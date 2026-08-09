import { createScope, createTimeout } from "@openlv/core";
import type { EventEmitter } from "eventemitter3";

import type { SessionMessage } from "./index.js";

/**
 * Await the ack and response correlated to a sent request.
 *
 * Two-phase timeout: the peer must ack within `ackTimeoutMs`, confirming it
 * received the message; after the ack the wait extends to `responseTimeoutMs`
 * -- enough for user-interactive flows such as `eth_sendTransaction`.
 */
export const awaitCorrelatedResponse = (
  messages: EventEmitter<{
    message: SessionMessage;
    terminal: (reason: string) => void;
  }>,
  messageId: string,
  ackTimeoutMs: number,
  responseTimeoutMs: number,
): Promise<unknown> => new Promise((resolve, reject) => {
  let isAckReceived = false;
  const ackTimer = createTimeout();
  const responseTimer = createTimeout();
  const scope = createScope();

  scope.add(ackTimer.cancel);
  scope.add(responseTimer.cancel);

  const onTerminal = (reason: string) => {
    void scope.close();
    reject(new Error(reason));
  };

  const handler = (message: SessionMessage) => {
    if (message.messageId !== messageId) return;

    if (!isAckReceived && message.type === "ack") {
      isAckReceived = true;
      ackTimer.cancel();
      // The other side confirmed receipt; wait for the full response.
      responseTimer.schedule(() => {
        void scope.close().catch(() => {});
        reject(new Error("Request timed out: no response after acknowledgement"));
      }, responseTimeoutMs);

      return;
    }

    if (message.type === "response") {
      void scope.close().catch(() => {});
      resolve(message.payload);
    }
  };

  scope.listen(messages, "message", handler);
  scope.listen(messages, "terminal", onTerminal);

  // Short window for the ack -- tells us the peer is alive and processing.
  ackTimer.schedule(() => {
    if (isAckReceived) {
      return;
    }

    void scope.close().catch(() => {});
    reject(new Error("Request timed out: remote peer did not acknowledge"));
  }, ackTimeoutMs);
});
