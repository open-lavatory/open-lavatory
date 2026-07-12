import { encodeConnectionURL as branchEncodeConnectionURL } from "@openlv/core";
import {
  connectSession as branchConnectSession,
  createSession as branchCreateSession,
} from "@openlv/session";
import { ntfy as branchNtfy } from "@openlv/signaling/ntfy";
import { webrtc as branchWebrtc } from "@openlv/transport/webrtc";
import { encodeConnectionURL as latestEncodeConnectionURL } from "latest-core";
import {
  connectSession as latestConnectSession,
  createSession as latestCreateSession,
} from "latest-session";
import { ntfy as latestNtfy } from "latest-signaling/ntfy";
import { webrtc as latestWebrtc } from "latest-transport/webrtc";

declare const __OPENLV_VERSIONS__: { branch: string; latest: string; };

export const OPENLV_VERSIONS = __OPENLV_VERSIONS__;

/**
 * Version-agnostic view of a Session.
 *
 * Deliberately minimal and structurally typed: the compat suite asserts
 * wire-level interoperability between two package versions, so it must keep
 * compiling even when the two versions' TypeScript types drift apart.
 */
export type CompatSession = {
  getState(): { status: string; };
  getHandshakeParameters(): object;
  connect(): Promise<void>;
  waitForLink(): Promise<void>;
  close(): Promise<void>;
  send(message: object, ackTimeout?: number, responseTimeout?: number): Promise<unknown>;
};

export type CompatMessageHandler = (message: object) => Promise<object | string>;

/**
 * One version of the openlv stack (core + session + signaling + transport),
 * wrapped behind a version-agnostic surface. Each stack only ever composes
 * modules from its own version — exactly like a real dapp or wallet would.
 */
export type Stack = {
  label: string;
  version: string;
  /** dApp role: host a session on the given signaling server. */
  createSession(
    init: { p: string; s: string; },
    onMessage: CompatMessageHandler,
  ): Promise<CompatSession>;
  /** Wallet role: join a session from an openlv:// connection URL. */
  connectSession(url: string, onMessage: CompatMessageHandler): Promise<CompatSession>;
  /** Encode this stack's own handshake parameters into an openlv:// URL. */
  encodeConnectionURL(parameters: object): string;
};

export const branchStack: Stack = {
  label: "branch (workspace build)",
  version: OPENLV_VERSIONS.branch,
  createSession: async (init, onMessage) =>
    branchCreateSession(init, branchNtfy, [branchWebrtc()], onMessage),
  connectSession: async (url, onMessage) =>
    branchConnectSession(url, onMessage, [branchWebrtc()]),
  encodeConnectionURL: parameters =>
    branchEncodeConnectionURL(parameters as Parameters<typeof branchEncodeConnectionURL>[0]),
};

export const latestStack: Stack = {
  label: "npm latest",
  version: OPENLV_VERSIONS.latest,
  createSession: async (init, onMessage) =>
    latestCreateSession(init, latestNtfy, [latestWebrtc()], onMessage),
  connectSession: async (url, onMessage) =>
    latestConnectSession(url, onMessage, [latestWebrtc()]),
  encodeConnectionURL: parameters =>
    latestEncodeConnectionURL(parameters as Parameters<typeof latestEncodeConnectionURL>[0]),
};
