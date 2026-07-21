/**
 * Open Lavatory Protocol - Decentralized Wallet Connection Library
 *
 * A privacy-first, peer-to-peer protocol for connecting dApps with wallets
 * without relying on centralized infrastructure.
 */
import type { DecryptionKey, EncryptionKey } from "@openlv/core/encryption";
import { EventEmitter } from "eventemitter3";
import type { MaybePromise } from "viem";

import { log } from "./utils/log.js";
import type { WebRTCConfig } from "./webrtc/index.js";

export const TRANSPORT_STATE = {
  STANDBY: "standby",
  CONNECTING: "connecting",
  READY: "ready",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  ERROR: "error",
} as const;
export type TransportState =
  (typeof TRANSPORT_STATE)[keyof typeof TRANSPORT_STATE];

export type TLayerEventMap = {
  state_change: (state: TransportState) => void;
  error: (reason?: string) => void;
};

export type TransportLayerSetupParameters = {
  isHost: boolean;
  encrypt: EncryptionKey["encrypt"];
  decrypt: DecryptionKey["decrypt"];
  subsend: (message: TransportMessage) => Promise<void>;
  onmessage: (message: { type: string; payload?: object | string; messageId: string; }) => MaybePromise<void>;
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
  setup: () => MaybePromise<void>;
  teardown: () => MaybePromise<void>;
  send: (message: object, options?: TransportSendOptions) => Promise<void>;
  handle: (message: TransportMessage) => Promise<void>;
  waitFor: (state: TransportState) => Promise<void>;
  emitter: EventEmitter<TLayerEventMap>;
};
export type TransportSendOptions = {
  allowReady?: boolean;
};
/** Wire identifier advertised in the `capabilities` handshake packet. */
export type TransportProtocol = "wrtc" | "ws" | (string & {});
export type TransportLayerFn = {
  transportId: TransportProtocol;
  create: (parameters: TransportLayerSetupParameters) => TransportLayer;
};
export type Transport = (config?: WebRTCConfig) => TransportLayerFn;

export type TransportLayerImpl = {
  setup: () => MaybePromise<void>;
  teardown: () => MaybePromise<void>;
  handle: (message: TransportMessage) => Promise<void>;
  send: (message: string) => Promise<void>;
};
export type TransportLayerBaseEventMap = {
  negotiate: (message: TransportMessage) => void;
  ready: () => void;
  error: (reason?: string) => void;
  message: (message: string) => void;
};
export type TransportLayerBaseEmitter =
  EventEmitter<TransportLayerBaseEventMap>;
export type TransportLayerBaseParameters = {
  emitter: TransportLayerBaseEmitter;
  isHost: boolean;
};
export type TransportLayerImplFn = (
  parameters: TransportLayerBaseParameters,
) => TransportLayerImpl;

const CONTROL_TYPE = "__openlv_transport";
const DEFAULT_PROBE_INTERVAL = 250;
const DEFAULT_HEARTBEAT_INTERVAL = 2000;
const DEFAULT_HEARTBEAT_TIMEOUT = 5000;

/**
 * Base Transport Layer implementation
 *
 * https://openlv.sh/api/transport
 */
export const createTransportBase = (
  transportId: TransportProtocol,
  init: TransportLayerImplFn,
): TransportLayerFn => ({
  transportId,
  create: ({ encrypt, decrypt, subsend, isHost, onmessage }) => {
    const emitter = new EventEmitter<TLayerEventMap>();
    const internalEmitter = new EventEmitter<TransportLayerBaseEventMap>();
    let state: TransportState = TRANSPORT_STATE.STANDBY;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastPeerActivity: number | undefined;
    let livenessGeneration = 0;
    const setState = (newState: TransportState) => {
      if (state === newState) return;

      state = newState;
      emitter.emit("state_change", newState);
    };

    const stopLiveness = () => {
      livenessGeneration++;

      if (timer) clearTimeout(timer);

      timer = undefined;
      lastPeerActivity = undefined;
    };

    const sendControl = async (action: "ping" | "pong") => {
      const payload = await encrypt(JSON.stringify({ type: CONTROL_TYPE, action }));

      await sendLayer(payload);
    };

    const failLiveness = () => {
      stopLiveness();
      setState(TRANSPORT_STATE.ERROR);
    };

    const checkLiveness = () => {
      if (state !== TRANSPORT_STATE.READY && state !== TRANSPORT_STATE.CONNECTED) return;

      if (
        lastPeerActivity !== undefined
        && Date.now() - lastPeerActivity > DEFAULT_HEARTBEAT_TIMEOUT
      ) {
        failLiveness();

        return;
      }

      const generation = livenessGeneration;

      void sendControl("ping").catch(() => {
        if (generation === livenessGeneration) failLiveness();
      });
      const interval = state === TRANSPORT_STATE.CONNECTED
        ? DEFAULT_HEARTBEAT_INTERVAL
        : DEFAULT_PROBE_INTERVAL;

      if (interval > 0) timer = setTimeout(checkLiveness, interval);
    };
    const notePeerActivity = () => {
      lastPeerActivity = Date.now();

      if (state === TRANSPORT_STATE.READY) setState(TRANSPORT_STATE.CONNECTED);
    };

    internalEmitter.on("negotiate", (message) => {
      subsend(message).catch(error => log("failed to relay negotiation message", error));
    });
    internalEmitter.on("ready", () => {
      lastPeerActivity = Date.now();

      if (!timer) timer = setTimeout(checkLiveness, DEFAULT_PROBE_INTERVAL);
    });
    internalEmitter.on("error", (reason) => {
      log("transport error", reason);
      stopLiveness();
      // Surface the reason before the state flips so listeners reading
      // state on state_change already see it.
      emitter.emit("error", reason);
      setState(TRANSPORT_STATE.ERROR);
    });
    internalEmitter.on("message", async (message) => {
      // Peer data is untrusted until decrypted and parsed. Invalid data is
      // discarded rather than turning into an unhandled async rejection.
      let parsed: {
        type?: string;
        action?: "ping" | "pong";
        payload?: object | string;
        messageId?: string;
      };

      try {
        const data = await decrypt(message);

        parsed = JSON.parse(data) as typeof parsed;
      }
      catch (error) {
        log("dropping undecryptable transport message", error);

        return;
      }

      try {
        if (parsed.type === CONTROL_TYPE) {
          notePeerActivity();

          if (parsed.action === "ping") await sendControl("pong");

          return;
        }

        // Promote before delivering so a peer that already finished probing can
        // receive acknowledgements while this side is still READY.
        notePeerActivity();
        await onmessage(parsed as { type: string; payload?: object | string; messageId: string; });
      }
      catch (error) {
        log("transport message handling failed", error);
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

    const send = async (
      message: object,
      { allowReady = false }: TransportSendOptions = {},
    ) => {
      if (state !== TRANSPORT_STATE.CONNECTED && !(allowReady && state === TRANSPORT_STATE.READY))
        throw new Error("Transport not connected");

      const payload = await encrypt(JSON.stringify(message));

      await sendLayer(payload);
    };

    const waitFor = async (targetState: TransportState) => {
      if (state === targetState) return;

      if (state === TRANSPORT_STATE.DISCONNECTED || state === TRANSPORT_STATE.ERROR)
        throw new Error(`Transport reached terminal state: ${state}`);

      return new Promise<void>((resolve, reject) => {
        const handler = (newState: TransportState) => {
          if (newState === targetState) {
            emitter.off("state_change", handler);
            resolve();

            return;
          }

          if (newState === TRANSPORT_STATE.DISCONNECTED || newState === TRANSPORT_STATE.ERROR) {
            emitter.off("state_change", handler);
            reject(new Error(`Transport reached terminal state: ${newState}`));
          }
        };

        emitter.on("state_change", handler);
      });
    };

    return {
      type: transportId,
      async setup() {
        setState(TRANSPORT_STATE.CONNECTING);
        await setup();

        if (state === TRANSPORT_STATE.CONNECTING) setState(TRANSPORT_STATE.READY);
      },
      async teardown() {
        stopLiveness();

        try {
          await teardown();
        }
        finally {
          if (state !== TRANSPORT_STATE.ERROR) setState(TRANSPORT_STATE.DISCONNECTED);
        }
      },
      handle,
      send,
      waitFor,
      emitter,
    };
  },
});
