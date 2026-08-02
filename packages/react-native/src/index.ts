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
export type {
  Session,
  SessionState,
  SessionStateObject,
} from "@openlv/session";

export const SESSION_STATE = {
  CREATED: "created",
  SIGNALING: "signaling",
  READY: "ready",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
} as const;

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
