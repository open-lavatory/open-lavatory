/**
 * Open Lavatory Protocol - Decentralized Wallet Connection Library
 *
 * A privacy-first, peer-to-peer protocol for connecting dApps with wallets
 * without relying on centralized infrastructure.
 */
import { type Observable, observable } from "@openlv/core";
import type { DecryptionKey, EncryptionKey } from "@openlv/core/encryption";
import { EventEmitter } from "eventemitter3";

import type { TransportLayerBaseEventMap, TransportLayerImplFunction } from "./layer.js";
import { log } from "./utils/log.js";
import type { WebRTCConfig } from "./webrtc/index.js";

export const Status = {
  STANDBY: "standby",
  CONNECTING: "connecting",
  READY: "ready",
  CONNECTED: "connected",
  ERROR: "error",
} as const;
export type Status
  = (typeof Status)[keyof typeof Status];

export type TLayerEventMap = {
  error: (reason?: string) => void;
};

export type TransportLayerParameters = {
  isHost: boolean;
  encrypt: EncryptionKey["encrypt"];
  decrypt: DecryptionKey["decrypt"];
  subsend: (message: TransportMessage) => Promise<void>;
  onmessage: (message: object) => void;
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
  status: Observable<Status>;
};
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

    const [status, setStatus] = observable<Status>(Status.STANDBY);

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
      setStatus(Status.CONNECTED);
    });
    internalEmitter.on("error", (reason) => {
      log("transport error", reason);
      // Surface the reason before the state flips so listeners reading
      // state on state_change already see it.
      emitter.emit("error", reason);
      setStatus(Status.ERROR);
    });
    internalEmitter.on("message", async (message) => {
      // Peer data is untrusted until decrypted AND parsed; drop anything that
      // fails either step rather than surfacing an unhandled rejection.
      try {
        const data = await decrypt(message);

        const parsed: unknown = JSON.parse(data);

        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("Invalid transport message");
        }

        onmessage(parsed);
      }
      catch (error) {
        log("dropping undecryptable transport message", error);
      }
    });

    const {
      send: sendLayer,
      handle,
      ...channel
    } = init({
      emitter: internalEmitter,
      isHost,
    });

    const send = async (message: object) => {
      if (status.get() !== Status.CONNECTED)
        throw new Error("Transport not connected");

      const payload = await encrypt(JSON.stringify(message));

      await sendLayer(payload);
    };

    const setup = async () => {
      setStatus(Status.CONNECTING);
      await channel.setup();
      setStatus(Status.READY);
    };

    const teardown = async () => {
      await channel.teardown();
    };

    return {
      type: transportId,
      setup,
      teardown,
      handle,
      send,
      emitter,
      status,
    };
  },
});
