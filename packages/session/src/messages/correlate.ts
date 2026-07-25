import type { EventEmitter } from "eventemitter3";

import type { SessionMessageAck, SessionMessageFailed, SessionMessageResponse } from "./index.js";

/** The peer's handler threw. The peer sends no detail, so there is none here. */
export class RequestFailedError extends Error {
  override name = "RequestFailedError";

  constructor() {
    super("The remote peer failed to handle the request");
  }
}

export type CorrelationEvents = {
  message: SessionMessageAck | SessionMessageFailed | SessionMessageResponse;
  /** The session ended; every open request fails with `reason`. */
  ended: (reason: string) => void;
};

/**
 * Await the ack and response correlated to a sent request.
 *
 * Two-phase timeout: the peer must ack within `ackTimeoutMs`, confirming it
 * received the message; after the ack the wait extends to `responseTimeoutMs`
 * -- enough for user-interactive flows such as `eth_sendTransaction`.
 */
export const awaitCorrelatedResponse = (
  messages: EventEmitter<CorrelationEvents>,
  messageId: string,
  ackTimeoutMs: number,
  responseTimeoutMs: number,
): Promise<unknown> => new Promise((resolve, reject) => {
  let isAckReceived = false;
  // eslint-disable-next-line prefer-const
  let ackTimer: ReturnType<typeof setTimeout> | undefined;
  let responseTimer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    clearTimeout(ackTimer);
    clearTimeout(responseTimer);
    messages.off("message", handler);
    messages.off("ended", onEnded);
  };

  const onEnded = (reason: string) => {
    cleanup();
    reject(new Error(reason));
  };

  const handler = (message: SessionMessageAck | SessionMessageFailed | SessionMessageResponse) => {
    if (message.messageId !== messageId) return;

    if (message.type === "failed") {
      cleanup();
      reject(new RequestFailedError());

      return;
    }

    if (message.type === "ack" && !isAckReceived) {
      isAckReceived = true;
      clearTimeout(ackTimer);
      // The other side confirmed receipt; wait for the full response.
      responseTimer = setTimeout(() => {
        cleanup();
        reject(new Error("Request timed out: no response after acknowledgement"));
      }, responseTimeoutMs);

      return;
    }

    if (message.type === "response") {
      cleanup();
      resolve(message.payload);
    }
  };

  messages.on("message", handler);
  messages.on("ended", onEnded);

  // Short window for the ack -- tells us the peer is alive and processing.
  ackTimer = setTimeout(() => {
    if (isAckReceived) {
      return;
    }

    cleanup();
    reject(new Error("Request timed out: remote peer did not acknowledge"));
  }, ackTimeoutMs);
});
