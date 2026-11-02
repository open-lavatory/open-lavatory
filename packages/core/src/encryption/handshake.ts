import { bytesToHex, concatBytes, hexToBytes } from "@noble/ciphers/utils.js";

import type { Cipher } from "./asymmetric.js";
import { fromBase64, toBase64 } from "./base64.js";

const HANDSHAKE_KEY_BYTES = 16;
const IV_BYTES = 12;

export const createHandshakeCipher = async (k: string): Promise<Cipher> => {
  const baseKey = Uint8Array.from(hexToBytes(k));

  if (baseKey.length !== HANDSHAKE_KEY_BYTES) {
    throw new Error(
      `Handshake key must be ${HANDSHAKE_KEY_BYTES} bytes, got ${baseKey.length}`,
    );
  }

  const sharedSecret = await crypto.subtle.importKey(
    "raw",
    baseKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );

  return {
    encrypt: async (message) => {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        sharedSecret,
        new TextEncoder().encode(message),
      );

      return toBase64(concatBytes(iv, new Uint8Array(encrypted)));
    },
    decrypt: async (ciphertext) => {
      const combined = fromBase64(ciphertext);
      const iv = combined.slice(0, IV_BYTES);
      const encrypted = combined.slice(IV_BYTES);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        sharedSecret,
        encrypted,
      );

      return new TextDecoder().decode(decrypted);
    },
  };
};

export const generateHandshakeKey = (): string => {
  const array = new Uint8Array(HANDSHAKE_KEY_BYTES);

  crypto.getRandomValues(array);

  return bytesToHex(array);
};
