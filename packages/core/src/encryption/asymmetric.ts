import { gcm } from "@noble/ciphers/aes.js";
import {
  bytesToHex,
  bytesToUtf8,
  concatBytes,
  equalBytes,
  utf8ToBytes,
} from "@noble/ciphers/utils.js";
import { x25519 } from "@noble/curves/ed25519.js";

import { fromBase64, toBase64 } from "./base64.js";

const PUBLIC_KEY_BYTES = 32;
const NONCE_BYTES = 12;
const HASH_LENGTH = 16;
const KEY_INFO = new TextEncoder().encode("openlv/1 peer-key");

export type PublicKey = Uint8Array<ArrayBuffer>;

export type KeyPair = {
  publicKey: PublicKey;
  secretKey: Uint8Array;
};

export type Cipher = {
  encrypt: (message: string) => Promise<string>;
  decrypt: (ciphertext: string) => Promise<string>;
};

export type AcceptedPeer = {
  peerKey: PublicKey;
  cipher: Cipher;
  message: string;
};

type DecodedCiphertext = {
  peerKey: PublicKey;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
};

export const generateKeyPair = (): KeyPair => {
  const secretKey = x25519.utils.randomSecretKey();

  return {
    publicKey: Uint8Array.from(x25519.getPublicKey(secretKey)),
    secretKey,
  };
};

/**
 * Check that restored static keys match and, when supplied, that their peer
 * public key is a distinct, valid X25519 point.
 */
export const isValidKeyPair = (value: unknown, peerValue?: unknown): value is KeyPair => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!("publicKey" in value) || !("secretKey" in value)) return false;

  const publicKey = value.publicKey;
  const secretKey = value.secretKey;

  if (!(publicKey instanceof Uint8Array)
    || publicKey.length !== PUBLIC_KEY_BYTES
    || !(secretKey instanceof Uint8Array)
    || secretKey.length !== PUBLIC_KEY_BYTES) {
    return false;
  }

  if (peerValue !== undefined
    && (!(peerValue instanceof Uint8Array)
      || peerValue.length !== PUBLIC_KEY_BYTES
      || equalBytes(publicKey, peerValue))) {
    return false;
  }

  try {
    const derivedPublicKey = x25519.getPublicKey(secretKey);

    if (!derivedPublicKey.every((byte, index) => byte === publicKey[index])) return false;

    if (peerValue instanceof Uint8Array) {
      const sharedSecret = x25519.getSharedSecret(secretKey, peerValue);

      if (sharedSecret.every(byte => byte === 0)) return false;
    }

    return true;
  }
  catch {
    return false;
  }
};

export const parsePublicKey = (encoded: string): PublicKey | undefined => {
  try {
    const publicKey = fromBase64(encoded);

    return publicKey.length === PUBLIC_KEY_BYTES ? publicKey : undefined;
  }
  catch {
    return undefined;
  }
};

export const hashPublicKey = async (publicKey: PublicKey): Promise<string> => {
  const hash = await crypto.subtle.digest("SHA-256", publicKey);

  return bytesToHex(new Uint8Array(hash)).slice(0, HASH_LENGTH);
};

const deriveKeys = async (
  keyPair: KeyPair,
  peerKey: PublicKey,
): Promise<{ sendKey: Uint8Array; receiveKey: Uint8Array; }> => {
  const shared = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(x25519.getSharedSecret(keyPair.secretKey, peerKey)),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const deriveDirectionKey = async (sender: PublicKey, recipient: PublicKey) => {
    const key = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(),
        info: Uint8Array.from(concatBytes(KEY_INFO, sender, recipient)),
      },
      shared,
      256,
    );

    return new Uint8Array(key);
  };

  return {
    sendKey: await deriveDirectionKey(keyPair.publicKey, peerKey),
    receiveKey: await deriveDirectionKey(peerKey, keyPair.publicKey),
  };
};

const decodeCiphertext = (ciphertext: string): DecodedCiphertext => {
  const bytes = fromBase64(ciphertext);

  if (bytes.length <= PUBLIC_KEY_BYTES + NONCE_BYTES) {
    throw new Error("Ciphertext is malformed");
  }

  return {
    peerKey: bytes.slice(0, PUBLIC_KEY_BYTES),
    nonce: bytes.slice(PUBLIC_KEY_BYTES, PUBLIC_KEY_BYTES + NONCE_BYTES),
    ciphertext: bytes.slice(PUBLIC_KEY_BYTES + NONCE_BYTES),
  };
};

export const createPeerCipher = async (
  keyPair: KeyPair,
  peerKey: PublicKey,
): Promise<Cipher> => {
  const { sendKey, receiveKey } = await deriveKeys(keyPair, peerKey);

  return {
    encrypt: async (message) => {
      const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
      const ciphertext = gcm(sendKey, nonce).encrypt(utf8ToBytes(message));

      return toBase64(concatBytes(keyPair.publicKey, nonce, ciphertext));
    },
    decrypt: async (ciphertext) => {
      const decoded = decodeCiphertext(ciphertext);

      if (!equalBytes(decoded.peerKey, peerKey)) {
        throw new Error("Ciphertext is not from the peer");
      }

      return bytesToUtf8(gcm(receiveKey, decoded.nonce).decrypt(decoded.ciphertext));
    },
  };
};

export const acceptPeer = async (
  keyPair: KeyPair,
  ciphertext: string,
): Promise<AcceptedPeer> => {
  const { peerKey } = decodeCiphertext(ciphertext);
  const cipher = await createPeerCipher(keyPair, peerKey);

  return { peerKey, cipher, message: await cipher.decrypt(ciphertext) };
};
