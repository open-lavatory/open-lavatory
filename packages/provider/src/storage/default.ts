import type { ProviderStorage } from "./version.js";

export const DEFAULT_SETTINGS: ProviderStorage = {
  version: 3,
  signaling: {
    p: "mqtt",
    s: {
      mqtt: "wss://test.mosquitto.org:8081/mqtt",
      ntfy: "https://ntfy.sh",
      gun: "wss://try.axe.eco/gun",
    },
  },
  autoReconnect: true,
  retainHistory: false,
  language: undefined,
  transport: {
    p: "webrtc",
  },
  theme: "system",
};
