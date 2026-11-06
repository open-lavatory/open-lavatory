export const XR_PREFIX = "x";
export const XR_H_PREFIX = "h";
export type SignalingPrefix = typeof XR_PREFIX | typeof XR_H_PREFIX;
export type SignalingRecipient = "h" | "c";

export const HANDSHAKE_TIMEOUT_MS = 30_000;
export const HANDSHAKE_RESEND_INTERVAL_MS = 2000;

export const composeFrame = (
  prefix: SignalingPrefix,
  recipient: SignalingRecipient,
  ciphertext: string,
): string => prefix + recipient + ciphertext;

export const parseFrame = (
  frame: string,
): { prefix: SignalingPrefix; recipient: SignalingRecipient; ciphertext: string; } | undefined => {
  const prefix = frame.slice(0, 1);

  if (prefix !== XR_PREFIX && prefix !== XR_H_PREFIX) return;

  const recipient = frame.slice(1, 2);

  if (recipient !== "h" && recipient !== "c") return;

  return { prefix, recipient, ciphertext: frame.slice(2) };
};
