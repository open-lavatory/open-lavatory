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
  }
>;

/** Optional self-description shown in the other peer's UI. */
export type PeerInfo = {
  /** Reverse-DNS application identifier, e.g. "com.example.wallet". */
  identity: string;
  name: string;
  /**
   * A data URI or an image URL. Only size is enforced on the wire — anyone
   * rendering or fetching it is responsible for sanity-checking it first.
   */
  icon?: string;
};

export type PeerCapabilities = {
  /** Supported transport identifiers, in preference order. */
  transports: string[];
  info?: PeerInfo;
};

/**
 * Completes the handshake: acknowledges the previous step, negotiates the
 * transport, and shares peer metadata in a single packet.
 */
export type SignalMessageCapabilities = SignalMessageBase<
  "capabilities",
  PeerCapabilities
>;

export type SignalMessageData = SignalMessageBase<"data", object>;

export type SignalMessage =
  | SignalMessageFlash
  | SignalMessagePubkey
  | SignalMessageCapabilities
  | SignalMessageData;

const MAX_TRANSPORTS = 8;
const MAX_TRANSPORT_ID_LENGTH = 32;
const MAX_TEXT_LENGTH = 128;

// Relay message limits (ntfy in particular) leave little room after base64
// and encryption overhead; oversized icons would silently fail to deliver,
// so they are rejected here instead.
export const MAX_ICON_LENGTH = 8192;

const isBoundedString = (value: unknown, maxLength: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= maxLength;

/**
 * Check outgoing peer info against the wire limits enforced by receivers.
 * Returns a human-readable problem, or undefined when the info is sendable.
 * Senders must use this: a receiver silently drops an oversized packet, which
 * would otherwise surface only as a generic handshake timeout.
 */
export const validatePeerInfo = (info: PeerInfo): string | undefined => {
  if (!isBoundedString(info.identity, MAX_TEXT_LENGTH)) {
    return `info.identity must be 1-${MAX_TEXT_LENGTH} characters`;
  }

  if (!isBoundedString(info.name, MAX_TEXT_LENGTH)) {
    return `info.name must be 1-${MAX_TEXT_LENGTH} characters`;
  }

  if (info.icon !== undefined && !isBoundedString(info.icon, MAX_ICON_LENGTH)) {
    return `info.icon must be 1-${MAX_ICON_LENGTH} characters — use a smaller image or an image URL`;
  }

  return undefined;
};

const parsePeerInfo = (raw: unknown): PeerInfo | undefined => {
  if (typeof raw !== "object" || raw === null) return undefined;

  const info = raw as Record<string, unknown>;

  if (!isBoundedString(info["identity"], MAX_TEXT_LENGTH)) return undefined;

  if (!isBoundedString(info["name"], MAX_TEXT_LENGTH)) return undefined;

  if (info["icon"] !== undefined && !isBoundedString(info["icon"], MAX_ICON_LENGTH)) {
    return undefined;
  }

  return {
    identity: info["identity"],
    name: info["name"],
    ...(info["icon"] === undefined ? {} : { icon: info["icon"] }),
  };
};

export const parseCapabilities = (raw: unknown): PeerCapabilities | undefined => {
  if (typeof raw !== "object" || raw === null) return undefined;

  const payload = raw as Record<string, unknown>;
  const transports = payload["transports"];

  if (
    !Array.isArray(transports)
    || transports.length === 0
    || transports.length > MAX_TRANSPORTS
    || !transports.every(transportId => isBoundedString(transportId, MAX_TRANSPORT_ID_LENGTH))
  ) {
    return undefined;
  }

  if (payload["info"] === undefined) return { transports };

  const info = parsePeerInfo(payload["info"]);

  if (!info) return undefined;

  return { transports, info };
};

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
    case "capabilities": {
      const capabilities = parseCapabilities(msg["payload"]);

      if (!capabilities) return undefined;

      return {
        type: "capabilities",
        payload: capabilities,
        timestamp: msg["timestamp"] as number,
      };
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
