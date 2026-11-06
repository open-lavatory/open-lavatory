import { describe, expect, test } from "vitest";

import { createPeerCipher, generateKeyPair, isValidKeyPair } from "./asymmetric.js";
import { fromBase64, toBase64 } from "./base64.js";

describe("Peer encryption", () => {
  test("should generate a key pair", () => {
    const keyPair = generateKeyPair();

    expect(keyPair.publicKey).toHaveLength(32);
    expect(keyPair.secretKey).toHaveLength(32);
  });

  test("validates restored key pairs", () => {
    const keyPair = generateKeyPair();

    expect(isValidKeyPair(keyPair)).toBe(true);
    expect(isValidKeyPair({ ...keyPair, publicKey: generateKeyPair().publicKey })).toBe(false);
    expect(isValidKeyPair({ publicKey: new Uint8Array(32), secretKey: new Uint8Array(32) })).toBe(false);
    expect(isValidKeyPair(keyPair, new Uint8Array(32))).toBe(false);
  });

  test("should encrypt and decrypt a message", async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const message = "test";

    const toBob = await createPeerCipher(alice, bob.publicKey);
    const fromAlice = await createPeerCipher(bob, alice.publicKey);

    await expect(fromAlice.decrypt(await toBob.encrypt(message))).resolves.toBe(message);
  });

  test("should be able to encrypt large blob", async () => {
    const keyPair = generateKeyPair();
    const cipher = await createPeerCipher(keyPair, keyPair.publicKey);
    const message = Array.from({ length: 1024 * 1024 }).fill("a")
      .join("");

    await expect(cipher.decrypt(await cipher.encrypt(message))).resolves.toBe(message);
  });

  test("should decrypt the shared test vector", async () => {
    // Same bytes as the Rust test: sender secret 0x01 * 32, receiver secret 0x02 * 32, nonce 0x03 * 12.
    const keyPair = {
      publicKey: fromBase64("zo060cy2M+x7cMF4FKXHbs0CloUFDTRHRboFhw5YfVk="),
      secretKey: fromBase64("AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI="),
    };
    const peerKey = fromBase64("pOCSkrZRwni5dyxWn1+puxPZBrRqtoyd+dwrRAn4ogk=");
    const cipher = await createPeerCipher(keyPair, peerKey);
    const ciphertext = "pOCSkrZRwni5dyxWn1+puxPZBrRqtoyd+dwrRAn4ogkDAwMDAwMDAwMDAwOL3klAuRZ1a2kM5EryzNjgXIUN6C2hj8Att8QbUqi3iEg5GNHlNL2Q3C//";

    await expect(cipher.decrypt(ciphertext)).resolves.toBe("openlv peer-key test vector");
  });

  test("should reject a ciphertext from a different peer key", async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const mallory = generateKeyPair();
    const fromMallory = await createPeerCipher(mallory, bob.publicKey);
    const expectingMallory = await createPeerCipher(bob, mallory.publicKey);
    const expectingAlice = await createPeerCipher(bob, alice.publicKey);
    const ciphertext = await fromMallory.encrypt("test");

    await expect(expectingMallory.decrypt(ciphertext)).resolves.toBe("test");
    await expect(expectingAlice.decrypt(ciphertext)).rejects.toThrow("Ciphertext is not from the peer");
  });

  test("should reject a ciphertext reflected back to its sender", async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const withBob = await createPeerCipher(alice, bob.publicKey);
    const reflected = fromBase64(await withBob.encrypt("test"));

    reflected.set(bob.publicKey, 0);

    await expect(withBob.decrypt(toBase64(reflected))).rejects.toThrow();
  });
});
