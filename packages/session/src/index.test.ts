import { decodeConnectionURL, encodeConnectionURL } from "@openlv/core";
import { webrtc } from "@openlv/transport/webrtc";
import { describe, expect, test, vi } from "vitest";

import { connectSession, createSession, SessionStatus } from "./index.js";

const { createChannel } = vi.hoisted(() => {
  const subscribersByTopic = new Map<string, Set<(payload: string) => void>>();

  const createChannel = (topic: string) => {
    const subscribers = subscribersByTopic.get(topic) ?? new Set<(payload: string) => void>();
    let subscriber: ((payload: string) => void) | undefined;

    subscribersByTopic.set(topic, subscribers);

    return {
      type: "memory",
      setup: () => {},
      teardown: () => {
        if (subscriber) subscribers.delete(subscriber);
      },
      publish: (payload: string) => {
        queueMicrotask(() => {
          for (const subscriber of subscribers) subscriber(payload);
        });
      },
      subscribe: (next: (payload: string) => void) => {
        subscriber = next;
        subscribers.add(next);
      },
    };
  };

  return { createChannel };
});

const createMemorySignaling = async ({ topic }: { topic: string; }) => {
  const { createSignalingLayer } = await import("@openlv/signaling");

  return createSignalingLayer(createChannel(topic));
};

vi.mock("./dynamic.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./dynamic.js")>();

  return {
    ...actual,
    loadSignaling: async () => createMemorySignaling,
  };
});

describe("Session", () => {
  test("Should create and resume a session", async () => {
    const sessionA = await createSession(
      {
        sessionId: "mytestsession111",
        p: "memory",
        s: "memory://relay",
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
