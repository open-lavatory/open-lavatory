import { Show } from "solid-js";

import { useTheme } from "../../../hooks/useTheme.js";
import { MenuItem } from "../../../ui/menu/MenuItem.js";
import { Select } from "../../../ui/Select.js";
import { useTranslation } from "../../../utils/i18n.js";

// Writing the preference back needs useTheme to own the mode; see the
// settings pass.
const updateThemePreference = () => undefined;

export const ThemeSettings = () => {
  const { t } = useTranslation();
  const theme = useTheme();

  const isUserConfigurable = () => theme.mode() === "auto";
  const userThemeMode = () => (theme.mode() === "auto" ? "system" : theme.mode());

  return (
    <Show when={isUserConfigurable()}>
      <MenuItem label={t("settings.theme.mode") as string}>
        <Select
          options={[
            ["light", t("settings.theme.light") as string],
            ["dark", t("settings.theme.dark") as string],
            ["system", t("settings.theme.system") as string],
          ]}
          value={userThemeMode()}
          onChange={() => updateThemePreference()}
        />
      </MenuItem>
    </Show>
  );
};
