export type Unsubscribe = () => void;
export type Observable<T> = {
  get(): T;
  /**
   * Calls the listener synchronously with the current value, then on every
   * change. The replay makes subscribe-then-check patterns race-free and
   * matches what reactive consumers (e.g. Solid's `from`) expect.
   */
  subscribe(listener: (value: T) => void): Unsubscribe;
  /** Resolves with the first value (including the current one) that matches. */
  until(isMatch: (value: T) => boolean): Promise<T>;
};
/** Returns false when the value was already equal and no listener ran. */
export type Setter<T> = (value: T) => boolean;

export const observable = <T>(initial: T): [Observable<T>, Setter<T>] => {
  let value = initial;
  const listeners = new Set<(value: T) => void>();

  const get = () => value;

  const subscribe = (listener: (value: T) => void): Unsubscribe => {
    listeners.add(listener);
    listener(value);

    return () => listeners.delete(listener);
  };

  const until = (isMatch: (value: T) => boolean): Promise<T> => {
    if (isMatch(value)) return Promise.resolve(value);

    return new Promise((resolve) => {
      const unsubscribe = subscribe((next) => {
        // The replay on subscribe re-delivers the current value; it cannot
        // match, because the fast path above already checked it.
        if (!isMatch(next)) return;

        resolve(next);
        unsubscribe();
      });
    });
  };

  return [
    { get, subscribe, until },
    (next) => {
      if (value === next) return false;

      value = next;

      for (const listener of listeners) listener(value);

      return true;
    }];
};
