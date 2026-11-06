import type { SessionConnectionParameters } from "@openlv/core";

const WALLET_SESSION_STORAGE_KEY = "@openlv/docs/wallet-session";

const isByteArray = (value: unknown): value is number[] =>
  Array.isArray(value)
  && value.length === 32
  && value.every(byte => Number.isSafeInteger(byte) && byte >= 0 && byte <= 255);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const loadWalletSession = (): SessionConnectionParameters | undefined => {
  try {
    const saved: unknown = JSON.parse(
      globalThis.sessionStorage.getItem(WALLET_SESSION_STORAGE_KEY) ?? "null",
    );

    if (!isRecord(saved)) return undefined;

    const keyPair = saved["keyPair"];

    if (!isRecord(keyPair)) return undefined;

    if (
      saved["version"] !== 1
      || typeof saved["sessionId"] !== "string"
      || typeof saved["h"] !== "string"
      || typeof saved["k"] !== "string"
      || typeof saved["p"] !== "string"
      || typeof saved["s"] !== "string"
      || typeof saved["selectedTransportId"] !== "string"
      || !isByteArray(keyPair["publicKey"])
      || !isByteArray(keyPair["secretKey"])
      || !isByteArray(saved["peerKey"])
    ) return undefined;

    return {
      version: 1,
      sessionId: saved["sessionId"],
      h: saved["h"],
      k: saved["k"],
      p: saved["p"],
      s: saved["s"],
      selectedTransportId: saved["selectedTransportId"],
      keyPair: {
        publicKey: Uint8Array.from(keyPair["publicKey"]),
        secretKey: Uint8Array.from(keyPair["secretKey"]),
      },
      peerKey: Uint8Array.from(saved["peerKey"]),
    };
  }
  catch {
    return undefined;
  }
};

export const saveWalletSession = (parameters: SessionConnectionParameters) => {
  try {
    globalThis.sessionStorage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify({
      ...parameters,
      keyPair: {
        publicKey: Array.from(parameters.keyPair.publicKey),
        secretKey: Array.from(parameters.keyPair.secretKey),
      },
      peerKey: Array.from(parameters.peerKey),
    }));
  }
  catch {
    // The demo should still work when browser storage is unavailable.
  }
};

export const clearWalletSession = () => {
  try {
    globalThis.sessionStorage.removeItem(WALLET_SESSION_STORAGE_KEY);
  }
  catch {
    // Storage may be unavailable in privacy-restricted contexts.
  }
};
