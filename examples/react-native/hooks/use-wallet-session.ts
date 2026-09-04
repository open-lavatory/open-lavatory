import { connectSession, type Session, SessionStatus } from "@openlv/react-native";
import { webrtc } from "@openlv/transport/webrtc";
import * as React from "react";

const DUMMY_ADDRESS
    = "0x8F8f07b6D61806Ec38febd15B07528dCF2903Ae7".toLowerCase();
const DUMMY_SIGNATURE = `0x${"11".repeat(65)}` as const;

export const useWalletSession = () => {
  const [connectionUrl, setConnectionUrl] = React.useState<string>("");
  const [status, setStatus] = React.useState<string>("idle");
  const [logLines, setLogLines] = React.useState<string[]>([]);
  const [session, setSession] = React.useState<Session | null>(null);

  const appendLog = React.useCallback((line: string) => {
    setLogLines(prev => [line, ...prev].slice(0, 50));
  }, []);

  React.useEffect(() => {
    if (!session) return;

    return session.status.subscribe((state) => {
      appendLog(`session state => ${state}`);
      setStatus(`session: ${state}`);
    });
  }, [appendLog, session]);

  const startSession = React.useCallback(async () => {
    try {
      if (!connectionUrl.trim()) {
        throw new Error("Missing connection URL");
      }

      setStatus("connecting");
      appendLog("Connecting…");

      const nextSession = await connectSession(
        connectionUrl.trim(),
        async (message) => {
          appendLog(`RPC <= ${JSON.stringify(message)}`);
          const req = message as {
            method?: string;
            params?: unknown;
          };
          const identifier
            = typeof message === "object"
              && message !== null
              && "id" in message
              && typeof message["id"] === "number"
              ? message["id"]
              : null;
          let result: unknown;

          if (
            req.method === "eth_accounts"
            || req.method === "eth_requestAccounts"
          ) {
            result = [DUMMY_ADDRESS];
          }
          else if (req.method === "personal_sign") {
            result = DUMMY_SIGNATURE;
          }
          else {
            result = "Unsupported method";
          }

          return { jsonrpc: "2.0", ["id"]: identifier, result };
        },
        [webrtc()],
      );

      setSession(nextSession);

      await nextSession.connect();

      appendLog("Connected; waiting for link…");

      const settled = await nextSession.status.until(
        state => state === SessionStatus.CONNECTED
          || state === SessionStatus.DISCONNECTED,
      );

      if (settled !== SessionStatus.CONNECTED) {
        throw new Error(nextSession.error.get() ?? "Session failed to link");
      }

      appendLog("Linked! (transport should start)");
    }
    catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      appendLog(`ERROR: ${msg}`);
      setStatus("error");
    }
  }, [appendLog, connectionUrl]);

  const closeSession = React.useCallback(async () => {
    try {
      if (!session) return;

      appendLog("Closing session…");
      await session.close();
      setSession(null);
      setStatus("idle");
      appendLog("Closed.");
    }
    catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      appendLog(`ERROR: ${msg}`);
    }
  }, [appendLog, session]);

  return {
    connectionUrl,
    setConnectionUrl,
    status,
    logLines,
    session,
    startSession,
    closeSession,
  };
};
