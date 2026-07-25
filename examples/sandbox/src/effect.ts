import type EventEmitter from "eventemitter3";
import { useEffect } from "react";

export const useEventEmitter = <
  X extends EventEmitter<R> | undefined,
  R extends EventEmitter.ValidEventTypes = string | symbol,
  E extends EventEmitter.EventNames<R> = EventEmitter.EventNames<R>,
  Function_ extends EventEmitter.EventListener<R, E> = EventEmitter.EventListener<R, E>,
>(
  emitter: X | undefined,
  event: E,
  function_: Function_,
) => {
  useEffect(() => {
    console.log("useEventEmitter", emitter, event, function_);
    emitter?.on(event, function_);

    return () => {
      emitter?.off(event, function_);
    };
  }, [emitter, event, function_]);
};
