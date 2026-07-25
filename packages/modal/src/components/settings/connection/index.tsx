import { For } from "solid-js";

import { useSettings } from "../../../hooks/useSettings.js";
import { InfoTooltip } from "../../../ui/InfoTooltip.js";
import { MenuGroup } from "../../../ui/menu/MenuGroup.js";
import { MenuItem } from "../../../ui/menu/MenuItem.js";
import { MenuLink } from "../../../ui/menu/MenuLink.js";
import { Toggle } from "../../../ui/Toggle.js";
import { useTranslation } from "../../../utils/i18n.js";
import type { SettingsScreen } from "../index.js";

export const ConnectionPreferences = (properties: {
  onNavigate: (screen: SettingsScreen) => void;
}) => {
  const { t } = useTranslation();
  const { settings, setRetainSessionHistory, setAutoReconnect } = useSettings();

  return (
    <MenuGroup title={t("settings.connectionPreferences.title")}>
      <MenuLink
        label={(
          <>
            {t("settings.signaling.title")}
            <InfoTooltip variant="icon">
              {t("settings.signaling.description")}
            </InfoTooltip>
          </>
        )}
        onClick={() => properties.onNavigate("signaling")}
        value={settings()?.signaling?.p}
      />
      <MenuLink
        label={(
          <>
            {t("settings.transport.title")}
            <InfoTooltip variant="icon">
              {t("settings.transport.description")}
            </InfoTooltip>
          </>
        )}
        onClick={() => properties.onNavigate("transport")}
        value="WebRTC"
      />
      <For
        each={
          [
            [
              t("settings.connectionPreferences.retainSessionHistory"),
              settings()?.retainHistory ?? false,
              setRetainSessionHistory,
            ],
            [
              t("settings.connectionPreferences.autoReconnect"),
              settings()?.autoReconnect ?? false,
              setAutoReconnect,
            ],
          ] as const
        }
      >
        {([label, value, onChange]) => (
          <MenuItem label={label}>
            <Toggle label={label} value={value} onChange={onChange} />
          </MenuItem>
        )}
      </For>
    </MenuGroup>
  );
};
