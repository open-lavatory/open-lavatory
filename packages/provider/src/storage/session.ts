import { decodeConnectionURL, type SessionConnectionParameters } from "@openlv/core";
import { isValidKeyPair, type KeyPair } from "@openlv/core/encryption";

import { SIGNALING_PROTOCOLS } from "./version.js";
import type { WebRTCSettings } from "./version.js";

export const SESSION_STORAGE_KEY = "@openlv/connector/session";

export type PersistedSession = {
  revision: 1;
  sessionURI: string;
  connection: SessionConnectionParameters;
  transport: WebRTCSettings;
};

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const object = (value: unknown, label: string): JsonObject => {
  if (!isObject(value)) throw new TypeError(`${label} must be an object`);
  return value;
};

const exactKeys = (value: JsonObject, keys: readonly string[], label: string) => {
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value))) {
    throw new TypeError(`${label} has invalid fields`);
  }
};

const byteArray = (value: unknown, size: number, label: string): Uint8Array<ArrayBuffer> => {
  if (
    !Array.isArray(value)
    || value.length !== size
    || value.some((byte: unknown) => (
      typeof byte !== "number"
      || !Number.isInteger(byte)
      || byte < 0
      || byte > 255
    ))
  ) {
    throw new TypeError(`${label} must contain ${size} bytes`);
  }

  return Uint8Array.from(value);
};

const string = (value: unknown, label: string): string => {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
};

const parseConnection = (value: unknown): SessionConnectionParameters => {
  const connection = object(value, "connection");
  exactKeys(connection, [
    "version", "sessionId", "h", "k", "p", "s", "keyPair", "peerKey", "selectedTransportId",
  ], "connection");
  if (connection.version !== 1) throw new TypeError("connection version must be 1");
  const sessionId = string(connection.sessionId, "sessionId");
  if (!/^[A-Za-z0-9_-]{16}$/.test(sessionId)) {
    throw new TypeError("sessionId is invalid");
  }
  const h = string(connection.h, "h");
  if (!/^[0-9a-f]{16}$/.test(h)) throw new TypeError("h is invalid");
  const k = string(connection.k, "k");
  if (!/^[0-9a-f]{32}$/.test(k)) throw new TypeError("k is invalid");
  const protocolValue = string(connection.p, "p");
  const protocol = SIGNALING_PROTOCOLS.find(value => value === protocolValue);
  if (!protocol) {
    throw new TypeError("p is not a supported signaling protocol");
  }
  const server = string(connection.s, "s");
  if (!server) throw new TypeError("s must not be empty");
  const transportId = string(connection.selectedTransportId, "selectedTransportId");
  if (transportId !== "wrtc") throw new TypeError("selectedTransportId is unsupported");
  const keyPair = object(connection.keyPair, "keyPair");
  exactKeys(keyPair, ["publicKey", "secretKey"], "keyPair");
  const restoredKeyPair = {
    publicKey: byteArray(keyPair.publicKey, 32, "keyPair.publicKey"),
    secretKey: byteArray(keyPair.secretKey, 32, "keyPair.secretKey"),
  } satisfies KeyPair;
  const restoredPeerKey = byteArray(connection.peerKey, 32, "peerKey");

  if (!isValidKeyPair(restoredKeyPair, restoredPeerKey)) {
    throw new TypeError("saved key pair and peer key are inconsistent");
  }

  const result: SessionConnectionParameters = {
    version: 1,
    sessionId,
    h,
    k,
    p: protocol,
    s: server,
    keyPair: restoredKeyPair,
    peerKey: restoredPeerKey,
    selectedTransportId: transportId,
  };

  return result;
};

const parseTransport = (value: unknown): WebRTCSettings => {
  const transport = object(value, "transport");
  exactKeys(transport, ["stun", "turn"].filter(key => key in transport), "transport");
  const result: WebRTCSettings = {};

  if ("stun" in transport) {
    if (!Array.isArray(transport.stun) || transport.stun.some(url => typeof url !== "string")) {
      throw new TypeError("transport.stun must be an array of strings");
    }
    result.stun = [...transport.stun];
  }
  if ("turn" in transport) {
    if (!Array.isArray(transport.turn)) throw new TypeError("transport.turn must be an array");
    result.turn = transport.turn.map((entry) => {
      const turn = object(entry, "transport.turn entry");
      if (Object.keys(turn).some(key => !["urls", "username", "credential"].includes(key))) {
        throw new TypeError("transport.turn entry has invalid fields");
      }
      const parsed: { urls: string; username?: string; credential?: string } = {
        urls: string(turn.urls, "transport.turn.urls"),
      };
      if ("username" in turn) parsed.username = string(turn.username, "transport.turn.username");
      if ("credential" in turn) parsed.credential = string(turn.credential, "transport.turn.credential");
      return parsed;
    });
  }
  return result;
};

export const parsePersistedSession = (raw: string): PersistedSession => {
  const value: unknown = JSON.parse(raw);
  const record = object(value, "session record");
  exactKeys(record, ["revision", "sessionURI", "connection", "transport"], "session record");
  if (record.revision !== 1) throw new TypeError("session revision must be 1");

  const sessionURI = string(record.sessionURI, "sessionURI");
  const connection = parseConnection(record.connection);
  const uriParameters = decodeConnectionURL(sessionURI);
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

  return {
    revision: 1,
    sessionURI,
    connection,
    transport: parseTransport(record.transport),
  };
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
