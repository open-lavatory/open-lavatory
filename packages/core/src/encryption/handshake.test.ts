import { describe, expect, test } from "vitest";

import { createHandshakeCipher, generateHandshakeKey } from "./handshake.js";

describe("Handshake", async () => {
  const k = generateHandshakeKey();
  const cipher = await createHandshakeCipher(k);

  test("should generate a 16-byte random shared key", () => {
    expect(k).toHaveLength(32);
  });

  test("should encrypt and decrypt a message", async () => {
    const message = "test";
    const encrypted = await cipher.encrypt(message);
    const decrypted = await cipher.decrypt(encrypted);

    expect(decrypted).toBe(message);
  });

  test("should derive symmetric key from decoded hex bytes", async () => {
    const key = await createHandshakeCipher("000102030405060708090a0b0c0d0e0f");
    const encrypted = await key.encrypt("hello");
    const rederived = await createHandshakeCipher("000102030405060708090a0b0c0d0e0f");

    await expect(rederived.decrypt(encrypted)).resolves.toBe("hello");
  });
});
