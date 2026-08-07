/**
 * Open Lavatory Protocol - Decentralized Wallet Connection Library
 *
 * A privacy-first, peer-to-peer protocol for connecting dApps with wallets
 * without relying on centralized infrastructure.
 */
import type { DecryptionKey, EncryptionKey } from "@openlv/core/encryption";
import { EventEmitter } from "eventemitter3";

import type { TransportLayerBaseEventMap, TransportLayerImplFunction } from "./layer.js";
import { log } from "./utils/log.js";
import type { WebRTCConfig } from "./webrtc/index.js";

export const TRANSPORT_STATE = {
  STANDBY: "standby",
  CONNECTING: "connecting",
  READY: "ready",
  CONNECTED: "connected",
  ERROR: "error",
} as const;
export type TransportState
  = (typeof TRANSPORT_STATE)[keyof typeof TRANSPORT_STATE];

export type TLayerEventMap = {
  state_change: (state: TransportState) => void;
  error: (reason?: string) => void;
};

export type TransportLayerParameters = {
  isHost: boolean;
  encrypt: EncryptionKey["encrypt"];
  decrypt: DecryptionKey["decrypt"];
  subsend: (message: TransportMessage) => Promise<void>;
  onmessage: (message: { type: string; payload: object; messageId: string; }) => void;
};

/**
 * A transport negotiation message, relayed over signaling before the direct
 * connection exists. The shape of `type`/`payload` is owned by the selected
 * transport; unknown types must be ignored, not fatal.
 */
export type TransportMessage = {
  type: string;
  payload: string;
};
export type TransportLayer = {
  type: TransportProtocol;
  setup: () => Promise<void>;
  teardown: () => Promise<void>;
  send: (message: object) => Promise<void>;
  handle: (message: TransportMessage) => Promise<void>;
  emitter: EventEmitter<TLayerEventMap>;
};
/** Wire identifier advertised in the `capabilities` handshake packet. */
export type TransportProtocol = "wrtc" | "ws" | (string & {});
export type TransportLayerFunction = {
  transportId: TransportProtocol;
  create: (parameters: TransportLayerParameters) => TransportLayer;
};
export type Transport = (config?: WebRTCConfig) => TransportLayerFunction;

/**
 * Base Transport Layer implementation
 *
 * https://openlv.sh/api/transport
 */
export const createTransportBase = (
  transportId: TransportProtocol,
  init: TransportLayerImplFunction,
): TransportLayerFunction => ({
  transportId,
  create: ({ encrypt, decrypt, subsend, isHost, onmessage }) => {
    const emitter = new EventEmitter<TLayerEventMap>();
    const internalEmitter = new EventEmitter<TransportLayerBaseEventMap>();
    let state: TransportState = TRANSPORT_STATE.STANDBY;

    const setState = (newState: TransportState) => {
      state = newState;
      emitter.emit("state_change", newState);
    };

    internalEmitter.on("negotiate", async (message) => {
      try {
        await subsend(message);
      }
      catch (error) {
        log("failed to relay negotiation message", error);
      }
    });
    internalEmitter.on("connected", () => {
      log("onConnected");
      setState(TRANSPORT_STATE.CONNECTED);
    });
    internalEmitter.on("error", (reason) => {
      log("transport error", reason);
      // Surface the reason before the state flips so listeners reading
      // state on state_change already see it.
      emitter.emit("error", reason);
      setState(TRANSPORT_STATE.ERROR);
    });
    internalEmitter.on("message", async (message) => {
      // Peer data is untrusted until decrypted AND parsed; drop anything that
      // fails either step rather than surfacing an unhandled rejection.
      try {
        const data = await decrypt(message);

        onmessage(JSON.parse(data) as { type: string; payload: object; messageId: string; });
      }
      catch (error) {
        log("dropping undecryptable transport message", error);
      }
    });

    const {
      setup,
      teardown,
      send: sendLayer,
      handle,
    } = init({
      emitter: internalEmitter,
      isHost,
    });

    const send = async (message: object) => {
      if (state !== TRANSPORT_STATE.CONNECTED)
        throw new Error("Transport not connected");

      const payload = await encrypt(JSON.stringify(message));

      await sendLayer(payload);
    };

    return {
      type: transportId,
      async setup() {
        setState(TRANSPORT_STATE.CONNECTING);
        await setup();
        setState(TRANSPORT_STATE.READY);
      },
      teardown,
      handle,
      send,
      emitter,
    };
  },
});
