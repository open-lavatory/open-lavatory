export type ManagedTimeout = {
  schedule: (callback: () => void, delayMs: number) => void;
  cancel: () => void;
};

export const createTimeout = (): ManagedTimeout => {
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;

  const cancel = () => {
    globalThis.clearTimeout(timer);
    timer = undefined;
  };

  return {
    schedule(callback, delayMs) {
      cancel();
      timer = globalThis.setTimeout(() => {
        timer = undefined;
        callback();
      }, delayMs);
    },
    cancel,
  };
};

export type ManagedRepeater = {
  start: () => Promise<void>;
  stop: () => void;
};

export const createRepeater = (
  callback: () => void | Promise<void>,
  intervalMs: number,
  onError: (error: unknown) => void = () => {},
): ManagedRepeater => {
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let generation = 0;

  const stop = () => {
    generation += 1;
    globalThis.clearTimeout(timer);
    timer = undefined;
  };

  const start = async (): Promise<void> => {
    stop();
    const currentGeneration = generation;

    const run = async () => {
      try {
        await callback();
      }
      catch (error) {
        onError(error);
      }

      if (generation !== currentGeneration) return;

      timer = globalThis.setTimeout(() => {
        timer = undefined;
        void run();
      }, intervalMs);
    };

    await run();
  };

  return { start, stop };
};
