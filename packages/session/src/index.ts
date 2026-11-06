import {
  createScope,
  decodeConnectionURL,
  type Observable,
  observable,
  OPENLV_PROTOCOL_VERSION,
  type SessionConnectionParameters,
  type SessionHandshakeParameters,
  type SessionLinkParameters,
} from "@openlv/core";
import {
  type Cipher,
  createHandshakeCipher,
  generateHandshakeKey,
  generateKeyPair,
  generateSessionId,
  hashPublicKey,
  isValidKeyPair,
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
import { awaitCorrelatedResponse, type CorrelationEvents } from "./messages/correlate.js";
import { isSessionMessage, type SessionMessage } from "./messages/index.js";
import { log } from "./utils/log.js";

export { loadSignaling, loadTransport } from "./dynamic.js";
export { RequestFailedError } from "./messages/correlate.js";
export type { SessionMessage } from "./messages/index.js";

// `peerInfo` is part of the session's surface, so consumers must be able to
// name its type without reaching into @openlv/signaling.
export type { PeerInfo } from "@openlv/signaling";

export const SessionStatus = {
  CREATED: "created",
  SIGNALING: "signaling",
  READY: "ready",
  LINKING: "linking",
  CONNECTED: "connected",
  RECOVERING: "recovering",
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
  getResumeParameters(): SessionConnectionParameters;
  connect(): Promise<void>;
  close(): Promise<void>;
  send(
    message: unknown,
    ackTimeout?: number,
    responseTimeout?: number,
  ): Promise<unknown>;
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
  onMessage: (message: unknown) => Promise<unknown>,
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
  const messages = new EventEmitter<CorrelationEvents>();
  const sessionId
    = "sessionId" in initParameters
      ? initParameters.sessionId
      : generateSessionId();
  const keyPair = "keyPair" in initParameters ? initParameters.keyPair : generateKeyPair();
  const isResume = "peerKey" in initParameters;
  const peerKey = "peerKey" in initParameters ? initParameters.peerKey : undefined;
  const selectedTransportId = "selectedTransportId" in initParameters
    ? initParameters.selectedTransportId
    : undefined;
  const k = "k" in initParameters ? initParameters.k : generateHandshakeKey();
  const ownHash = await hashPublicKey(keyPair.publicKey);
  const hash = ("h" in initParameters && initParameters.h) || ownHash;
  const isHost = hash === ownHash;
  if (isResume) {
    if (!peerKey || !(peerKey instanceof Uint8Array) || peerKey.length !== 32) {
      throw new Error("Cannot resume without a valid pinned peer key");
    }

    if (!isValidKeyPair(keyPair, peerKey)) {
      throw new Error("Cannot resume with invalid local key pair or peer key");
    }

    if (!selectedTransportId) {
      throw new Error("Cannot resume without a selected transport");
    }

    if (!transportLayers.some(layer => layer.transportId === selectedTransportId)) {
      throw new Error("Cannot resume with an unsupported selected transport");
    }

    const resumedPeerHash = isHost ? ownHash : await hashPublicKey(peerKey);

    if (resumedPeerHash !== hash) {
      throw new Error("Resumed peer identity does not match session");
    }
  }
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

  status.subscribe((current) => {
    if (current === SessionStatus.RECOVERING || current === SessionStatus.DISCONNECTED) {
      const fallback = current === SessionStatus.RECOVERING
        ? "Transport interrupted"
        : "Session closed";

      messages.emit("ended", lastError.get() ?? fallback);
    }
  });

  const signalLayer = await loadSignaling(protocol);
  const signaling = await signalLayer({
    topic: sessionId,
    url: server,
  });
  const signal = await signaling({
    h: hash,
    ...(!isResume && { handshakeCipher: await createHandshakeCipher(k) }),
    keyPair,
    capabilities,
    isHost,
    ...(isResume && peerKey ? { resume: true, peerKey } : {}),
  });

  const scope = createScope();

  scope.add(signal.teardown);

  signal.peer.subscribe((peer) => {
    const role = isHost ? "host" : "client";

    log(`rpKey discovered by ${role}`, peer?.peerKey);
  });

  signal.peerCapabilities.subscribe((received) => {
    log("peer capabilities received", received);
    setPeerInfo(received?.info);
  });

  let transport: TransportLayer | undefined;

  const createTransport = (layer: TransportLayerFunction, cipher: Cipher): TransportLayer => layer.create({
    cipher,
    isHost,
    onmessage: async (message) => {
      log("Session: received message from transport", message);

      if (!isSessionMessage(message)) {
        log("dropping invalid session message", message);

        return;
      }

      if (message["type"] === "close") {
        await teardown();

        return;
      }

      if (message["type"] === "request") {
        const messageId = message["messageId"];

        try {
          // Immediately acknowledge receipt so the sender's ack-timeout does
          // not fire while the handler (which may await user interaction) runs.
          await transport?.send({ type: "ack", messageId } satisfies SessionMessage);

          let answer: SessionMessage;

          try {
            // Notify observers before processing (e.g. wallet UI can show a
            // pending indicator before the handler resolves).
            emitter.emit("request", message["payload"]);

            answer = {
              type: "response",
              messageId,
              payload: await onMessage(message["payload"]),
            };
          }
          catch (error) {
            // Only the fact of failure goes to the peer; the thrown value
            // may carry wallet-private details and stays in the local log.
            log("request handler threw", error);
            answer = { type: "failed", messageId };
          }

          await transport?.send(answer);
        }
        catch (error) {
          log("failed to respond to peer request", error);
        }
      }

      else {
        // What is left is an ack, a response or a failure: the send() correlator takes all three.
        messages.emit("message", message);
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
   * A resumed session pins the previously negotiated transport. Fresh sessions
   * negotiate the preferred common transport from peer capabilities.
   */
  const selectTransportLayer = (): TransportLayerFunction | undefined => {
    if (selectedTransportId) {
      return transportLayers.find(layer => layer.transportId === selectedTransportId);
    }

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
  // From transport start until the session connects or ends
  const linking = scope.child();

  linking.closeWhen(status, value => value === SessionStatus.CONNECTED || value === SessionStatus.DISCONNECTED);

  const onTransportStateChange = (transportStatus: TransportStatus) => {
    log("transport state change", transportStatus);

    if (transportStatus === TransportStatus.CONNECTED) {
      signal.markTransportConnected();
      clearLinkDeadline();
      setLastError(undefined);
      updateStatus(SessionStatus.CONNECTED);
    }

    if (transportStatus === TransportStatus.ERROR) {
      setLastErrorIfUnset("Peer-to-peer transport failed");

      if (status.get() === SessionStatus.CONNECTED) {
        recoverTransport();
      }
      else updateStatus(SessionStatus.DISCONNECTED);
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
      const peer = signal.peer.get();

      if (!peer) {
        throw new Error("Relying party public key not found");
      }

      transport = createTransport(layer, peer.cipher);
      scope.add(transport.teardown);
      scope.add(transport.status.subscribe(onTransportStateChange));
      scope.listen(transport.emitter, "error", onTransportError);
      linking.timeout(TRANSPORT_LINK_TIMEOUT_MS, () => {
        log("transport failed to connect in time");
        setLastErrorIfUnset("Timed out establishing the peer-to-peer connection");
        updateStatus(SessionStatus.DISCONNECTED);
      });
    }

    Promise.resolve(transport.setup()).catch((error) => {
      log("transport setup failed", error);
      setLastErrorIfUnset(error instanceof Error ? error.message : "Transport setup failed");
      updateStatus(SessionStatus.DISCONNECTED);
    });
  };

  const clearCurrentTransport = async () => {
    clearLinkDeadline();
    unsubscribeTransportStatus?.();
    unsubscribeTransportStatus = undefined;
    transport?.emitter.off("error", onTransportError);
    const previous = transport;

    transport = undefined;
    await previous?.teardown();
  };

  async function recoverTransport() {
    if (status.get() === SessionStatus.RECOVERING) return;

    updateStatus(SessionStatus.RECOVERING);

    try {
      await clearCurrentTransport();

      if (status.get() !== SessionStatus.RECOVERING) return;

      if (!signal.resume) throw new Error("Signaling protocol cannot resume interrupted sessions");

      await signal.resume();

      if (status.get() !== SessionStatus.RECOVERING) return;

      startTransport();
    }
    catch (error) {
      log("failed to resume signaling after transport failure", error);
      setLastErrorIfUnset(error instanceof Error ? error.message : "Session resume failed");
      updateStatus(SessionStatus.DISCONNECTED);
    }
  }

  const onSignalMessage = async (message: object) => {
    log("Session: received message from signaling", message);
    if (status.get() === SessionStatus.CONNECTED) {
      log("discarding late signaling negotiation after transport connected");

      return;
    }

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
      if (status.get() !== SessionStatus.RECOVERING) {
        updateStatus(SessionStatus.READY);
      }
    }

    if (
      (
        [
          SignalStatus.HANDSHAKE,
          SignalStatus.HANDSHAKE_PARTIAL,
        ] as SignalStatus[]
      ).includes(signalStatus)
    ) {
      if (status.get() !== SessionStatus.RECOVERING) {
        updateStatus(SessionStatus.LINKING);
      }
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

  const teardown = async () => {
    await scope.close();
    updateStatus(SessionStatus.DISCONNECTED);
  };

  return {
    connect: async () => {
      updateStatus(SessionStatus.SIGNALING);
      log("connecting to session, isHost:", isHost);

      scope.listen(signal, "message", onSignalMessage);
      scope.add(signal.status.subscribe(onSignalStateChange));

      await signal.setup();
    },
    async close() {
      log("session teardown");
      await transport?.send({ type: "close" } satisfies SessionMessage)
        .catch(error => log("failed to send close to peer", error));
      await teardown();
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
        k,
        p: protocol,
        s: server,
      };
    },
    getResumeParameters() {
      const peer = signal.peer.get();

      if (status.get() !== SessionStatus.CONNECTED || !peer || !transport) {
        throw new Error("Session is not connected and cannot be resumed");
      }

      return {
        version: OPENLV_PROTOCOL_VERSION,
        sessionId,
        h: hash,
        k,
        p: protocol,
        s: server,
        keyPair,
        peerKey: peer.peerKey,
        selectedTransportId: transport.type,
      };
    },
    async send(
      message: unknown,
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
  onMessage: (message: unknown) => Promise<unknown>,
  transports: TransportLayerFunction[],
  options?: SessionOptions,
): Promise<Session> => {
  const initParameters = decodeConnectionURL(connectionUrl);

  return createSession(initParameters, transports, onMessage, options);
};
