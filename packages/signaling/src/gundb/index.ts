import { SignalNoConnectionError } from "@openlv/core/errors";
import Gun, { type IGun, type IGunInstance } from "gun";

import { createSignalingLayer } from "../index.js";
import type { SignalingProtocol } from "../protocol.js";
import { log } from "../utils/log.js";

/**
 * GunDB Signaling Layer
 * https://openlv.sh/api/signaling/gun
 */
export const gundb: SignalingProtocol = ({ topic, url }) => {
  const endpoint = url || "wss://try.axe.eco/gun";
  let connection: IGunInstance | undefined;

  return createSignalingLayer({
    type: "gundb",
    async setup() {
      log("GUNDB: Setting up");
      const x = new (Gun as unknown as IGun)({
        peers: [endpoint],
        file: undefined,
        localStorage: undefined,
      });

      connection = x;

      await connection?.get(topic);
    },
    teardown() {
      connection?.get(topic).off();
      connection = undefined;
    },
    async publish(payload) {
      if (!connection) throw new SignalNoConnectionError();

      log("GUNDB: Publishing message", topic, payload);
      connection.get(topic).put({ data: payload });
    },
    async subscribe(handler) {
      if (!connection) throw new SignalNoConnectionError();

      connection.get(topic).on((data) => {
        log("GUNDB: Received message", data);

        const message = data.data?.toString();

        if (!message) return;

        handler(message);
      });
    },
  });
};

Object.assign(gundb, {
  __name: "gundb",
});
