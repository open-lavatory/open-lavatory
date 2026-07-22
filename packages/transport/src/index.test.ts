import { generateKeyPair } from "@openlv/core/encryption";
import { EventEmitter } from "eventemitter3";
import { describe, expect, it, vi } from "vitest";

import {
  createTransportBase,
  TRANSPORT_STATE,
  type TransportLayer,
  type TransportLayerBaseEmitter,
  type TransportLayerSetupParameters,
} from "./index.js";
import { webrtc } from "./webrtc/index.js";

describe("Transport", () => {
  it("should be able to create a transport", async () => {
    const { encryptionKey: publicKey, decryptionKey } = await generateKeyPair();
    const { encrypt } = publicKey;
    const { decrypt } = decryptionKey;
    const signalA = new EventEmitter<{ signal: string; message: object; }>();
    const signalB = new EventEmitter<{ signal: string; message: object; }>();

    const transportA = webrtc().create({
      encrypt,
      decrypt,
      subsend: async (m) => {
        signalA.emit("signal", m);
      },
      isHost: true,
      onmessage: (m) => {
        signalA.emit("message", m);
      },
    });
    const transportB = webrtc().create({
      encrypt,
      decrypt,
      subsend: async (m) => {
        signalB.emit("signal", m);
      },
      isHost: false,
      onmessage: (m) => {
        signalB.emit("message", m);
      },
    });

    signalA.on("signal", (m) => {
      console.log("messageA", m);
      transportB.handle(m);
    });
    signalB.on("signal", (m) => {
      console.log("messageB", m);
      transportA.handle(m);
    });

    console.log("test: setup");
    await Promise.all([transportA.setup(), transportB.setup()]);

    console.log("test: waitFor connected");
    await Promise.all([
      transportA.waitFor(TRANSPORT_STATE.CONNECTED),
      transportB.waitFor(TRANSPORT_STATE.CONNECTED),
    ]);

    console.log("test: connected");

    const awaitedMessageAtB = new Promise<object>((resolve) => {
      signalB.on("message", (m) => {
        console.log("messageB", m);
        resolve(m);
      });
    });

    console.log("test: send message to A");
    await transportA.send({ data: "test_123" });

    console.log("test: await message at B");
    const messageAtB = await awaitedMessageAtB;

    expect(messageAtB).toEqual({ data: "test_123" });

    console.log("test: message at B", messageAtB);
    const awaitedMessageAtA = new Promise<object>((resolve) => {
      signalA.on("message", (m) => {
        console.log("messageA", m);
        resolve(m);
      });
    });

    await transportB.send({ data: "test_456" });
    const messageAtA = await awaitedMessageAtA;

    expect(messageAtA).toEqual({ data: "test_456" });

    await Promise.all([transportA.teardown(), transportB.teardown()]);

    expect(transportA).toBeDefined();
    expect(transportB).toBeDefined();
  });

  it("requires an encrypted heartbeat round-trip before connecting", async () => {
    const { encryptionKey, decryptionKey } = await generateKeyPair();
    const harnessA = createMemoryTransportHarness();
    const harnessB = createMemoryTransportHarness();

    harnessA.peer = harnessB;
    harnessB.peer = harnessA;
    const parameters: TransportLayerSetupParameters = {
      encrypt: encryptionKey.encrypt,
      decrypt: decryptionKey.decrypt,
      subsend: async () => {},
      isHost: true,
      onmessage: () => {},
    };
    const transportA = harnessA.create(parameters);
    const transportB = harnessB.create({ ...parameters, isHost: false });

    await Promise.all([transportA.setup(), transportB.setup()]);
    harnessA.ready();

    await expect(Promise.race([
      transportA.waitFor(TRANSPORT_STATE.CONNECTED).then(() => "connected"),
      new Promise(resolve => setTimeout(resolve, 50)).then(() => "pending"),
    ])).resolves.toBe("pending");

    harnessB.ready();
    await Promise.all([
      transportA.waitFor(TRANSPORT_STATE.CONNECTED),
      transportB.waitFor(TRANSPORT_STATE.CONNECTED),
    ]);

    await Promise.all([transportA.teardown(), transportB.teardown()]);
  });

  it("moves to error when an updated peer stops responding to heartbeats", async () => {
    const { encryptionKey, decryptionKey } = await generateKeyPair();
    const harnessA = createMemoryTransportHarness();
    const harnessB = createMemoryTransportHarness();

    harnessA.peer = harnessB;
    harnessB.peer = harnessA;
    const parameters: TransportLayerSetupParameters = {
      encrypt: encryptionKey.encrypt,
      decrypt: decryptionKey.decrypt,
      subsend: async () => {},
      isHost: true,
      onmessage: () => {},
    };
    const transportA = harnessA.create(parameters);
    const transportB = harnessB.create({ ...parameters, isHost: false });

    await Promise.all([transportA.setup(), transportB.setup()]);
    harnessA.ready();
    harnessB.ready();

    await new Promise(resolve => setTimeout(resolve, 300));
    harnessB.acceptInbound = false;
    const now = Date.now();
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now + 31_000);

    await transportA.waitFor(TRANSPORT_STATE.ERROR);
    await transportB.teardown();
    dateNow.mockRestore();
  }, 15_000);

  it("allows close messages during the ready phase when explicitly permitted", async () => {
    const { encryptionKey, decryptionKey } = await generateKeyPair();
    const received: object[] = [];
    const harnessA = createMemoryTransportHarness();
    const harnessB = createMemoryTransportHarness();

    harnessA.peer = harnessB;
    harnessB.peer = harnessA;
    const parameters: TransportLayerSetupParameters = {
      encrypt: encryptionKey.encrypt,
      decrypt: decryptionKey.decrypt,
      subsend: async () => {},
      isHost: true,
      onmessage: () => {},
    };
    const transportA = harnessA.create(parameters);
    const transportB = harnessB.create({
      ...parameters,
      isHost: false,
      onmessage: (message) => {
        received.push(message);
      },
    });

    await Promise.all([transportA.setup(), transportB.setup()]);
    harnessA.ready();
    harnessB.acceptInbound = true;

    await expect(transportA.send(
      { type: "close", messageId: "close-1" },
      { allowReady: true },
    )).resolves.toBeUndefined();
    expect(received).toEqual([{ type: "close", messageId: "close-1" }]);

    await Promise.all([transportA.teardown(), transportB.teardown()]);
  });
});

type MemoryTransportHarness = {
  acceptInbound: boolean;
  peer?: MemoryTransportHarness;
  create: (parameters: TransportLayerSetupParameters) => TransportLayer;
  ready: () => void;
  receive: (message: string) => void;
};

const createMemoryTransportHarness = (): MemoryTransportHarness => {
  let emitter: TransportLayerBaseEmitter | undefined;
  const harness: MemoryTransportHarness = {
    acceptInbound: false,
    create(parameters) {
      return createTransportBase("memory", ({ emitter: internalEmitter }) => {
        emitter = internalEmitter;

        return {
          setup: () => {},
          teardown: () => {},
          handle: async () => {},
          send: async (message) => {
            harness.peer?.receive(message);
          },
        };
      }).create(parameters);
    },
    ready() {
      harness.acceptInbound = true;
      emitter?.emit("ready");
    },
    receive(message) {
      if (!harness.acceptInbound) return;

      emitter?.emit("message", message);
    },
  };

  return harness;
};
