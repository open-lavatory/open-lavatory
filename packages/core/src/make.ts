export const make = <M extends object, O extends object>(e: M, o: O) =>
  Object.assign(e, o) as M & O;
