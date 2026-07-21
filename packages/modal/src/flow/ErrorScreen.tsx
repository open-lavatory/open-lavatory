import { createMemo } from "solid-js";

import { useModalContext } from "../context.jsx";
import { useTranslation } from "../utils/i18n.jsx";

/**
 * Shown when a session fails to establish. Special-cases the "no local ICE
 * candidates" transport failure, since that one has a concrete user-side
 * remedy (WebRTC disabled/blocked by the browser, an extension, or a VPN).
 */
export const ErrorScreen = (props: { onClose: () => void; }) => {
  const { t } = useTranslation();
  const { provider } = useModalContext();

  const reason = createMemo(
    () => provider.getState().error ?? provider.getState().session?.error,
  );
  const isIceFailure = createMemo(() =>
    /ice candidates/i.test(reason() ?? ""));

  const message = createMemo(() => {
    if (isIceFailure()) return t("connectionFlow.errorNoIce");

    return reason() ?? t("connectionFlow.errorGeneric");
  });

  const retry = () => {
    // Back to the disconnected view so the user can generate a fresh QR.
    void provider.closeSession();
  };

  return (
    <div class="flex flex-col items-center gap-4 p-6">
      <div class="text-center">
        <div class="mb-4 text-4xl">⚠️</div>
        <h3 class="mb-2 font-semibold text-(--lv-text-primary) text-lg">
          {t("connectionFlow.connectionFailed")}
        </h3>
        <p class="mb-2 text-(--lv-text-muted) text-sm">{message()}</p>
      </div>
      <div class="flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={retry}
          class="w-full rounded-lg bg-(--lv-control-button-primary-background) px-4 py-2 font-semibold text-(--lv-control-button-primary-color, var(--lv-text-primary)) text-sm transition hover:bg-(--lv-control-button-primary-background-hover)"
        >
          {t("connectionFlow.tryAgain")}
        </button>
        <button
          type="button"
          onClick={props.onClose}
          class="w-full rounded-lg bg-(--lv-control-button-secondary-background) px-4 py-2 font-semibold text-(--lv-text-primary) text-sm transition hover:bg-(--lv-control-button-primary-background-hover)"
        >
          {t("common.close")}
        </button>
      </div>
    </div>
  );
};
