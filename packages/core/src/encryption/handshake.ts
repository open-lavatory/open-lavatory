import { bytesToHex, hexToBytes } from "@noble/ciphers/utils.js";

export type SymmetricKey = {
  toString: () => string;
  encrypt: (message: string) => Promise<string>;
  decrypt: (message: string) => Promise<string>;
};

const HANDSHAKE_KEY_BYTES = 16;
const IV_BYTES = 12;

export const deriveSymmetricKey = async (k: string): Promise<SymmetricKey> => {
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
    toString: () => k,
    encrypt: async (message: string) => {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        sharedSecret,
        new TextEncoder().encode(message),
      );
      const combined = new Uint8Array(iv.length + encrypted.byteLength);

      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      return btoa(String.fromCharCode.apply(null, Array.from(combined)));
    },
    decrypt: async (message: string) => {
      const combined = new Uint8Array(
        atob(message)
          .split("")
          .map(char => char.codePointAt(0)!),
      );
      const iv = combined.slice(0, IV_BYTES);
      const encrypted = combined.slice(IV_BYTES);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        sharedSecret,
        encrypted,
      );
      const decoder = new TextDecoder();

      return decoder.decode(decrypted);
    },
  };
};

/**
 * Generate a 16-byte random shared key and return as hex
 */
export const generateHandshakeKey = async (): Promise<SymmetricKey> => {
  const array = new Uint8Array(HANDSHAKE_KEY_BYTES);

  crypto.getRandomValues(array);

  return await deriveSymmetricKey(bytesToHex(array));
};
