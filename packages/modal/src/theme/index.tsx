import type {
  ThemeConfig,
  ThemeMode,
  ThemeTokensMap,
  UserThemePreference,
} from "./types.js";

export type {
  PredefinedThemeName,
  ThemeConfig,
  ThemeMode,
  ThemeTokensMap,
  UserThemePreference,
} from "./types.js";

const importOrPassthrough = async (
  theme: ThemeConfig["theme"],
): Promise<ThemeTokensMap> => {
  if (typeof theme === "string") {
    if (theme === "simple") {
      return await import("./simple.js").then(m => m.simpleTheme);
    }

    if (theme === "openlv") {
      return await import("./openlv.js").then(m => m.openlvTheme);
    }

    throw new Error(`Unknown theme: ${theme}`);
  }

  return theme;
};

type Primitive = string | number | boolean | null | undefined;
type Leaf = Primitive; // extend if you want to allow Date, bigint, etc.

type FlatCssVariables = Record<`--${string}`, Leaf>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const flattenToCssVars = <T extends Record<string, unknown>>(
  object: T,
  prefix: readonly string[] = [],
  out: FlatCssVariables = {},
): FlatCssVariables => {
  for (const [key, value] of Object.entries(object)) {
    const path = [...prefix, key];

    if (isPlainObject(value)) {
      flattenToCssVars(value, path, out);
    }
    else {
      out[`--lv-${path.join("-")}` as `--${string}`] = value as Leaf;
    }
  }

  return out;
};

export const resolveMode = (
  appThemeMode: ThemeMode = "auto",
  userTheme: UserThemePreference = "system",
): "light" | "dark" => {
  if (appThemeMode === "light" || appThemeMode === "dark") {
    return appThemeMode;
  }

  if (userTheme === "system") {
    return globalThis.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  return userTheme;
};

const deepMerge = (
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...base };

  for (const key of Object.keys(overlay)) {
    const baseValue = base[key];
    const overlayValue = overlay[key];

    result[key]
      = isPlainObject(baseValue) && isPlainObject(overlayValue)
        ? deepMerge(baseValue, overlayValue)
        : overlayValue;
  }

  return result;
};

// Converts the theme into css variables
// --lv-
export const buildTheme = async (
  config: ThemeConfig,
  userTheme: UserThemePreference = "system",
) => {
  const theme = await importOrPassthrough(config.theme);

  const resolvedMode = resolveMode(config.mode, userTheme);
  const variant = theme[resolvedMode];

  if (!variant) return "";

  const mergedVariant = theme.common
    ? deepMerge(theme.common, variant)
    : variant;

  const flattened = flattenToCssVars(mergedVariant);

  return Object.entries(flattened)
    .map(([key, value]) => `${key}: ${value};`)
    .join("\n");
};
