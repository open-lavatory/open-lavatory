import type { SignalingProtocol } from "@openlv/signaling";
import { webrtc } from "@openlv/transport/webrtc";
import { describe, expect, it } from "vitest";

import { createSession } from "./index.js";

// The guards under test throw before any signaling connection is attempted.
const unreachableSignaling: SignalingProtocol = () => {
  throw new Error("signaling should not be reached");
};

const linkParameters = { p: "ntfy", s: "https://ntfy.sh/" };
const onMessage = async () => ({});

describe("createSession input validation", () => {
  it("rejects an empty transport list", async () => {
    await expect(
      createSession(linkParameters, unreachableSignaling, [], onMessage),
    ).rejects.toThrow("At least one transport is required");
  });

  it("rejects info a receiver would silently drop", async () => {
    await expect(
      createSession(linkParameters, unreachableSignaling, [webrtc()], onMessage, {
        info: {
          identity: "com.example.dapp",
          name: "Example dApp",
          icon: "x".repeat(10_000),
        },
      }),
    ).rejects.toThrow(/icon/);

    await expect(
      createSession(linkParameters, unreachableSignaling, [webrtc()], onMessage, {
        info: { identity: "", name: "Example dApp" },
      }),
    ).rejects.toThrow(/identity/);
  });
});
