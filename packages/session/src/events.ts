import type { SessionStateObject } from "./index.js";

export type SessionEvents = {
  state_change: (state?: SessionStateObject) => void;
  /**
     * Emitted when a request arrives from the remote peer — before the reply
     * is sent. Useful for observability, logging, or UI integration without
     * needing to intercept the `onMessage` callback.
     */
  request: (payload: object | string) => void;
};
