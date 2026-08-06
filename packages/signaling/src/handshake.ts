
export const XR_PREFIX = "x";
export const XR_H_PREFIX = "h";

/**
 * Relays are lossy (MQTT QoS 0, ntfy best-effort), so every handshake step
 * is re-sent on an interval until the state machine observes progress.
 * Receivers treat duplicates as no-ops, which keeps re-sends wire-compatible.
 */
const HANDSHAKE_RESEND_INTERVAL_MS = 2000;
const HANDSHAKE_TIMEOUT_MS = 30_000;
