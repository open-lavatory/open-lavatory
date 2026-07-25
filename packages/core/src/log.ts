/**
 * Debug logging is disabled by default so that key material, handshake
 * traffic, and RPC payloads never reach the console in production.
 *
 * Enable it by setting `globalThis.OPENLV_DEBUG = true`, adding an
 * `openlv:debug` key to localStorage, or setting the `OPENLV_DEBUG`
 * environment variable (Node).
 */
const isDebugEnabled = (): boolean => {
  try {
    const g = globalThis as {
      OPENLV_DEBUG?: unknown;
      localStorage?: Storage;
      process?: { env?: Record<string, string | undefined>; };
    };

    return Boolean(
      g.OPENLV_DEBUG
      ?? g.localStorage?.getItem("openlv:debug")
      ?? g.process?.env?.["OPENLV_DEBUG"],
    );
  }
  catch {
    return false;
  }
};

const isSupportsColor = typeof document !== "undefined";

export const createLogger = (scope: string, color = "gray") =>
  (...arguments_: Parameters<typeof console.log>) => {
    if (!isDebugEnabled()) return;

    if (isSupportsColor) {
      console.log(
        `%c[${scope}]%c`,
        `color: ${color}; font-weight: bold`,
        "color: inherit; font-weight: normal",
        ...arguments_,
      );
    }
    else {
      console.log(`[${scope}]`, ...arguments_);
    }
  };
