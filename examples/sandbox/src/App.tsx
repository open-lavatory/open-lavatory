import { decodeConnectionURL, encodeConnectionURL } from "@openlv/core";
import { createProvider } from "@openlv/provider";
import type { Session } from "@openlv/session";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

const provider = createProvider({});

const readSessionState = (session: Session) => ({
  status: session.status.get(),
  signal: session.signalStatus.get(),
  peer: session.peerInfo.get(),
  error: session.error.get(),
});

const SessionConnect = () => {
  const [url, setUrl] = useState<string | undefined>();

  return (
    <div className="flex gap-2">
      <input
        type="text"
        placeholder="URL"
        className="rounded-md border px-4 py-2"
        value={url}
        onChange={e => setUrl(e.target.value)}
      />
      <button
        onClick={async () => {
          if (!url) return;

          const parameters = decodeConnectionURL(url);

          if (!parameters) return;

          await provider.createSession(parameters);
        }}
        className="btn"
      >
        Connect
      </button>
    </div>
  );
};

const App = () => {
  const [status, setStatus] = useState(provider.status.get());
  const [session, setSession] = useState(provider.session.get());
  const [sessionState, setSessionState] = useState<ReturnType<typeof readSessionState>>();

  useEffect(() => provider.status.subscribe((next) => {
    console.log("provider status", next);
    setStatus(next);
  }), []);

  useEffect(() => provider.session.subscribe(setSession), []);

  useEffect(() => {
    if (!session) {
      setSessionState(undefined);

      return;
    }

    const update = () => {
      const next = readSessionState(session);

      console.log("session state", next);
      setSessionState(next);
    };

    const unsubscribes = [
      session.status.subscribe(update),
      session.signalStatus.subscribe(update),
      session.peerInfo.subscribe(update),
      session.error.subscribe(update),
    ];

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [session]);

  const canStartSession = status === "standby";
  const connectionParameters = session?.getHandshakeParameters();
  const connectionUrl = connectionParameters
    ? encodeConnectionURL(connectionParameters)
    : undefined;

  return (
    <div className="min-h-screen w-full space-y-4 bg-gray-100 p-4">
      <div className="flex w-full gap-4">
        <div className="w-full space-y-4">
          <div className="space-y-4 border p-4">
            <div className="w-fit">
              Status:
              {status}
            </div>
            <div className="w-fit">
              Session Status:
              {JSON.stringify(sessionState)}
            </div>
          </div>
          <div className="space-y-4 border p-4">
            <div>
              {connectionUrl && <QRCodeSVG value={connectionUrl} />}
              {" "}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => provider.createSession()}
                className="btn"
                disabled={!canStartSession}
              >
                Create Session
              </button>
              {session && (
                <button onClick={() => provider.closeSession()} className="btn">
                  Close Session
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="w-full space-y-4 border p-4">
          <div>
            <SessionConnect />
          </div>
        </div>
      </div>
    </div>
  );
};

export { App };
