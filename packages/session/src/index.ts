/* eslint-disable max-lines */

import {
  decodeConnectionURL,
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
  parseEncryptionKey,
} from "@openlv/core/encryption";
import {
  type PeerCapabilities,
  type PeerInfo,
  SIGNAL_STATE,
  type SignalingLayer,
  type SignalingProtocol,
  type SignalState,
  validatePeerInfo,
} from "@openlv/signaling";
import { dynamicSignalingLayer } from "@openlv/signaling/dynamic";
import {
  TRANSPORT_STATE,
  type TransportLayer,
  type TransportLayerFn,
  type TransportMessage,
  type TransportState,
} from "@openlv/transport";
import { EventEmitter } from "eventemitter3";

import type { SessionEvents } from "./events.js";
import { awaitCorrelatedResponse } from "./messages/correlate.js";
import type { SessionMessage, SessionMessageClose } from "./messages/index.js";
import { selectTransportId } from "./transports.js";
import { log } from "./utils/log.js";

export type { PeerCapabilities, PeerInfo } from "@openlv/signaling";

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
    state: SignalState;
  };
  /** The peer's self-description, set once capabilities are exchanged. */
  peerInfo?: PeerInfo;
  /** Human-readable reason for the last disconnect/failure, if any. */
  error?: string;
};

export type SessionOptions = {
  /** Shared with the peer during the handshake and shown in its UI. */
  info?: PeerInfo;
};

/**
 * an OpenLV Session
 *
 * https://openlv.sh/api/session
 */
export type Session = {
  getState(): SessionStateObject;
  getHandshakeParameters(): SessionHandshakeParameters;
  connect(): Promise<void>;
  waitForLink(): Promise<void>;
  close(): Promise<void>;
  /**
     * Send a request to the remote peer and await a correlated response.
     *
     * Two-phase timeout:
     * - `ackTimeout` (default 10 s): the remote peer must send back an ack
     *   within this window, confirming it received the message.
     * - After an ack arrives the wait is extended to `responseTimeout`
     *   (default 1 hour) — enough for user-interactive flows such as
     *   `eth_sendTransaction` or `personal_sign`.
     */
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
  transportLayers: TransportLayerFn[],
  onMessage: (message: object) => Promise<object | string>,
  options?: SessionOptions,
): Promise<Session> => {
  if (transportLayers.length === 0) {
    throw new Error("At least one transport is required");
  }

  if (options?.info) {
    // A receiver silently drops out-of-bounds info with the whole packet,
    // which would surface only as a handshake timeout — fail loudly here.
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
    ...(options?.info ? { info: options.info } : {}),
  };
  let peerCaps: PeerCapabilities | undefined;
  const pendingRequestRejects = new Set<(error: Error) => void>();
  let detachSignalState: (() => void) | undefined;
  let detachTransportState: (() => void) | undefined;

  const updateStatus = (newStatus: SessionState) => {
    log("updateStatus", newStatus);
    status = newStatus;
    emitter.emit("state_change", {
      status,
      signaling: signal.getState(),
      peerInfo: peerCaps?.info,
      error: lastError,
    });
  };
  const rejectPendingRequests = (error: Error) => {
    for (const reject of pendingRequestRejects) {
      reject(error);
    }
    pendingRequestRejects.clear();
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
    async rpDiscovered(rpKey) {
      const role = isHost ? "host" : "client";

      log(`rpKey discovered by ${role}`, rpKey);

      relyingPublicKey = await parseEncryptionKey(rpKey);
    },
    capabilities,
    peerCapabilities(received) {
      log("peer capabilities received", received);
      peerCaps = received;
      // Re-emit the current status so observers see peerInfo the moment the
      // capabilities exchange completes, not at the next status transition.
      updateStatus(status);
    },
    isHost,
  });

  let transport: TransportLayer | undefined;
  const createTransport = (layer: TransportLayerFn): TransportLayer => layer.create({
    encrypt(message) {
      if (!relyingPublicKey) {
        throw new Error("Relying party public key not found");
      }

      return relyingPublicKey.encrypt(message);
    },
    decrypt,
    isHost,
    onmessage: async (message: { type: string; payload?: object | string; messageId: string; }) => {
      log("Session: received message from transport", message);

      if (message.type === "close") {
        await disconnect(false);

        return;
      }

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

  const TRANSPORT_LINK_TIMEOUT_MS = 45_000;
  let linkDeadline: ReturnType<typeof setTimeout> | undefined;
  let transportSetup: Promise<void> | undefined;
  const clearLinkDeadline = () => {
    clearTimeout(linkDeadline);
    linkDeadline = undefined;
  };
  let disconnecting = false;
  const disconnect = async (notify: boolean = true) => {
    if (disconnecting || status === SESSION_STATE.DISCONNECTED) return;

    disconnecting = true;
    clearLinkDeadline();
    rejectPendingRequests(new Error("Session disconnected"));

    if (notify) {
      try {
        const message: SessionMessageClose = {
          type: "close",
          messageId: crypto.randomUUID(),
        };

        await transport?.send(message, { allowReady: true });
      }
      catch (error) {
        log("session close notification failed", error);
      }
    }

    signal.off("message", onSignalMessage);
    detachSignalState?.();
    detachSignalState = undefined;
    detachTransportState?.();
    detachTransportState = undefined;

    try {
      await Promise.all([transport?.teardown(), signal.teardown()]);
    }
    catch (error) {
      log("session teardown failed", error);
    }

    updateStatus(SESSION_STATE.DISCONNECTED);
  };
  const onTransportState = (state: TransportState) => {
    log("transport state change", state);

    if (state === TRANSPORT_STATE.CONNECTED) {
      clearLinkDeadline();
      lastError = undefined;
      updateStatus(SESSION_STATE.CONNECTED);
    }

    if (state === TRANSPORT_STATE.DISCONNECTED || state === TRANSPORT_STATE.ERROR) {
      lastError ??= state === TRANSPORT_STATE.ERROR
        ? "Peer-to-peer transport failed"
        : "Peer-to-peer transport disconnected";
      void disconnect(false);
    }
  };
  const onTransportError = (reason?: unknown) => {
    if (reason instanceof Error) lastError = reason.message;
    else if (typeof reason === "string") lastError = reason;
  };
  const startTransport = () => {
    if (!transport) {
      const selectedTransport = peerCaps
        ? selectTransportId(isHost, capabilities.transports, peerCaps.transports)
        : undefined;
      const layer = peerCaps
        ? transportLayers.find(candidate => candidate.transportId === selectedTransport)
        : transportLayers[0];

      if (!layer) {
        log("no common transport with peer", capabilities.transports, peerCaps?.transports);
        lastError ??= "No common transport with peer";
        void disconnect(false);

        return transportSetup;
      }

      log("selected transport", layer.transportId);
      transport = createTransport(layer);
      transport.emitter.on("state_change", onTransportState);
      transport.emitter.on("error", onTransportError);
      detachTransportState = () => {
        transport?.emitter.off("state_change", onTransportState);
        transport?.emitter.off("error", onTransportError);
      };
    }

    const activeTransport = transport;

    if (!activeTransport) return transportSetup;

    transportSetup ??= Promise.resolve().then(() => activeTransport.setup())
      .catch(async (error: unknown) => {
        log("transport setup failed", error);
        lastError ??= error instanceof Error ? error.message : "Transport setup failed";
        await disconnect(false);
      });

    return transportSetup;
  };
  const onSignalMessage = async (message: object) => {
    log("Session: received message from signaling", message);

    const sessionMsg = message as SessionMessage;

    if (sessionMsg.type === "response") {
      messages.emit("message", sessionMsg);
    }

    if (sessionMsg.type === "request") {
      if (!transport) {
        log("dropping negotiation message: transport not selected yet");

        return;
      }

      try {
        await transport.handle(sessionMsg.payload as TransportMessage);
      }
      catch (error) {
        // Negotiation payloads come from the (untrusted) relay; a malformed one must not become an unhandled rejection.
        log("failed to handle negotiation message", error);
      }
    }
  };

  const onSignalState = (state: SignalState) => {
    log("signal state change", state);

    if (state === SIGNAL_STATE.READY) {
      updateStatus(SESSION_STATE.READY);
    }

    if (
      (
        [
          SIGNAL_STATE.HANDSHAKE,
          SIGNAL_STATE.HANDSHAKE_PARTIAL,
        ] as SignalState[]
      ).includes(state)
    ) {
      updateStatus(SESSION_STATE.LINKING);
    }

    if (state === SIGNAL_STATE.ENCRYPTED) {
      linkDeadline ??= setTimeout(() => {
        if (status === SESSION_STATE.CONNECTED) return;

        lastError ??= "Timed out establishing the peer-to-peer connection";
        void disconnect(false);
      }, TRANSPORT_LINK_TIMEOUT_MS);
      void startTransport();
    }

    if (state === SIGNAL_STATE.ERROR) {
      log("signaling error — marking session disconnected");
      lastError ??= "Signaling failed or timed out";
      void disconnect(false);
    }
  };

  return {
    connect: async () => {
      updateStatus(SESSION_STATE.SIGNALING);
      log("connecting to session, isHost:", isHost);

      signal.on("message", onSignalMessage);

      signal.on("state_change", onSignalState);
      detachSignalState = () => signal.off("state_change", onSignalState);

      await signal.setup();
    },
    close: disconnect,
    getState() {
      return {
        status,
        signaling: signal.getState(),
        peerInfo: peerCaps?.info,
        error: lastError,
      };
    },
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
      const handler = (state?: SessionStateObject) => {
        if (state?.status === SESSION_STATE.CONNECTED) {
          emitter.off("state_change", handler);
          resolve();
        }
        else if (state?.status === SESSION_STATE.DISCONNECTED) {
          emitter.off("state_change", handler);
          reject(new Error(lastError ?? "Session failed to connect"));
        }
      };

      // Subscribe before inspecting the current status so a transition
      // between the check and the subscription cannot be missed.
      emitter.on("state_change", handler);
      handler({ status, error: lastError });
    }),
    async send(
      message: object,
      ackTimeout: number = 10_000,
      responseTimeout: number = 60 * 60_000,
    ) {
      if (!transport || signal.getState().state !== SIGNAL_STATE.ENCRYPTED) {
        throw new Error("Session not ready");
      }

      const activeTransport = transport;
      const messageId = crypto.randomUUID();

      return awaitCorrelatedResponse(messages, messageId, ackTimeout, responseTimeout, {
        pendingRejects: pendingRequestRejects,
        send: () => activeTransport.send(
          { type: "request", messageId, payload: message } satisfies SessionMessage,
        ),
      });
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
  transports: TransportLayerFn[],
  options?: SessionOptions,
): Promise<Session> => {
  const initParameters = decodeConnectionURL(connectionUrl);

  const signaling = await dynamicSignalingLayer(initParameters.p);

  if (!signaling) {
    throw new Error(`Invalid signaling protocol: ${initParameters.p}`);
  }

  return createSession(initParameters, signaling, transports, onMessage, options);
};
