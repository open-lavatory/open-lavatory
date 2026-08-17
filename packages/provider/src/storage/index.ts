import { EventEmitter } from "eventemitter3";

import { DEFAULT_SETTINGS } from "./default.js";
import { parseProviderStorage, type ProviderStorage } from "./version.js";

const DEFAULT_STORAGE_KEY = "@openlv/connector/settings";

export type {
  ProviderStorage,
  SignalingProtocol,
  TurnServer,
  UserThemePreference,
} from "./version.js";

export type ProviderStorageParameters = {
  // Defaults to localStorage
  storage?: Storage;
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
  emitter: EventEmitter<{
    settings_change: (settings: ProviderStorage) => void;
  }>;
  getSettings: () => ProviderStorage;
  setSettings: (update: ProviderStorage) => void;
};

export const createProviderStorage = ({
  storage,
}: ProviderStorageParameters): ProviderStorageR => {
  const io = storage ?? getStorage() ?? createPassthrough();
  const initialSettings = io.getItem(DEFAULT_STORAGE_KEY);

  let settings: ProviderStorage = initialSettings
    ? parseProviderStorage(initialSettings)
    : DEFAULT_SETTINGS;

  const emitter = new EventEmitter<{
    settings_change: (settings: ProviderStorage) => void;
  }>();

  return {
    emitter,
    getSettings: () => settings,
    setSettings: (update: ProviderStorage) => {
      settings = update;
      io.setItem(DEFAULT_STORAGE_KEY, JSON.stringify(update));
      emitter.emit("settings_change", update);
    },
  };
};
