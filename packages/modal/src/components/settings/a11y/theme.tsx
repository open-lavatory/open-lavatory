import { Show } from "solid-js";

import { useTheme } from "../../../hooks/useTheme.js";
import { MenuItem } from "../../../ui/menu/MenuItem.js";
import { Select } from "../../../ui/Select.js";
import { useTranslation } from "../../../utils/i18n.js";

export const ThemeSettings = () => {
  const { t } = useTranslation();
  const theme = useTheme();

  const isUserConfigurable = () => theme.mode() === "auto";

  return (
    <Show when={isUserConfigurable()}>
      <MenuItem label={t("settings.theme.mode")}>
        <Select
          options={[
            ["light", String(t("settings.theme.light"))],
            ["dark", String(t("settings.theme.dark"))],
            ["system", String(t("settings.theme.system"))],
          ]}
          value={theme.preference()}
          onChange={(next) => {
            switch (next) {
              case "light":
              case "dark":
              case "system": {
                theme.setPreference(next);
              }
            }
          }}
        />
      </MenuItem>
    </Show>
  );
};
