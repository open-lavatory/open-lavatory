export type Unsubscribe = () => void;
export type Observable<T> = {
  get(): T;
  subscribe(listener: (value: T) => void): Unsubscribe;
};
// Returns false if value was not changed
export type Setter<T> = (value: T) => boolean;

export const observable = <T>(initial: T): [Observable<T>, Setter<T>] => {
  let value = initial;
  const listeners = new Set<(value: T) => void>();

  return [
    {
      get: () => value,
      subscribe: (listener) => {
        listeners.add(listener);

        return () => listeners.delete(listener);
      },
    },
    (next) => {
      if (value === next) return false;

      value = next;

      for (const listener of listeners) listener(value);

      return true;
    }];
};
