import { createScope, type Scope } from "@openlv/core";
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
export const awaitCorrelatedResponse = async (
  messages: EventEmitter<CorrelationEvents>,
  messageId: string,
  ackTimeoutMs: number,
  responseTimeoutMs: number,
): Promise<unknown> => {
  const request = createScope();
  // Short window for the ack -- tells us the peer is alive and processing.
  const ackWait = request.child();

  const timeout = (scope: Scope, delayMs: number, reason: string) => new Promise<never>((_resolve, reject) => {
    scope.timeout(delayMs, () => reject(new Error(`Request timed out: ${reason}`)));
  });
  const acknowledged = new Promise<void>((resolve) => {
    ackWait.listen(messages, "message", (message: CorrelationEvents["message"]) => {
      if (message.messageId === messageId && message.type === "ack") resolve();
    });
  });
  const response = new Promise<unknown>((resolve, reject) => {
    request.listen(messages, "ended", (reason: string) => reject(new Error(reason)));
    request.listen(messages, "message", (message: CorrelationEvents["message"]) => {
      if (message.messageId !== messageId) return;

      if (message.type === "failed") reject(new RequestFailedError());
      else if (message.type === "response") resolve(message.payload);
    });
  });

  try {
    await Promise.race([acknowledged, response, timeout(ackWait, ackTimeoutMs, "remote peer did not acknowledge")]);
    await ackWait.close();

    return await Promise.race([response, timeout(request, responseTimeoutMs, "no response after acknowledgement")]);
  }
  finally {
    await request.close();
  }
};
