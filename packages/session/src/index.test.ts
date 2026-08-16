import { decodeConnectionURL, encodeConnectionURL } from "@openlv/core";
import { webrtc } from "@openlv/transport/webrtc";
import { describe, expect, test } from "vitest";

import { connectSession, createSession, SessionStatus } from "./index.js";

describe("Session", () => {
  test("Should be able to create a session", async () => {
    const sessionA = await createSession(
      {
        sessionId: "mytestsession111",
        p: "ntfy",
        s: "https://ntfy.sh/",
      },
      [webrtc()],
      async (message) => {
        console.log("sessionA received message", message);

        return { result: "success" };
      },
    );

    expect(sessionA).toBeDefined();
    console.log(sessionA.status.get());

    await sessionA.connect();

    const handshakeParametersA = sessionA.getHandshakeParameters();
    const encodedUrl = encodeConnectionURL(handshakeParametersA);

    console.log(encodedUrl);

    const decodedUrl = decodeConnectionURL(encodedUrl);

    expect(decodedUrl).toEqual(handshakeParametersA);

    //
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log("Connecting to session B");

    const sessionB = await connectSession(
      encodedUrl,
      async (message) => {
        console.log("sessionB received message", message);

        return { result: "success" };
      },
      [webrtc()],
    );

    console.log(sessionB.status.get());
    await sessionB.connect();

    await Promise.all([sessionA, sessionB].map(
      session => session.status.until(current => current === SessionStatus.CONNECTED),
    ));

    //
    console.log("A", sessionA.status.get());
    console.log("B", sessionB.status.get());

    const response = await sessionA.send({ data: "test" });

    console.log("response", response);

    expect(response).toEqual({ result: "success" });
  });
});
