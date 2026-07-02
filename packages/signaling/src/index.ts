import { make } from "@openlv/core";
import type { EncryptionKey, SymmetricKey } from "@openlv/core/encryption";
import { parseEncryptionKey, validatePublicKeyHash } from "@openlv/core/encryption";
import { EventEmitter } from "eventemitter3";
import { match } from "ts-pattern";
import type { MaybePromise } from "viem";

import { parseSignalMessage, type SignalMessage } from "./messages.js";
import type { SignalingChannel } from "./protocol.js";
import { log } from "./utils/log.js";

export * from "./protocol.js";

export const SIGNAL_STATE = {
  STANDBY: "standby",
  CONNECTING: "connecting",
  READY: "ready",
  HANDSHAKE: "handshake",
  HANDSHAKE_PARTIAL: "handshake-partial",
  ENCRYPTED: "encrypted",
  ERROR: "error",
} as const;
export type SignalState = (typeof SIGNAL_STATE)[keyof typeof SIGNAL_STATE];

export type SignalEventMap = {
  state_change: (state: SignalState) => void;
  message: (message: object) => void;
};

export type SignalingProperties = {
  isHost: boolean;
  h: string;
  k?: SymmetricKey;
  rpDiscovered: (rpKey: string) => MaybePromise<void>;
  // Decrypt using our private key
  decrypt: (message: string) => MaybePromise<string>;
  // Encrypt to relying party
  encrypt: (message: string) => MaybePromise<string>;
  // our public key
  publicKey: EncryptionKey;
  canEncrypt: () => boolean;
};

export type SignalingContext = {
  type: string;

  // Sending only works once keys are exchanged
  send: (message: object) => MaybePromise<void>;
  setup: () => MaybePromise<void>;
  teardown: () => MaybePromise<void>;

  getState: () => {
    state: SignalState;
  };
};
export type SignalingLayer = EventEmitter<SignalEventMap> & SignalingContext;
export type SignalingLayerFn = (
  properties: SignalingProperties,
) => Promise<SignalingLayer>;

export const XR_PREFIX = "x";
export const XR_H_PREFIX = "h";

/**
 * Relays are lossy (MQTT QoS 0, ntfy best-effort), so every handshake step
 * is re-sent on an interval until the state machine observes progress.
 * Receivers treat duplicates as no-ops, which keeps re-sends wire-compatible.
 */
const HANDSHAKE_RESEND_INTERVAL_MS = 2000;
const HANDSHAKE_TIMEOUT_MS = 30_000;

/**
 * Base Signaling Layer implementation
 *
 * https://openlv.sh/api/signaling
 */
export const createSignalingLayer = (
  init: SignalingChannel,
): SignalingLayerFn => async ({
  canEncrypt,
  encrypt,
  decrypt,
  rpDiscovered,
  h,
  k,
  publicKey,
  isHost,
}: SignalingProperties) => {
  const emitter = new EventEmitter<SignalEventMap>();
  let state: SignalState = SIGNAL_STATE.STANDBY;
  let peerKeyRecorded = false;
  let resendTimer: ReturnType<typeof setInterval> | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const handshakeKey = k || undefined;

  const stopResend = () => {
    clearInterval(resendTimer);
    resendTimer = undefined;
  };
  const stopTimers = () => {
    stopResend();
    clearTimeout(deadlineTimer);
    deadlineTimer = undefined;
  };

  const setState = (_state: SignalState) => {
    if (state === _state) return;

    state = _state;

    if (_state === SIGNAL_STATE.ENCRYPTED || _state === SIGNAL_STATE.ERROR) {
      stopTimers();
    }

    emitter.emit("state_change", _state);
  };

  const send = async (
    method: "handshake" | "encrypted",
    recipient: "h" | "c",
    payload: SignalMessage,
  ) => {
    const prefix = match(method)
      .with("handshake", () => XR_H_PREFIX)
      .with("encrypted", () => XR_PREFIX)
      .exhaustive();

    const message = await match(method)
      .with("handshake", () => {
        if (!handshakeKey) return;

        return handshakeKey.encrypt(JSON.stringify(payload));
      })
      .with("encrypted", () => {
        if (!canEncrypt()) return;

        return encrypt(JSON.stringify(payload));
      })
      .exhaustive();

    if (message === undefined) {
      throw new Error(`Cannot encrypt ${method} frame: key not available`);
    }

    await init.publish(prefix + recipient + message);
  };

  /**
   * Send a handshake step now, then keep re-sending it until the next step
   * (or teardown) supersedes it. Errors are logged and swallowed — the next
   * tick retries.
   */
  const sendRepeating = (
    method: "handshake" | "encrypted",
    recipient: "h" | "c",
    payload: SignalMessage,
  ) => {
    stopResend();

    const attempt = () => send(method, recipient, payload)
      .catch(error => log("handshake send failed, will retry", error));

    resendTimer = setInterval(attempt, HANDSHAKE_RESEND_INTERVAL_MS);

    return attempt();
  };

  const startHandshakeDeadline = () => {
    if (deadlineTimer) return;

    deadlineTimer = setTimeout(() => {
      if (state === SIGNAL_STATE.ENCRYPTED) return;

      log("handshake timed out");
      setState(SIGNAL_STATE.ERROR);
    }, HANDSHAKE_TIMEOUT_MS);
  };

  const recordPeerKey = async (key: string): Promise<boolean> => {
    // Never overwrite an established peer key — a second, different pubkey
    // mid-handshake is either a duplicate delivery or an injection attempt.
    if (peerKeyRecorded) return false;

    peerKeyRecorded = true;
    await rpDiscovered(key);

    return true;
  };

  const ackMessage = (): SignalMessage => ({
    type: "ack",
    payload: undefined,
    timestamp: Date.now(),
  });
  const pubkeyMessage = (): SignalMessage => ({
    type: "pubkey",
    payload: { publicKey: publicKey.toString() },
    timestamp: Date.now(),
  });

  const handleHandshakeFrame = async (msg: SignalMessage) => {
    await match({ msg, state, isHost })
      // Host: a client wants to connect. Re-entered on duplicate `flash`
      // deliveries (client re-sends until it hears our pubkey).
      .with({ msg: { type: "flash" }, state: SIGNAL_STATE.READY, isHost: true }, async () => {
        setState(SIGNAL_STATE.HANDSHAKE);
        startHandshakeDeadline();
        await sendRepeating("handshake", "c", pubkeyMessage());
      })
      // Client: host announced its public key.
      .with({ msg: { type: "pubkey" }, isHost: false, state: SIGNAL_STATE.HANDSHAKE }, async ({ msg: { payload: msgPayload } }) => {
        try {
          const receivedKey = await parseEncryptionKey(msgPayload.publicKey);

          if (!await validatePublicKeyHash(receivedKey, h)) {
            setState(SIGNAL_STATE.ERROR);
            log("Received host public key does not match expected hash — possible tampering");

            return;
          }
        }
        catch {
          setState(SIGNAL_STATE.ERROR);
          log("Failed to parse received host public key");

          return;
        }

        if (!await recordPeerKey(msgPayload.publicKey)) return;

        setState(SIGNAL_STATE.HANDSHAKE_PARTIAL);

        return await sendRepeating("encrypted", "h", pubkeyMessage());
      })
      .otherwise(() => {
        log("Ignoring handshake frame", msg.type, "in state", state);
      });
  };

  const handleEncryptedFrame = async (msg: SignalMessage) => {
    await match({ msg, state, isHost })
      // Host: client responded with its public key.
      .with(
        { msg: { type: "pubkey" }, isHost: true, state: SIGNAL_STATE.HANDSHAKE },
        async ({ msg: { payload: msgPayload } }) => {
          if (!await recordPeerKey(msgPayload.publicKey)) return;

          setState(SIGNAL_STATE.HANDSHAKE_PARTIAL);

          return await sendRepeating("encrypted", "c", ackMessage());
        },
      )
      .with(
        { msg: { type: "ack" }, state: SIGNAL_STATE.HANDSHAKE_PARTIAL },
        async () => {
          setState(SIGNAL_STATE.ENCRYPTED);

          if (isHost) return;

          return await send("encrypted", "h", ackMessage());
        },
      )
      // Client already encrypted, but the host is still re-sending its ack
      // (our final ack was lost): answer again so the host can finish.
      .with(
        { msg: { type: "ack" }, state: SIGNAL_STATE.ENCRYPTED, isHost: false },
        async () => await send("encrypted", "h", ackMessage()),
      )
      .with({ msg: { type: "data" }, state: SIGNAL_STATE.ENCRYPTED }, async () => {
        emitter.emit("message", msg.payload as object);
      })
      .otherwise(() => {
        log("Ignoring encrypted frame", msg.type, "in state", state);
      });
  };

  const handleReceive = async (payload: string) => {
    // The topic is public: anyone can publish garbage. Nothing in this
    // handler may throw past this boundary, otherwise a single malformed
    // frame becomes an unhandled rejection.
    try {
      const prefix = payload.slice(0, 1);
      const recipient = payload.slice(1, 2);
      const body = payload.slice(2);
      const isRecipient = (isHost ? "h" : "c") === recipient;

      if (!isRecipient) return;

      if (prefix === XR_H_PREFIX) {
        if (!handshakeKey) return;

        const msg = parseSignalMessage(await handshakeKey.decrypt(body));

        if (msg) await handleHandshakeFrame(msg);
      }
      else if (prefix === XR_PREFIX) {
        const msg = parseSignalMessage(await decrypt(body));

        if (msg) await handleEncryptedFrame(msg);
      }
      else {
        log("Dropping frame with unknown prefix");
      }
    }
    catch (error) {
      log("Dropping undecryptable or malformed frame", error);
    }
  };

  return make(emitter, {
    type: init.type,
    async setup() {
      setState(SIGNAL_STATE.CONNECTING);
      await init.setup();
      await init.subscribe(handleReceive);

      if (canEncrypt()) {
        setState(SIGNAL_STATE.ENCRYPTED);

        return;
      }

      setState(SIGNAL_STATE.READY);

      if (!isHost) {
        // Enter HANDSHAKE before publishing: the host's pubkey reply can
        // arrive while the publish is still in flight.
        setState(SIGNAL_STATE.HANDSHAKE);
        startHandshakeDeadline();
        await sendRepeating("handshake", "h", {
          type: "flash",
          payload: {},
          timestamp: Date.now(),
        });
      }
    },
    async teardown() {
      log("teardown");
      stopTimers();
      await init.teardown?.();
    },
    send(message: object) {
      if (!canEncrypt()) {
        return Promise.reject(
          new Error("Cannot encrypt message before keys are exchanged"),
        );
      }

      const them = isHost ? "c" : "h";

      return send("encrypted", them, {
        type: "data",
        payload: message,
        timestamp: Date.now(),
      });
    },
    getState() {
      return { state: state };
    },
  });
};
