import {
  createScope,
  encodeConnectionURL,
  type Observable,
  observable,
  type SessionLinkParameters,
} from "@openlv/core";
import {
  createSession,
  type Session,
  SessionStatus,
} from "@openlv/session";
import type { PeerInfo } from "@openlv/signaling";
import type { TransportProtocol } from "@openlv/transport";
import { webrtc, type WebRTCConfig } from "@openlv/transport/webrtc";
import { Provider as OxProvider } from "ox";
import type { Address } from "ox/Address";
import type { EventMap } from "ox/Provider";
import type { ExtractReturnType } from "ox/RpcSchema";

import {
  createWalletRpcClient,
  jsonRpcRequest,
  type RpcSchema,
} from "./rpc.js";
import { DEFAULT_SETTINGS } from "./storage/default.js";
import {
  createProviderStorage,
  type ProviderStorageParameters,
  type ProviderStorageR,
} from "./storage/index.js";
import type { SignalingProtocol } from "./storage/version.js";
import { log } from "./utils/log.js";

export type OpenLVProviderConfig = {
  /** Shared with the wallet during the handshake and shown in its UI. */
  info?: PeerInfo;
  signaling?: {
    p?: SignalingProtocol;
    s?: Record<SignalingProtocol, string>;
  };
  transport?: {
    p?: TransportProtocol;
    s?: Record<TransportProtocol, WebRTCConfig>;
  };
};

export type OpenLVProviderParameters = {
  config?: OpenLVProviderConfig;
  openModal?: (provider: OpenLVProvider) => Promise<void>;
} & Pick<ProviderStorageParameters, "storage">;

export const ProviderStatus = {
  STANDBY: "standby",
  CREATING: "creating",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  ERROR: "error",
} as const;
export type ProviderStatus = (typeof ProviderStatus)[keyof typeof ProviderStatus];

export type ProviderConfig = {
  schema: RpcSchema;
};

export type ProviderBase = {
  storage: ProviderStorageR;
  createSession: (parameters?: SessionLinkParameters) => Promise<Session>;
  closeSession: () => Promise<void>;
  getAccounts: () => Promise<Address[]>;
  status: Observable<ProviderStatus>;
  error: Observable<string | undefined>;
  session: Observable<Session | undefined>;
};

export type OpenLVProvider = OxProvider.Provider<
  { schema: RpcSchema; },
  EventMap
>
& ProviderBase;

/**
 * OpenLV Provider
 *
 * https://openlv.sh/api/provider
 */
export const createProvider = (
  parameters: OpenLVProviderParameters,
): OpenLVProvider => {
  const { openModal, config, storage } = parameters;

  const store = createProviderStorage({ storage });
  const [session, setSession] = observable<Session | undefined>(undefined);
  const [status, setStatus] = observable<ProviderStatus>(ProviderStatus.STANDBY);
  const [error, setError] = observable<string | undefined>(undefined);

  const oxEmitter = OxProvider.createEmitter<EventMap>();

  const walletRpc = createWalletRpcClient(async (payload) => {
    const current = session.get();

    if (!current) throw new Error("No session");

    return await current.send(payload);
  });

  const getAccounts = async () => [...await walletRpc.call({ method: "eth_accounts" })];

  // For debug purposes
  status.subscribe(current => log("status", current));

  const onMessage = async (message: unknown): Promise<unknown> => {
    log("onMessage received from remote peer", message);

    // Emit on the session emitter so observers (e.g. modal) can react.
    session.get()?.emitter.emit("request", message);

    const requestIdentifier = jsonRpcRequest.safeParse(message).data?.["id"] ?? null;

    return {
      jsonrpc: "2.0",
      ["id"]: requestIdentifier,
      error: {
        code: -32_601,
        message: "Method not found",
      },
    };
  };

  const defaultLinkParameters = (): SessionLinkParameters | undefined => {
    const signaling: { p?: string; s?: Partial<Record<string, string>>; } | undefined
      = store.settings.get().signaling ?? config?.signaling;
    const p = signaling?.p;

    return p ? { p, s: signaling?.s?.[p] ?? DEFAULT_SETTINGS.signaling?.s[p] ?? "" } : undefined;
  };

  const start = async (parameters?: SessionLinkParameters) => {
    setError(undefined);
    setStatus(ProviderStatus.CREATING);
    const linkParameters = parameters ?? defaultLinkParameters();

    if (!linkParameters) {
      throw new Error("No link parameters provided and no signaling defaults configured");
    }

    const stored = store.settings.get().transport?.s?.webrtc;
    const iceServers = [
      ...stored?.stun?.map(urls => ({ urls })) ?? [],
      ...stored?.turn ?? [],
    ];
    const transportOptions = iceServers.length > 0
      ? { iceServers }
      : config?.transport?.s?.webrtc;

    try {
      const next = await createSession(
        linkParameters,
        [webrtc(transportOptions)],
        onMessage,
        { info: config?.info },
      );

      setSession(next);
      setStatus(ProviderStatus.CONNECTING);

      log("session created");
      await next.connect();
      log("session connected");
      const handshakeParameters = next.getHandshakeParameters();
      const url = encodeConnectionURL(handshakeParameters);

      log("session url", url);

      const settled = await next.status.until(
        state => state === SessionStatus.CONNECTED
          || state === SessionStatus.DISCONNECTED,
      );

      if (settled !== SessionStatus.CONNECTED) {
        throw new Error(next.error.get() ?? "Session failed to connect");
      }

      log("session linked");

      const accounts = await getAccounts();
      const chainId = await walletRpc.call({ method: "eth_chainId" });

      setStatus(ProviderStatus.CONNECTED);
      oxEmitter.emit("connect", { chainId });
      oxEmitter.emit("accountsChanged", accounts);

      return next;
    }
    catch (error_) {
      setError(
        session.get()?.error.get()
        ?? (error_ instanceof Error ? error_.message : "Connection failed"),
      );
      setStatus(ProviderStatus.ERROR);
      throw error_;
    }
  };

  const closeSession = async () => {
    await session.get()?.close();
    setSession(undefined);
    setError(undefined);
    setStatus(ProviderStatus.STANDBY);
  };

  const request: OxProvider.from.Value<ProviderConfig>["request"] = async (
    request,
  ) => {
    log("ox request", request.method, request.params);

    if (request.method === "eth_chainId" && !session.get()) return "0x1";

    if (request.method === "wallet_revokePermissions") return await closeSession();

    if (request.method === "eth_requestAccounts") {
      log("eth_requestAccounts");

      if (openModal) {
        await openModal(oxProvider as OpenLVProvider);

        const waiting = createScope();

        await new Promise<void>((resolve) => {
          waiting.listen(oxEmitter, "connect", () => resolve());
          waiting.listen(oxEmitter, "disconnect", () => resolve());
        });
        await waiting.close();
      }
      else {
        await start();
      }

      return await getAccounts();
    }

    if (!session.get()) throw new Error(`Method ${request.method} not supported`);

    log("sending request to session", request);
    const result = await walletRpc.call(request);

    log("result from session", result);

    return result as ExtractReturnType<RpcSchema, typeof request.method>;
  };

  const oxProvider = OxProvider.from<
    ProviderConfig,
    OxProvider.from.Value<ProviderConfig>
    & ProviderBase
    & OxProvider.Emitter<EventMap>
  >({
    ...oxEmitter,
    storage: store,
    request,
    getAccounts,
    createSession: start,
    closeSession,
    status,
    error,
    session,
  });

  return oxProvider as OpenLVProvider;
};
