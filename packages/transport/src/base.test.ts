import { generateKeyPair } from "@openlv/core/encryption";
import { describe, expect, it } from "vitest";

import {
  createTransportBase,
  Status,
  type TransportMessage,
} from "./index.js";
import type { TransportLayerBaseEmitter } from "./layer.js";

const createFakeTransport = () => {
  let emitter: TransportLayerBaseEmitter | undefined;
  const sent: string[] = [];

  const factory = createTransportBase("fake", (parameters) => {
    emitter = parameters.emitter;

    return {
      setup: async () => {},
      teardown: async () => {},
      handle: async () => {},
      send: async (message) => {
        sent.push(message);
      },
    };
  });

  return {
    factory,
    sent,
    getEmitter: (): TransportLayerBaseEmitter => {
      if (!emitter) throw new Error("transport not created");

      return emitter;
    },
  };
};

describe("createTransportBase", () => {
  it("exposes the wire id on the factory and instance", () => {
    const { factory } = createFakeTransport();

    expect(factory.transportId).toBe("fake");
  });

  it("relays negotiate events through subsend", async () => {
    const { encryptionKey, decryptionKey } = await generateKeyPair();
    const { factory, getEmitter } = createFakeTransport();
    const relayed: TransportMessage[] = [];

    const layer = factory.create({
      encrypt: encryptionKey.encrypt,
      decrypt: decryptionKey.decrypt,
      isHost: true,
      onmessage: () => {},
      subsend: async (message) => {
        relayed.push(message);
      },
    });

    expect(layer.type).toBe("fake");
    await layer.setup();

    getEmitter().emit("negotiate", { type: "offer", payload: "sdp" });
    getEmitter().emit("negotiate", { type: "candidate", payload: "cand" });
    await Promise.resolve();

    expect(relayed).toEqual([
      { type: "offer", payload: "sdp" },
      { type: "candidate", payload: "cand" },
    ]);
  });

  it("encrypts outgoing messages and decrypts incoming ones", async () => {
    const { encryptionKey, decryptionKey } = await generateKeyPair();
    const { factory, sent, getEmitter } = createFakeTransport();
    const received: object[] = [];

    const layer = factory.create({
      encrypt: encryptionKey.encrypt,
      decrypt: decryptionKey.decrypt,
      isHost: true,
      onmessage: (message) => {
        received.push(message);
      },
      subsend: async () => {},
    });

    await layer.setup();
    getEmitter().emit("connected");
    expect(layer.status.get()).toBe(Status.CONNECTED);

    await layer.send({ type: "request", messageId: "1", payload: { a: 1 } });
    expect(sent).toHaveLength(1);
    // Ciphertext on the wire, not the plaintext envelope.
    expect(sent[0]).not.toContain("messageId");

    getEmitter().emit("message", sent[0]);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(received).toEqual([{ type: "request", messageId: "1", payload: { a: 1 } }]);
  });

  it("rejects sends before the transport is connected", async () => {
    const { encryptionKey, decryptionKey } = await generateKeyPair();
    const { factory } = createFakeTransport();

    const layer = factory.create({
      encrypt: encryptionKey.encrypt,
      decrypt: decryptionKey.decrypt,
      isHost: true,
      onmessage: () => {},
      subsend: async () => {},
    });

    await layer.setup();
    await expect(layer.send({ a: 1 })).rejects.toThrow("Transport not connected");
  });
});
