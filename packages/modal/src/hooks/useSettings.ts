import type {
  ProviderStorage,
  SignalingProtocol,
  UserThemePreference,
  WebRTCSettings,
} from "@openlv/provider/storage";
import { createSignal, onCleanup } from "solid-js";

import { useModalContext } from "../context.js";
import type { LanguageTag } from "../utils/i18n.jsx";

export const useSettings = () => {
  const { provider } = useModalContext();
  const [settings, setLocalSettings] = createSignal<ProviderStorage>(provider.storage.getSettings());

  // Several components hold their own useSettings(); without this a write
  // through one leaves the others showing the value it replaced.
  provider.storage.emitter.on("settings_change", setLocalSettings);
  onCleanup(() => provider.storage.emitter.off("settings_change", setLocalSettings));

  const setSettings = (newSettings: ProviderStorage) => {
    provider.storage.setSettings(newSettings);
  };

  const setLanguage = (language: LanguageTag) => {
    setSettings({ ...settings(), language });
  };

  const setThemeMode = (themeMode: UserThemePreference) => {
    setSettings({ ...settings(), theme: themeMode });
  };

  const setSignalingProtocol = (p: SignalingProtocol) => {
    setSettings({ ...settings(), signaling: { p, s: settings()?.signaling?.s ?? {} } });
  };

  const setSignalingOptions = (options: { url: string; }) => {
    const p = settings()?.signaling?.p;

    if (!p) return;

    const s = settings()?.signaling?.s ?? {};

    setSettings({ ...settings(), signaling: { p, s: { ...s, [p]: options.url } } });
  };

  const setTransportOptions = (webrtc: WebRTCSettings) => {
    const p = settings()?.transport?.p ?? "webrtc";

    setSettings({ ...settings(), transport: { p, s: { webrtc } } });
  };

  const setRetainSessionHistory = (retain: boolean) => {
    setSettings({ ...settings(), retainHistory: retain });
  };

  const setAutoReconnect = (autoReconnect: boolean) => {
    setSettings({ ...settings(), autoReconnect });
  };

  return {
    settings,
    setSettings,
    setLanguage,
    setThemeMode,
    setSignalingProtocol,
    setSignalingOptions,
    setTransportOptions,
    setRetainSessionHistory,
    setAutoReconnect,
  };
};
