import {
  createScope,
  decodeConnectionURL,
  type Observable,
  observable,
  OPENLV_PROTOCOL_VERSION,
  type Scope,
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
import { isSessionMessage, type SessionMessage, type SessionMessageRequest } from "./messages/index.js";
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
  getConnectionParameters(): SessionConnectionParameters | undefined;
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
  const savedPairing = "peerKey" in initParameters ? initParameters : undefined;
  const keyPair = savedPairing?.keyPair ?? generateKeyPair();
  const k = "k" in initParameters ? initParameters.k : generateHandshakeKey();
  const ownHash = await hashPublicKey(keyPair.publicKey);
  const hash = ("h" in initParameters && initParameters.h) || ownHash;
  const isHost = hash === ownHash;
  const protocol = initParameters.p;
  const server = initParameters.s;
  const capabilities: PeerCapabilities = {
    transports: transportLayers.map(layer => layer.transportId),
    ...(options?.info && { info: options.info }),
  };
  const handshakeParameters: SessionHandshakeParameters = { version: OPENLV_PROTOCOL_VERSION, sessionId, h: hash, k, p: protocol, s: server };

  const [status, setStatus] = observable<SessionStatus>(SessionStatus.CREATED);
  const [lastError, setLastError] = observable<string | undefined>(undefined);
  const [peerInfo, setPeerInfo] = observable<PeerInfo | undefined>(undefined);
  const linkEnded = () => status.until(value => value === SessionStatus.CONNECTED || value === SessionStatus.DISCONNECTED);

  const setLastErrorIfUnset = (reason: string) => {
    if (lastError.get() === undefined) setLastError(reason);
  };

  const updateStatus = (newStatus: SessionStatus) => {
    const previous = status.get();

    if (previous === newStatus) return;

    setStatus(newStatus);

    if (previous === SessionStatus.CONNECTED && newStatus === SessionStatus.LINKING) {
      messages.emit("ended", lastError.get() ?? "Transport interrupted");
    }
    else if (newStatus === SessionStatus.DISCONNECTED) {
      messages.emit("ended", lastError.get() ?? "Session closed");
    }
  };

  const signalLayer = await loadSignaling(protocol);
  const signaling = await signalLayer({
    topic: sessionId,
    url: server,
  });
  const signal = await signaling({
    h: hash,
    handshakeCipher: await createHandshakeCipher(k),
    keyPair,
    capabilities,
    isHost,
    resume: savedPairing && { peerKey: savedPairing.peerKey, ended: linkEnded() },
  });

  const scope = createScope();

  scope.add(signal.teardown);

  scope.add(signal.peerCapabilities.subscribe(received => setPeerInfo(received?.info)));

  let transport: TransportLayer | undefined;
  let selectedTransportId = savedPairing?.transport.p;

  scope.closeWhen(status, value => value === SessionStatus.DISCONNECTED);
  const [sentAnswer, setSentAnswer] = observable<{ offer: string | undefined; message: SessionMessage; } | undefined>(undefined);
  const [currentOffer, setCurrentOffer] = observable<SessionMessageRequest | undefined>(undefined);

  const createTransport = (layer: TransportLayerFunction, cipher: Cipher, isCurrent: () => boolean): TransportLayer => layer.create({
    cipher,
    isHost,
    onmessage: async (message) => {
      if (!isCurrent()) return;

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
        const source = transport;

        try {
          // Immediately acknowledge receipt so the sender's ack-timeout does
          // not fire while the handler (which may await user interaction) runs.
          await source?.send({ type: "ack", messageId } satisfies SessionMessage);

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

          await source?.send(answer);
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
      if (!isCurrent()) return;

      const sessionMessage: SessionMessageRequest = {
        type: "request",
        messageId: crypto.randomUUID(),
        payload: message,
      };

      if (message.type === "answer") setSentAnswer({ offer: message.messageId, message: sessionMessage });
      else if (message.type === "offer") setCurrentOffer(sessionMessage);

      if (message.type !== "offer") return await signal.send(sessionMessage);

      await signal.repeatUntil(sessionMessage, Promise.race([currentOffer.until(offer => offer !== sessionMessage), linkEnded()]));
    },
  });

  const selectTransportLayer = (): TransportLayerFunction | undefined => {
    if (selectedTransportId) return transportLayers.find(layer => layer.transportId === selectedTransportId);

    const peerCaps = signal.peerCapabilities.get();

    if (!peerCaps) return transportLayers[0];

    const hostPreference = isHost ? capabilities.transports : peerCaps.transports;
    const clientSupported = new Set(isHost ? peerCaps.transports : capabilities.transports);
    const selected = hostPreference.find(transportId => clientSupported.has(transportId));

    return transportLayers.find(layer => layer.transportId === selected);
  };

  const beginLink = () => {
    updateStatus(SessionStatus.LINKING);
    const linking = scope.child();

    linking.closeWhen(status, value => value === SessionStatus.CONNECTED || value === SessionStatus.DISCONNECTED);
    linking.timeout(45_000, () => {
      setLastErrorIfUnset("Timed out establishing the peer-to-peer connection");
      updateStatus(SessionStatus.DISCONNECTED);
    });
  };

  const recover = async (transportScope: Scope) => {
    setCurrentOffer(undefined);
    setSentAnswer(undefined);
    beginLink();

    try {
      await transportScope.close();

      if (status.get() === SessionStatus.LINKING) signal.resume(linkEnded());
    }
    catch (error) {
      log("failed to close interrupted transport", error);
      updateStatus(SessionStatus.DISCONNECTED);
    }
  };

  const onTransportStateChange = (transportStatus: TransportStatus, transportScope: Scope) => {
    if (transportStatus === TransportStatus.CONNECTED) {
      setLastError(undefined);
      updateStatus(SessionStatus.CONNECTED);
    }

    if (transportStatus === TransportStatus.ERROR) {
      setLastErrorIfUnset("Peer-to-peer transport failed");

      if (status.get() === SessionStatus.CONNECTED) void recover(transportScope);
      else updateStatus(SessionStatus.DISCONNECTED);
    }
  };

  const onTransportError = (reason?: string) => {
    if (reason) setLastError(reason);
  };

  const startTransport = async () => {
    if (transport) return;

    const layer = selectTransportLayer();
    const peer = signal.peer.get();

    if (!layer || !peer) {
      setLastErrorIfUnset("No common transport or peer key");
      updateStatus(SessionStatus.DISCONNECTED);

      return;
    }

    selectedTransportId = layer.transportId;
    const transportScope = scope.child();
    const current: TransportLayer = createTransport(layer, peer.cipher, () => transport !== undefined && transport === current);

    transport = current;
    transportScope.add(current.teardown);
    transportScope.add(current.status.subscribe(value => onTransportStateChange(value, transportScope)));
    transportScope.listen(current.emitter, "error", onTransportError);
    transportScope.add(() => {
      if (transport === current) transport = undefined;
    });

    try {
      await current.setup();
    }
    catch (error) {
      if (transport !== current) return;

      log("transport setup failed", error);
      setLastErrorIfUnset(error instanceof Error ? error.message : "Transport setup failed");
      updateStatus(SessionStatus.DISCONNECTED);
    }
  };

  const onPeerCapabilities = async () => {
    if (status.get() !== SessionStatus.LINKING) return;

    if (!transport) await startTransport();

    try {
      if (isHost) await signal.sendCapabilities();
    }
    catch (error) {
      log("failed to answer capabilities", error);
    }
  };

  const onSignalMessage = async (message: object) => {
    const sessionMessage = message as SessionMessage;

    if (sessionMessage.type === "response") {
      messages.emit("message", sessionMessage);
    }
    else if (sessionMessage.type === "request") {
      if (!transport && selectedTransportId && status.get() === SessionStatus.LINKING) await startTransport();

      if (!transport || status.get() !== SessionStatus.LINKING) return log("dropping negotiation message: no transport, or transport open");

      try {
        const received = sessionMessage.payload as TransportMessage;
        const negotiation = received.type === "offer" ? { ...received, messageId: sessionMessage.messageId } : received;
        const repeatedAnswer = negotiation.type === "offer" && negotiation.messageId === sentAnswer.get()?.offer ? sentAnswer.get()?.message : undefined;
        const answeredOffer = negotiation.type === "answer" ? currentOffer.get() : undefined;

        if (negotiation.type === "answer" && (!answeredOffer || negotiation.messageId !== answeredOffer.messageId)) return log("dropping an answer to another offer");

        await (repeatedAnswer ? signal.send(repeatedAnswer) : transport.handle(negotiation));

        if (answeredOffer && currentOffer.get() === answeredOffer) setCurrentOffer(undefined);
      }
      catch (error) {
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
      beginLink();

      if (!savedPairing) void startTransport();
    }

    if (signalStatus === SignalStatus.ERROR) {
      log("signaling error -- marking session disconnected");
      setLastErrorIfUnset("Signaling failed or timed out");
      updateStatus(SessionStatus.DISCONNECTED);
    }
  };

  const teardown = async () => {
    updateStatus(SessionStatus.DISCONNECTED);
    await scope.close();
  };

  return {
    connect: async () => {
      updateStatus(SessionStatus.SIGNALING);
      scope.listen(signal, "message", onSignalMessage);
      scope.listen(signal, "capabilities", onPeerCapabilities);
      scope.add(signal.status.subscribe(onSignalStateChange));

      await signal.setup();
    },
    async close() {
      try {
        await transport?.send({ type: "close" } satisfies SessionMessage);
      }
      catch (error) {
        log("failed to send close to peer", error);
      }

      await teardown();
    },
    status,
    signalStatus: signal.status,
    error: lastError,
    peerInfo,
    getHandshakeParameters: () => ({ ...handshakeParameters }),
    getConnectionParameters() {
      const peer = signal.peer.get();

      return peer && transport && status.get() === SessionStatus.CONNECTED ? { ...handshakeParameters, keyPair: { publicKey: keyPair.publicKey.slice(), secretKey: keyPair.secretKey.slice() }, peerKey: peer.peerKey.slice(), transport: { p: transport.type } } : undefined;
    },
    async send(
      message: unknown,
      ackTimeout: number = 10_000,
      responseTimeout: number = 60 * 60_000,
    ) {
      if (!transport || status.get() !== SessionStatus.CONNECTED) {
        throw new Error("Session not ready");
      }

      const messageId = crypto.randomUUID();
      const sessionMessage: SessionMessage = {
        type: "request",
        messageId,
        payload: message,
      };

      const current = transport;

      await current.send(sessionMessage);

      if (transport !== current || status.get() !== SessionStatus.CONNECTED) {
        throw new Error(lastError.get() ?? "Session interrupted");
      }

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
