"use client";

import type { Observable } from "@openlv/core";
import {
  type PeerInfo,
  type Session,
  SessionStatus,
} from "@openlv/session";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useConnection } from "wagmi";

export type TryItRole = "dapp" | "wallet";

export type ConnectionPhase
  = | "idle"
    | "establishing"
    | "linked"
    | "connected"
    | "error";

export type TryItPeerInfo = {
  role: TryItRole;
  connectionUrl?: string;
  sessionId?: string;
  protocol?: string;
  signalingServer?: string;
  /** The remote peer's self-description from the capabilities handshake. */
  remote?: PeerInfo;
};

export type TryItLogEntry = {
  logId: string;
  at: number;
  role: TryItRole;
  direction: "in" | "out";
  kind: "rpc" | "session" | "info";
  method?: string;
  summary: string;
  payload?: unknown;
};

export type TryItSessionActions = {
  appendEntry: (entry: Omit<TryItLogEntry, "logId" | "at">) => void;
  setPhase: (phase: ConnectionPhase) => void;
  setPeer: Dispatch<SetStateAction<TryItPeerInfo | null>>;
  clearLog: () => void;
  resetSession: () => void;
};

type TryItSessionState = {
  phase: ConnectionPhase;
  peer: TryItPeerInfo | null;
  entries: TryItLogEntry[];
};

type TryItSessionContextValue = TryItSessionState & TryItSessionActions;

const ActionsContext = createContext<TryItSessionActions | null>(null);
const StateContext = createContext<TryItSessionState | null>(null);

const MAX_LOG_ENTRIES = 200;

const nextLogId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36)
    .slice(2, 8)}`;

const sessionToPhase = (status: SessionStatus): ConnectionPhase => {
  if (status === SessionStatus.CONNECTED) return "connected";

  if (status === SessionStatus.DISCONNECTED) return "error";

  if (status === SessionStatus.LINKING) return "linked";

  return "establishing";
};

const formatPayload = (payload: unknown) => {
  try {
    return JSON.stringify(payload, null, 2);
  }
  catch {
    return String(payload);
  }
};

export const TryItSessionProvider = ({ children }: { children: ReactNode; }) => {
  const [phase, setPhase] = useState<ConnectionPhase>("idle");
  const [peer, setPeer] = useState<TryItPeerInfo | null>(null);
  const [entries, setEntries] = useState<TryItLogEntry[]>([]);

  const appendEntry = useCallback(
    (entry: Omit<TryItLogEntry, "logId" | "at">) => {
      setEntries(previous => [
        { ...entry, logId: nextLogId(), at: Date.now() },
        ...previous,
      ].slice(0, MAX_LOG_ENTRIES));
    },
    [],
  );

  const clearLog = useCallback(() => setEntries([]), []);

  const resetSession = useCallback(() => {
    setPhase("idle");
    setPeer(null);
    setEntries([]);
  }, []);

  const actions = useMemo(
    () => ({ appendEntry, setPhase, setPeer, clearLog, resetSession }),
    [appendEntry, clearLog, resetSession],
  );

  const state = useMemo(
    () => ({ phase, peer, entries }),
    [phase, peer, entries],
  );

  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ActionsContext.Provider>
  );
};

export const useTryItSessionActions = (): TryItSessionActions => {
  const context = useContext(ActionsContext);

  if (!context) {
    throw new Error(
      "useTryItSessionActions must be used within TryItSessionProvider",
    );
  }

  return context;
};

export const useTryItSession = (): TryItSessionContextValue => {
  const actions = useTryItSessionActions();
  const state = useContext(StateContext);

  if (!state) {
    throw new Error("useTryItSession must be used within TryItSessionProvider");
  }

  return { ...state, ...actions };
};

const logRpc = (
  actions: TryItSessionActions,
  role: TryItRole,
  direction: "in" | "out",
  payload: unknown,
  method?: string,
  error?: boolean,
) => {
  const arrow = direction === "in" ? "←" : "→";
  const suffix = error ? " (error)" : "";

  actions.appendEntry({
    role,
    direction,
    kind: "rpc",
    method,
    summary: method
      ? `${arrow} ${method}${suffix}`
      : `${arrow} ${error ? "error" : (direction === "in" ? "response" : "request")}`,
    payload,
  });
};

export const attachTryItSession = (
  session: Session,
  role: TryItRole,
  actions: TryItSessionActions,
  options?: { logRequests?: boolean; },
) => {
  let lastSessionLogKey = "";
  let isPeerInfoLogged = false;

  // Status and signaling status move independently, so the log is keyed on
  // the pair to keep a change in one from repeating the other.
  const logSession = () => {
    const status = session.status.get();
    const signaling = session.signalStatus.get();
    const logKey = `${status}:${signaling}`;

    if (logKey === lastSessionLogKey) return;

    lastSessionLogKey = logKey;

    actions.appendEntry({
      role,
      direction: "in",
      kind: "session",
      summary: `Session ${status} - ${signaling}`,
      payload: { status, signaling, error: session.error.get() },
    });
  };

  const onRequest = (payload: object | string) => {
    const request = payload as { method?: string; };

    logRpc(actions, role, "in", payload, request.method);
  };

  // Every observable replays its current value on subscribe, so this reports
  // the session as it stands before it reports any change to it.
  const unsubscribes = [
    session.status.subscribe((status) => {
      actions.setPhase(sessionToPhase(status));
      logSession();
    }),
    session.signalStatus.subscribe(logSession),
    session.peerInfo.subscribe((remote) => {
      actions.setPeer(previous =>
        (previous && previous.remote !== remote ? { ...previous, remote } : previous));

      if (!remote || isPeerInfoLogged) return;

      isPeerInfoLogged = true;
      actions.appendEntry({
        role,
        direction: "in",
        kind: "info",
        summary: `Peer identified - ${remote.name}`,
        payload: { identity: remote.identity, name: remote.name },
      });
    }),
  ];

  if (options?.logRequests !== false) {
    session.emitter.on("request", onRequest);
  }

  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();

    if (options?.logRequests !== false) {
      session.emitter.off("request", onRequest);
    }
  };
};

export const shimWalletOnMessage = (
  role: TryItRole,
  handler: (message: object) => Promise<unknown>,
  actions: TryItSessionActions,
) => async (message: object) => {
  const request = message as { method?: string; };
  const identifier
    = "id" in message && typeof message["id"] === "number"
      ? message["id"]
      : null;

  logRpc(actions, role, "in", message, request.method);

  try {
    const result = await handler(message);
    const response = {
      jsonrpc: "2.0",
      ["id"]: identifier,
      result,
    };

    logRpc(actions, role, "out", response, request.method);

    return response;
  }
  catch (error) {
    logRpc(
      actions,
      role,
      "out",
      error instanceof Error ? { message: error.message } : error,
      request.method,
      true,
    );

    return {
      jsonrpc: "2.0",
      ["id"]: identifier,
      error: {
        code: typeof error === "object"
          && error !== null
          && "code" in error
          && typeof error.code === "number"
          ? error.code
          : -32_603,
        message: error instanceof Error ? error.message : "Internal error",
      },
    };
  }
};

export const peerInfoFromConnectionUrl = (
  role: TryItRole,
  connectionUrl: string,
): TryItPeerInfo => {
  try {
    const parsed = new URL(connectionUrl);

    return {
      role,
      connectionUrl,
      sessionId: parsed.username || undefined,
      protocol: parsed.searchParams.get("p") ?? undefined,
      signalingServer: parsed.searchParams.get("s") ?? undefined,
    };
  }
  catch {
    return { role, connectionUrl };
  }
};

/** The part of `OpenLVProvider` this panel uses, without depending on it. */
export type DappProviderShim = {
  session: Observable<Session | undefined>;
  request: (arguments_: JsonRpcCall) => Promise<unknown>;
};

export type JsonRpcCall = { method: string; params?: unknown; };

const phaseLabel: Record<ConnectionPhase, string> = {
  idle: "Not connected",
  establishing: "Connecting...",
  linked: "Opening channel",
  connected: "Connected",
  error: "Failed",
};

const phaseDotClass: Record<ConnectionPhase, string> = {
  idle: "bg-[var(--vocs-color_textSecondary)]",
  establishing: "bg-[var(--vocs-color_textSecondary)] animate-pulse",
  linked: "bg-[var(--vocs-color_textSecondary)] animate-pulse",
  connected: "bg-[var(--vocs-color_text)]",
  error: "bg-[var(--vocs-color_textSecondary)]",
};

const peerMetaLine = (peer: TryItPeerInfo) => {
  const parts: string[] = [];

  if (peer.sessionId) parts.push(peer.sessionId);

  if (peer.protocol) parts.push(peer.protocol);

  return parts.join(" - ");
};

// The wire only bounds the icon's size -- vetting what goes into an
// <img src> is this renderer's job.
const renderableRemoteIcon = (remote?: PeerInfo) => {
  const icon = remote?.icon;

  return icon && (icon.startsWith("data:image/") || icon.startsWith("https://"))
    ? icon
    : undefined;
};

const ConnectionStatusBar = () => {
  const { phase, peer } = useTryItSession();
  const [copied, setCopied] = useState(false);

  if (phase === "idle" && !peer) return null;

  const connectionUrl
    = peer?.role === "dapp" ? peer.connectionUrl : undefined;

  const copyUrl = async () => {
    if (!connectionUrl) return;

    await navigator.clipboard.writeText(connectionUrl);
    setCopied(true);
    globalThis.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex gap-3 rounded-lg border vocs:border-primary bg-[var(--vocs-color_codeBlockBackground)] px-3 py-2.5">
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${phaseDotClass[phase]}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-medium">{phaseLabel[phase]}</span>
          {peer && (
            <span className="text-xs text-[var(--vocs-color_textSecondary)]">
              {peer.role === "dapp" ? "dApp" : "Wallet"}
            </span>
          )}
          {peer?.remote && (
            <span className="inline-flex items-center gap-1.5 text-xs">
              {renderableRemoteIcon(peer.remote) && (
                <img
                  src={renderableRemoteIcon(peer.remote)}
                  alt=""
                  className="h-4 w-4 rounded"
                />
              )}
              <span>{peer.remote.name}</span>
            </span>
          )}
        </div>
        {peer && peerMetaLine(peer) && (
          <p className="mt-0.5 truncate font-mono text-xs text-[var(--vocs-color_textSecondary)]">
            {peerMetaLine(peer)}
          </p>
        )}
        {connectionUrl && (
          <div className="mt-1.5 flex items-center gap-2">
            <p
              className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--vocs-color_textSecondary)]"
              title={connectionUrl}
            >
              {connectionUrl}
            </p>
            <button
              type="button"
              onClick={() => copyUrl()}
              className="shrink-0 rounded-md border vocs:border-primary px-2 py-0.5 text-xs hover:bg-[var(--vocs-color_codeHighlightBackground)]"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const LogRow = ({
  entry,
  expanded,
  onToggle,
}: {
  entry: TryItLogEntry;
  expanded: boolean;
  onToggle: () => void;
}) => {
  const hasPayload = entry.payload !== undefined;
  const time = new Date(entry.at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="text-xs">
      <button
        type="button"
        disabled={!hasPayload}
        onClick={onToggle}
        className={[
          "flex w-full items-baseline gap-2 px-3 py-2 text-left",
          hasPayload && "hover:bg-[var(--vocs-color_codeHighlightBackground)]",
        ].filter(Boolean).join(" ")}
      >
        <time className="shrink-0 tabular-nums text-[var(--vocs-color_textSecondary)]">
          {time}
        </time>
        <span className="shrink-0 uppercase text-[var(--vocs-color_textSecondary)]">
          {entry.role}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono">{entry.summary}</span>
        {hasPayload && (
          <span className="text-[var(--vocs-color_textSecondary)]">
            {expanded ? "−" : "+"}
          </span>
        )}
      </button>
      {expanded && hasPayload && (
        <pre className="border-t vocs:border-primary bg-[var(--vocs-color_codeTitleBackground)] px-3 py-2 font-mono text-[11px] whitespace-pre-wrap break-all text-[var(--vocs-color_textSecondary)]">
          {formatPayload(entry.payload)}
        </pre>
      )}
    </div>
  );
};

const MessageLogPanel = () => {
  const listId = useId();
  const { entries, clearLog } = useTryItSession();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (entries.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border vocs:border-primary">
      <div className="flex items-center gap-2 bg-[var(--vocs-color_codeBlockBackground)] px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
        >
          <span
            className="text-[var(--vocs-color_textSecondary)]"
            style={{ transform: open ? "rotate(90deg)" : undefined }}
            aria-hidden
          >
            ›
          </span>
          <span className="font-medium">Wire log</span>
          <span className="rounded-full border vocs:border-primary px-2 py-0.5 font-mono text-xs tabular-nums text-[var(--vocs-color_textSecondary)]">
            {entries.length}
          </span>
        </button>
        {open && (
          <button
            type="button"
            onClick={clearLog}
            className="text-xs text-[var(--vocs-color_textSecondary)] hover:text-[var(--vocs-color_text)]"
          >
            Clear
          </button>
        )}
      </div>
      {open && (
        <ul
          id={listId}
          className="max-h-72 overflow-y-auto border-t vocs:border-primary"
        >
          {entries.map((entry, index) => (
            <li
              key={entry.logId}
              className={
                index < entries.length - 1 ? "border-b vocs:border-primary" : undefined
              }
            >
              <LogRow
                entry={entry}
                expanded={expandedId === entry.logId}
                onToggle={() =>
                  setExpandedId(c =>
                    (c === entry.logId ? null : entry.logId),
                  )}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const TryItSessionPanel = () => {
  const { phase, peer, entries } = useTryItSession();

  if (phase === "idle" && !peer && entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <ConnectionStatusBar />
      <MessageLogPanel />
    </div>
  );
};

export const OpenLvDappMonitor = ({
  onSessionBound,
}: {
  onSessionBound?: (session: Session) => void;
}) => {
  const { connector, isConnected } = useConnection();
  const actions = useTryItSessionActions();
  const onBoundReference = useRef(onSessionBound);

  onBoundReference.current = onSessionBound;
  const detachReference = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (!isConnected || connector?.type !== "openLv") {
      detachReference.current?.();
      detachReference.current = undefined;

      return;
    }

    let isCancelled = false;
    let restoreRequest: DappProviderShim["request"] | undefined;

    const wire = async () => {
      const provider = (await connector.getProvider()) as DappProviderShim;

      if (isCancelled) return;

      // Replays the current session, so this covers a session that already
      // exists as well as every one the provider creates after it.
      const unbindSession = provider.session.subscribe((session) => {
        detachReference.current?.();
        detachReference.current = undefined;

        if (!session) return;

        detachReference.current = attachTryItSession(session, "dapp", actions);
        onBoundReference.current?.(session);
      });

      restoreRequest = provider.request.bind(provider);
      provider.request = async (arguments_: JsonRpcCall) => {
        logRpc(actions, "dapp", "out", arguments_, arguments_.method);

        try {
          const result = await restoreRequest!(arguments_);

          logRpc(actions, "dapp", "in", result, arguments_.method);

          return result;
        }
        catch (error) {
          logRpc(
            actions,
            "dapp",
            "in",
            error instanceof Error ? { message: error.message } : error,
            arguments_.method,
            true,
          );
          throw error;
        }
      };

      return () => {
        unbindSession();

        if (restoreRequest) provider.request = restoreRequest;
      };
    };

    let unwire: (() => void) | undefined;

    wire().then((function_) => { unwire = function_; });

    return () => {
      isCancelled = true;
      unwire?.();
      detachReference.current?.();
      detachReference.current = undefined;
    };
  }, [isConnected, connector, actions]);

  return null;
};
