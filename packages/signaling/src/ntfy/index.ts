import { EventEmitter } from "eventemitter3";
import { match } from "ts-pattern";

import { createSignalingLayer } from "../index.js";
import type { SignalingProtocol } from "../protocol.js";
import { log } from "../utils/log.js";
import { parseNtfyUrl } from "./url.js";

export type NtfyMessage = {
  // eslint-disable-next-line no-restricted-syntax
  id: string;
  time: number;
  expires: number;
  event: string;
  topic: string;
  message: string;
};

/**
 * Ntfy Signaling Layer
 *
 * Uses HTTP Post for publishing
 * Uses WebSocket for subscribing
 *
 * URL format supports the ?auth= parameter
 * example: https://ntfy.sh/mytopic?auth=mytoken
 *
 * The same goes for apprise ntfy urls
 * example: ntfy://{token}@{hostname}/{topic}
 * example: ntfy://{user}:{password}@{hostname}/{topic}
 * https variant: ntfys://{user}:{password}@{hostname}/{topic}
 *
 * https://openlv.sh/api/signaling/ntfy
 */
export const ntfy: SignalingProtocol = ({ topic, url }) => {
  let connection: WebSocket | undefined;
  const connectionInfo = parseNtfyUrl(url || "https://ntfy.sh");
  const wsProtocol = match(connectionInfo.protocol)
    .with("https", () => "wss")
    .with("http", () => "ws")
    .exhaustive();
  const events = new EventEmitter<{ message: string; }>();

  return createSignalingLayer({
    type: "ntfy",
    async setup() {
      log("NTFY: Setting up");

      const wsUrl
        = wsProtocol
          + "://"
          + connectionInfo.host
          + "/"
          + topic
          + "/ws"
          + (connectionInfo.parameters || "");

      log("NTFY: Connecting to WebSocket", wsUrl);
      connection = new WebSocket(wsUrl);

      // Resolves once the server confirms the subscription ("open" event);
      // rejects on socket error/close so setup cannot hang forever.
      await new Promise<void>((resolve, reject) => {
        connection!.addEventListener("error", () => {
          reject(new Error(`NTFY: WebSocket error connecting to ${connectionInfo.host}`));
        });

        connection!.addEventListener("close", () => {
          reject(new Error("NTFY: WebSocket closed before subscription was confirmed"));
        });

        connection!.addEventListener("message", (event) => {
          let data: NtfyMessage;

          try {
            data = JSON.parse(event.data) as NtfyMessage;
          }
          catch {
            log("NTFY: Dropping non-JSON frame");

            return;
          }

          if (data.event === "open") {
            resolve();
          }
          else if (data.event === "message" && typeof data.message === "string") {
            events.emit("message", data.message);
          }
        });
      });
    },
    teardown() {
      connection?.close();
    },
    async publish(body) {
      const headers = { "Content-Type": "application/json" } as HeadersInit;

      const response = await fetch(
        `${connectionInfo.protocol}://${connectionInfo.host}/${topic}`,
        { method: "POST", body, headers },
      );

      if (!response.ok) {
        throw new Error(`NTFY: publish failed with status ${response.status}`);
      }
    },
    subscribe: (handler) => {
      events.on("message", handler);
    },
  });
};

Object.defineProperty(ntfy, "__name", { value: "ntfy" });
