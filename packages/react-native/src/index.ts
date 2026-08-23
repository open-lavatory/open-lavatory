import { assertOpenLVReady } from "./assert.js";

export {
  ensureWebCryptoSubtle,
  type EnsureWebCryptoSubtleOptions,
  installOpenLVReactNativePolyfills,
  OpenLVCryptoPolyfill,
} from "./polyfills.js";
export { OpenLVGlobals, type OpenLVGlobalsProps } from "./provider.js";
export {
  installWebRTCPolyfills,
  type InstallWebRTCPolyfillsOptions,
} from "./webrtc.js";
export type { Session } from "@openlv/session";

// Mirrored rather than re-exported: a value re-export would pull
// @openlv/session into the entry statically, before the polyfills that
// createSession/connectSession deliberately wait for. The copy is pinned to
// the original in type-tests/session-signatures.ts.
export const SessionStatus = {
  CREATED: "created",
  SIGNALING: "signaling",
  READY: "ready",
  LINKING: "linking",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

type SessionModule = typeof import("@openlv/session");

export const createSession = async (
  ...arguments_: Parameters<SessionModule["createSession"]>
): ReturnType<SessionModule["createSession"]> => {
  assertOpenLVReady({ requireCryptoReady: true });
  const module_ = (await import("@openlv/session")) as SessionModule;

  return module_.createSession(...arguments_);
};

export const connectSession = async (
  ...arguments_: Parameters<SessionModule["connectSession"]>
): ReturnType<SessionModule["connectSession"]> => {
  assertOpenLVReady({ requireCryptoReady: true });
  const module_ = (await import("@openlv/session")) as SessionModule;

  return module_.connectSession(...arguments_);
};
