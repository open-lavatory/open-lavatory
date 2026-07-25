export const SIGNALING_PROTOCOLS = ["mqtt", "ntfy", "gun"] as const;
export type SignalingProtocol = (typeof SIGNALING_PROTOCOLS)[number];

export type SignalingSettingsV0 = { p: string; s: string; };

export type SignalingSettingsV1 = {
  p: SignalingProtocol;
  s: Partial<Record<SignalingProtocol, string>>;
};

export type SignalingSettings = SignalingSettingsV1;

export type UserThemePreference = "light" | "dark" | "system";

export type ProviderStorageV0 = {
  version?: 0;
  retainHistory: boolean;
  autoReconnect: boolean;
  session: SignalingSettingsV0;
};

export type ProviderStorageV1 = {
  version: 1;
  retainHistory: boolean;
  autoReconnect: boolean;
  signaling: SignalingSettingsV1;
};

export type ProviderStorageV2 = {
  version: 2;
  retainHistory: boolean;
  autoReconnect: boolean;
  signaling: SignalingSettingsV1;
  language?: string;
};

export type TurnServer = {
  urls: string;
  username?: string;
  credential?: string;
};

export type WebRTCSettings = {
  stun?: string[];
  turn?: TurnServer[];
};

export type TransportSettings = {
  p: string;
  s?: { webrtc?: WebRTCSettings; };
};

export type ProviderStorageV3 = {
  version: 3;
  retainHistory: boolean;
  autoReconnect: boolean;
  signaling?: SignalingSettingsV1;
  language?: string;
  transport?: TransportSettings;
  theme?: UserThemePreference;
};

export type ProviderStorage = ProviderStorageV3;

export type ProviderStorageVAny
  = | ProviderStorageV0
    | ProviderStorageV1
    | ProviderStorageV2
    | ProviderStorageV3;

type JsonObject = Record<string, unknown>;

const isObject = (v: unknown): v is JsonObject =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const fail = (message: string): never => {
  throw new TypeError(message);
};

const asObject = (v: unknown, label: string): JsonObject =>
  (isObject(v) ? v : fail(`${label} must be an object`));

const asBool = (v: unknown, label: string): boolean =>
  (typeof v === "boolean" ? v : fail(`${label} must be a boolean`));

const asString = (v: unknown, label: string): string =>
  (typeof v === "string" ? v : fail(`${label} must be a string`));

const asProtocol = (v: unknown): SignalingProtocol =>
  (typeof v === "string" && SIGNALING_PROTOCOLS.includes(v as SignalingProtocol)
    ? (v as SignalingProtocol)
    : fail(`protocol must be one of: ${SIGNALING_PROTOCOLS.join(", ")}`));

const asTheme = (v: unknown): UserThemePreference =>
  (v === "light" || v === "dark" || v === "system"
    ? v
    : fail("theme must be \"light\", \"dark\", or \"system\""));

const asStringArray = (v: unknown, label: string): string[] => {
  if (!Array.isArray(v) || v.some(x => typeof x !== "string")) {
    return fail(`${label} must be an array of strings`);
  }

  return v as string[];
};

const readCore = (o: JsonObject) => ({
  retainHistory: asBool(o.retainHistory, "retainHistory"),
  autoReconnect: asBool(o.autoReconnect, "autoReconnect"),
});

const readSignalingV0 = (v: unknown): SignalingSettingsV0 => {
  const o = asObject(v, "session");

  return { p: asString(o.p, "session.p"), s: asString(o.s, "session.s") };
};

const readSignalingV1 = (v: unknown): SignalingSettingsV1 => {
  const o = asObject(v, "signaling");
  const servers = asObject(o.s, "signaling.s");
  const s: Partial<Record<SignalingProtocol, string>> = {};

  for (const protocol of SIGNALING_PROTOCOLS) {
    if (protocol in servers) {
      s[protocol] = asString(servers[protocol], `signaling.s.${protocol}`);
    }
  }

  return { p: asProtocol(o.p), s };
};

const readTurn = (v: unknown): TurnServer => {
  const o = asObject(v, "turn server");

  return {
    urls: asString(o.urls, "turn.urls"),
    ...((typeof o.username === "string") && { username: o.username }),
    ...((typeof o.credential === "string") && { credential: o.credential }),
  };
};

const readWebRTC = (v: unknown): WebRTCSettings => {
  const o = asObject(v, "webrtc");

  return {
    ...(Array.isArray(o.stun) && { stun: asStringArray(o.stun, "webrtc.stun") }),
    ...(Array.isArray(o.turn) && { turn: o.turn.map(readTurn) }),
  };
};

const readTransport = (v: unknown): TransportSettings => {
  const o = asObject(v, "transport");
  const transport: TransportSettings = { p: asString(o.p, "transport.p") };

  if (isObject(o.s)) {
    transport.s = "webrtc" in o.s ? { webrtc: readWebRTC(o.s.webrtc) } : {};
  }

  return transport;
};

const readV0 = (v: unknown): ProviderStorageV0 => {
  const o = asObject(v, "storage");

  return { version: 0, ...readCore(o), session: readSignalingV0(o.session) };
};

const readV1 = (v: unknown): ProviderStorageV1 => {
  const o = asObject(v, "storage");

  if (o.version !== 1) fail("storage version must be 1");

  return { version: 1, ...readCore(o), signaling: readSignalingV1(o.signaling) };
};

const readV2 = (v: unknown): ProviderStorageV2 => {
  const o = asObject(v, "storage");

  if (o.version !== 2) fail("storage version must be 2");

  return {
    version: 2,
    ...readCore(o),
    signaling: readSignalingV1(o.signaling),
    ...((typeof o.language === "string") && { language: o.language }),
  };
};

const readV3 = (v: unknown): ProviderStorageV3 => {
  const o = asObject(v, "storage");

  if (o.version !== 3) fail("storage version must be 3");

  return {
    version: 3,
    ...readCore(o),
    ...(o.signaling !== undefined && { signaling: readSignalingV1(o.signaling) }),
    ...((typeof o.language === "string") && { language: o.language }),
    ...(o.transport !== undefined && { transport: readTransport(o.transport) }),
    ...(o.theme !== undefined && { theme: asTheme(o.theme) }),
  };
};

const toSignalingV1 = (session: SignalingSettingsV0): SignalingSettingsV1 => {
  const p = asProtocol(session.p);

  return { p, s: { [p]: session.s } };
};

export const convertProviderStorageV0ToV1 = (
  settings: ProviderStorageV0,
): ProviderStorageV1 => ({
  version: 1,
  retainHistory: settings.retainHistory,
  autoReconnect: settings.autoReconnect,
  signaling: toSignalingV1(settings.session),
});

export const convertProviderStorageV1ToV2 = (
  settings: ProviderStorageV1,
): ProviderStorageV2 => ({
  version: 2,
  retainHistory: settings.retainHistory,
  autoReconnect: settings.autoReconnect,
  signaling: settings.signaling,
});

export const convertProviderStorageV2ToV3 = (
  settings: ProviderStorageV2,
): ProviderStorageV3 => ({
  version: 3,
  retainHistory: settings.retainHistory,
  autoReconnect: settings.autoReconnect,
  signaling: settings.signaling,
  language: settings.language,
});

export const migrateStorageToLatest = (
  storage: ProviderStorageVAny,
): ProviderStorage => {
  if (storage.version === 0 || storage.version === undefined) {
    return migrateStorageToLatest(
      convertProviderStorageV0ToV1(storage as ProviderStorageV0),
    );
  }

  if (storage.version === 1) {
    return migrateStorageToLatest(
      convertProviderStorageV1ToV2(storage as ProviderStorageV1),
    );
  }

  if (storage.version === 2) {
    return convertProviderStorageV2ToV3(storage as ProviderStorageV2);
  }

  return storage as ProviderStorage;
};

/** Parse persisted JSON and return the latest storage shape (V3). */
export const parseProviderStorage = (raw: string): ProviderStorage => {
  const parsed: unknown = JSON.parse(raw);

  if (!isObject(parsed)) {
    return fail("provider storage must be a JSON object");
  }

  const data = parsed;

  if ("session" in data && !("signaling" in data)) {
    return migrateStorageToLatest(
      convertProviderStorageV0ToV1(readV0({ ...data, version: 0 })),
    );
  }

  switch (data.version) {
    case 1: {
      return migrateStorageToLatest(readV1(data));
    }
    case 2: {
      return migrateStorageToLatest(readV2(data));
    }
    case 3: {
      return readV3(data);
    }
    default: {
      if ("signaling" in data || "retainHistory" in data) {
        return readV3({ version: 3, ...data });
      }

      return fail("unrecognized provider storage format");
    }
  }
};
