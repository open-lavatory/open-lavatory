import type { KeyPair, PublicKey } from "./encryption/asymmetric.js";

// typescript type for 32 character hex string
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type Hex<_L> = string;

/**
 * The parameters from the connection url
 */
export type SessionHandshakeParameters = {
  // Version of the openlv protocol
  version: 1;
  // Unique session identifier
  sessionId: Hex<16>;
  // Hash of peerA's public key
  h: Hex<16>;
  // Shared key for symmetric encryption during handshake (32 hex chars = 16 bytes)
  k: Hex<32>;
  // Protocol for signaling
  p: string;
  // Signaling server URL
  s: string;
};

/**
 * The parameters that describe a session
 * these can be used to restart a session
 */
export type SessionConnectionParameters = SessionHandshakeParameters & {
  // Our key pair
  keyPair: KeyPair;
  // The relying party's public key
  peerKey: PublicKey;
  // Transport selected during the previous connection.
  selectedTransportId: string;
};

export type SessionCreationParameters = Pick<
  SessionHandshakeParameters,
  "p" | "s"
>;

/**
 * The parameters that describe a session these can be used to restart a session
 */
export type SessionConnectionParameters = SessionHandshakeParameters & {
  keyPair: KeyPair;
  peerKey: PublicKey;
};

export type SessionLinkParameters
  = | SessionConnectionParameters
    | SessionHandshakeParameters
    | SessionCreationParameters;
