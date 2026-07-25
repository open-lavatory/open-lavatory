import type { TurnServer } from "@openlv/provider/storage";
import { LucidePlus, LucideTrash2 } from "lucide-solid";
import type { JSX } from "solid-js";
import { createSignal, For } from "solid-js";

import { useSettings } from "../../../hooks/useSettings.js";
import { Button } from "../../../ui/Button.js";
import { Input } from "../../../ui/Input.js";
import { MenuGroup } from "../../../ui/menu/MenuGroup.js";
import { useTranslation } from "../../../utils/i18n.js";

const ServerListItem = (properties: {
  children: JSX.Element;
  onRemove: () => void;
}) => (
  <div class="flex items-center gap-2">
    <div class="flex-1">{properties.children}</div>
    <Button
      onClick={properties.onRemove}
      $variant="tertiary"
      $aspect="square"
      $size="sm"
    >
      <LucideTrash2 class="h-4 w-4 text-(--lv-text-muted)" />
    </Button>
  </div>
);

const AddServerButton = (properties: {
  label: JSX.Element;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={properties.onClick}
    class="flex w-full cursor-pointer items-center justify-center gap-1 rounded-md border border-dashed border-(--lv-control-input-border) py-2 text-sm text-(--lv-text-muted) hover:bg-(--lv-card-background)"
  >
    <LucidePlus class="h-4 w-4" />
    {properties.label}
  </button>
);

export const TransportSettings = () => {
  const { t } = useTranslation();
  const {
    settings,
    setSettings,
  } = useSettings();

  const [turnServers, setTurnServers] = createSignal<TurnServer[]>([]);
  const [stunServers, setStunServers] = createSignal<string[]>([]);

  const handleAddStun = () => {
    setStunServers([...stunServers(), ""]);
  };

  const handleRemoveStun = (index: number) => {
    setStunServers(stunServers().filter((_, index_) => index_ !== index));
  };

  const handleStunChange = (index: number, value: string) => {
    setStunServers(stunServers().map((server, index_) => (index_ === index ? value : server)));
  };

  const handleAddTurn = () => {
    setTurnServers([...turnServers(), { urls: "" }]);
  };

  const handleRemoveTurn = (index: number) => {
    setTurnServers(turnServers().filter((_, index_) => index_ !== index));
  };

  const handleTurnChange = (index: number, field: keyof TurnServer, value: string) => {
    setTurnServers(turnServers().map((server, index_) => (index_ === index ? { ...server, [field]: value } : server)));
  };

  // createEffect(() => {
  //   setSettings({
  //     ...settings(), transport: {
  //       p: "webrtc",
  //       s: {
  //         webrtc: {
  //           stun: stunServers(),
  //           turn: turnServers(),
  //         },
  //       },
  //     },
  //   });
  // });

  return (
    <>
      <MenuGroup title={t("settings.transport.iceServers.stun")}>
        <div class="flex flex-col gap-2 p-2">
          <For each={stunServers()}>
            {(server, index) => (
              <ServerListItem onRemove={() => handleRemoveStun(index())}>
                <Input
                  value={server}
                  onChange={value => handleStunChange(index(), value)}
                  placeholder="stun:stun.l.google.com:19302"
                  readOnly={false}
                />
              </ServerListItem>
            )}
          </For>
          <AddServerButton
            label={t("settings.transport.iceServers.addStun")}
            onClick={handleAddStun}
          />
        </div>
      </MenuGroup>

      <MenuGroup title={t("settings.transport.iceServers.turn")}>
        <div class="flex flex-col gap-3 p-2">
          <For each={turnServers()}>
            {(server, index) => (
              <div class="flex flex-col gap-2 rounded-md border border-(--lv-control-input-border) p-2">
                <ServerListItem onRemove={() => handleRemoveTurn(index())}>
                  <Input
                    value={server.urls}
                    onChange={value =>
                      handleTurnChange(index(), "urls", value)}
                    placeholder="turn:relay.example.com:443"
                    readOnly={false}
                  />
                </ServerListItem>
                <div class="grid grid-cols-2 gap-2">
                  <Input
                    value={server.username ?? ""}
                    onChange={value =>
                      handleTurnChange(index(), "username", value)}
                    placeholder="Username"
                    readOnly={false}
                  />
                  <Input
                    value={server.credential ?? ""}
                    onChange={value =>
                      handleTurnChange(index(), "credential", value)}
                    placeholder="Password"
                    readOnly={false}
                  />
                </div>
              </div>
            )}
          </For>
          <AddServerButton
            label={t("settings.transport.iceServers.addTurn")}
            onClick={handleAddTurn}
          />
        </div>
      </MenuGroup>
      <div class="p-2 text-sm text-(--lv-text-secondary) text-start">
        {t("settings.transport.description")}
      </div>
    </>
  );
};
