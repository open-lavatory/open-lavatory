import { decode as base64Decode, encode as base64Encode } from "base-64";
import * as React from "react";
import PolyfillCrypto from "react-native-webview-crypto";

import { installWebRTCPolyfills } from "./webrtc.js";

export type EnsureWebCryptoSubtleOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
};

const getGlobal = () => globalThis as unknown as Record<string, unknown>;

const CRYPTO_GRV_BACKUP_KEY = "__openlvRnGetRandomValues";

const getCrypto = () => {
  const g = getGlobal();

  const maybeWindow = g.window as undefined | Record<string, unknown>;

  return (g.crypto ?? maybeWindow?.crypto) as
    | undefined
    | Record<string, unknown>;
};

const restoreUnifiedCrypto = () => {
  const g = getGlobal();

  const maybeWindow = g.window as undefined | Record<string, unknown>;
  const windowCrypto = maybeWindow?.crypto as
    | undefined
    | Record<string, unknown>;

  const globalCrypto = g.crypto as undefined | Record<string, unknown>;

  // Ensure `globalThis.crypto` exists (many libs only look here).
  if (!globalCrypto) {
    g.crypto = {};
  }

  const targetCrypto = g.crypto as Record<string, unknown>;

  // Restore getRandomValues if a previous value was captured before
  // another polyfill replaced globalThis.crypto.
  const backupGetRandomValues = g[CRYPTO_GRV_BACKUP_KEY];

  if (
    typeof targetCrypto.getRandomValues !== "function"
    && typeof backupGetRandomValues === "function"
  ) {
    targetCrypto.getRandomValues = backupGetRandomValues;
  }

  // If WebCrypto landed on window.crypto, copy `subtle` onto global crypto.
  if (
    targetCrypto.subtle === undefined
    && windowCrypto
    && windowCrypto.subtle !== undefined
  ) {
    targetCrypto.subtle = windowCrypto.subtle;
  }
};

const hasWebCryptoSubtle = (): boolean => {
  const crypto = getCrypto();

  return !!crypto && crypto.subtle !== undefined;
};

const hasGetRandomValues = (): boolean => {
  const crypto = getCrypto();

  return !!crypto && typeof crypto.getRandomValues === "function";
};

const ensureAtobBtoa = () => {
  const g = getGlobal();

  if (g.btoa === undefined) {
    g.btoa = (input: string) => base64Encode(input);
  }

  if (g.atob === undefined) {
    g.atob = (input: string) => base64Decode(input);
  }
};

const toHex = (b: number) => b.toString(16).padStart(2, "0");
const ensureCryptoRandomUUID = () => {
  const g = getGlobal();

  restoreUnifiedCrypto();

  const crypto = g.crypto as Record<string, unknown>;

  if (typeof crypto.randomUUID === "function") return;

  if (typeof crypto.getRandomValues !== "function") {
    throw new TypeError(
      "@openlv/react-native: crypto.getRandomValues is missing. Add <OpenLVGlobals /> from '@openlv/react-native' somewhere in your app.",
    );
  }

  crypto.randomUUID = () => {
    const bytes = new Uint8Array(16);

    (crypto.getRandomValues as (a: Uint8Array) => Uint8Array)(bytes);

    // RFC 4122 v4
    bytes[6] = (bytes[6] & 0x0F) | 0x40;
    bytes[8] = (bytes[8] & 0x3F) | 0x80;

    const hex = Array.from(bytes, toHex);

    return (
      hex.slice(0, 4).join("")
      + "-"
      + hex.slice(4, 6).join("")
      + "-"
      + hex.slice(6, 8).join("")
      + "-"
      + hex.slice(8, 10).join("")
      + "-"
      + hex.slice(10, 16).join("")
    );
  };
};

const ensureMinimumGlobalsForSession = () => {
  const g = getGlobal();

  if (g.URL === undefined) {
    throw new TypeError(
      "@openlv/react-native: global URL is missing. Install a URL polyfill (e.g. 'react-native-url-polyfill') or use an environment that provides URL.",
    );
  }

  if (
    g.TextEncoder === undefined
    || g.TextDecoder === undefined
  ) {
    throw new TypeError(
      "@openlv/react-native: TextEncoder/TextDecoder are missing. Use Hermes/modern RN, or add a polyfill (e.g. 'fast-text-encoding').",
    );
  }

  ensureAtobBtoa();

  // Capture getRandomValues once, so we can restore it later if another
  // polyfill overwrites `globalThis.crypto`.
  restoreUnifiedCrypto();
  const capturedCrypto = g.crypto as undefined | Record<string, unknown>;

  if (
    typeof g[CRYPTO_GRV_BACKUP_KEY] !== "function"
    && capturedCrypto
    && typeof capturedCrypto.getRandomValues === "function"
  ) {
    g[CRYPTO_GRV_BACKUP_KEY] = capturedCrypto.getRandomValues;
  }

  if (!hasGetRandomValues()) {
    throw new Error(
      "@openlv/react-native: crypto.getRandomValues is missing. Add <OpenLVGlobals /> from '@openlv/react-native' somewhere in your app.",
    );
  }

  ensureCryptoRandomUUID();
};

export const ensureWebCryptoSubtle = async (
  options: EnsureWebCryptoSubtleOptions = {},
): Promise<void> => {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const pollIntervalMs = options.pollIntervalMs ?? 25;

  if (hasWebCryptoSubtle()) {
    restoreUnifiedCrypto();

    return;
  }

  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, pollIntervalMs));

    if (hasWebCryptoSubtle()) {
      restoreUnifiedCrypto();

      return;
    }
  }

  throw new Error(
    "@openlv/react-native: WebCrypto is not ready (crypto.subtle missing). Add <OpenLVGlobals /> from '@openlv/react-native' somewhere in your app (or render <OpenLVCryptoPolyfill /> manually) and ensure 'react-native-webview' + 'react-native-webview-crypto' are installed.",
  );
};

export const installOpenLVReactNativePolyfills = (): void => {
  installWebRTCPolyfills();
  ensureMinimumGlobalsForSession();
};

export const OpenLVCryptoPolyfill = (
  properties: Record<string, unknown> = {},
): React.ReactElement => React.createElement(
  PolyfillCrypto as React.ComponentType<Record<string, unknown>>,
  properties,
);
