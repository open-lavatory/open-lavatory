type Simplify<T> = { [K in keyof T]: T[K] } & {};

type Overwrite<L, R> = Omit<L, keyof R> & R;

type MergeRight<T extends readonly unknown[]> = T extends []
  // eslint-disable-next-line @stylistic/operator-linebreak
  ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {}
  : T extends [infer A]
    ? A
    : T extends [infer A extends object, ...infer R extends object[]]
      ? Overwrite<Simplify<A>, Simplify<MergeRight<R>>>
      : never;

export const merge = <T extends readonly object[]>(
  ...sources: T
): Simplify<MergeRight<T>> => Object.assign({}, ...sources) as Simplify<MergeRight<T>>;
