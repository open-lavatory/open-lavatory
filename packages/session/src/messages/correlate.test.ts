import { EventEmitter } from "eventemitter3";
import { describe, expect, test } from "vitest";

import { awaitCorrelatedResponse, type CorrelationEvents, RequestFailedError } from "./correlate.js";

describe("awaitCorrelatedResponse", () => {
  test.each([
    ["before any ack", false],
    ["after the ack", true],
  ])("rejects at once when the peer reports failure %s", async (_name, hasAck) => {
    const messages = new EventEmitter<CorrelationEvents>();
    const pending = awaitCorrelatedResponse(messages, "request-1", 60_000, 60_000);

    if (hasAck) messages.emit("message", { type: "ack", messageId: "request-1" });

    messages.emit("message", { type: "failed", messageId: "another-request" });
    messages.emit("message", { type: "failed", messageId: "request-1" });

    await expect(pending).rejects.toBeInstanceOf(RequestFailedError);
  });
});
