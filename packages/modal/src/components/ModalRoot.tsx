import { ProviderStatus } from "@openlv/provider";
import classNames from "classnames";
import {
  createEffect,
  createMemo,
  createSignal,
  from,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";
import { match, P } from "ts-pattern";

import { useModalContext } from "../context.jsx";
import { ConnectionFlow } from "../flow/ConnectionFlow.js";
import { Disconnected } from "../flow/disconnected/Disconnected.js";
import { InfoScreen } from "../flow/InfoScreen.js";
import { copyToClipboard } from "../hooks/useClipboard.js";
import { usePunchTransition } from "../hooks/usePunchTransition.js";
import { useSession } from "../hooks/useSession.js";
import { useTheme } from "../hooks/useTheme.js";
import { useTranslation } from "../utils/i18n.js";
import { Footer } from "./footer/Footer.js";
import { Header } from "./Header.js";
import { ModalSettings, type SettingsNavigationReference } from "./settings/index.js";
import { UnknownState } from "./UnknownState.js";

export interface ModalRootProps {
  onClose?: () => void;
  onStartConnection?: () => void;
  onCopy?: (uri: string) => void;
}

export type ModalView = "start" | "settings" | "info";

const useModalState = () => {
  const [view, setView] = createSignal<ModalView>("start");
  const [copied, setCopied] = createSignal(false);

  createEffect(() => {
    if (!copied()) return;

    const timeout = globalThis.setTimeout(() => setCopied(false), 2000);

    onCleanup(() => globalThis.clearTimeout(timeout));
  });

  return {
    view,
    setView,
    copied,
    setCopied,
  };
};

const useEscapeToClose = (handler: () => void) => {
  createEffect(() => {
    // eslint-disable-next-line unicorn/consistent-function-scoping
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") handler();
    };

    document.addEventListener("keydown", keyHandler);

    onCleanup(() => document.removeEventListener("keydown", keyHandler));
  });
};

const useDynamicDialogHeight = () => {
  const [contentNode, setContentNode] = createSignal<HTMLDivElement>();
  const [height, setHeight] = createSignal(0);

  const measureHeight = (
    targetElement?: HTMLElement | null,
    useScrollHeight = false,
  ) => {
    const node = targetElement || contentNode();

    if (!node || !node.getBoundingClientRect) return;

    const nextHeight = useScrollHeight
      ? node.scrollHeight
      : node.getBoundingClientRect().height;

    if (nextHeight > 0) {
      setHeight(previousHeight =>
        (typeof previousHeight === "number"
          && Math.abs(previousHeight - nextHeight) < 0.5
          ? previousHeight
          : nextHeight),
      );
    }
  };

  createEffect(() => {
    const node = contentNode();

    if (!node || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      measureHeight();
    });

    observer.observe(node);

    onCleanup(() => observer.disconnect());
  });

  const handleResize = () => measureHeight();

  createEffect(() => {
    if (globalThis.window === undefined) return;

    window.addEventListener("resize", handleResize);

    onCleanup(() => window.removeEventListener("resize", handleResize));
  });

  return {
    setContentRef: setContentNode,
    contentNode,
    height,
    measureHeight,
  };
};

export const ModalRoot = (properties: { onClose: () => void; }) => {
  const { view: modalView, setView, copied, setCopied } = useModalState();
  const { uri } = useSession();
  const { provider } = useModalContext();
  const providerStatus = from(provider.status);
  const { setContentRef, contentNode, height, measureHeight }
    = useDynamicDialogHeight();
  const {
    current: displayedModalView,
    previous: previousModalView,
    isTransitioning: isModalViewTransitioning,
  } = usePunchTransition(modalView);
  const {
    current: displayedStatus,
    previous: previousStatus,
    isTransitioning: isStatusTransitioning,
  } = usePunchTransition(providerStatus);
  const openSettings = () => setView("settings");
  const { t, isRtl, languageTag } = useTranslation();
  const theme = useTheme();

  const settingsNavReference: { current: SettingsNavigationReference | null; } = {
    current: null,
  };
  const [settingsTitleKey, setSettingsTitleKey]
    = createSignal("settings.title");

  const title = createMemo(() =>
    match(modalView())
      .with("start", () => t("start.title"))
      .with("settings", () => t(settingsTitleKey()))
      .with("info", () => t("info.title"))
      .exhaustive(),
  );

  useEscapeToClose(properties.onClose);

  createEffect(() => {
    if (providerStatus() === ProviderStatus.CONNECTED) {
      properties.onClose();
    }
  });

  const handleCopy = async () => {
    const sessionUri = uri();
    const success = sessionUri && (await copyToClipboard(sessionUri));

    if (success) setCopied(true);
  };

  let isInitialMount = true;
  let initialMeasureTimeout: ReturnType<typeof setTimeout> | undefined;
  let previousHeight: number | undefined;
  let overflowTimeout: ReturnType<typeof setTimeout> | undefined;
  const [shouldHideOverflow, setShouldHideOverflow] = createSignal(false);

  createEffect(() => {
    displayedStatus();
    displayedModalView();
    const node = contentNode();

    if (!node) return;

    if (isInitialMount) {
      if (initialMeasureTimeout) {
        globalThis.clearTimeout(initialMeasureTimeout);
      }

      initialMeasureTimeout = globalThis.setTimeout(() => {
        if (!contentNode()) {
          return;
        }

        measureHeight(undefined, true);
        isInitialMount = false;
      }, 0);
    }
    else {
      measureHeight();
    }

    onCleanup(() => {
      if (initialMeasureTimeout) {
        globalThis.clearTimeout(initialMeasureTimeout);
      }
    });
  });

  createEffect(() => {
    const currentHeight = height();
    const isHeightChanging
      = previousHeight !== undefined
        && currentHeight !== previousHeight
        && currentHeight > 0
        && previousHeight > 0
        && Math.abs(currentHeight - previousHeight) > 0.5;

    if (isHeightChanging) {
      setShouldHideOverflow(true);

      if (overflowTimeout) {
        globalThis.clearTimeout(overflowTimeout);
      }

      overflowTimeout = globalThis.setTimeout(() => {
        setShouldHideOverflow(false);
        overflowTimeout = undefined;
      }, 200);
    }

    previousHeight = currentHeight;

    onCleanup(() => {
      if (overflowTimeout) {
        globalThis.clearTimeout(overflowTimeout);
      }
    });
  });

  const shouldShowBack = createMemo(
    () => !(modalView() === "start" && providerStatus() === ProviderStatus.STANDBY),
  );

  const onBack = () => {
    match({ view: modalView(), status: providerStatus() })
      .with({ view: "start", status: ProviderStatus.STANDBY }, () => undefined)
      .with({ view: "start" }, () => {
        provider.closeSession();
      })
      .with({ view: "settings" }, () => {
        if (settingsNavReference.current && !settingsNavReference.current.isAtRoot) {
          settingsNavReference.current.goBack();
        }
        else {
          setView("start");
        }
      })
      .with({ view: "info" }, () => {
        setView("start");
      })
      .otherwise(() => {
        provider.closeSession();
        properties.onClose();
      });
  };

  const renderDisconnectedView = (targetView: ModalView): JSX.Element =>
    match(targetView)
      .with("start", () => <Disconnected onSettings={openSettings} />)
      .with("settings", () => (
        <ModalSettings
          onTitleChange={setSettingsTitleKey}
          navigationRef={settingsNavReference}
        />
      ))
      .with("info", () => <InfoScreen />)
      .otherwise(() => <UnknownState state={targetView} />);

  const renderDisconnectedSection = () => (
    <div class="modal-transition__container">
      <Show when={previousModalView()}>
        {previousView => (
          <div class="modal-transition__layer modal-transition__layer--outgoing">
            {renderDisconnectedView(previousView())}
          </div>
        )}
      </Show>
      <div
        class={classNames(
          "modal-transition__layer",
          isModalViewTransitioning() && "modal-transition__layer--incoming",
        )}
      >
        {renderDisconnectedView(displayedModalView())}
      </div>
    </div>
  );

  const renderStatusSection = (
    targetStatus: ProviderStatus | undefined,
  ): JSX.Element =>
    match(targetStatus)
      .with(ProviderStatus.STANDBY, () => renderDisconnectedSection())
      .with(
        P.union(
          ProviderStatus.CREATING,
          ProviderStatus.CONNECTING,
          ProviderStatus.CONNECTED,
          ProviderStatus.ERROR,
        ),
        () => (
          <ConnectionFlow onClose={properties.onClose} onCopy={handleCopy} />
        ),
      )
      .otherwise(state => <UnknownState state={state || "unknown status"} />);

  const overlayStyle: JSX.CSSProperties = {
    "background": "var(--lv-overlay-background, rgba(0,0,0,0.3))",
    "backdrop-filter": "var(--lv-overlay-backdrop-filter, blur(4px))",
  };

  const cardStyle: JSX.CSSProperties = {
    "background": "var(--lv-body-background)",
    "color": "var(--lv-body-color, var(--lv-text-primary))",
    "border-radius": "var(--lv-border-radius, 16px)",
    "box-shadow": "var(--lv-modal-shadow, 0px 12px 32px rgba(0,0,0,0.25))",
  };

  return (
    <div
      class="fixed inset-0 z-10000 flex animate-[bg-in_0.15s_ease-in-out] items-end justify-center md:items-center lg:p-4"
      onMouseUp={(e) => {
        if (e.target === e.currentTarget) properties.onClose();
      }}
      role="presentation"
      data-openlv-modal-root
      data-openlv-theme-mode={theme.mode()}
      lang={languageTag()}
      dir={isRtl() ? "rtl" : "ltr"}
      style={overlayStyle}
    >
      <div
        class={classNames(
          "relative w-full max-w-[400px] animate-[fade-in_0.15s_ease-in-out] transition-[height] duration-200 ease-out",
          shouldHideOverflow() || previousStatus()
            ? "overflow-hidden"
            : undefined,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={String(title())}
        onClick={event => event.stopPropagation()}
        style={{
          ...(typeof height() === "number" && height() > 0 && { height: `${height()}px` }),
          ...cardStyle,
        }}
      >
        <div ref={setContentRef}>
          <Header
            title={String(title())}
            view={modalView()}
            onClose={properties.onClose}
            onBack={shouldShowBack() ? onBack : undefined}
            setView={setView}
          />
          <div class="modal-transition__container">
            <div
              class={classNames(
                "modal-transition__layer",
                isStatusTransitioning() && "modal-transition__layer--incoming",
              )}
            >
              <div class="flex flex-col text-center">
                {renderStatusSection(providerStatus())}
              </div>
            </div>
          </div>
          <Footer />
        </div>

        <div
          class={classNames(
            "absolute top-5 rounded-lg bg-blue-500 px-4 py-3 font-medium text-sm text-white transition-all ltr:right-5 rtl:left-5",
            copied()
              ? "translate-x-0 opacity-100"
              : "opacity-0 ltr:translate-x-full rtl:-translate-x-full",
          )}
        >
          {t("modal.urlCopied")}
        </div>
      </div>
    </div>
  );
};
