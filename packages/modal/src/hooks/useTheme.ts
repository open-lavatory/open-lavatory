import { createMemo } from "solid-js";

import { useModalContext } from "../context.js";
import type { ThemeMode, UserThemePreference } from "../theme/types.js";
import { useSettings } from "./useSettings.js";

export const useTheme = () => {
  const { themeConfig } = useModalContext();
  const { settings, setThemeMode } = useSettings();

  const mode = createMemo<ThemeMode>(() => themeConfig?.mode ?? "auto");
  const preference = createMemo<UserThemePreference>(() => settings().theme ?? "system");
  /** What the stylesheet keys off: the preference, unless the app forces a mode. */
  const applied = createMemo(() => (mode() === "auto" ? preference() : mode()));

  return {
    mode,
    preference,
    applied,
    setPreference: setThemeMode,
  };
};
