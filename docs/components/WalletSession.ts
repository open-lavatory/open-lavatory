import type { SessionConnectionParameters } from "@openlv/core";
import * as z from "zod/mini";

const WALLET_SESSION_STORAGE_KEY = "@openlv/docs/wallet-session";

const bytes = z.pipe(
  z.array(z.number().check(z.int(), z.minimum(0), z.maximum(255))).check(z.length(32)),
  z.transform((value: number[]) => Uint8Array.from(value)),
);
const walletSessionSchema = z.object({
  version: z.literal(1),
  sessionId: z.string(),
  h: z.string(),
  k: z.string(),
  p: z.string(),
  s: z.string(),
  selectedTransportId: z.string(),
  keyPair: z.object({
    publicKey: bytes,
    secretKey: bytes,
  }),
  peerKey: bytes,
});

export const loadWalletSession = (): SessionConnectionParameters | undefined => {
  try {
    const parsed = walletSessionSchema.safeParse(JSON.parse(
      globalThis.sessionStorage.getItem(WALLET_SESSION_STORAGE_KEY) ?? "null",
    ));

    return parsed.success ? parsed.data : undefined;
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
