import type { SymmetricKey } from "@openlv/core/encryption";
import { match } from "ts-pattern";

import { parseSignalMessage, type SignalMessage } from "./messages.js";

export const XR_PREFIX = "x";
export const XR_H_PREFIX = "h";
export type SignalingStage = typeof XR_PREFIX | typeof XR_H_PREFIX;

/**
 * Relays are lossy (MQTT QoS 0, ntfy best-effort), so every handshake step
 * is re-sent on an interval until the state machine observes progress.
 * Receivers treat duplicates as no-ops, which keeps re-sends wire-compatible.
 */
// const HANDSHAKE_RESEND_INTERVAL_MS = 2000;
// const HANDSHAKE_TIMEOUT_MS = 30_000;

export type HandshakeHooks = {
  isHost: boolean;
  handshakeKey: SymmetricKey;
  encrypt: (payload: string) => Promise<string>;
  decrypt: (payload: string) => Promise<string>;
};

export const handshake = (hooks: HandshakeHooks) => {
  // hello world
  const {
    isHost,
    handshakeKey,
    encrypt,
    decrypt,
  } = hooks;

  const frame = async (method: "handshake" | "encrypted", payload: SignalMessage) => {
    const [prefix, message] = await match(method)
      .with("handshake", async () => [XR_H_PREFIX, await handshakeKey.encrypt(JSON.stringify(payload))])
      .with("encrypted", async () => [XR_PREFIX, await encrypt(JSON.stringify(payload))])
      .exhaustive();

    if (message === undefined) {
      throw new Error(`Cannot encrypt ${method} frame: key not available`);
    }

    const recipient = isHost ? "c" : "h";

    return prefix + recipient + message;
  };

  const parse = async (payload: string): Promise<[SignalingStage, SignalMessage] | undefined> => {
    const prefix = payload.slice(0, 1) as SignalingStage;
    const recipient = payload.slice(1, 2);
    const body = payload.slice(2);
    const isRecipient = (isHost ? "h" : "c") === recipient;

    if (!isRecipient) return;

    const content = await match(prefix)
      .with(XR_H_PREFIX, async () => await handshakeKey.decrypt(body))
      .with(XR_PREFIX, async () => await decrypt(body))
      .otherwise(() => undefined);

    if (!content) return;

    const message = parseSignalMessage(content);

    if (!message) return;

    return [prefix, message];
  };

  return { frame, parse };
};
