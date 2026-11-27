import {
  decodeConnectionURL,
  encodeConnectionURL,
  type Observable,
  observable,
  type SessionConnectionParameters,
} from "@openlv/core";
import { fromBase64, generateKeyPair, toBase64 } from "@openlv/core/encryption";
import * as z from "zod/mini";

import { DEFAULT_SETTINGS } from "./default.js";
import { parseProviderStorage, type ProviderStorage } from "./version.js";

const DEFAULT_STORAGE_KEY = "@openlv/connector/settings";
const SESSION_STORAGE_KEY = "@openlv/connector/session";

const sessionKey = z.pipe(z.base64(), z.transform(fromBase64))
  .check(z.refine(key => key.length === 32));

const iceServerUrls = z.union([z.string(), z.array(z.string())]);
const iceServer = z.object({
  urls: iceServerUrls,
  username: z.optional(z.string()),
  credential: z.optional(z.string()),
});
const webrtcConfig = z.object({ iceServers: z.optional(z.array(iceServer)) });

const sessionURI = z.pipe(z.string(), z.transform(decodeConnectionURL));
const sessionKeys = z.object({ publicKey: sessionKey, secretKey: sessionKey })
  .check(z.refine(({ publicKey, secretKey }) => generateKeyPair(secretKey).publicKey.every((byte, index) => byte === publicKey[index])));
// The provider connects with WebRTC only
const transport = z.object({ p: z.literal("wrtc"), s: z.optional(webrtcConfig) });

const sessionFields = z.object({ sessionURI, sessionKeys, peerKey: sessionKey, transport, revision: z.literal(1) })
  .check(z.refine(({ sessionKeys, peerKey }) => peerKey.some((byte, index) => byte !== sessionKeys.publicKey[index])));

const sessionRecord = z.pipe(sessionFields, z.transform(({ sessionURI, sessionKeys, peerKey, transport }): SessionConnectionParameters => ({
  ...sessionURI,
  keyPair: sessionKeys,
  peerKey,
  transport,
})));

export type {
  ProviderStorage,
  SignalingProtocol,
  TurnServer,
  UserThemePreference,
  WebRTCSettings,
} from "./version.js";

export type ProviderStorageParameters = {
  storage?: Storage;
};

const createPassthrough = () => {
  const map = new Map<string, string>();

  return {
    getItem: (key: string) => map.get(key),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
};

const getStorage = () => {
  if (globalThis.window === undefined) return;

  if (!("localStorage" in globalThis)) return;

  return globalThis.localStorage;
};

export type ProviderStorageR = {
  settings: Observable<ProviderStorage>;
  setSettings: (update: ProviderStorage) => void;
  getSessionRecord: () => SessionConnectionParameters | undefined;
  setSessionRecord: (parameters: SessionConnectionParameters | undefined) => void;
};

export const createProviderStorage = ({
  storage,
}: ProviderStorageParameters): ProviderStorageR => {
  const io = storage ?? getStorage() ?? createPassthrough();
  const initialSettings = io.getItem(DEFAULT_STORAGE_KEY);
  const [settings, setSettings] = observable<ProviderStorage>(
    initialSettings ? parseProviderStorage(initialSettings) : DEFAULT_SETTINGS,
  );

  const setSessionRecord = (parameters: SessionConnectionParameters | undefined) => {
    try {
      if (parameters) {
        const { keyPair, peerKey, transport, ...handshake } = parameters;

        io.setItem(SESSION_STORAGE_KEY, JSON.stringify({
          sessionURI: encodeConnectionURL(handshake),
          sessionKeys: { publicKey: toBase64(keyPair.publicKey), secretKey: toBase64(keyPair.secretKey) },
          peerKey: toBase64(peerKey),
          transport,
          revision: 1,
        }));
      }
      else io.removeItem(SESSION_STORAGE_KEY);
    }
    catch {
      // A storage that refuses keeps its old record, which a revoke reads back to report
    }
  };

  return {
    settings,
    setSettings: (update: ProviderStorage) => {
      io.setItem(DEFAULT_STORAGE_KEY, JSON.stringify(update));
      setSettings(update);
    },
    getSessionRecord: () => {
      try {
        const saved = io.getItem(SESSION_STORAGE_KEY);

        if (!saved) return undefined;

        try {
          return sessionRecord.parse(JSON.parse(saved));
        }
        catch {
          setSessionRecord(undefined);

          return undefined;
        }
      }
      catch {
        return undefined;
      }
    },
    setSessionRecord,
  };
};
