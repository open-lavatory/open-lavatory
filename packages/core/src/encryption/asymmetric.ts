import { secretbox } from "@noble/ciphers/salsa.js";
import { x25519 } from "@noble/curves/ed25519.js";

import type { SessionLinkParameters } from "../session.js";
import { fromBase64, toBase64 } from "./base64.js";

const PUBLIC_KEY_BYTES = 32;
const NONCE_BYTES = 24;

const composePayload = (
  ephemeralPublicKey: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
): string => {
  const payload = new Uint8Array(
    ephemeralPublicKey.length + nonce.length + ciphertext.length,
  );

  payload.set(ephemeralPublicKey, 0);
  payload.set(nonce, ephemeralPublicKey.length);
  payload.set(ciphertext, ephemeralPublicKey.length + nonce.length);

  return toBase64(payload);
};

const decomposePayload = (
  payload: string,
): {
  ephemeralPublicKey: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
} => {
  const bytes = fromBase64(payload);

  if (bytes.length <= PUBLIC_KEY_BYTES + NONCE_BYTES) {
    throw new Error("Encrypted payload is malformed.");
  }

  const ephemeralPublicKey = bytes.slice(0, PUBLIC_KEY_BYTES);
  const nonce = bytes.slice(PUBLIC_KEY_BYTES, PUBLIC_KEY_BYTES + NONCE_BYTES);
  const ciphertext = bytes.slice(PUBLIC_KEY_BYTES + NONCE_BYTES);

  return {
    ephemeralPublicKey,
    nonce,
    ciphertext,
  };
};

export type EncryptionKey = {
  toString: () => string;
  encrypt: (message: string) => Promise<string>;
};

export type DecryptionKey = {
  toString: () => string;
  decrypt: (message: string) => Promise<string>;
};

export const createEncryptionKey = async (
  publicKey: Uint8Array,
): Promise<EncryptionKey> => {
  if (publicKey.length !== PUBLIC_KEY_BYTES) {
    throw new Error(
      `Public key must be ${PUBLIC_KEY_BYTES} bytes, got ${publicKey.length}`,
    );
  }

  const serializedPublicKey = toBase64(publicKey);

  return {
    toString: () => serializedPublicKey,
    encrypt: async (message: string) => {
      const ephemeralSecret = x25519.utils.randomSecretKey();
      const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);
      const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
      const { seal } = secretbox(
        x25519.getSharedSecret(ephemeralSecret, publicKey),
        nonce,
      );
      const ciphertext = seal(new TextEncoder().encode(message));

      return composePayload(ephemeralPublic, nonce, ciphertext);
    },
  };
};

export const parseEncryptionKey = async (
  serializedKey: string,
): Promise<EncryptionKey> => createEncryptionKey(fromBase64(serializedKey));

export const createDecryptionKey = async (
  secretKey: Uint8Array,
): Promise<DecryptionKey> => {
  const serializedSecretKey = toBase64(secretKey);

  return {
    toString: () => serializedSecretKey,
    decrypt: async (message: string) => {
      if (!message) {
        throw new Error("Cannot decrypt an empty payload");
      }

      const { ephemeralPublicKey, nonce, ciphertext }
        = decomposePayload(message);
      const { open } = secretbox(
        x25519.getSharedSecret(secretKey, ephemeralPublicKey),
        nonce,
      );

      return new TextDecoder().decode(open(ciphertext));
    },
  };
};

export type EncKeypair = {
  encryptionKey: EncryptionKey;
  decryptionKey: DecryptionKey;
};

export const generateKeyPair = async (): Promise<EncKeypair> => {
  const secretKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(secretKey);

  return {
    encryptionKey: await createEncryptionKey(publicKey),
    decryptionKey: await createDecryptionKey(secretKey),
  };
};

export const initEncryptionKeys = async (
  initParameters?: SessionLinkParameters,
): Promise<EncKeypair & { relyingEncryptionKey?: EncryptionKey; }> => {
  const { encryptionKey, decryptionKey } = await generateKeyPair();

  // Note: the peer key is deliberately left undefined until discovered —
  // falling back to our own key would silently encrypt to ourselves.
  const publicKey
    = initParameters && "publicKey" in initParameters
      ? (initParameters.publicKey as string)
      : undefined;

  return {
    encryptionKey,
    decryptionKey,
    relyingEncryptionKey: publicKey
      ? await parseEncryptionKey(publicKey)
      : undefined,
  };
};
