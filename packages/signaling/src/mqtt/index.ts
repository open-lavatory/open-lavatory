import { SignalNoConnectionError } from "@openlv/core/errors";
import { createMqtt, type MqttClient } from "websocket-mqtt";

import { createSignalingLayer } from "../index.js";
import type { SignalingProtocol } from "../protocol.js";
import { log } from "../utils/log.js";

/**
 * MQTT Signaling Layer
 *
 * https://openlv.sh/api/signaling/mqtt
 */
export const mqtt: SignalingProtocol = ({ url, topic }) => {
  // `url` may be an empty string when the session URI omits `s`.
  const endpoint = url || "wss://test.mosquitto.org:8081/mqtt";
  let connection: MqttClient | undefined;

  return createSignalingLayer({
    type: "mqtt",
    setup() {
      return new Promise((resolve, reject) => {
        connection = createMqtt({ url: endpoint });

        connection.on("connect", () => {
          resolve();
        });
        connection.on("error", (error) => {
          log("MQTT: Error connecting to URL", error);
          reject(error instanceof Error ? error : new Error(String(error)));
        });

        connection.on("close", () => {
          reject(new Error("MQTT: Closed connection to URL"));
        });

        connection.connect();
      });
    },
    teardown() {
      connection?.close();
      connection = undefined;
    },
    async publish(payload) {
      if (!connection) {
        throw new Error("MQTT: No connection to publish to");
      }

      connection?.publish(topic, payload, { retain: false });
    },
    async subscribe(handler) {
      if (!connection) throw new SignalNoConnectionError();

      log("MQTT: Subscribing to topic", topic);

      connection.on("message", (receivedTopic, message) => {
        log("MQTT: Received message on topic", topic);

        if (receivedTopic !== topic) return;

        const decoded = new TextDecoder().decode(message);

        handler(decoded);
      });

      await connection?.subscribe(topic);
    },
  });
};

Object.defineProperty(mqtt, "__name", { value: "mqtt" });
