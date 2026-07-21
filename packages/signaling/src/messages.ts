export type SignalMessageBase<T extends string, P> = {
  type: T;
  payload: P;
  timestamp: number;
};

/**
 * Flash message
 * Sent to initiate handshake by non-host
 */
export type SignalMessageFlash = SignalMessageBase<"flash", object>;

export type SignalMessagePubkey = SignalMessageBase<
  "pubkey",
  {
    publicKey: string;
    dAppInfo?: {
      name: string;
      url: string;
      icon: string;
    };
  }
>;

export type SignalMessageAck = SignalMessageBase<"ack", undefined>;

export type SignalMessageData = SignalMessageBase<"data", object>;

export type SignalMessage =
  | SignalMessageFlash
  | SignalMessagePubkey
  | SignalMessageAck
  | SignalMessageData;

/**
 * Parse and shape-check a decrypted signaling payload. The relay topic is
 * public, so decrypted JSON is still untrusted input: anything that does not
 * match one of the four message shapes is dropped (returns undefined).
 */
export const parseSignalMessage = (raw: string): SignalMessage | undefined => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  }
  catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) return undefined;

  const msg = parsed as Record<string, unknown>;

  switch (msg["type"]) {
    case "flash": {
      return typeof msg["payload"] === "object" && msg["payload"] !== null
        ? (msg as SignalMessageFlash)
        : undefined;
    }
    case "pubkey": {
      const payload = msg["payload"] as Record<string, unknown> | null;

      return typeof payload === "object"
        && payload !== null
        && typeof payload["publicKey"] === "string"
        ? (msg as SignalMessagePubkey)
        : undefined;
    }
    case "ack": {
      return msg as SignalMessageAck;
    }
    case "data": {
      return typeof msg["payload"] === "object" && msg["payload"] !== null
        ? (msg as SignalMessageData)
        : undefined;
    }
    default: {
      return undefined;
    }
  }
};
