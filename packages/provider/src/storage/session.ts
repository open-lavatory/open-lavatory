import { decodeConnectionURL, type SessionConnectionParameters } from "@openlv/core";
import { isValidKeyPair } from "@openlv/core/encryption";
import * as z from "zod/mini";

import { SIGNALING_PROTOCOLS } from "./version.js";
import type { WebRTCSettings } from "./version.js";

export const SESSION_STORAGE_KEY = "@openlv/connector/session";

export type PersistedSession = {
  revision: 1;
  sessionURI: string;
  connection: SessionConnectionParameters;
  transport: WebRTCSettings;
};

const bytes = z.pipe(
  z.array(z.number().check(z.int(), z.minimum(0), z.maximum(255))).check(z.length(32)),
  z.transform((value: number[]) => Uint8Array.from(value)),
);
const keyPairSchema = z.strictObject({
  publicKey: bytes,
  secretKey: bytes,
});
const connectionSchema = z.strictObject({
  version: z.literal(1),
  sessionId: z.string().check(z.regex(/^[A-Za-z0-9_-]{16}$/)),
  h: z.string().check(z.regex(/^[0-9a-f]{16}$/)),
  k: z.string().check(z.regex(/^[0-9a-f]{32}$/)),
  p: z.enum(SIGNALING_PROTOCOLS),
  s: z.string().check(z.minLength(1)),
  keyPair: keyPairSchema,
  peerKey: bytes,
  selectedTransportId: z.literal("wrtc"),
})
  .check(z.refine(connection => isValidKeyPair(connection.keyPair, connection.peerKey)));
const transportSchema = z.strictObject({
  stun: z.optional(z.array(z.string())),
  turn: z.optional(z.array(z.strictObject({
    urls: z.string(),
    username: z.optional(z.string()),
    credential: z.optional(z.string()),
  }))),
});
const recordSchema = z.strictObject({
  revision: z.literal(1),
  sessionURI: z.string(),
  connection: connectionSchema,
  transport: transportSchema,
});

export const parsePersistedSession = (raw: string): PersistedSession => {
  const record = recordSchema.parse(JSON.parse(raw));
  const uriParameters = decodeConnectionURL(record.sessionURI);
  const { connection } = record;

  if (
    uriParameters.version !== connection.version
    || uriParameters.sessionId !== connection.sessionId
    || uriParameters.h !== connection.h
    || uriParameters.k !== connection.k
    || uriParameters.p !== connection.p
    || uriParameters.s !== connection.s
  ) {
    throw new TypeError("sessionURI does not match connection parameters");
  }

  return record;
};

export type SessionStorageBackend = {
  get: () => PersistedSession | undefined;
  set: (record: PersistedSession) => void;
  clear: () => void;
};

const serializeSession = (record: PersistedSession) => JSON.stringify({
  ...record,
  connection: {
    ...record.connection,
    keyPair: {
      publicKey: Array.from(record.connection.keyPair.publicKey),
      secretKey: Array.from(record.connection.keyPair.secretKey),
    },
    peerKey: Array.from(record.connection.peerKey),
  },
});

export const createSessionStorage = (storage?: Storage): SessionStorageBackend => {
  let io = storage;

  if (!io && typeof globalThis.window !== "undefined") {
    try {
      io = globalThis.sessionStorage;
    }
    catch {
      // Storage access is commonly disabled in privacy-restricted contexts.
    }
  }

  if (!io) {
    const memory = new Map<string, string>();
    return {
      get: () => {
        const raw = memory.get(SESSION_STORAGE_KEY);
        if (raw === undefined) return undefined;
        try { return parsePersistedSession(raw); }
        catch { memory.delete(SESSION_STORAGE_KEY); return undefined; }
      },
      set: record => memory.set(SESSION_STORAGE_KEY, serializeSession(record)),
      clear: () => memory.delete(SESSION_STORAGE_KEY),
    };
  }

  return {
    get: () => {
      try {
        const raw = io.getItem(SESSION_STORAGE_KEY);

        if (raw === null) return undefined;

        try { return parsePersistedSession(raw); }
        catch {
          io.removeItem(SESSION_STORAGE_KEY);

          return undefined;
        }
      }
      catch {
        return undefined;
      }
    },
    set: record => io.setItem(SESSION_STORAGE_KEY, serializeSession(record)),
    clear: () => io.removeItem(SESSION_STORAGE_KEY),
  };
};
