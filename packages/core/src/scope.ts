import type { EventEmitter } from "eventemitter3";

import { createLogger } from "./log.js";
import type { Observable } from "./observable.js";

const log = createLogger("scope");

export type Cleanup = () => void | Promise<void>;

/**
 * Owns cleanups, listeners and timers for one lifetime. `close` runs every
 * cleanup once, newest first; a cleanup that throws does not stop the others,
 * and `close` then rejects with all their errors. A closed scope takes no new
 * work: `add` runs the cleanup at once, the rest do nothing.
 */
export type Scope = {
  add: (cleanup: Cleanup) => void;
  listen: <
    Events extends EventEmitter.ValidEventTypes,
    Event extends EventEmitter.EventNames<Events>,
  >(
    emitter: EventEmitter<Events>,
    event: Event,
    listener: EventEmitter.EventListener<Events, Event>,
  ) => void;
  // Runs `run` once after `delayMs`, unless the scope closes first
  timeout: (delayMs: number, run: () => void) => void;
  // Runs `run` now, then every `intervalMs`; a failed run is logged and the next one tries again
  repeat: (intervalMs: number, run: () => void | Promise<void>) => void;
  // A scope with a shorter lifetime, closed with this one at the latest
  child: () => Scope;
  // Closes this scope once `observable` holds a value that `isMatch` accepts, the current one included
  closeWhen: <Value>(observable: Observable<Value>, isMatch: (value: Value) => boolean) => void;
  close: () => Promise<void>;
};

// `run` starts before the first await, so the caller sees its synchronous effects at once
const runLogged = async (run: () => void | Promise<void>, failure: string) => {
  try {
    await run();
  }
  catch (error) {
    log(failure, error);
  }
};

export const createScope = (): Scope => {
  const cleanups: Cleanup[] = [];
  let closing: Promise<void> | undefined;

  const remove = (cleanup: Cleanup) => {
    const index = cleanups.indexOf(cleanup);

    if (index !== -1) cleanups.splice(index, 1);
  };

  const add = (cleanup: Cleanup) => {
    if (closing) {
      void runLogged(cleanup, "cleanup failed");

      return;
    }

    cleanups.unshift(cleanup);
  };

  const close = () => {
    if (closing) return closing;

    const pending = [...cleanups];

    cleanups.length = 0;
    closing = Promise.resolve();
    const runs = pending.map(async cleanup => cleanup());

    closing = (async () => {
      const results = await Promise.allSettled(runs);
      const errors = results.flatMap(result => (result.status === "rejected" ? [result.reason] : []));

      if (errors.length > 0) throw new AggregateError(errors, "Failed to close scope");
    })();

    return closing;
  };

  return {
    add,
    listen: (emitter, event, listener) => {
      if (closing) return;

      emitter.on(event, listener);
      add(() => {
        emitter.off(event, listener);
      });
    },
    timeout: (delayMs, run) => {
      if (closing) return;

      const cancel = () => clearTimeout(timer);
      const timer = setTimeout(() => {
        remove(cancel);
        run();
      }, delayMs);

      add(cancel);
    },
    repeat: (intervalMs, run) => {
      if (closing) return;

      const timer = setInterval(() => void runLogged(run, "repeated run failed"), intervalMs);

      add(() => clearInterval(timer));
      void runLogged(run, "repeated run failed");
    },
    child: () => {
      const child = createScope();

      add(child.close);
      child.add(() => remove(child.close));

      return child;
    },
    closeWhen: (observable, isMatch) => {
      if (closing) return;

      add(observable.subscribe((value) => {
        if (isMatch(value)) void runLogged(close, "close failed");
      }));
    },
    close,
  };
};
