
import {
  encodeConnectionURL,
  type Observable,
  observable,
  type SessionLinkParameters,
} from "@openlv/core";
import {
  createSession,
  type Session,
  type SessionPayload,
  SessionStatus,
} from "@openlv/session";
import type { PeerInfo } from "@openlv/signaling";
import type { TransportProtocol } from "@openlv/transport";
import { webrtc, type WebRTCConfig } from "@openlv/transport/webrtc";
import { Provider as OxProvider } from "ox";
import type { EventMap } from "ox/Provider";
import type { ExtractReturnType } from "ox/RpcSchema";
import { match } from "ts-pattern";
import type { Address, Prettify } from "viem";

import {
  createJsonRpcRequestEncoder,
  createMethodNotFoundResponse,
  decodeJsonRpcResponse,
  type RpcSchema,
} from "./rpc.js";
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

export type OpenLVProviderParameters = Prettify<
  {
    config?: OpenLVProviderConfig;
    openModal?: (provider: OpenLVProvider) => Promise<void>;
  } & Pick<ProviderStorageParameters, "storage">
>;

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
  const oxEmitter = OxProvider.createEmitter<EventMap>();

  const [session, setSession] = observable<Session | undefined>(undefined);
  const [status, setStatus] = observable<ProviderStatus>(ProviderStatus.STANDBY);
  const [error, setError] = observable<string | undefined>(undefined);

  let accounts: Address[] = [];
  const encodeJsonRpcRequest = createJsonRpcRequestEncoder();
  const storage = createProviderStorage({ storage: parameters.storage });
  const { openModal, config } = parameters;

  status.subscribe(current => log("status", current));

  /**
   * Called when the remote peer (wallet) sends a request to the dApp.
   *
   * In the normal EIP-1193 flow the dApp is always the requester, so this
   * path is unusual. We emit a `request` event on the session (once the
   * session is available) so the modal or other UI consumers can react.
   * For any method we have no built-in handler for, we return a JSON-RPC
   * "Method not found" error so the wallet receives a proper response rather
   * than a no-op stub.
   */
  const onMessage = async (message: SessionPayload): Promise<SessionPayload> => {
    log("onMessage received from remote peer", message);

    // Emit on the session emitter so observers (e.g. modal) can react.
    session.get()?.emitter.emit("request", message);

    return createMethodNotFoundResponse(message);
  };

  const sendJsonRpcRequest = async (request: object): Promise<unknown> => {
    const current = session.get();

    if (!current) throw new Error("No session");

    const { payload, requestIdentifier } = encodeJsonRpcRequest(request);

    return decodeJsonRpcResponse(
      await current.send(payload),
      requestIdentifier,
    );
  };

  const getAccounts = async (): Promise<Address[]> =>
    await sendJsonRpcRequest({ method: "eth_accounts", params: [] }) as Address[];

  /** Derive default link parameters from stored signaling settings. */
  const defaultLinkParameters = (): SessionLinkParameters | undefined => {
    const signaling = storage.getSettings().signaling ?? config?.signaling;
    const p = signaling?.p;
    const s = p ? signaling?.s?.[p] : undefined;

    return p && s ? { p, s } : undefined;
  };

  const start = async (parameters?: SessionLinkParameters) => {
    setError(undefined);
    setStatus(ProviderStatus.CREATING);
    const linkParameters = parameters ?? defaultLinkParameters();

    if (!linkParameters) {
      throw new Error("No link parameters provided and no signaling defaults configured");
    }

    // Stored user settings win over constructor config; both fall back to the
    // transport's built-in defaults, so an empty list must stay undefined
    // rather than become an empty iceServers array.
    const stored = storage.getSettings().transport?.s?.webrtc;
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

      accounts = await getAccounts();

      const chainIdHex = await sendJsonRpcRequest({ method: "eth_chainId", params: [] }) as string;

      setStatus(ProviderStatus.CONNECTED);
      oxEmitter.emit("connect", { chainId: chainIdHex });
      oxEmitter.emit("accountsChanged", accounts);

      return next;
    }
    catch (error_) {
      // Surface the failure to UI consumers (e.g. the modal) instead of
      // leaving the provider stuck in "connecting".
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

    return (
      match(request)
        .with({ method: "eth_chainId" }, async () => {
          log("eth_chainId");

          const current = session.get();

          if (current) {
            log("sending eth_chainId to session");
            const result = await sendJsonRpcRequest(request);

            log("eth_chainId result from session", result);

            return result;
          }

          return "0x1";
        })
        .with({ method: "wallet_requestPermissions" }, () => {
          throw new Error("Not implemented");
        })
        .with({ method: "wallet_revokePermissions" }, async () => {
          await closeSession();

          return;
        })
        .with({ method: "eth_requestAccounts" }, async () => {
          log("eth_requestAccounts");

          let provider: OpenLVProvider | undefined;

          if (oxProvider) {
            provider = oxProvider as OpenLVProvider;
          }

          if (openModal && provider) {
            await openModal(provider);

            await new Promise<void>((resolve) => {
              const onConnect = () => {
                cleanup();
                resolve();
              };
              const onDisconnect = () => {
                cleanup();
                resolve();
              };
              const cleanup = () => {
                provider?.off("connect", onConnect);
                provider?.off("disconnect", onDisconnect);
              };

              provider?.on("connect", onConnect);
              provider?.on("disconnect", onDisconnect);
            });

            return await getAccounts();
          }

          await start();

          return await getAccounts();
        })
        .with({ method: "eth_accounts" }, async () => {
          log("eth_accounts");

          return await getAccounts();
        })
        .otherwise(async (v) => {
          const current = session.get();

          if (current) {
            log("sending request to session", request);
            const result = await sendJsonRpcRequest(request);

            log("result from session", result);

            return result;
          }

          throw new Error(`Method ${v.method} not supported`);
        }) as unknown as ExtractReturnType<RpcSchema, typeof request.method>
    );
  };
  const oxProvider = OxProvider.from<
    ProviderConfig,
    OxProvider.from.Value<ProviderConfig>
    & ProviderBase
    & OxProvider.Emitter<EventMap>
  >({
    ...oxEmitter,
    storage,
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
