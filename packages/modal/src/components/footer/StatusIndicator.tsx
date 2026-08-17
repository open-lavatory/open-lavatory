import { SessionStatus } from "@openlv/session";
import { Status as SignalStatus } from "@openlv/signaling";
import { createMemo, Show } from "solid-js";
import { match, P } from "ts-pattern";

import { useSession } from "../../hooks/useSession.js";
import { useTranslation } from "../../utils/i18n.js";

const SIGNAL_INDICATORS = {
  [SignalStatus.STANDBY]: { icon: "🫥", key: "status.connecting" },
  [SignalStatus.CONNECTING]: { icon: "↗️", key: "status.connecting" },
  [SignalStatus.READY]: { icon: "👋", key: "status.ready" },
  [SignalStatus.HANDSHAKE]: { icon: "🤝", key: "status.handshakeClosed" },
  [SignalStatus.HANDSHAKE_PARTIAL]: { icon: "🤝", key: "status.handshakePartial" },
  // Reaching ENCRYPTED is what starts the transport, so this state is the
  // peer connection being negotiated, not an idle encrypted channel.
  [SignalStatus.ENCRYPTED]: { icon: "🔒", key: "connectionFlow.establishingConnection" },
  [SignalStatus.ERROR]: { icon: "❌", key: "status.signalError" },
} satisfies Record<SignalStatus, { icon: string; key: string; }>;

export const FooterStatus = () => {
  const { t } = useTranslation();
  const { status, signalStatus } = useSession();

  const indicator = createMemo(() =>
    match({ session: status(), signal: signalStatus() })
      .with({ session: SessionStatus.CONNECTED }, () => ({
        icon: "✅",
        text: t("status.connectedSuccessfully"),
      }))
      // Signaling stays ENCRYPTED when the transport gives up, so the
      // session has the last word on both ends of the connection.
      .with({ session: SessionStatus.DISCONNECTED }, () => ({
        icon: "❌",
        text: t("status.disconnected"),
      }))
      .with({ signal: P.nonNullable }, ({ signal }) => ({
        icon: SIGNAL_INDICATORS[signal].icon,
        text: t(SIGNAL_INDICATORS[signal].key),
      }))
      .otherwise(() => undefined),
  );

  return (
    <Show when={indicator()}>
      {resolved => (
        <div class="group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-(--lv-control-button-secondary-background)">
          <div class="pointer-events-none whitespace-nowrap rounded-md text-xs opacity-0 group-hover:opacity-100">
            {resolved().text}
          </div>
          <div>{resolved().icon}</div>
        </div>
      )}
    </Show>
  );
};
