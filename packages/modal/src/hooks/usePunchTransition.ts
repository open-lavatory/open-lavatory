import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";

export interface PunchTransitionOptions {
  duration?: number;
}

export const usePunchTransition = <T>(
  value: T | Accessor<T>,
  { duration = 200 }: PunchTransitionOptions = {},
) => {
  const readValue: Accessor<T>
    = typeof value === "function" ? (value as Accessor<T>) : () => value;
  const initialValue = readValue();
  const [current, setCurrent] = createSignal<T>(initialValue);
  const [previous, setPrevious] = createSignal<T | undefined>(undefined);
  let timeoutReference: ReturnType<typeof setTimeout> | undefined;
  let lastValueReference = initialValue;

  createEffect(() => {
    const nextValue = readValue();

    if (Object.is(nextValue, lastValueReference)) return;

    if (timeoutReference) {
      globalThis.clearTimeout(timeoutReference);
    }

    setPrevious(() => lastValueReference);
    setCurrent(() => nextValue);
    lastValueReference = nextValue;

    timeoutReference = globalThis.setTimeout(() => {
      setPrevious(() => undefined);
      timeoutReference = undefined;
    }, duration);

    onCleanup(() => {
      if (timeoutReference) {
        globalThis.clearTimeout(timeoutReference);
      }
    });
  });

  return {
    current,
    previous,
    isTransitioning: () => previous() !== undefined,
  };
};
