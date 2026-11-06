import { type Observable, observable } from "@openlv/core";

import { DEFAULT_SETTINGS } from "./default.js";
import { parseProviderStorage, type ProviderStorage } from "./version.js";

const DEFAULT_STORAGE_KEY = "@openlv/connector/settings";

export {
  createSessionStorage,
  parsePersistedSession,
  SESSION_STORAGE_KEY,
  type PersistedSession,
  type SessionStorageBackend,
} from "./session.js";
export type {
  ProviderStorage,
  SignalingProtocol,
  TurnServer,
  UserThemePreference,
  WebRTCSettings,
} from "./version.js";

export type ProviderStorageParameters = {
  storage?: Storage;
  // Defaults to sessionStorage
  sessionStorage?: Storage;
};

const createPassthrough = () => {
  const map = new Map<string, string>();

  return {
    getItem: (key: string) => map.get(key),
    setItem: (key: string, value: string) => {
      map.set(key, value);
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
};

export const createProviderStorage = ({
  storage,
}: ProviderStorageParameters): ProviderStorageR => {
  const io = storage ?? getStorage() ?? createPassthrough();
  const initialSettings = io.getItem(DEFAULT_STORAGE_KEY);
  const [settings, setSettings] = observable<ProviderStorage>(
    initialSettings ? parseProviderStorage(initialSettings) : DEFAULT_SETTINGS,
  );

  return {
    settings,
    setSettings: (update: ProviderStorage) => {
      io.setItem(DEFAULT_STORAGE_KEY, JSON.stringify(update));
      setSettings(update);
    },
  };
};
