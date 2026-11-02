export const toBase64 = (data: Uint8Array): string => {
  let binary = "";

  for (const datum of data) {
    binary += String.fromCodePoint(datum);
  }

  return btoa(binary);
};

export const fromBase64 = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(value), char => char.codePointAt(0) ?? 0);
