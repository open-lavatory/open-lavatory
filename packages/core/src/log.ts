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

const supportsColor = typeof document !== "undefined";

export const createLogger = (scope: string, color = "gray") =>
  (...args: Parameters<typeof console.log>) => {
    if (!isDebugEnabled()) return;

    if (supportsColor) {
      console.log(
        `%c[${scope}]%c`,
        `color: ${color}; font-weight: bold`,
        "color: inherit; font-weight: normal",
        ...args,
      );
    }
    else {
      console.log(`[${scope}]`, ...args);
    }
  };
