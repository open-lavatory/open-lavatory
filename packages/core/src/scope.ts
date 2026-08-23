import type { EventEmitter } from "eventemitter3";

export type Cleanup = () => void | Promise<void>;

export type Scope = {
  add: (cleanup: Cleanup | Cleanup[]) => void;
  listen: <
    Events extends EventEmitter.ValidEventTypes,
    Event extends EventEmitter.EventNames<Events>,
  >(
    emitter: EventEmitter<Events>,
    event: Event,
    listener: EventEmitter.EventListener<Events, Event>,
  ) => void;
  close: () => Promise<void>;
};

export const createScope = (): Scope => {
  const cleanups: Cleanup[] = [];
  let closePromise: Promise<void> | undefined;

  const add = (cleanup: Cleanup | Cleanup[]) => {
    if (closePromise) {
      throw new Error("Cannot add cleanup to a closed scope");
    }

    cleanups.push(...(Array.isArray(cleanup) ? cleanup : [cleanup]));
  };

  const listen: Scope["listen"] = (emitter, event, listener) => {
    add(() => {
      emitter.off(event, listener);
    });
    emitter.on(event, listener);
  };

  const close = () => {
    closePromise ??= (async () => {
      const errors: unknown[] = [];

      for (let index = cleanups.length - 1; index >= 0; index -= 1) {
        const cleanup = cleanups[index];

        try {
          const result = cleanup();

          if (result) await result;
        }
        catch (error) {
          errors.push(error);
        }
      }

      if (errors.length > 0) {
        throw new AggregateError(errors, "Failed to close scope");
      }
    })();

    return closePromise;
  };

  return { add, listen, close };
};
