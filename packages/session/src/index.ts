import {
  createScope,
  createTimeout,
  decodeConnectionURL,
  type Observable,
  observable,
  OPENLV_PROTOCOL_VERSION,
  type SessionHandshakeParameters,
  type SessionLinkParameters,
} from "@openlv/core";
import {
  deriveSymmetricKey,
  generateHandshakeKey,
  generateSessionId,
  initEncryptionKeys,
  initHash,
} from "@openlv/core/encryption";
import {
  type PeerCapabilities,
  type PeerInfo,
  type SignalingLayer,
  Status as SignalStatus,
  validatePeerInfo,
} from "@openlv/signaling";
import {
  Status as TransportStatus,
  type TransportLayer,
  type TransportLayerFunction,
  type TransportMessage,
} from "@openlv/transport";
import { EventEmitter } from "eventemitter3";

import { loadSignaling } from "./dynamic.js";
import type { SessionEvents } from "./events.js";
import { awaitCorrelatedResponse } from "./messages/correlate.js";
import type { SessionMessage } from "./messages/index.js";
import { log } from "./utils/log.js";

export { loadSignaling, loadTransport } from "./dynamic.js";

// `peerInfo` is part of the session's surface, so consumers must be able to
// name its type without reaching into @openlv/signaling.
export type { PeerInfo } from "@openlv/signaling";

export const SessionStatus = {
  CREATED: "created",
  SIGNALING: "signaling",
  READY: "ready",
  LINKING: "linking",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export type SessionOptions = {
  info?: PeerInfo;
};

/**
 * an OpenLV Session
 *
 * https://openlv.sh/api/session
 */
export type Session = {
  status: Observable<SessionStatus>;
  signalStatus: Observable<SignalStatus>;
  error: Observable<string | undefined>;
  peerInfo: Observable<PeerInfo | undefined>;
  getHandshakeParameters(): SessionHandshakeParameters;
  connect(): Promise<void>;
  close(): Promise<void>;
  send(message: object, ackTimeout?: number, responseTimeout?: number): Promise<unknown>;
  emitter: EventEmitter<SessionEvents>;
  _internal: {
    signal: SignalingLayer;
    /** Instantiated when signaling reaches ENCRYPTED and a transport is selected. */
    transport: TransportLayer | undefined;
  };
};

/**
 * OpenLV Session
 *
 * https://openlv.sh/api/session
 */
export const createSession = async (
  initParameters: SessionLinkParameters,
  transportLayers: TransportLayerFunction[],
  onMessage: (message: object) => Promise<object | string>,
  options?: SessionOptions,
): Promise<Session> => {
  if (transportLayers.length === 0) {
    throw new Error("At least one transport is required");
  }

  if (options?.info) {
    const problem = validatePeerInfo(options.info);

    if (problem) throw new Error(`Invalid session info: ${problem}`);
  }

  const emitter = new EventEmitter<SessionEvents>();
  const messages = new EventEmitter<{ message: SessionMessage; }>();
  const sessionId
    = "sessionId" in initParameters
      ? initParameters.sessionId
      : generateSessionId();
  const {
    encryptionKey,
    decryptionKey: { decrypt },
  } = await initEncryptionKeys(initParameters);
  const handshakeKey
    = "k" in initParameters
      ? await deriveSymmetricKey(initParameters.k)
      : await generateHandshakeKey();
  const { hash, isHost } = await initHash(
    "h" in initParameters ? initParameters.h : undefined,
    encryptionKey,
  );
  const protocol = initParameters.p;
  const server = initParameters.s;
  const capabilities: PeerCapabilities = {
    transports: transportLayers.map(layer => layer.transportId),
    ...(options?.info && { info: options.info }),
  };

  const [status, setStatus] = observable<SessionStatus>(SessionStatus.CREATED);
  const [lastError, setLastError] = observable<string | undefined>(undefined);
  const [peerInfo, setPeerInfo] = observable<PeerInfo | undefined>(undefined);

  const setLastErrorIfUnset = (reason: string) => {
    if (lastError.get() === undefined) setLastError(reason);
  };

  const updateStatus = (newStatus: SessionStatus) => {
    log("updateStatus", newStatus);
    setStatus(newStatus);
  };

  const signalLayer = await loadSignaling(protocol);
  const signaling = await signalLayer({
    topic: sessionId,
    url: server,
  });
  const canEncrypt = () => signal.peerKey.get() !== undefined;
  const signal = await signaling({
    h: hash,
    canEncrypt,
    async encrypt(message) {
      const key = signal.peerKey.get();

      if (!key) {
        throw new Error("Relying party public key not found");
      }

      return await key.encrypt(message);
    },
    decrypt,
    publicKey: encryptionKey,
    k: handshakeKey,
    capabilities,
    isHost,
  });

  const scope = createScope();
  let connectionScope: ReturnType<typeof createScope> | undefined;

  scope.add([
    signal.teardown,
    signal.peerKey.subscribe((key) => {
      const role = isHost ? "host" : "client";

      log(`rpKey discovered by ${role}`, key);
    }),
    signal.peerCapabilities.subscribe((received) => {
      log("peer capabilities received", received);
      setPeerInfo(received?.info);
    }),
  ]);

  let transport: TransportLayer | undefined;

  const createTransport = (layer: TransportLayerFunction): TransportLayer => layer.create({
    async encrypt(message) {
      const key = signal.peerKey.get();

      if (!key) {
        throw new Error("Relying party public key not found");
      }

      return await key.encrypt(message);
    },
    decrypt,
    isHost,
    onmessage: async (message: { type: string; payload: object; messageId: string; }) => {
      log("Session: received message from transport", message);

      if (message["type"] === "request") {
        const messageId = message["messageId"] as string;

        try {
          // Immediately acknowledge receipt so the sender's ack-timeout does
          // not fire while the handler (which may await user interaction) runs.
          await transport?.send({ type: "ack", messageId } satisfies SessionMessage);

          // Notify observers before processing (e.g. wallet UI can show a
          // pending indicator before the handler resolves).
          emitter.emit("request", message["payload"] as object);

          const data = await onMessage(message["payload"] as object)
            // A throwing handler must still answer, otherwise the peer waits
            // out its full response timeout.
            .catch(() => ({ error: { code: -32_603, message: "Internal error" } }));

          await transport?.send({
            type: "response",
            messageId,
            payload: data,
          } satisfies SessionMessage);
        }
        catch (error) {
          log("failed to respond to peer request", error);
        }
      }

      if (message["type"] === "response" || message["type"] === "ack") {
        // Both acks and responses are forwarded to the send() correlator.
        messages.emit("message", message as SessionMessage);
      }
    },
    async subsend(message) {
      log("Session: sending trans msg to signal", message);
      const sessionMessage: SessionMessage = {
        type: "request",
        messageId: crypto.randomUUID(),
        payload: message,
      };

      await signal.send(sessionMessage);
    },
  });

  /**
   * Sessions resumed with a known peer key never exchange capabilities and
   * keep the first configured transport.
   */
  const selectTransportLayer = (): TransportLayerFunction | undefined => {
    const peerCaps = signal.peerCapabilities.get();

    if (!peerCaps) return transportLayers[0];

    // The host's preferred transport that the client also supports; both
    // peers compute the same result independently -- no confirmation round trip.
    const hostPreference = isHost ? capabilities.transports : peerCaps.transports;
    const clientSupported = new Set(isHost ? peerCaps.transports : capabilities.transports);
    const selected = hostPreference.find(transportId => clientSupported.has(transportId));

    return transportLayers.find(layer => layer.transportId === selected);
  };

  // Once both peers are present (signaling encrypted) the transport should
  // connect promptly; if it cannot (e.g. no ICE candidates on a restricted
  // network) fail loudly instead of sitting in "linking" forever.
  const TRANSPORT_LINK_TIMEOUT_MS = 45_000;
  const linkDeadline = createTimeout();

  scope.add(linkDeadline.cancel);

  const onTransportStateChange = (transportStatus: TransportStatus) => {
    log("transport state change", transportStatus);

    if (transportStatus === TransportStatus.CONNECTED) {
      linkDeadline.cancel();
      setLastError(undefined);
      updateStatus(SessionStatus.CONNECTED);
    }

    if (transportStatus === TransportStatus.ERROR) {
      linkDeadline.cancel();
      setLastErrorIfUnset("Peer-to-peer transport failed");
      updateStatus(SessionStatus.DISCONNECTED);
    }
  };

  const onTransportError = (reason?: string) => {
    if (reason) setLastError(reason);
  };

  const startTransport = () => {
    if (!transport) {
      const layer = selectTransportLayer();

      if (!layer) {
        log("no common transport with peer", capabilities.transports, signal.peerCapabilities.get()?.transports);
        setLastErrorIfUnset("No common transport with peer");
        updateStatus(SessionStatus.DISCONNECTED);

        return;
      }

      log("selected transport", layer.transportId);
      transport = createTransport(layer);
      scope.add([
        transport.teardown,
        transport.status.subscribe(onTransportStateChange),
      ]);
      scope.listen(transport.emitter, "error", onTransportError);
    }

    linkDeadline.schedule(() => {
      if (status.get() === SessionStatus.CONNECTED) return;

      log("transport failed to connect in time");
      setLastErrorIfUnset("Timed out establishing the peer-to-peer connection");
      updateStatus(SessionStatus.DISCONNECTED);
    }, TRANSPORT_LINK_TIMEOUT_MS);

    Promise.resolve(transport.setup()).catch((error) => {
      log("transport setup failed", error);
      linkDeadline.cancel();
      setLastErrorIfUnset(error instanceof Error ? error.message : "Transport setup failed");
      updateStatus(SessionStatus.DISCONNECTED);
    });
  };

  const onSignalMessage = async (message: object) => {
    log("Session: received message from signaling", message);

    const sessionMessage = message as SessionMessage;

    if (sessionMessage.type === "response") {
      messages.emit("message", sessionMessage);
    }
    else if (sessionMessage.type === "request") {
      if (!transport) {
        log("dropping negotiation message: transport not selected yet");

        return;
      }

      try {
        await transport.handle(sessionMessage.payload as TransportMessage);
      }
      catch (error) {
        // Negotiation payloads come from the (untrusted) relay; a malformed
        // one must not become an unhandled rejection.
        log("failed to handle negotiation message", error);
      }
    }
  };

  const onSignalStateChange = (signalStatus: SignalStatus) => {
    log("signal state change", signalStatus);

    if (signalStatus === SignalStatus.READY) {
      updateStatus(SessionStatus.READY);
    }

    if (
      (
        [
          SignalStatus.HANDSHAKE,
          SignalStatus.HANDSHAKE_PARTIAL,
        ] as SignalStatus[]
      ).includes(signalStatus)
    ) {
      updateStatus(SessionStatus.LINKING);
    }

    if (signalStatus === SignalStatus.ENCRYPTED) {
      startTransport();
    }

    if (signalStatus === SignalStatus.ERROR) {
      log("signaling error -- marking session disconnected");
      setLastErrorIfUnset("Signaling failed or timed out");
      updateStatus(SessionStatus.DISCONNECTED);
    }
  };

  return {
    connect: async () => {
      updateStatus(SessionStatus.SIGNALING);
      log("connecting to session, isHost:", isHost);

      connectionScope ??= createScope();
      connectionScope.listen(signal, "message", onSignalMessage);
      connectionScope.add(signal.status.subscribe(onSignalStateChange));

      try {
        await signal.setup();
      }
      catch (error) {
        await connectionScope.close();
        connectionScope = undefined;
        throw error;
      }
    },
    async close() {
      log("session teardown");
      await Promise.allSettled([
        scope.close(),
        connectionScope?.close() ?? Promise.resolve(),
      ]);

      updateStatus(SessionStatus.DISCONNECTED);
    },
    status,
    signalStatus: signal.status,
    error: lastError,
    peerInfo,
    getHandshakeParameters() {
      return {
        version: OPENLV_PROTOCOL_VERSION,
        sessionId,
        h: hash,
        k: handshakeKey.toString(),
        p: protocol,
        s: server,
      };
    },
    async send(
      message: object,
      ackTimeout: number = 10_000,
      responseTimeout: number = 60 * 60_000,
    ) {
      if (!transport || signal.status.get() !== SignalStatus.ENCRYPTED) {
        throw new Error("Session not ready");
      }

      const messageId = crypto.randomUUID();
      const sessionMessage: SessionMessage = {
        type: "request",
        messageId,
        payload: message,
      };

      await transport.send(sessionMessage);

      return awaitCorrelatedResponse(messages, messageId, ackTimeout, responseTimeout);
    },
    _internal: {
      signal,
      get transport() {
        return transport;
      },
    },
    emitter,
  };
};

/**
 * Connect to a session from its openlv:// URL
 */
export const connectSession = async (
  connectionUrl: string,
  onMessage: (message: object) => Promise<object | string>,
  transports: TransportLayerFunction[],
  options?: SessionOptions,
): Promise<Session> => {
  const initParameters = decodeConnectionURL(connectionUrl);

  return createSession(initParameters, transports, onMessage, options);
};
