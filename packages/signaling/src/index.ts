import { make } from "@openlv/core";
import type { EncryptionKey, SymmetricKey } from "@openlv/core/encryption";
import { parseEncryptionKey, validatePublicKeyHash } from "@openlv/core/encryption";
import { EventEmitter } from "eventemitter3";
import { match } from "ts-pattern";

import {
  parseSignalMessage,
  type PeerCapabilities,
  type SignalMessage,
} from "./messages.js";
import type { SignalingChannel } from "./protocol.js";
import { log } from "./utils/log.js";

export * from "./messages.js";
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
  rpDiscovered: (rpKey: string) => Promise<void>;
  // Our capabilities, advertised to the peer during the handshake
  capabilities: PeerCapabilities;
  peerCapabilities: (capabilities: PeerCapabilities) => Promise<void>;
  // Decrypt using our private key
  decrypt: (message: string) => Promise<string>;
  // Encrypt to relying party
  encrypt: (message: string) => Promise<string>;
  // our public key
  publicKey: EncryptionKey;
  canEncrypt: () => boolean;
};

export type SignalingContext = {
  type: string;

  // Sending only works once keys are exchanged
  send: (message: object) => Promise<void>;
  setup: () => Promise<void>;
  teardown: () => Promise<void>;

  getState: () => {
    state: SignalState;
  };
};
export type SignalingLayer = EventEmitter<SignalEventMap> & SignalingContext;
export type SignalingLayerFunction = (
  properties: SignalingProperties,
) => Promise<SignalingLayer>;

/**
 * Base Signaling Layer implementation
 *
 * https://openlv.sh/api/signaling
 */
export const createSignalingLayer = (
  base: SignalingChannel,
): SignalingLayerFunction => async ({
  canEncrypt,
  encrypt,
  decrypt,
  rpDiscovered,
  capabilities,
  peerCapabilities,
  h,
  k,
  publicKey,
  isHost,
}: SignalingProperties) => {
  const emitter = new EventEmitter<SignalEventMap>();
  let state: SignalState = SIGNAL_STATE.STANDBY;
  const handshakeKey = k || undefined;

  const setState = (_state: SignalState) => {
    if (state === _state) return;

    state = _state;

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

    const message = match(method)
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

    await base.publish(prefix + recipient + message);
  };

  const recordPeerCapabilities = async (
    peerCaps: PeerCapabilities,
  ): Promise<void> => {
    // Same overwrite guard as the peer key: only the first delivery counts,
    // re-sent duplicates are no-ops.
    if (isPeerCapabilitiesRecorded) return;

    isPeerCapabilitiesRecorded = true;
    await peerCapabilities(peerCaps);
  };

  const capabilitiesMessage = (): SignalMessage => ({
    type: "capabilities",
    payload: capabilities,
    timestamp: Date.now(),
  });
  const pubkeyMessage = (): SignalMessage => ({
    type: "pubkey",
    payload: { publicKey: publicKey.toString() },
    timestamp: Date.now(),
  });

  const handleHandshakeFrame = async (message: SignalMessage) => {
    await match({ msg: message, state, isHost })
      .with({ msg: { type: "flash" }, state: SIGNAL_STATE.READY, isHost: true }, async () => {
        setState(SIGNAL_STATE.HANDSHAKE);
        await sendRepeating("handshake", "c", pubkeyMessage());
      })
      // Client: host announced its public key.
      .with({ msg: { type: "pubkey" }, isHost: false, state: SIGNAL_STATE.HANDSHAKE }, async ({ msg: { payload: messagePayload } }) => {
        try {
          const receivedKey = await parseEncryptionKey(messagePayload.publicKey);

          if (!await validatePublicKeyHash(receivedKey, h)) {
            setState(SIGNAL_STATE.ERROR);
            log("Received host public key does not match expected hash -- possible tampering");

            return;
          }
        }
        catch {
          setState(SIGNAL_STATE.ERROR);
          log("Failed to parse received host public key");

          return;
        }

        if (!await recordPeerKey(messagePayload.publicKey)) return;

        setState(SIGNAL_STATE.HANDSHAKE_PARTIAL);

        return await sendRepeating("encrypted", "h", pubkeyMessage());
      })
      .otherwise(() => {
        log("Ignoring handshake frame", message.type, "in state", state);
      });
  };

  const handleEncryptedFrame = async (message: SignalMessage) => {
    await match({ msg: message, state, isHost })
      // Host: client responded with its public key.
      .with(
        { msg: { type: "pubkey" }, isHost: true, state: SIGNAL_STATE.HANDSHAKE },
        async ({ msg: { payload: messagePayload } }) => {
          if (!await recordPeerKey(messagePayload.publicKey)) return;

          setState(SIGNAL_STATE.HANDSHAKE_PARTIAL);

          return await sendRepeating("encrypted", "c", capabilitiesMessage());
        },
      )
      .with(
        { msg: { type: "capabilities" }, state: SIGNAL_STATE.HANDSHAKE_PARTIAL },
        async ({ msg: { payload: messagePayload } }) => {
          await recordPeerCapabilities(messagePayload);
          setState(SIGNAL_STATE.ENCRYPTED);

          if (isHost) return;

          return await send("encrypted", "h", capabilitiesMessage());
        },
      )
      // Client already encrypted, but the host is still re-sending its
      // capabilities (our final packet was lost): answer again so the host
      // can finish.
      .with(
        { msg: { type: "capabilities" }, state: SIGNAL_STATE.ENCRYPTED, isHost: false },
        async () => await send("encrypted", "h", capabilitiesMessage()),
      )
      .with({ msg: { type: "data" }, state: SIGNAL_STATE.ENCRYPTED }, async () => {
        emitter.emit("message", message.payload as object);
      })
      .otherwise(() => {
        log("Ignoring encrypted frame", message.type, "in state", state);
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

        const message = parseSignalMessage(await handshakeKey.decrypt(body));

        if (message) await handleHandshakeFrame(message);
      }
      else if (prefix === XR_PREFIX) {
        const message = parseSignalMessage(await decrypt(body));

        if (message) await handleEncryptedFrame(message);
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
    type: base.type,
    async setup() {
      setState(SIGNAL_STATE.CONNECTING);
      await base.setup();
      await base.subscribe(handleReceive);

      if (canEncrypt()) {
        setState(SIGNAL_STATE.ENCRYPTED);

        return;
      }

      setState(SIGNAL_STATE.READY);

      if (!isHost) {
        // Enter HANDSHAKE before publishing: the host's pubkey reply can
        // arrive while the publish is still in flight.
        setState(SIGNAL_STATE.HANDSHAKE);
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
      await base.teardown?.();
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
