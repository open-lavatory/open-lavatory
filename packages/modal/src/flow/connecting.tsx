import { SessionStatus } from "@openlv/session";
import { Match, Switch } from "solid-js";

import { useSession } from "../hooks/useSession.js";
import { useTranslation } from "../utils/i18n.jsx";
import { HandshakeOpen } from "./HandshakeOpen.jsx";

const LoadingSpinner = () => (
  <div class="flex items-center justify-center">
    <div class="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
  </div>
);

export const Connecting = () => {
  const { status } = useSession();
  const { t } = useTranslation();

  return (
    <div>
      <Switch>
        <Match when={status() === SessionStatus.CREATED || status() === SessionStatus.SIGNALING}>
          <div class="flex flex-col items-center gap-4 p-6">
            <LoadingSpinner />
            <div class="text-center">
              <h3 class="mb-2 font-semibold text-(--lv-text-primary) text-lg">
                {t("connectionFlow.connecting")}
              </h3>
              <p class="text-(--lv-text-muted) text-sm">
                {t("connectionFlow.waitingForNetwork")}
              </p>
            </div>
          </div>
        </Match>
        <Match when={status() === SessionStatus.READY}>
          <HandshakeOpen />
        </Match>
        <Match when={status() === SessionStatus.LINKING}>
          <div class="flex flex-col items-center gap-4 p-6">
            <LoadingSpinner />
            <div class="text-center">
              <h3 class="mb-2 font-semibold text-(--lv-text-primary) text-lg">
                {t("connectionFlow.establishingConnection")}
              </h3>
              <p class="text-(--lv-text-muted) text-sm">
                {t("connectionFlow.mayTakeFewSeconds")}
              </p>
            </div>
          </div>
        </Match>
      </Switch>
    </div>
  );
};
