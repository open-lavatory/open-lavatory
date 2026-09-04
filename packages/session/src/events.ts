export type SessionEvents = {
  /**
   * Emitted when a request arrives from the remote peer -- before the reply
   * is sent. Useful for observability, logging, or UI integration without
   * needing to intercept the `onMessage` callback.
   */
  request: (payload: unknown) => void;
};
