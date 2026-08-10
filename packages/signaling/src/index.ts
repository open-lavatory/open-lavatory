import { make, type Observable, observable } from "@openlv/core";
import type { EncryptionKey, SymmetricKey } from "@openlv/core/encryption";
import { parseEncryptionKey, validatePublicKeyHash } from "@openlv/core/encryption";
import { EventEmitter } from "eventemitter3";
import { match } from "ts-pattern";

import { handshake, XR_H_PREFIX, XR_PREFIX } from "./handshake.js";
import {
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
  message: (message: object) => void;
};

export type SignalingHooks = {
  isHost: boolean;
  h: string;
  k?: SymmetricKey;
  // Our capabilities, advertised to the peer during the handshake
  capabilities: PeerCapabilities;
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

  state: Observable<SignalState>;
  peerKey: Observable<string | undefined>;
  peerCapabilities: Observable<PeerCapabilities | undefined>;
};
export type SignalingLayer = EventEmitter<SignalEventMap> & SignalingContext;
export type SignalingLayerFunction = (
  hooks: SignalingHooks,
) => Promise<SignalingLayer>;

export type CreateSignalingLayerFunction = (
  base: SignalingChannel,
) => SignalingLayerFunction;

/**
 * Base Signaling Layer implementation
 *
 * https://openlv.sh/api/signaling
 */
export const createSignalingLayer: CreateSignalingLayerFunction = channel => async (hooks: SignalingHooks) => {
  const {
    canEncrypt,
    encrypt,
    decrypt,
    capabilities,
    h,
    k,
    publicKey,
    isHost,
  } = hooks;

  const [state, setState] = observable<SignalState>(SIGNAL_STATE.STANDBY);
  const [peerKey, setPeerKey] = observable<string | undefined>(undefined);
  const [peerCapabilities, setPeerCapabilities] = observable<PeerCapabilities | undefined>(undefined);

  const emitter = new EventEmitter<SignalEventMap>();
  const handshakeKey = k || undefined;

  if (!handshakeKey) return;

  const { frame, parse } = handshake({
    isHost,
    handshakeKey,
    encrypt,
    decrypt,
  });

  const send = async (method: "handshake" | "encrypted", payload: SignalMessage) => await channel.publish(frame(method, payload));

  // TODO: dont know why this is here
  const capabilitiesMessage = (): SignalMessage => ({
    type: "capabilities",
    payload: capabilities,
    timestamp: Date.now(),
  });
  // TODO: dont know why this is here
  const pubkeyMessage = (): SignalMessage => ({
    type: "pubkey",
    payload: { publicKey: publicKey.toString() },
    timestamp: Date.now(),
  });

  const handleHandshakeFrame = async (message: SignalMessage) => {
    await match({ msg: message, state: state.get(), isHost })
      .with({ msg: { type: "flash" }, state: SIGNAL_STATE.READY, isHost: true }, async () => {
        setState(SIGNAL_STATE.HANDSHAKE);
        await send("handshake", pubkeyMessage());
      })
      .with({ msg: { type: "pubkey" }, state: SIGNAL_STATE.HANDSHAKE, isHost: false }, async ({ msg: { payload: messagePayload } }) => {
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

        const changed = setPeerKey(messagePayload.publicKey)
          && setState(SIGNAL_STATE.HANDSHAKE_PARTIAL);

        if (!changed) return;

        return await send("encrypted", pubkeyMessage());
      })
      .otherwise(() => {
        log("Ignoring handshake frame", message.type, "in state", state);
      });
  };

  const handleEncryptedFrame = async (message: SignalMessage) => {
    await match({ msg: message, state: state.get(), isHost })
      // Host: client responded with its public key.
      .with(
        { msg: { type: "pubkey" }, isHost: true, state: SIGNAL_STATE.HANDSHAKE },
        async ({ msg: { payload: messagePayload } }) => {
          if (!setPeerKey(messagePayload.publicKey)) return;

          setState(SIGNAL_STATE.HANDSHAKE_PARTIAL);

          return await send("encrypted", capabilitiesMessage());
        },
      )
      .with(
        { msg: { type: "capabilities" }, state: SIGNAL_STATE.HANDSHAKE_PARTIAL },
        async ({ msg: { payload: messagePayload } }) => {
          await setPeerCapabilities(messagePayload);
          setState(SIGNAL_STATE.ENCRYPTED);

          if (isHost) return;

          return await send("encrypted", capabilitiesMessage());
        },
      )
      // Client already encrypted, but the host is still re-sending its
      // capabilities (our final packet was lost): answer again so the host
      // can finish.
      .with(
        { msg: { type: "capabilities" }, state: SIGNAL_STATE.ENCRYPTED, isHost: false },
        async () => await send("encrypted", capabilitiesMessage()),
      )
      .with({ msg: { type: "data" }, state: SIGNAL_STATE.ENCRYPTED }, async () => {
        emitter.emit("message", message.payload as object);
      })
      .otherwise(() => {
        log("Ignoring encrypted frame", message.type, "in state", state);
      });
  };

  const onReceive = async (payload: string) => {
    try {
      const parsed = await parse(payload);

      if (!parsed) return;

      const [stage, message] = parsed;

      if (stage === XR_H_PREFIX && message) return await handleHandshakeFrame(message);

      if (stage === XR_PREFIX && message) return await handleEncryptedFrame(message);

      log("Dropping frame with unknown prefix");
    }
    catch (error) {
      log("Dropping undecryptable or malformed frame", error);
    }
  };

  const setup = async () => {
    setState(SIGNAL_STATE.CONNECTING);
    await channel.setup();
    await channel.subscribe(onReceive);

    if (canEncrypt()) {
      setState(SIGNAL_STATE.ENCRYPTED);

      return;
    }

    setState(SIGNAL_STATE.READY);

    // if (!isHost) {
    //   // Enter HANDSHAKE before publishing: the host's pubkey reply can
    //   // arrive while the publish is still in flight.
    //   setState(SIGNAL_STATE.HANDSHAKE);
    //   await sendRepeating("handshake", "h", {
    //     type: "flash",
    //     payload: {},
    //     timestamp: Date.now(),
    //   });
    // }
  };

  const teardown = async () => {
    log("teardown");
    await channel.teardown?.();
  };

  return make(emitter, {
    type: channel.type,
    setup,
    teardown,
    send(message: object) {
      if (!canEncrypt()) {
        return Promise.reject(
          new Error("Cannot encrypt message before keys are exchanged"),
        );
      }

      return send("encrypted", {
        type: "data",
        payload: message,
        timestamp: Date.now(),
      });
    },
    state,
    peerKey,
    peerCapabilities,
  });
};
