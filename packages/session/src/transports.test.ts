import { describe, expect, it } from "vitest";

import { selectTransportId } from "./transports.js";

describe("selectTransportId", () => {
  it("picks the first host preference the client supports", () => {
    expect(selectTransportId(true, ["ws", "wrtc"], ["wrtc", "ws"])).toBe("ws");
    expect(selectTransportId(true, ["wrtc", "ws"], ["ws"])).toBe("ws");
  });

  it("computes the same result from both perspectives", () => {
    const hostTransports = ["ws", "wrtc"];
    const clientTransports = ["wrtc", "ws"];

    expect(selectTransportId(true, hostTransports, clientTransports))
      .toBe(selectTransportId(false, clientTransports, hostTransports));
  });

  it("skips identifiers the client has never heard of", () => {
    expect(selectTransportId(true, ["quic", "wrtc"], ["wrtc"])).toBe("wrtc");
  });

  it("returns undefined when there is no common transport", () => {
    expect(selectTransportId(true, ["ws"], ["wrtc"])).toBeUndefined();
    expect(selectTransportId(true, ["wrtc"], [])).toBeUndefined();
  });
});
