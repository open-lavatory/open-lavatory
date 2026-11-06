import { type Accessor, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";

export interface PunchTransitionOptions {
  duration?: number;
}

export const usePunchTransition = <T>(
  value: T | Accessor<T>,
  { duration = 200 }: PunchTransitionOptions = {},
) => {
  const readValue: Accessor<T>
    = typeof value === "function" ? (value as Accessor<T>) : () => value;
  const changed = createMemo(readValue, undefined, { equals: Object.is });
  const [current, setCurrent] = createSignal<T>(changed());
  const [previous, setPrevious] = createSignal<T | undefined>(undefined);

  createEffect(on(changed, (next) => {
    setPrevious(() => current());
    setCurrent(() => next);

    const timer = globalThis.setTimeout(() => setPrevious(() => undefined), duration);

    onCleanup(() => globalThis.clearTimeout(timer));
  }, { defer: true }));

  return {
    current,
    previous,
    isTransitioning: () => previous() !== undefined,
  };
};
