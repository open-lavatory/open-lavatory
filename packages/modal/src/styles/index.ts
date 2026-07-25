import "./index.css";

import { buildTheme } from "../theme/index.js";
import type { ThemeConfig, UserThemePreference } from "../theme/types.js";
// @ts-expect-error - Vite handles this import at build time
import cssContent from "./index.css?inline";

/**
 * Ensures styles exist in the shadow root and updates them with the current theme.
 */
export const updateStyles = async (
  shadowRoot: ShadowRoot,
  theme?: ThemeConfig,
  userTheme: UserThemePreference = "system",
) => {
  let style = shadowRoot.querySelector(
    "style[data-openlv-modal]",
  ) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement("style");
    style.dataset.openlvModal = "true";
    shadowRoot.append(style);
  }

  const themeConfig = {
    ...theme,
    theme: theme?.theme ?? "simple",
  };

  if (themeConfig) {
    const themeString = await buildTheme(themeConfig, userTheme);

    style.textContent = `:root, :host {\n${themeString}\n}\n` + cssContent;
  }
  else {
    style.textContent = cssContent;
  }
};
