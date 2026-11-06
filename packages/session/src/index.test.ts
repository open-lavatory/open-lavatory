import { decodeConnectionURL, encodeConnectionURL } from "@openlv/core";
import { webrtc } from "@openlv/transport/webrtc";
import { describe, expect, test, vi } from "vitest";

vi.mock("./dynamic.js", async () => {
  const { createSignalingLayer } = await import("@openlv/signaling");
  const subscribers = new Set<(payload: string) => void>();

  return {
    loadTransport: vi.fn(),
    loadSignaling: async () => () => {
      let unsubscribe = () => {};

      return createSignalingLayer({
        type: "memory",
        setup: () => {},
        teardown: () => { unsubscribe(); },
        subscribe: (handler) => {
          subscribers.add(handler);
          unsubscribe = () => { subscribers.delete(handler); };
        },
        publish: (payload) => {
          queueMicrotask(() => {
            for (const subscriber of subscribers) subscriber(payload);
          });
        },
      });
    },
  };
});

import { connectSession, createSession, RequestFailedError, SessionStatus } from "./index.js";

describe("Session", () => {
  test.each(["host", "client"])("resumes after only the %s transport disappears", async (role) => {
    const onMessage = async () => ({ resumed: true });
    const host = await createSession(
      { p: "ntfy", s: "memory" },
      [webrtc({ iceServers: [] })],
      onMessage,
    );
    const client = await connectSession(
      encodeConnectionURL(host.getHandshakeParameters()),
      onMessage,
      [webrtc({ iceServers: [] })],
    );
    await Promise.all([host.connect(), client.connect()]);
    await Promise.all([host, client].map(
      session => session.status.until(state => state === SessionStatus.CONNECTED),
    ));

    const previous = role === "host" ? host : client;
    const stayed = role === "host" ? client : host;
    const saved = previous.getResumeParameters();

    // Lose the channel before cleanup so the peer receives no session-close packet.
    await previous._internal.transport?.teardown();
    await previous.close();
    await stayed.status.until(state => state === SessionStatus.RECOVERING);

    const restored = await createSession(saved, [webrtc({ iceServers: [] })], onMessage);
    await restored.connect();
    await Promise.all([stayed, restored].map(
      session => session.status.until(state => state === SessionStatus.CONNECTED),
    ));
    await expect(stayed.send({ method: "after reload" })).resolves.toEqual({ resumed: true });
    await Promise.all([stayed.close(), restored.close()]);
  });

  test("Should be able to create a session", async () => {
    const sessionA = await createSession(
      {
        sessionId: "mytestsession111",
        p: "ntfy",
        s: "https://ntfy.sh/",
      },
      [webrtc({ iceServers: [] })],
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

        if (JSON.stringify(message).includes("boom")) {
          throw new Error("failed to sign with privkey 12345");
        }

        return { result: "success" };
      },
      [webrtc({ iceServers: [] })],
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

    // A throwing handler fails the request at once instead of leaving it to time out.
    await expect(sessionA.send({ data: "boom" })).rejects.toBeInstanceOf(RequestFailedError);

    const resumeParametersA = sessionA.getResumeParameters();
    const resumeParametersB = sessionB.getResumeParameters();

    expect(resumeParametersA.selectedTransportId).toBe("wrtc");
    expect(resumeParametersB.peerKey).toBeDefined();

    await Promise.all([sessionA.close(), sessionB.close()]);

    const resumedA = await createSession(
      resumeParametersA,
      [webrtc({ iceServers: [] })],
      async () => ({ result: "resumed" }),
    );
    const resumedB = await createSession(
      resumeParametersB,
      [webrtc({ iceServers: [] })],
      async () => ({ result: "resumed" }),
    );

    await Promise.all([resumedA.connect(), resumedB.connect()]);
    await Promise.all([resumedA, resumedB].map(
      session => session.status.until(current => current === SessionStatus.CONNECTED),
    ));

    await expect(resumedA.send({ data: "after resume" })).resolves.toEqual({ result: "resumed" });

    await Promise.all([resumedA.close(), resumedB.close()]);
  });
});
