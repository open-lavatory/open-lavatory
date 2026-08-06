import type { EventEmitter } from "eventemitter3";

import type { TransportMessage } from "./index.js";

export type TransportLayerImpl = {
  setup: () => Promise<void>;
  teardown: () => Promise<void>;
  handle: (message: TransportMessage) => Promise<void>;
  send: (message: string) => Promise<void>;
};
export type TransportLayerBaseEventMap = {
  negotiate: (message: TransportMessage) => void;
  connected: () => void;
  message: (message: string) => void;
  error: (reason?: string) => void;
};
export type TransportLayerBaseEmitter
  = EventEmitter<TransportLayerBaseEventMap>;
export type TransportLayerBaseParameters = {
  emitter: TransportLayerBaseEmitter;
  isHost: boolean;
};
export type TransportLayerImplFunction = (
  parameters: TransportLayerBaseParameters,
) => TransportLayerImpl;
