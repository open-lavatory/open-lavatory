import { encodeConnectionURL } from "@openlv/core";
import { ProviderStatus } from "@openlv/provider";
import { createMemo, from } from "solid-js";

import { useModalContext } from "../context.js";

export const useSession = () => {
  const { provider } = useModalContext();
  const session = from(provider.session);

  // `from` binds one source, and the provider replaces the session per
  // connection. Rebinding inside a memo disposes the previous session's
  // subscriptions when it recomputes.
  const bound = createMemo(() => {
    const current = session();

    if (!current) return undefined;

    return {
      status: from(current.status),
      signalStatus: from(current.signalStatus),
      peerInfo: from(current.peerInfo),
      error: from(current.error),
    };
  });

  const uri = createMemo(() => {
    const parameters = session()?.getHandshakeParameters();

    return parameters ? encodeConnectionURL(parameters) : undefined;
  });

  return {
    uri,
    status: () => bound()?.status(),
    signalStatus: () => bound()?.signalStatus(),
    peerInfo: () => bound()?.peerInfo(),
    error: () => bound()?.error(),
  };
};

export const useSessionStart = () => {
  const { provider } = useModalContext();

  return {
    start: () => {
      const currentSettings = provider.storage.settings.get();
      const p = currentSettings?.signaling?.p;
      const s = p ? currentSettings?.signaling?.s?.[p] : undefined;

      if (!p || !s) {
        throw new Error("Invalid protocol or server");
      }

      return provider.createSession({ p, s }).catch((error: unknown) => {
        // Back cancels an in-flight session by returning the provider to
        // standby. Its rejected start promise is not a connection failure.
        if (provider.status.get() !== ProviderStatus.ERROR) return undefined;

        throw error;
      });
    },
  };
};
