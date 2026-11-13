"use client";

import { createScope, encodeConnectionURL, type Observable } from "@openlv/core";
import { type Session, SessionStatus } from "@openlv/session";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { EIP1193Events } from "viem";
import * as z from "zod/mini";

type TryItRole = "dapp" | "wallet";
type LogEntry = {
  logId: string;
  at: number;
  role: TryItRole;
  summary: string;
  payload?: unknown;
};
export type AppendEntry = (entry: Omit<LogEntry, "logId" | "at">) => void;

export const useSessionValue = function<Value>(observable: Observable<Value> | undefined, fallback: Value) {
  return useSyncExternalStore(
    useCallback(listener => observable?.subscribe(listener) ?? (() => {}), [observable]),
    () => (observable ? observable.get() : fallback),
    () => fallback,
  );
};

export const useWireLog = () => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const append = useCallback<AppendEntry>((entry) => {
    setEntries(previous => [
      { ...entry, logId: crypto.randomUUID(), at: Date.now() },
      ...previous,
    ].slice(0, 200));
  }, []);
  const clear = useCallback(() => setEntries([]), []);

  return { entries, append, clear };
};

const requestMethod = (value: unknown) =>
  (typeof value === "object" && value !== null && "method" in value && typeof value.method === "string"
    ? value.method
    : undefined);

export const logRpc = (
  append: AppendEntry,
  role: TryItRole,
  direction: "in" | "out",
  payload: unknown,
  method?: string,
  isError = false,
) => append({
  role,
  summary: `${direction === "in" ? "←" : "→"} ${method ?? "response"}${isError ? " (error)" : ""}`,
  payload,
});

export const observeSession = (session: Session, role: TryItRole, append: AppendEntry) => {
  const scope = createScope();
  let lastStatus = "";
  const logStatus = () => {
    const status = session.status.get();
    const signaling = session.signalStatus.get();
    const summary = `Session ${status} - ${signaling}`;

    if (summary === lastStatus) return;

    lastStatus = summary;
    append({ role, summary, payload: { status, signaling, error: session.error.get() } });
  };

  scope.add(session.status.subscribe(logStatus));
  scope.add(session.signalStatus.subscribe(logStatus));
  scope.add(session.peerInfo.subscribe((remote) => {
    if (remote) append({ role, summary: `Peer identified - ${remote.name}`, payload: remote });
  }));

  if (role === "dapp") {
    scope.listen(session.emitter, "request", payload => logRpc(append, role, "in", payload, requestMethod(payload)));
  }

  return scope.close;
};

export const logSessionSend = (send: Session["send"], role: TryItRole, append: AppendEntry): Session["send"] =>
  async (message, ackTimeout, responseTimeout) => {
    const method = requestMethod(message);

    logRpc(append, role, "out", message, method);

    try {
      const response = await send(message, ackTimeout, responseTimeout);

      logRpc(append, role, "in", response, method);

      return response;
    }
    catch (error) {
      logRpc(append, role, "in", error instanceof Error ? { message: error.message } : error, method, true);
      throw error;
    }
  };

type WalletProvider = EIP1193Events & {
  request: (message: unknown) => Promise<unknown>;
};

const walletProvider = z.object({
  request: z.function(),
  on: z.function(),
  removeListener: z.function(),
});

export const isWalletProvider = (value: unknown): value is WalletProvider =>
  walletProvider.safeParse(value).success;

export const providerError = z.object({
  code: z.number(),
  message: z.string(),
  data: z.optional(z.unknown()),
});

export const forwardWalletRequest = (
  request: WalletProvider["request"],
  append: AppendEntry,
) => async (message: unknown) => {
  const method = requestMethod(message);
  const identifier = typeof message === "object" && message !== null && "id" in message
    && (typeof message["id"] === "number" || typeof message["id"] === "string")
    ? message["id"]
    : null;

  logRpc(append, "wallet", "in", message, method);

  try {
    const result = await request(message);
    const response = { jsonrpc: "2.0", ["id"]: identifier, result };

    logRpc(append, "wallet", "out", response, method);

    return response;
  }
  catch (error) {
    logRpc(append, "wallet", "out", error instanceof Error ? { message: error.message } : error, method, true);

    const failure = providerError.safeParse(error).data;

    if (!failure) throw error;

    return { jsonrpc: "2.0", ["id"]: identifier, error: failure };
  }
};

const formatPayload = (payload: unknown) => {
  try {
    return JSON.stringify(payload, null, 2);
  }
  catch {
    return String(payload);
  }
};

const statusLabel: Record<SessionStatus, string> = {
  created: "Connecting...",
  signaling: "Connecting...",
  ready: "Connecting...",
  linking: "Opening channel",
  connected: "Connected",
  disconnected: "Failed",
};

export const SessionPanel = ({ session, role, entries, onClear }: {
  session: Session | undefined;
  role: TryItRole;
  entries: LogEntry[];
  onClear: () => void;
}) => {
  const status = useSessionValue(session?.status, SessionStatus.CREATED);
  const remote = useSessionValue(session?.peerInfo, undefined);
  const [isCopied, setIsCopied] = useState(false);
  const [isLogCopied, setIsLogCopied] = useState(false);
  const parameters = session?.getHandshakeParameters();
  const url = parameters && role === "dapp" ? encodeConnectionURL(parameters) : undefined;
  const icon = remote?.icon;
  const isRenderableIcon = icon?.startsWith("data:image/") || icon?.startsWith("https://");
  useEffect(() => {
    if (!isCopied) return;

    const timer = setTimeout(() => setIsCopied(false), 2000);

    return () => clearTimeout(timer);
  }, [isCopied]);

  return (
    <div className="flex flex-col gap-2">
      {session && (
        <div className="rounded-lg border vocs:border-primary bg-[var(--vocs-color_codeBlockBackground)] px-3 py-2.5 pl-10">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 text-sm">
              <span className="font-medium">{statusLabel[status]}</span>
              <span className="text-xs text-[var(--vocs-color_textSecondary)]">{role === "dapp" ? "dApp" : "Wallet"}</span>
              {remote && (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  {isRenderableIcon && <img src={icon} alt="" className="h-4 w-4 rounded" />}
                  {remote.name}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-[var(--vocs-color_textSecondary)]">
              {parameters?.sessionId}
              {" "}
              -
              {parameters?.p}
            </p>
            {url && (
              <div className="mt-1.5 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--vocs-color_textSecondary)]" title={url}>{url}</code>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url);
                    setIsCopied(true);
                  }}
                  className="rounded border vocs:border-primary px-2 py-0.5 text-xs"
                >
                  {isCopied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {entries.length > 0 && (
        <details className="group overflow-hidden rounded-lg border vocs:border-primary text-xs">
          <summary className="flex w-full cursor-pointer items-center gap-2 bg-[var(--vocs-color_codeBlockBackground)] px-3 py-2 text-sm">
            <span aria-hidden className="group-open:rotate-90">›</span>
            <span className="font-medium">Wire log</span>
            <span className="rounded-full border vocs:border-primary px-2 py-0.5 font-mono text-xs tabular-nums text-[var(--vocs-color_textSecondary)]">{entries.length}</span>
            <button
              type="button"
              onClick={async (event) => {
                event.preventDefault();
                const text = entries.map((entry) => {
                  const timestamp = new Date(entry.at).toLocaleTimeString();
                  const payload = entry.payload === undefined ? "" : `\n${formatPayload(entry.payload)}`;

                  return `[${timestamp}] ${entry.role} ${entry.summary}${payload}`;
                }).join("\n\n");

                await navigator.clipboard.writeText(text);
                setIsLogCopied(true);
                setTimeout(() => setIsLogCopied(false), 2000);
              }}
              className="ml-auto hidden shrink-0 text-xs text-[var(--vocs-color_textSecondary)] hover:text-[var(--vocs-color_text)] group-open:inline-flex"
            >
              {isLogCopied ? "Copied" : "Copy log"}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                onClear();
              }}
              className="hidden shrink-0 text-xs text-[var(--vocs-color_textSecondary)] hover:text-[var(--vocs-color_text)] group-open:inline-flex"
            >
              Clear
            </button>
          </summary>
          <div className="max-h-72 overflow-y-auto">
            {entries.map(entry => (
              <details key={entry.logId} className="border-t vocs:border-primary">
                <summary className="cursor-pointer px-3 py-2 font-mono">
                  <time className="mr-2 text-[var(--vocs-color_textSecondary)]">{new Date(entry.at).toLocaleTimeString()}</time>
                  {entry.role}
                  {" "}
                  {entry.summary}
                </summary>
                {entry.payload !== undefined && (
                  <pre className="overflow-auto px-3 py-2 whitespace-pre-wrap break-all">{formatPayload(entry.payload)}</pre>
                )}
              </details>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};
