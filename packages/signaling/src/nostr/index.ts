import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/curves/utils.js";
import { SignalNoConnectionError } from "@openlv/core/errors";

import { createSignalingLayer } from "../index.js";
import type { SignalingProtocol } from "../protocol.js";
import { log } from "../utils/log.js";

const NOSTR_KIND = 21_337;

type RelayMessage = [type: string, subscription: string, body: unknown, reason?: string];

/**
 * Nostr Signaling Layer
 *
 * https://openlv.sh/api/signaling/nostr
 */
export const nostr: SignalingProtocol = ({ url, topic }) => {
  const endpoint = url || "wss://relay.nostr.net/";
  const secretKey = schnorr.utils.randomSecretKey();
  const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));
  let connection: WebSocket | undefined;

  return createSignalingLayer({
    type: "nostr",
    setup() {
      return new Promise((resolve, reject) => {
        connection = new WebSocket(endpoint);
        connection.addEventListener("open", () => resolve());
        connection.addEventListener("error", () => reject(new Error(`NOSTR: could not connect to ${endpoint}`)));
        connection.addEventListener("message", (event) => {
          const [type, , body, reason] = JSON.parse(String(event.data)) as RelayMessage;

          if (type === "CLOSED" || (type === "OK" && body === false)) log("NOSTR: Relay refused", type, body, reason);
        });
      });
    },
    teardown() {
      connection?.close();
      connection = undefined;
    },
    async publish(content) {
      if (!connection) throw new SignalNoConnectionError();

      const created_at = Math.floor(Date.now() / 1000);
      const tags = [["x", topic]];
      const serialized = new TextEncoder().encode(JSON.stringify([0, pubkey, created_at, NOSTR_KIND, tags, content]));
      const eventHash = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", serialized)));
      const sig = bytesToHex(schnorr.sign(eventHash, secretKey));

      connection.send(JSON.stringify(["EVENT", { ["id"]: eventHash, pubkey, created_at, kind: NOSTR_KIND, tags, content, sig }]));
    },
    subscribe(handler) {
      const socket = connection;

      if (!socket) throw new SignalNoConnectionError();

      return new Promise((resolve, reject) => {
        socket.addEventListener("close", () => reject(new Error("NOSTR: Relay closed the connection")));
        socket.addEventListener("message", (event) => {
          const [type, subscription, body] = JSON.parse(String(event.data)) as RelayMessage;

          if (subscription !== topic) return;

          if (type === "EOSE") resolve();
          else if (type === "CLOSED") reject(new Error(`NOSTR: Relay closed subscription: ${String(body)}`));
          else if (type === "EVENT" && typeof body === "object" && body && "content" in body && typeof body.content === "string") handler(body.content);
        });

        log("NOSTR: Subscribing to topic", topic);
        socket.send(JSON.stringify(["REQ", topic, { "kinds": [NOSTR_KIND], "#x": [topic] }]));
      });
    },
  });
};
