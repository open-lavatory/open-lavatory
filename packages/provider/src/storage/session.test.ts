import { generateKeyPair } from "@openlv/core/encryption";
import { describe, expect, test } from "vitest";

import { createSessionStorage, parsePersistedSession, SESSION_STORAGE_KEY } from "./session.js";
const keyPair = generateKeyPair();
const peerKey = generateKeyPair().publicKey;

const record = {
  revision: 1,
  sessionURI: "openlv://abcdefghijklmnop@1?h=0123456789abcdef&k=0123456789abcdef0123456789abcdef&p=mqtt&s=wss%3A%2F%2Fexample.com",
  connection: {
    version: 1,
    sessionId: "abcdefghijklmnop",
    h: "0123456789abcdef",
    k: "0123456789abcdef0123456789abcdef",
    p: "mqtt",
    s: "wss://example.com",
    keyPair: {
      publicKey: Array.from(keyPair.publicKey),
      secretKey: Array.from(keyPair.secretKey),
    },
    peerKey: Array.from(peerKey),
    selectedTransportId: "wrtc",
  },
  transport: { stun: ["stun:example.com"], turn: [{ urls: "turn:example.com", username: "u", credential: "p" }] },
};

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    values,
  } satisfies Storage & { values: Map<string, string>; };
};

describe("persisted session records", () => {
  test("validates and restores typed key bytes", () => {
    const parsed = parsePersistedSession(JSON.stringify(record));
    expect(parsed.connection.keyPair.publicKey).toBeInstanceOf(Uint8Array);
    expect(parsed.connection.peerKey).toEqual(peerKey);
    expect(parsed.transport).toEqual(record.transport);
  });

  test.each([
    ["unknown record field", { ...record, unexpected: true }],
    ["unsupported revision", { ...record, revision: 2 }],
    ["malformed session id", { ...record, connection: { ...record.connection, sessionId: "bad" } }],
    ["mismatched URI", { ...record, sessionURI: record.sessionURI.replace("abcdefghijklmnop", "ponmlkjihgfedcba") }],
    ["short public key", { ...record, connection: { ...record.connection, peerKey: [1, 2] } }],
    ["non-byte key value", { ...record, connection: { ...record.connection, keyPair: { ...record.connection.keyPair, secretKey: Array(32).fill(256) } } }],
    ["mismatched key pair", {
      ...record,
      connection: {
        ...record.connection,
        keyPair: {
          ...record.connection.keyPair,
          publicKey: Array(32).fill(1),
        },
      },
    }],
    ["low-order peer key", {
      ...record,
      connection: { ...record.connection, peerKey: Array(32).fill(0) },
    }],
    ["invalid TURN entry", { ...record, transport: { turn: [{ urls: 1 }] } }],
  ])("rejects %s", (_name, invalid) => {
    expect(() => parsePersistedSession(JSON.stringify(invalid))).toThrow();
  });

  test("clears malformed persisted state rather than restoring it", () => {
    const storage = memoryStorage();
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...record, revision: 8 }));
    const backend = createSessionStorage(storage);
    expect(backend.get()).toBeUndefined();
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  test("persists and clears a valid record using the separate storage key", () => {
    const storage = memoryStorage();
    const backend = createSessionStorage(storage);
    backend.set(parsePersistedSession(JSON.stringify(record)));
    expect(backend.get()?.sessionURI).toBe(record.sessionURI);
    backend.clear();
    expect(backend.get()).toBeUndefined();
  });
});
