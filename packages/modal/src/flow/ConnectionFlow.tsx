import { PROVIDER_STATUS, type ProviderStatus } from "@openlv/provider";
import {
  createSignal,
  Match,
  onCleanup,
  onMount,
  Switch,
} from "solid-js";

import { UnknownState } from "../components/UnknownState.js";
import { useModalContext } from "../context.jsx";
import { useTranslation } from "../utils/i18n.js";
import { Connecting } from "./connecting.jsx";
import { ErrorScreen } from "./ErrorScreen.jsx";

interface ConnectionFlowProps {
  onClose: () => void;
  onCopy: (uri: string) => void;
}

const LoadingSpinner = () => (
  <div class="flex items-center justify-center">
    <div class="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
  </div>
);

export const ConnectionFlow = (props: ConnectionFlowProps) => {
  const { t } = useTranslation();
  const { provider } = useModalContext();

  const [providerStatus, setProviderStatus] = createSignal<ProviderStatus>(provider.getState().status);

  onMount(() => {
    provider.on("status_change", setProviderStatus);
  });
  onCleanup(() => {
    provider.off("status_change", setProviderStatus);
  });

  return (
    <div style={{ "view-transition-name": "connection-flow" }} class="w-full">
      <Switch fallback={<UnknownState state={providerStatus()} />}>
        <Match when={providerStatus() === PROVIDER_STATUS.CREATING}>
          <div class="flex flex-col items-center gap-4 p-6">
            <LoadingSpinner />
            <div class="text-center">
              <h3 class="mb-2 font-semibold text-(--lv-text-primary) text-lg">
                {t("connectionFlow.preparingConnection")}
              </h3>
              <p class="text-(--lv-text-muted) text-sm">
                {t("connectionFlow.generatingKeys")}
              </p>
            </div>
          </div>
        </Match>
        <Match when={providerStatus() === PROVIDER_STATUS.CONNECTING}>
          <Connecting onClose={props.onClose} />
        </Match>
        <Match when={providerStatus() === PROVIDER_STATUS.CONNECTED}>
          <div class="flex flex-col items-center gap-4 p-6">
            <div class="text-center">
              <div class="mb-4 text-4xl">✅</div>
              <h3 class="mb-2 font-semibold text-(--lv-text-primary) text-lg">
                {t("connectionFlow.connectedSuccessfully")}
              </h3>
              <p class="text-(--lv-text-muted) text-sm">
                {t("connectionFlow.walletConnectedReady")}
              </p>
            </div>
          </div>
        </Match>
        <Match when={providerStatus() === PROVIDER_STATUS.ERROR}>
          <ErrorScreen onClose={props.onClose} />
        </Match>
      </Switch>
    </div>
  );
};
