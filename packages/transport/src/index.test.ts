import { generateKeyPair } from "@openlv/core/encryption";
import { EventEmitter } from "eventemitter3";
import { describe, expect, it } from "vitest";

import { Status } from "./index.js";
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
    await Promise.all([transportA, transportB].map(transport => new Promise<void>((resolve) => {
      if (transport.status.get() === Status.CONNECTED) return resolve();

      transport.status.subscribe((status) => {
        if (status === Status.CONNECTED) resolve();
      });
    })));

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
});
