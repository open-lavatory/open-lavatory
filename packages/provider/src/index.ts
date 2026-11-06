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
import { hashPublicKey } from "@openlv/core/encryption";
import type { TransportProtocol } from "@openlv/transport";
import { webrtc, type WebRTCConfig } from "@openlv/transport/webrtc";
import { Provider as OxProvider } from "ox";
import type { EventMap } from "ox/Provider";
import type { ExtractReturnType } from "ox/RpcSchema";
import type { Address, Prettify } from "viem";

import {
  createWalletRpcClient,
  jsonRpcRequest,
  type RpcSchema,
} from "./rpc.js";
import {
  createProviderStorage,
  createSessionStorage,
  type PersistedSession,
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
  } & Pick<ProviderStorageParameters, "storage" | "sessionStorage">
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
  restoreSession: () => Promise<Session>;
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
  let sessionOperation = 0;
  let unsubscribeSessionStatus: (() => void) | undefined;
  const sessionStorage = createSessionStorage(parameters.sessionStorage);
  const walletRpc = createWalletRpcClient(async (payload) => {
    const current = session.get();

    if (!current) throw new Error("No session");

    return await current.send(payload);
  });

  const getAccounts = async () => {
    const current = session.get();

    if (!current || current.status.get() !== SessionStatus.CONNECTED) return [];

    return [...await walletRpc.call({ method: "eth_accounts" })];
  };

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
    const signaling = store.settings.get().signaling ?? config?.signaling;
    const p = signaling?.p;
    const s = p ? signaling?.s?.[p] : undefined;

    return p && s ? { p, s } : undefined;
  };
  const configuredWebRTCSettings = () => {
    const settings: NonNullable<PersistedSession["transport"]> = {};
    const servers = config?.transport?.s?.webrtc?.iceServers ?? [];
    const stun: string[] = [];
    const turn: NonNullable<PersistedSession["transport"]["turn"]> = [];

    for (const server of servers) {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      for (const url of urls) {
        if (url.startsWith("stun:")) stun.push(url);
        else {
          turn.push({
            urls: url,
            ...(server.username !== undefined && { username: server.username }),
            ...(server.credential !== undefined && { credential: String(server.credential) }),
          });
        }
      }
    }
    if (stun.length) settings.stun = stun;
    if (turn.length) settings.turn = turn;
    return settings;
  };


  const start = async (
    parameters?: SessionLinkParameters,
    resumeTransport?: PersistedSession["transport"],
  ) => {
    const operation = ++sessionOperation;

    setError(undefined);
    setStatus(ProviderStatus.CREATING);

    let createdSession: Session | undefined;

    try {
      const linkParameters = parameters ?? defaultLinkParameters();

      if (!linkParameters) {
        throw new Error("No link parameters provided and no signaling defaults configured");
      }

      // Stored user settings win over constructor config; both fall back to the
      // transport's built-in defaults, so an empty list must stay undefined
      // rather than become an empty iceServers array.
      const stored = resumeTransport ?? store.settings.get().transport?.s?.webrtc;
      const iceServers = [
        ...stored?.stun?.map(urls => ({ urls })) ?? [],
        ...stored?.turn ?? [],
      ];
      const transportOptions = iceServers.length > 0
        ? { iceServers }
        : config?.transport?.s?.webrtc;

      const next = await createSession(
        linkParameters,
        [webrtc(transportOptions)],
        onMessage,
        { info: config?.info },
      );
      createdSession = next;

      if (operation !== sessionOperation) {
        await next.close();

        return next;
      }

      setSession(next);
      setStatus(ProviderStatus.CONNECTING);

      let wasConnected = false;

      unsubscribeSessionStatus?.();

      unsubscribeSessionStatus = next.status.subscribe((state) => {
        if (state === SessionStatus.CONNECTED) {
          wasConnected = true;

          return;
        }

        // A failed initial handshake is handled by start()'s catch path. Once
        // established, however, a peer close must reset the provider too.
        if (
          !wasConnected
          || session.get() !== next
          || state !== SessionStatus.DISCONNECTED
        ) return;

        unsubscribeSessionStatus?.();
        unsubscribeSessionStatus = undefined;

        try {
          sessionStorage.clear();
        }
        catch (error_) {
          log("could not clear saved session", error_);
        }

        setSession(undefined);
        setError(undefined);
        setStatus(ProviderStatus.STANDBY);
        oxEmitter.emit(
          "disconnect",
          new OxProvider.ProviderRpcError(4900, next.error.get() ?? "Session closed by peer"),
        );
      });

      log("session created");
      await next.connect();
      log("session connected");
      const url = encodeConnectionURL(next.getHandshakeParameters());

      log("session url", url);

      const settled = await next.status.until(
        state => state === SessionStatus.CONNECTED
          || state === SessionStatus.DISCONNECTED,
      );

      if (settled !== SessionStatus.CONNECTED) {
        throw new Error(next.error.get() ?? "Session failed to connect");
      }
      const resumeParameters = next.getResumeParameters();
      const persistedTransport = stored && (stored.stun?.length || stored.turn?.length)
        ? stored
        : configuredWebRTCSettings();

      try {
        sessionStorage.set({
          revision: 1,
          sessionURI: url,
          connection: resumeParameters,
          transport: persistedTransport,
        });
      }
      catch (error_) {
        // Persistence is optional and must not turn a live connection into a
        // failed one when storage is unavailable or quota-limited.
        log("could not persist resumable session", error_);
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
      if (operation !== sessionOperation) throw error_;

      if (createdSession && session.get() === createdSession) {
        unsubscribeSessionStatus?.();
        unsubscribeSessionStatus = undefined;
        setSession(undefined);
      }

      if (createdSession) {
        try {
          await createdSession.close();
        }
        catch (closeError) {
          log("could not close failed session", closeError);
        }
      }

      // Surface the failure to UI consumers (e.g. the modal) instead of
      // leaving the provider stuck in "connecting".
      setError(
        createdSession?.error.get()
        ?? (error_ instanceof Error ? error_.message : "Connection failed"),
      );
      setStatus(ProviderStatus.ERROR);
      throw error_;
    }
  };
  const restoreSession = async () => {
    const operation = sessionOperation;
    const saved = sessionStorage.get();

    if (!saved) throw new Error("No valid saved session to restore");

    const localHash = await hashPublicKey(saved.connection.keyPair.publicKey);
    const peerHash = await hashPublicKey(saved.connection.peerKey);

    if (localHash !== saved.connection.h && peerHash !== saved.connection.h) {
      sessionStorage.clear();
      throw new Error("Saved peer key does not match the session URI");
    }

    if (operation !== sessionOperation) {
      throw new Error("Session restoration was cancelled");
    }

    return await start(saved.connection, saved.transport);
  };
  const closeSession = async () => {
    sessionOperation++;

    const current = session.get();
    unsubscribeSessionStatus?.();
    unsubscribeSessionStatus = undefined;
    try {
      sessionStorage.clear();
    }
    catch (error_) {
      log("could not clear saved session", error_);
    }
    setSession(undefined);
    setError(undefined);
    setStatus(ProviderStatus.STANDBY);
    if (current) {
      try {
        await current.close();
      }
      catch (closeError) {
        log("could not close session cleanly", closeError);
      }
    }

    if (current) {
      oxEmitter.emit(
        "disconnect",
        new OxProvider.ProviderRpcError(4900, "Session closed by provider"),
      );
    }
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
    restoreSession,
    closeSession,
    status,
    error,
    session,
  });

  if (store.settings.get().autoReconnect) {
    const saved = sessionStorage.get();
    if (saved) {
      const operation = sessionOperation;

      // Mark restoration synchronously so connector authorization checks can
      // distinguish it from a provider with no saved session.
      setStatus(ProviderStatus.CREATING);

      void (async () => {
        const localHash = await hashPublicKey(saved.connection.keyPair.publicKey);
        const peerHash = await hashPublicKey(saved.connection.peerKey);

        if (localHash !== saved.connection.h && peerHash !== saved.connection.h) {
          sessionStorage.clear();
          throw new Error("Saved peer key does not match the session URI");
        }

        if (operation !== sessionOperation) return;

        await restoreSession();
      })().catch((error_) => {
        log("automatic session restore failed", error_);
        if (operation === sessionOperation && status.get() === ProviderStatus.CREATING) {
          setStatus(ProviderStatus.STANDBY);
        }
      });
    }
  }

  return oxProvider as OpenLVProvider;
};
