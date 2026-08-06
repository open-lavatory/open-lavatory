import type { SignalingProtocol } from "@openlv/provider/storage";
import { createMemo } from "solid-js";

import { useSettings } from "../../../hooks/useSettings.js";
import { Input } from "../../../ui/Input.js";
import { MenuGroup } from "../../../ui/menu/MenuGroup.js";
import { MenuItem } from "../../../ui/menu/MenuItem.js";
import { Select } from "../../../ui/Select.js";
import { useTranslation } from "../../../utils/i18n.js";

const AVAILABLE_PROTOCOLS = ["mqtt", "ntfy", "gun"];

export const SignalingSettings = () => {
  const { t } = useTranslation();
  const { settings, setSignalingProtocol, setSignalingOptions }
    = useSettings();
  const signalingProtocol = createMemo(() => settings()?.signaling?.p);
  const signalingServer = createMemo(() => {
    const activeProtocol = signalingProtocol();

    if (!activeProtocol) return "";

    return settings()?.signaling?.s?.[activeProtocol] ?? "";
  });

  return (
    <div>
      <MenuGroup title={t("settings.signaling.title")}>
        <MenuItem label={t("common.protocol")}>
          <Select
            options={AVAILABLE_PROTOCOLS.map(option => [
              option.toLowerCase(),
              option.toUpperCase(),
            ])}
            value={signalingProtocol() ?? ""}
            onChange={value => setSignalingProtocol(value as SignalingProtocol)}
          />
        </MenuItem>
        <MenuItem label={t("settings.signaling.server")}>
          <Input
            id="server"
            value={signalingServer()}
            onChange={value => setSignalingOptions({ url: value })}
            placeholder={String(t("settings.signaling.serverUrl"))}
            ariaLabel={String(t("settings.signaling.serverUrl"))}
            readOnly={false}
          />
        </MenuItem>
      </MenuGroup>
      <div class="p-2 text-sm text-(--lv-text-secondary) text-start">
        {t("settings.signaling.description")}
      </div>
    </div>
  );
};
