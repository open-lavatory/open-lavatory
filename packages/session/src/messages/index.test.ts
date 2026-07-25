import { describe, expect, it } from "vitest";

import { isSessionMessage } from "./index.js";

describe("isSessionMessage", () => {
  it("accepts every session message type", () => {
    expect(isSessionMessage({ type: "request", messageId: "1", payload: null })).toBe(true);
    expect(isSessionMessage({ type: "response", messageId: "1", payload: "0x1" })).toBe(true);
    expect(isSessionMessage({ type: "ack", messageId: "1" })).toBe(true);
    expect(isSessionMessage({ type: "close" })).toBe(true);
  });

  it("rejects messages without a message id or payload", () => {
    expect(isSessionMessage({ type: "ack" })).toBe(false);
    expect(isSessionMessage({ type: "request", messageId: "1" })).toBe(false);
    expect(isSessionMessage({ type: "response", messageId: 1, payload: {} })).toBe(false);
    expect(isSessionMessage({ type: "unknown", messageId: "1", payload: {} })).toBe(false);
  });
});
