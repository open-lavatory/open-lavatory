import {
  decodeConnectionURL,
  type Observable,
  observable,
  OPENLV_PROTOCOL_VERSION,
  type SessionHandshakeParameters,
  type SessionLinkParameters,
} from "@openlv/core";
import {
  deriveSymmetricKey,
  type EncryptionKey,
  generateHandshakeKey,
  generateSessionId,
  initEncryptionKeys,
  initHash,
} from "@openlv/core/encryption";
import {
  type PeerCapabilities,
  type PeerInfo,
  type SignalingLayer,
  type SignalingProtocol,
  Status as SignalStatus,
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

export const SESSION_STATE = {
  CREATED: "created",
  SIGNALING: "signaling",
  READY: "ready",
  LINKING: "linking",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
} as const;
export type SessionState = (typeof SESSION_STATE)[keyof typeof SESSION_STATE];

export type SessionStateObject = {
  status: SessionState;
  signaling?: {
    status: SignalStatus;
  };
  peerInfo?: PeerInfo;
  error?: string;
};

export type SessionOptions = {
  info?: PeerInfo;
};

/**
 * an OpenLV Session
 *
 * https://openlv.sh/api/session
 */
export type Session = {
  status: Observable<SessionStateObject>;
  getHandshakeParameters(): SessionHandshakeParameters;
  connect(): Promise<void>;
  waitForLink(): Promise<void>;
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
  signalLayer: SignalingProtocol,
  transportLayers: TransportLayerFunction[],
  onMessage: (message: object) => Promise<object | string>,
  options?: SessionOptions,
): Promise<Session> => {
  if (transportLayers.length === 0) {
    throw new Error("At least one transport is required");
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
  let relyingPublicKey: EncryptionKey | undefined;
  const handshakeKey
    = "k" in initParameters
      ? await deriveSymmetricKey(initParameters.k)
      : await generateHandshakeKey();
  const { hash, isHost } = await initHash(
    "h" in initParameters ? initParameters.h : undefined,
    encryptionKey,
  );
  let status: SessionState = SESSION_STATE.CREATED;
  let lastError: string | undefined;
  const protocol = initParameters.p;
  const server = initParameters.s;
  const capabilities: PeerCapabilities = {
    transports: transportLayers.map(layer => layer.transportId),
    ...(options?.info && { info: options.info }),
  };
  let peerCaps: PeerCapabilities | undefined;

  const [sessionState, setSessionState] = observable<SessionStateObject>({ status });

  const updateStatus = (newStatus: SessionState) => {
    log("updateStatus", newStatus);
    status = newStatus;
    setSessionState({
      status,
      signaling: { status: signal.status.get() },
      peerInfo: peerCaps?.info,
      error: lastError,
    });
  };

  const signaling = await signalLayer({
    topic: sessionId,
    url: server,
  });
  const signal = await signaling({
    h: hash,
    canEncrypt() {
      return relyingPublicKey !== undefined;
    },
    async encrypt(message) {
      if (!relyingPublicKey) {
        throw new Error("Relying party public key not found");
      }

      return await relyingPublicKey.encrypt(message);
    },
    decrypt,
    publicKey: encryptionKey,
    k: handshakeKey,
    capabilities,
    isHost,
  });

  signal.peerKey.subscribe((key) => {
    const role = isHost ? "host" : "client";

    log(`rpKey discovered by ${role}`, key);

    relyingPublicKey = key;
  });

  signal.peerCapabilities.subscribe((received) => {
    log("peer capabilities received", received);
    peerCaps = received;
    // Re-emit the current status so observers see peerInfo the moment the
    // capabilities exchange completes, not at the next status transition.
    updateStatus(status);
  });

  let transport: TransportLayer | undefined;

  const createTransport = (layer: TransportLayerFunction): TransportLayer => layer.create({
    encrypt(message) {
      if (!relyingPublicKey) {
        throw new Error("Relying party public key not found");
      }

      return relyingPublicKey?.encrypt(message);
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
  let linkDeadline: ReturnType<typeof setTimeout> | undefined;
  let unsubscribeTransportStatus: (() => void) | undefined;

  const clearLinkDeadline = () => {
    clearTimeout(linkDeadline);
    linkDeadline = undefined;
  };

  const onTransportStateChange = (transportStatus: TransportStatus) => {
    log("transport state change", transportStatus);

    if (transportStatus === TransportStatus.CONNECTED) {
      clearLinkDeadline();
      lastError = undefined;
      updateStatus(SESSION_STATE.CONNECTED);
    }

    if (transportStatus === TransportStatus.ERROR) {
      clearLinkDeadline();
      lastError ??= "Peer-to-peer transport failed";
      updateStatus(SESSION_STATE.DISCONNECTED);
    }
  };

  const onTransportError = (reason?: string) => {
    if (reason) lastError = reason;
  };

  const startTransport = () => {
    if (!transport) {
      const layer = selectTransportLayer();

      if (!layer) {
        log("no common transport with peer", capabilities.transports, peerCaps?.transports);
        lastError ??= "No common transport with peer";
        updateStatus(SESSION_STATE.DISCONNECTED);

        return;
      }

      log("selected transport", layer.transportId);
      transport = createTransport(layer);
      unsubscribeTransportStatus = transport.status.subscribe(onTransportStateChange);
      transport.emitter.on("error", onTransportError);
    }

    linkDeadline ??= setTimeout(() => {
      if (status === SESSION_STATE.CONNECTED) return;

      log("transport failed to connect in time");
      lastError ??= "Timed out establishing the peer-to-peer connection";
      updateStatus(SESSION_STATE.DISCONNECTED);
    }, TRANSPORT_LINK_TIMEOUT_MS);

    Promise.resolve(transport.setup()).catch((error) => {
      log("transport setup failed", error);
      clearLinkDeadline();
      lastError ??= error instanceof Error ? error.message : "Transport setup failed";
      updateStatus(SESSION_STATE.DISCONNECTED);
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
      updateStatus(SESSION_STATE.READY);
    }

    if (
      (
        [
          SignalStatus.HANDSHAKE,
          SignalStatus.HANDSHAKE_PARTIAL,
        ] as SignalStatus[]
      ).includes(signalStatus)
    ) {
      updateStatus(SESSION_STATE.LINKING);
    }

    if (signalStatus === SignalStatus.ENCRYPTED) {
      startTransport();
    }

    if (signalStatus === SignalStatus.ERROR) {
      log("signaling error -- marking session disconnected");
      lastError ??= "Signaling failed or timed out";
      updateStatus(SESSION_STATE.DISCONNECTED);
    }
  };

  let unsubscribeSignalStatus: (() => void) | undefined;

  return {
    connect: async () => {
      updateStatus(SESSION_STATE.SIGNALING);
      log("connecting to session, isHost:", isHost);

      signal.on("message", onSignalMessage);
      unsubscribeSignalStatus = signal.status.subscribe(onSignalStateChange);

      await signal.setup();
    },
    async close() {
      log("session teardown");
      clearLinkDeadline();
      signal.off("message", onSignalMessage);
      unsubscribeSignalStatus?.();
      unsubscribeTransportStatus?.();
      transport?.emitter.off("error", onTransportError);
      await Promise.all([
        transport?.teardown(),
        signal.teardown(),
      ]);
      updateStatus(SESSION_STATE.DISCONNECTED);
    },
    status: sessionState,
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
    waitForLink: async () => new Promise<void>((resolve, reject) => {
      const check = (current: SessionStateObject) => {
        if (current.status === SESSION_STATE.CONNECTED) {
          unsubscribe();
          resolve();
        }
        else if (current.status === SESSION_STATE.DISCONNECTED) {
          unsubscribe();
          reject(new Error(lastError ?? "Session failed to connect"));
        }
      };

      // Subscribe before inspecting the current status so a transition
      // between the check and the subscription cannot be missed.
      const unsubscribe = sessionState.subscribe(check);

      check(sessionState.get());
    }),
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

  const signaling = await loadSignaling(initParameters.p);

  if (!signaling) {
    throw new Error(`Invalid signaling protocol: ${initParameters.p}`);
  }

  return createSession(initParameters, signaling, transports, onMessage, options);
};
