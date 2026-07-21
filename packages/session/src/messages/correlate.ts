import type { EventEmitter } from "eventemitter3";

import type { SessionMessage } from "./index.js";

/**
 * Await the ack and response correlated to a sent request.
 *
 * Two-phase timeout: the peer must ack within `ackTimeoutMs`, confirming it
 * received the message; after the ack the wait extends to `responseTimeoutMs`
 * — enough for user-interactive flows such as `eth_sendTransaction`.
 */
export const awaitCorrelatedResponse = (
  messages: EventEmitter<{ message: SessionMessage; }>,
  messageId: string,
  ackTimeoutMs: number,
  responseTimeoutMs: number,
): Promise<unknown> => new Promise((resolve, reject) => {
  let ackReceived = false;
  // eslint-disable-next-line prefer-const
  let ackTimer: ReturnType<typeof setTimeout> | undefined;
  let responseTimer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    clearTimeout(ackTimer);
    clearTimeout(responseTimer);
    messages.off("message", handler);
  };

  const handler = (msg: SessionMessage) => {
    if (msg.messageId !== messageId) return;

    if (msg.type === "ack" && !ackReceived) {
      ackReceived = true;
      clearTimeout(ackTimer);
      // The other side confirmed receipt; wait for the full response.
      responseTimer = setTimeout(() => {
        cleanup();
        reject(new Error("Request timed out: no response after acknowledgement"));
      }, responseTimeoutMs);

      return;
    }

    if (msg.type === "response") {
      cleanup();
      resolve(msg.payload);
    }
  };

  messages.on("message", handler);

  // Short window for the ack — tells us the peer is alive and processing.
  ackTimer = setTimeout(() => {
    if (!ackReceived) {
      cleanup();
      reject(new Error("Request timed out: remote peer did not acknowledge"));
    }
  }, ackTimeoutMs);
});
