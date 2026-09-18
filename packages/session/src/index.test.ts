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

  test("Should resume a saved session", { timeout: 30_000 }, async () => {
    const sessionA = await createSession(
      {
        sessionId: "resumingsession1",
        p: "ntfy",
        s: "https://ntfy.sh/",
      },
      [webrtc()],
      async () => ({ result: "host" }),
    );

    await sessionA.connect();

    const sessionB = await connectSession(
      encodeConnectionURL(sessionA.getHandshakeParameters()),
      async () => ({ result: "client" }),
      [webrtc()],
    );

    await sessionB.connect();
    await Promise.all([sessionA, sessionB].map(
      session => session.status.until(current => current === SessionStatus.CONNECTED),
    ));

    const savedA = sessionA.getConnectionParameters();
    const savedB = sessionB.getConnectionParameters();

    await Promise.all([sessionA.close(), sessionB.close()]);

    const resumedA = await createSession(savedA, [webrtc()], async () => ({ result: "host" }));
    const resumedB = await createSession(savedB, [webrtc()], async () => ({ result: "client" }));

    await resumedA.connect();
    await resumedB.connect();
    await Promise.all([resumedA, resumedB].map(
      session => session.status.until(current => current === SessionStatus.CONNECTED),
    ));

    await expect(resumedA.send({ method: "eth_chainId" })).resolves.toEqual({ result: "client" });
    await Promise.all([resumedA.close(), resumedB.close()]);
  });
});
