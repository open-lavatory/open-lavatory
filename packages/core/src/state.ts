import type { EventEmitter } from "eventemitter3";

export type StateInput<K, U, M extends EventEmitter> = {
  value: K;
  emitter: M;
  topic: U;
};

export type StateOutput<K, U> = {
  data: K;
  setData: (data: K) => void;
};

export const useState = <K, U>(input: StateInput): StateOutput => {
    
};
