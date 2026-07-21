import { bytesToHex } from "@noble/ciphers/utils.js";

import type { EncryptionKey } from "./asymmetric.js";

const HASH_LENGTH = 16;

/**
 * Hashes a public key using SHA-256 and returns the first 16 bytes as a hex string
 */
export const hashPublicKey = async (
  publicKey: EncryptionKey,
): Promise<string> => {
  const buffer = new TextEncoder().encode(publicKey.toString());
  const hash = await crypto.subtle.digest("SHA-256", buffer);

  return bytesToHex(new Uint8Array(hash)).slice(0, HASH_LENGTH);
};

export const validatePublicKeyHash = async (
  publicKey: EncryptionKey,
  hash: string,
): Promise<boolean> => {
  const computedHash = await hashPublicKey(publicKey);

  return computedHash === hash;
};

/**
 * determines/or generates the hash and dictates wether is host or not
 */
export const initHash = async (
  initialHash: string | undefined,
  encryptionKey: EncryptionKey,
) => {
  const ourHash = await hashPublicKey(encryptionKey);
  const hash = initialHash || ourHash;
  const isHost = hash === ourHash;

  return {
    hash,
    isHost,
  };
};
