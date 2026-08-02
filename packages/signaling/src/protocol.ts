import type { MaybePromise } from "viem";

import type { SignalingLayerFunction } from "./index.js";

export type SignalingChannel = {
  type: string;
  setup: () => MaybePromise<void>;
  teardown: () => MaybePromise<void>;
  publish: (payload: string) => MaybePromise<void>;
  subscribe: (handler: (payload: string) => void) => MaybePromise<void>;
};

export type SignalingProtocolOptions = {
  topic: string;
  url: string;
};

export type SignalingProtocol = (
  properties: SignalingProtocolOptions,
) => MaybePromise<SignalingLayerFunction>;
