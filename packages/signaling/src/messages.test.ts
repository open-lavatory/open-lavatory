import { describe, expect, it } from "vitest";

import { parseSignalMessage } from "./messages.js";

const frame = (type: string, payload: unknown) =>
  JSON.stringify({ type, payload, timestamp: 1_750_000_000_000 });

describe("parseSignalMessage", () => {
  it("parses a capabilities packet with info", () => {
    const message = parseSignalMessage(
      frame("capabilities", {
        transports: ["wrtc", "ws"],
        info: {
          identity: "com.example.wallet",
          name: "Example Wallet",
          icon: "data:image/png;base64,aaaa",
          url: "https://example.com",
        },
      }),
    );

    expect(message).toEqual({
      type: "capabilities",
      payload: {
        transports: ["wrtc", "ws"],
        info: {
          identity: "com.example.wallet",
          name: "Example Wallet",
          icon: "data:image/png;base64,aaaa",
          url: "https://example.com",
        },
      },
      timestamp: 1_750_000_000_000,
    });
  });

  it("parses a capabilities packet without info", () => {
    expect(
      parseSignalMessage(frame("capabilities", { transports: ["wrtc"] })),
    ).toMatchObject({ payload: { transports: ["wrtc"] } });
  });

  it("drops unknown extra fields from capabilities payloads", () => {
    const message = parseSignalMessage(
      frame("capabilities", { transports: ["wrtc"], extra: "field" }),
    );

    expect(message?.payload).toEqual({ transports: ["wrtc"] });
  });

  it("rejects capabilities without transports", () => {
    expect(parseSignalMessage(frame("capabilities", {}))).toBeUndefined();
    expect(parseSignalMessage(frame("capabilities", { transports: [] }))).toBeUndefined();
    expect(
      parseSignalMessage(frame("capabilities", { transports: [42] })),
    ).toBeUndefined();
  });

  it("rejects capabilities with malformed info", () => {
    expect(
      parseSignalMessage(
        frame("capabilities", { transports: ["wrtc"], info: { name: "No identity" } }),
      ),
    ).toBeUndefined();
    expect(
      parseSignalMessage(
        frame("capabilities", {
          transports: ["wrtc"],
          info: {
            identity: "com.example.wallet",
            name: "Example Wallet",
            icon: "x".repeat(10_000),
          },
        }),
      ),
    ).toBeUndefined();
  });

  it("rejects retired and unknown packet types", () => {
    expect(parseSignalMessage(frame("ack", undefined))).toBeUndefined();
    expect(parseSignalMessage(frame("nonsense", {}))).toBeUndefined();
    expect(parseSignalMessage("not json")).toBeUndefined();
  });

  it("still parses flash, pubkey, and data", () => {
    expect(parseSignalMessage(frame("flash", {}))).toMatchObject({ type: "flash" });
    expect(
      parseSignalMessage(frame("pubkey", { publicKey: "abc" })),
    ).toMatchObject({ type: "pubkey" });
    expect(
      parseSignalMessage(frame("data", { anything: true })),
    ).toMatchObject({ type: "data" });
  });
});
