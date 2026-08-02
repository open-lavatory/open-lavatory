import { PROVIDER_STATUS, type ProviderStatus } from "@openlv/provider";
import {
  createSignal,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";

import { UnknownState } from "../components/UnknownState.js";
import { useModalContext } from "../context.jsx";
import { useTranslation } from "../utils/i18n.js";
import { Connecting } from "./connecting.jsx";
import { ErrorScreen } from "./ErrorScreen.jsx";

interface ConnectionFlowProperties {
  onClose: () => void;
  onCopy: (uri: string) => void;
}

const LoadingSpinner = () => (
  <div class="flex items-center justify-center">
    <div class="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
  </div>
);

export const ConnectionFlow = (properties: ConnectionFlowProperties) => {
  const { t } = useTranslation();
  const { provider } = useModalContext();

  const [providerStatus, setProviderStatus] = createSignal<ProviderStatus>(provider.getState().status);
  // Peer info is recorded during the handshake, so it is in the session
  // state by the time the status flips to CONNECTED and this re-evaluates.
  const peerInfo = () => provider.getSession()?.getState().peerInfo;
  // The wire only bounds the icon's size — vetting what goes into an
  // <img src> is this renderer's job.
  const renderableIcon = () => {
    const icon = peerInfo()?.icon;

    return icon && (icon.startsWith("data:image/") || icon.startsWith("https://"))
      ? icon
      : undefined;
  };

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
          <Connecting onClose={properties.onClose} />
        </Match>
        <Match when={providerStatus() === PROVIDER_STATUS.CONNECTED}>
          <div class="flex flex-col items-center gap-4 p-6">
            <div class="text-center">
              <Show
                when={peerInfo()}
                fallback={<div class="mb-4 text-4xl">✅</div>}
              >
                {info => (
                  <div class="mb-4 flex flex-col items-center gap-2">
                    <Show
                      when={renderableIcon()}
                      fallback={<div class="text-4xl">✅</div>}
                    >
                      {icon => (
                        <img
                          src={icon()}
                          alt=""
                          class="h-12 w-12 rounded-xl"
                        />
                      )}
                    </Show>
                    <span class="font-medium text-(--lv-text-primary) text-sm">
                      {info().name}
                    </span>
                  </div>
                )}
              </Show>
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
          <ErrorScreen onClose={properties.onClose} />
        </Match>
      </Switch>
    </div>
  );
};
