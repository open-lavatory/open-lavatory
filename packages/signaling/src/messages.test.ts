import { describe, expect, it } from "vitest";

import { MAX_ICON_LENGTH, parseSignalMessage, validatePeerInfo } from "./messages.js";

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
        },
      },
      timestamp: 1_750_000_000_000,
    });
  });

  it("accepts an icon that is a URL -- content vetting is the renderer's job", () => {
    const message = parseSignalMessage(
      frame("capabilities", {
        transports: ["wrtc"],
        info: {
          identity: "com.example.wallet",
          name: "Example Wallet",
          icon: "https://example.com/icon.png",
        },
      }),
    );

    expect(message?.payload).toMatchObject({
      info: { icon: "https://example.com/icon.png" },
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

  it("validates outgoing peer info with descriptive reasons", () => {
    expect(validatePeerInfo({ identity: "com.example.wallet", name: "Example Wallet" }))
      .toBeUndefined();
    expect(validatePeerInfo({
      identity: "com.example.wallet",
      name: "Example Wallet",
      icon: "data:image/png;base64,aaaa",
    })).toBeUndefined();
    expect(validatePeerInfo({ identity: "", name: "Example Wallet" }))
      .toMatch(/identity/);
    expect(validatePeerInfo({ identity: "com.example.wallet", name: "x".repeat(200) }))
      .toMatch(/name/);
    expect(validatePeerInfo({
      identity: "com.example.wallet",
      name: "Example Wallet",
      icon: "x".repeat(MAX_ICON_LENGTH + 1),
    })).toMatch(/icon/);
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
