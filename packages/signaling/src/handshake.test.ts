import {
  deriveSymmetricKey,
  type EncryptionKey,
  generateKeyPair,
  hashPublicKey,
  parseEncryptionKey,
} from "@openlv/core/encryption";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSignalingLayer, SIGNAL_STATE, type SignalingLayer } from "./index.js";
import type { SignalingChannel } from "./protocol.js";

/**
 * In-memory topic emulating a public relay: every publish is delivered to
 * all subscribers (including the sender, like MQTT echo). A `drop` predicate
 * simulates lossy delivery.
 */
const neverDrop = () => false;

const createTopic = () => {
  const subscribers: ((payload: string) => void)[] = [];
  let drop: (payload: string, index: number) => boolean = neverDrop;
  let published = 0;

  return {
    setDrop(fn: (payload: string, index: number) => boolean) {
      drop = fn;
    },
    inject(payload: string) {
      for (const subscriber of subscribers) subscriber(payload);
    },
    channel(): SignalingChannel {
      return {
        type: "memory",
        setup: () => {},
        teardown: () => {},
        publish: (payload: string) => {
          const index = published++;

          if (drop(payload, index)) return;

          // Deliver asynchronously, as a real relay would.
          queueMicrotask(() => {
            for (const subscriber of subscribers) subscriber(payload);
          });
        },
        subscribe: (handler) => {
          subscribers.push(handler);
        },
      };
    },
  };
};

const createPeer = async (
  channel: SignalingChannel,
  { isHost, h, k }: { isHost: boolean; h: string; k: string; },
) => {
  const { encryptionKey, decryptionKey } = await generateKeyPair();
  let relyingKey: EncryptionKey | undefined;

  const layer = await createSignalingLayer(channel)({
    isHost,
    h,
    k: await deriveSymmetricKey(k),
    publicKey: encryptionKey,
    canEncrypt: () => relyingKey !== undefined,
    encrypt: (message: string) => {
      if (!relyingKey) throw new Error("no peer key");

      return relyingKey.encrypt(message);
    },
    decrypt: (message: string) => decryptionKey.decrypt(message),
    rpDiscovered: async (rpKey: string) => {
      relyingKey = await parseEncryptionKey(rpKey);
    },
  });

  return { layer, encryptionKey };
};

const K = "00112233445566778899aabbccddeeff";

const setupPair = async (topic: ReturnType<typeof createTopic>) => {
  // Mirror createSession: the host's h is the hash of its own key, the
  // client receives that h out-of-band (via the URI).
  const hostKeys = await generateKeyPair();
  const h = await hashPublicKey(hostKeys.encryptionKey);

  let hostRelying: EncryptionKey | undefined;
  const host = await createSignalingLayer(topic.channel())({
    isHost: true,
    h,
    k: await deriveSymmetricKey(K),
    publicKey: hostKeys.encryptionKey,
    canEncrypt: () => hostRelying !== undefined,
    encrypt: (message: string) => {
      if (!hostRelying) throw new Error("no peer key");

      return hostRelying.encrypt(message);
    },
    decrypt: (message: string) => hostKeys.decryptionKey.decrypt(message),
    rpDiscovered: async (rpKey: string) => {
      hostRelying = await parseEncryptionKey(rpKey);
    },
  });

  const { layer: client } = await createPeer(topic.channel(), {
    isHost: false,
    h,
    k: K,
  });

  return { host, client };
};

const waitForState = (layer: SignalingLayer, target: string) =>
  new Promise<void>((resolve, reject) => {
    if (layer.getState().state === target) return resolve();

    layer.on("state_change", (state) => {
      if (state === target) resolve();

      if (state === SIGNAL_STATE.ERROR && target !== SIGNAL_STATE.ERROR) {
        reject(new Error("signaling errored"));
      }
    });
  });

describe("signaling handshake (in-memory relay)", () => {
  let host: SignalingLayer;
  let client: SignalingLayer;

  afterEach(async () => {
    await host?.teardown();
    await client?.teardown();
  });

  it("completes and exchanges data on a reliable relay", async () => {
    const topic = createTopic();

    ({ host, client } = await setupPair(topic));

    await host.setup();

    const encrypted = Promise.all([
      waitForState(host, SIGNAL_STATE.ENCRYPTED),
      waitForState(client, SIGNAL_STATE.ENCRYPTED),
    ]);

    await client.setup();
    await encrypted;

    const received = new Promise<object>(resolve => host.on("message", resolve));

    await client.send({ hello: "world" });
    expect(await received).toEqual({ hello: "world" });
  });

  it("ignores garbage frames on the public topic", async () => {
    const topic = createTopic();

    ({ host, client } = await setupPair(topic));

    await host.setup();

    // Garbage before and during the handshake: random text, valid-looking
    // frames with undecryptable bodies, and truncated frames.
    topic.inject("not-a-frame");
    topic.inject("hh");
    topic.inject("hcQUJDRA==");
    topic.inject("xh!!!not-base64!!!");

    const encrypted = Promise.all([
      waitForState(host, SIGNAL_STATE.ENCRYPTED),
      waitForState(client, SIGNAL_STATE.ENCRYPTED),
    ]);

    await client.setup();
    topic.inject("hcgarbage-mid-handshake");
    await encrypted;
  });

  describe("lossy relay", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("recovers when handshake frames are dropped", async () => {
      const topic = createTopic();

      // Drop the first delivery of every frame; re-sends get through.
      const seen = new Set<string>();

      topic.setDrop((payload) => {
        if (seen.has(payload.slice(0, 2) + payload.length)) return false;

        seen.add(payload.slice(0, 2) + payload.length);

        return true;
      });

      ({ host, client } = await setupPair(topic));

      await host.setup();
      await client.setup();

      const encrypted = Promise.all([
        waitForState(host, SIGNAL_STATE.ENCRYPTED),
        waitForState(client, SIGNAL_STATE.ENCRYPTED),
      ]);

      // Let several resend intervals elapse.
      for (let index = 0; index < 10; index += 1) {
        await vi.advanceTimersByTimeAsync(2100);
      }

      await encrypted;
    });

    it("errors out when the peer never appears", async () => {
      const topic = createTopic();

      topic.setDrop(() => true);

      ({ host, client } = await setupPair(topic));

      await client.setup();

      const errored = waitForState(client, SIGNAL_STATE.ERROR);

      await vi.advanceTimersByTimeAsync(31_000);
      await errored;
      expect(client.getState().state).toBe(SIGNAL_STATE.ERROR);
    });
  });
});
