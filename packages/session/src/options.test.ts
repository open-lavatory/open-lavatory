import { webrtc } from "@openlv/transport/webrtc";
import { describe, expect, it } from "vitest";

import { createSession } from "./index.js";

const linkParameters = { p: "ntfy", s: "https://ntfy.sh/" };
const onMessage = async () => ({});

describe("createSession input validation", () => {
  it("rejects an empty transport list", async () => {
    await expect(
      createSession(linkParameters, [], onMessage),
    ).rejects.toThrow("At least one transport is required");
  });

  it("rejects info a receiver would silently drop", async () => {
    await expect(
      createSession(linkParameters, [webrtc()], onMessage, {
        info: {
          identity: "com.example.dapp",
          name: "Example dApp",
          icon: "x".repeat(10_000),
        },
      }),
    ).rejects.toThrow(/icon/);

    await expect(
      createSession(linkParameters, [webrtc()], onMessage, {
        info: { identity: "", name: "Example dApp" },
      }),
    ).rejects.toThrow(/identity/);
  });
});
