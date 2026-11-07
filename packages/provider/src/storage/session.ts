import { decodeConnectionURL, type SessionConnectionParameters } from "@openlv/core";
import { isValidKeyPair } from "@openlv/core/encryption";
import { z } from "zod";

import { SIGNALING_PROTOCOLS } from "./version.js";
import type { WebRTCSettings } from "./version.js";

export const SESSION_STORAGE_KEY = "@openlv/connector/session";

export type PersistedSession = {
  revision: 1;
  sessionURI: string;
  connection: SessionConnectionParameters;
  transport: WebRTCSettings;
};

const bytes = z.array(z.number().int().min(0).max(255))
  .length(32)
  .transform(value => Uint8Array.from(value));
const keyPairSchema = z.object({
  publicKey: bytes,
  secretKey: bytes,
}).strict();
const connectionSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
  h: z.string().regex(/^[0-9a-f]{16}$/),
  k: z.string().regex(/^[0-9a-f]{32}$/),
  p: z.enum(SIGNALING_PROTOCOLS),
  s: z.string().min(1),
  keyPair: keyPairSchema,
  peerKey: bytes,
  selectedTransportId: z.literal("wrtc"),
})
  .strict()
  .transform((connection) => {
  if (!isValidKeyPair(connection.keyPair, connection.peerKey)) {
    throw new TypeError("saved key pair and peer key are inconsistent");
  }

  return connection satisfies SessionConnectionParameters;
});
const transportSchema = z.object({
  stun: z.array(z.string()).optional(),
  turn: z.array(z.object({
    urls: z.string(),
    username: z.string().optional(),
    credential: z.string().optional(),
  }).strict()).optional(),
}).strict();
const recordSchema = z.object({
  revision: z.literal(1),
  sessionURI: z.string(),
  connection: connectionSchema,
  transport: transportSchema,
}).strict();

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
