import {
  createHandshakeCipher,
  generateKeyPair,
  hashPublicKey,
  type KeyPair,
} from "@openlv/core/encryption";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSignalingLayer, Status, type SignalingLayer } from "./index.js";
import type { PeerCapabilities } from "./messages.js";
import type { SignalingChannel } from "./protocol.js";

const realSetTimeout = globalThis.setTimeout;

/**
 * In-memory topic emulating a public relay: every publish is delivered to
 * all subscribers (including the sender, like MQTT echo). A `drop` predicate
 * simulates lossy delivery.
 */
const neverDrop = () => false;

type Topic = {
  setDrop: (function_: (payload: string, index: number) => boolean) => void;
  setCopies: (copies: number) => void;
  inject: (payload: string) => void;
  channel: () => SignalingChannel;
  // Every published payload, including the dropped ones
  frames: string[];
};

const createTopic = (): Topic => {
  const subscribers: ((payload: string) => void)[] = [];
  const frames: string[] = [];
  let drop: (payload: string, index: number) => boolean = neverDrop;
  let copies = 1;

  return {
    frames,
    setCopies(count: number) {
      copies = count;
    },
    setDrop(function_: (payload: string, index: number) => boolean) {
      drop = function_;
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
          const index = frames.length;

          frames.push(payload);

          if (drop(payload, index)) return;

          // Deliver asynchronously, as a real relay would.
          queueMicrotask(() => {
            for (const subscriber of subscribers) {
              for (let copy = 0; copy < copies; copy += 1) subscriber(payload);
            }
          });
        },
        subscribe: (handler) => {
          subscribers.push(handler);
        },
      };
    },
  };
};

const CLIENT_CAPABILITIES: PeerCapabilities = {
  transports: ["wrtc"],
  info: { identity: "com.example.wallet", name: "Example Wallet" },
};

const createPeer = async (
  channel: SignalingChannel,
  { isHost, h, k, keyPair = generateKeyPair() }: {
    isHost: boolean;
    h: string;
    k: string;
    keyPair?: KeyPair;
  },
) => {
  let peerCapabilities: PeerCapabilities | undefined;

  const layer = await createSignalingLayer(channel)({
    isHost,
    h,
    handshakeCipher: await createHandshakeCipher(k),
    keyPair,
    capabilities: CLIENT_CAPABILITIES,
  });

  layer.peerCapabilities.subscribe((capabilities) => {
    peerCapabilities = capabilities;
  });

  return { layer, keyPair, getPeerCapabilities: () => peerCapabilities };
};

const K = "00112233445566778899aabbccddeeff";

const setupPair = async (topic: ReturnType<typeof createTopic>) => {
  // Mirror createSession: the host's h is the hash of its own key, the
  // client receives that h out-of-band (via the URI).
  const hostKeys = generateKeyPair();
  const h = await hashPublicKey(hostKeys.publicKey);

  const HOST_CAPABILITIES: PeerCapabilities = {
    transports: ["wrtc", "ws"],
    info: { identity: "com.example.dapp", name: "Example dApp" },
  };

  let hostPeerCapabilities: PeerCapabilities | undefined;
  const host = await createSignalingLayer(topic.channel())({
    isHost: true,
    h,
    handshakeCipher: await createHandshakeCipher(K),
    keyPair: hostKeys,
    capabilities: HOST_CAPABILITIES,
  });

  host.peerCapabilities.subscribe((capabilities) => {
    hostPeerCapabilities = capabilities;
  });

  const { layer: client, keyPair: clientKeys, getPeerCapabilities: getClientPeerCapabilities }
    = await createPeer(topic.channel(), {
      isHost: false,
      h,
      k: K,
    });

  return {
    host,
    client,
    hostKeys,
    clientKeys,
    h,
    hostCapabilities: HOST_CAPABILITIES,
    getHostPeerCapabilities: () => hostPeerCapabilities,
    getClientPeerCapabilities,
  };
};

const waitForState = (layer: SignalingLayer, target: string) =>
  new Promise<void>((resolve, reject) => {
    if (layer.status.get() === target) return resolve();

    layer.status.subscribe((state) => {
      if (state === target) resolve();

      if (state === Status.ERROR && target !== Status.ERROR) {
        // eslint-disable-next-line unicorn/no-multiple-promise-resolver-calls
        reject(new Error("signaling errored"));
      }
    });
  });

const bothEncrypted = (first: SignalingLayer, second: SignalingLayer) => Promise.all([
  waitForState(first, Status.ENCRYPTED),
  waitForState(second, Status.ENCRYPTED),
]);

// The crypto behind each send finishes in real time, outside the fake clock
const advance = async (milliseconds: number) => {
  await vi.advanceTimersByTimeAsync(milliseconds);
  await new Promise(resolve => realSetTimeout(resolve, 50));
};

const recordHistory = (layer: SignalingLayer) => {
  const statuses: string[] = [];
  const peers: unknown[] = [];

  layer.status.subscribe((value) => {
    statuses.push(value);
  });
  layer.peer.subscribe((value) => {
    peers.push(value);
  });

  return { statuses, peers };
};

const waitForStateWithin = async (layer: SignalingLayer, target: string) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${target}`)), 500);
  });

  try {
    await Promise.race([waitForState(layer, target), timeoutPromise]);
  }
  finally {
    clearTimeout(timeout);
  }
};

describe("signaling handshake (in-memory relay)", () => {
  let host: SignalingLayer;
  let client: SignalingLayer;

  afterEach(async () => {
    await host?.teardown();
    await client?.teardown();
  });

  it("completes and exchanges data on a reliable relay", async () => {
    const topic = createTopic();
    const pair = await setupPair(topic);

    ({ host, client } = pair);

    await host.setup();

    const encrypted = Promise.all([
      waitForState(host, Status.ENCRYPTED),
      waitForState(client, Status.ENCRYPTED),
    ]);

    await client.setup();
    await encrypted;

    const received = new Promise<object>(resolve => host.on("message", resolve));

    await client.send({ hello: "world" });
    expect(await received).toEqual({ hello: "world" });
  });
  it("resumes with pinned keys and exchanges capabilities before data", async () => {
    const pair = await setupPair(createTopic());
    await pair.host.setup();

    const initialHandshake = Promise.all([
      waitForState(pair.host, Status.ENCRYPTED),
      waitForState(pair.client, Status.ENCRYPTED),
    ]);
    await pair.client.setup();
    await initialHandshake;
    await pair.host.teardown();
    await pair.client.teardown();

    const topic = createTopic();
    host = await createSignalingLayer(topic.channel())({
      isHost: true,
      h: pair.h,
      keyPair: pair.hostKeys,
      peerKey: pair.clientKeys.publicKey,
      resume: true,
      capabilities: pair.hostCapabilities,
    });
    client = await createSignalingLayer(topic.channel())({
      isHost: false,
      h: pair.h,
      keyPair: pair.clientKeys,
      peerKey: pair.hostKeys.publicKey,
      resume: true,
      capabilities: CLIENT_CAPABILITIES,
    });

    expect(host.peer.get()?.peerKey).toEqual(pair.clientKeys.publicKey);
    expect(client.peer.get()?.peerKey).toEqual(pair.hostKeys.publicKey);

    await host.setup();
    const resumed = Promise.all([
      waitForState(host, Status.ENCRYPTED),
      waitForState(client, Status.ENCRYPTED),
    ]);
    await client.setup();
    await resumed;

    const received = new Promise<object>(resolve => host.on("message", resolve));
    await client.send({ resumed: true });
    expect(await received).toEqual({ resumed: true });
  });

  it.each(["host", "client"] as const)(
    "resumes when only the %s peer reloads",
    async (reloadedPeer) => {
      const topic = createTopic();
      const pair = await setupPair(topic);

      host = pair.host;
      client = pair.client;

      await host.setup();
      const initialHandshake = Promise.all([
        waitForState(host, Status.ENCRYPTED),
        waitForState(client, Status.ENCRYPTED),
      ]);
      await client.setup();
      await initialHandshake;
      host.markTransportConnected();
      client.markTransportConnected();

      const stayedPeer = reloadedPeer === "host" ? client : host;
      let resumeEvents = 0;

      const setResumeHandler = stayedPeer.setResumeHandler;
      expect(setResumeHandler).toBeDefined();
      setResumeHandler?.(async () => {
        resumeEvents++;
      });

      const resumedPeer = await createSignalingLayer(topic.channel())({
        isHost: reloadedPeer === "host",
        h: pair.h,
        keyPair: reloadedPeer === "host" ? pair.hostKeys : pair.clientKeys,
        peerKey: reloadedPeer === "host" ? pair.clientKeys.publicKey : pair.hostKeys.publicKey,
        resume: true,
        capabilities: reloadedPeer === "host"
          ? pair.hostCapabilities
          : CLIENT_CAPABILITIES,
      });

      if (reloadedPeer === "host") {
        await host.teardown();
        host = resumedPeer;
      }
      else {
        await client.teardown();
        client = resumedPeer;
      }

      await resumedPeer.setup();

      if (reloadedPeer === "host") {
        void client.resume?.().catch(() => {});
      }

      await waitForStateWithin(resumedPeer, Status.ENCRYPTED);
      expect(resumeEvents).toBe(reloadedPeer === "client" ? 1 : 0);
    },
  );

  it("fails a resume attempt when the peer does not return", async () => {
    const hostKeys = generateKeyPair();
    const clientKeys = generateKeyPair();
    const topic = createTopic();

    host = await createSignalingLayer(topic.channel())({
      isHost: true,
      h: await hashPublicKey(hostKeys.publicKey),
      handshakeCipher: await createHandshakeCipher(K),
      keyPair: hostKeys,
      peerKey: clientKeys.publicKey,
      resume: true,
      capabilities: { transports: ["wrtc"] },
    });

    vi.useFakeTimers();
    try {
      await host.setup();
      await vi.advanceTimersByTimeAsync(45_000);
      expect(host.status.get()).toBe(Status.ERROR);
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("exchanges capabilities in both directions during the handshake", async () => {
    const topic = createTopic();
    const pair = await setupPair(topic);

    ({ host, client } = pair);

    await host.setup();

    const encrypted = Promise.all([
      waitForState(host, Status.ENCRYPTED),
      waitForState(client, Status.ENCRYPTED),
    ]);

    await client.setup();
    await encrypted;

    expect(pair.getClientPeerCapabilities()).toEqual(pair.hostCapabilities);
    expect(pair.getHostPeerCapabilities()).toEqual(CLIENT_CAPABILITIES);
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
      waitForState(host, Status.ENCRYPTED),
      waitForState(client, Status.ENCRYPTED),
    ]);

    await client.setup();
    topic.inject("hcgarbage-mid-handshake");
    await encrypted;
  });

  describe("timeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("fails a joining peer whose host does not answer after 30 seconds", async () => {
      const topic = createTopic();

      topic.setDrop(() => true);
      ({ host, client } = await setupPair(topic));

      await host.setup();
      await client.setup();

      await vi.advanceTimersByTimeAsync(29_999);
      expect(client.status.get()).toBe(Status.HANDSHAKE);

      await vi.advanceTimersByTimeAsync(1);
      expect(client.status.get()).toBe(Status.ERROR);
    });

    it("fails a host 30 seconds after a flash when the joining peer goes quiet", async () => {
      const topic = createTopic();

      topic.setDrop(payload => !payload.startsWith("hh"));
      ({ host, client } = await setupPair(topic));

      await host.setup();
      await client.setup();
      await waitForState(host, Status.HANDSHAKE);

      await vi.advanceTimersByTimeAsync(29_999);
      expect(host.status.get()).toBe(Status.HANDSHAKE);

      await vi.advanceTimersByTimeAsync(1);
      expect(host.status.get()).toBe(Status.ERROR);
    });

    it("keeps a completed handshake encrypted past the limit", async () => {
      const topic = createTopic();

      ({ host, client } = await setupPair(topic));

      await host.setup();

      const encrypted = Promise.all([
        waitForState(host, Status.ENCRYPTED),
        waitForState(client, Status.ENCRYPTED),
      ]);

      await client.setup();
      await encrypted;

      await vi.advanceTimersByTimeAsync(60_000);
      expect(host.status.get()).toBe(Status.ENCRYPTED);
      expect(client.status.get()).toBe(Status.ENCRYPTED);
    });
  });

  it("ignores duplicate deliveries of every frame", async () => {
    const topic = createTopic();

    topic.setCopies(2);
    ({ host, client } = await setupPair(topic));

    const hostHistory = recordHistory(host);
    const clientHistory = recordHistory(client);

    await host.setup();

    const encrypted = bothEncrypted(host, client);

    await client.setup();
    await encrypted;

    const path = ["standby", "connecting", "ready", "handshake", "handshake-partial", "encrypted"];

    expect(hostHistory.statuses).toEqual(path);
    expect(clientHistory.statuses).toEqual(path);
    // The initial value and the one recorded peer
    expect(hostHistory.peers).toHaveLength(2);
    expect(clientHistory.peers).toHaveLength(2);
  });

  it("answers each duplicate capabilities of the host after the handshake", async () => {
    const topic = createTopic();

    ({ host, client } = await setupPair(topic));

    await host.setup();

    const encrypted = bothEncrypted(host, client);

    await client.setup();
    await encrypted;

    const sent = topic.frames.length;
    // "xc" is a peer-key frame for the joining peer: only the host's capabilities
    const hostCapabilities = topic.frames.filter(frame => frame.startsWith("xc"));

    for (const frame of [...hostCapabilities, ...hostCapabilities]) topic.inject(frame);

    await vi.waitFor(() => expect(topic.frames).toHaveLength(sent + 2));

    expect(topic.frames.slice(sent).every(frame => frame.startsWith("xh"))).toBe(true);
    expect(host.status.get()).toBe(Status.ENCRYPTED);
    expect(client.status.get()).toBe(Status.ENCRYPTED);
  });

  describe("re-send", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("sends a dropped flash again after 2 seconds", async () => {
      const topic = createTopic();

      topic.setDrop((_payload, index) => index === 0);
      ({ host, client } = await setupPair(topic));

      await host.setup();
      await client.setup();

      await advance(1999);
      expect(host.status.get()).toBe(Status.READY);

      await advance(1);
      await bothEncrypted(host, client);
    });

    it("recovers when the first delivery of every frame is dropped", async () => {
      const topic = createTopic();
      const seen = new Set<string>();

      topic.setDrop((payload) => {
        const key = payload.slice(0, 2) + payload.length;

        if (seen.has(key)) return false;

        seen.add(key);

        return true;
      });

      ({ host, client } = await setupPair(topic));

      await host.setup();
      await client.setup();

      const encrypted = bothEncrypted(host, client);

      for (let index = 0; index < 10; index += 1) {
        await advance(2100);
      }

      await encrypted;
    });

    it("stops re-sending once encrypted", async () => {
      const topic = createTopic();

      ({ host, client } = await setupPair(topic));

      await host.setup();

      const encrypted = bothEncrypted(host, client);

      await client.setup();
      await encrypted;

      const sent = topic.frames.length;

      await advance(60_000);
      expect(topic.frames).toHaveLength(sent);
    });

    it("re-sends every 2 seconds until the limit, then stops", async () => {
      const topic = createTopic();

      topic.setDrop(() => true);
      ({ host, client } = await setupPair(topic));

      await host.setup();
      await client.setup();

      await advance(29_999);
      // The first flash and one re-send every 2 seconds from 2 s to 28 s
      expect(topic.frames).toHaveLength(15);

      await advance(1);
      expect(client.status.get()).toBe(Status.ERROR);

      await advance(60_000);
      expect(topic.frames).toHaveLength(15);
    });

    it("stops re-sending on teardown", async () => {
      const topic = createTopic();

      topic.setDrop(() => true);
      ({ host, client } = await setupPair(topic));

      await host.setup();
      await client.setup();
      await advance(5000);
      await client.teardown();

      const sent = topic.frames.length;

      await advance(20_000);
      expect(topic.frames).toHaveLength(sent);
    });

    it("stops re-sending a step once the next one starts", async () => {
      const topic = createTopic();

      // The host's capabilities never arrive, so both peers stay in handshake-partial
      topic.setDrop(payload => payload.startsWith("xc"));
      ({ host, client } = await setupPair(topic));

      await host.setup();
      await client.setup();
      await Promise.all([host, client].map(layer => waitForState(layer, Status.HANDSHAKE_PARTIAL)));

      const sent = topic.frames.length;
      const sentSince = (prefix: string) => topic.frames.slice(sent).filter(frame => frame.startsWith(prefix));

      await advance(10_000);

      // The flash and the host's pubkey stopped; the steps of handshake-partial still repeat
      expect(sentSince("hh")).toEqual([]);
      expect(sentSince("hc")).toEqual([]);
      expect(sentSince("xh").length).toBeGreaterThan(1);
      expect(sentSince("xc").length).toBeGreaterThan(1);
    });
  });
});
