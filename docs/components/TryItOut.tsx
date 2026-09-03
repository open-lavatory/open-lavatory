"use client";

import { openlv } from "@openlv/connector";
import { encodeConnectionURL } from "@openlv/core";
import { connectSession, type Session, SessionStatus } from "@openlv/session";
import { webrtc } from "@openlv/transport/webrtc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import classNames from "classnames";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { match } from "ts-pattern";
import { type Address, type EIP1193Provider } from "viem";
import {
  type Connector,
  createConfig,
  http,
  useChainId,
  useClient,
  useConnect,
  useConnection,
  useConnections,
  useConnectors,
  useDisconnect,
  useSignMessage,
  useVerifyMessage,
  WagmiProvider,
} from "wagmi";
import { holesky, mainnet, sepolia } from "wagmi/chains";

import {
  attachTryItSession,
  OpenLvDappMonitor,
  peerInfoFromConnectionUrl,
  shimWalletOnMessage,
  TryItSessionPanel,
  TryItSessionProvider,
  useTryItSession,
} from "./TryItOutSession.js";

const queryClient = new QueryClient();

const config = createConfig({
  chains: [mainnet, sepolia, holesky],
  connectors: [
    openlv({
      config: {
        info: {
          identity: "sh.openlv.docs",
          name: "OpenLV Docs",
          icon: "https://openlv.sh/openlavatory.png",
        },
      },
    }),
  ],
  transports: {
    /* eslint-disable no-restricted-syntax */
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [holesky.id]: http(),
    /* eslint-enable no-restricted-syntax */
  },
});

const trimAddress = (address: Address | undefined | null) => {
  if (typeof address !== "string") return address;

  return `${address.slice(0, 5)}...${address.slice(-4)}`;
};

const buttonClass
  = "!bg-[var(--vocs-color_codeTitleBackground)] hover:!bg-[var(--vocs-color_codeBlockBackground)] rounded-lg vocs:border-primary px-4 py-1 disabled:opacity-50";

const PersonalSign = () => {
  const signMessage = useSignMessage();
  const { address, connector } = useConnection();
  const { data: signature, error, isPending, reset } = signMessage;
  const chainId = useChainId();
  const { phase } = useTryItSession();
  const isReady = connector?.type !== "openLv" || phase === "connected";

  const { data: valid, isLoading: verifying } = useVerifyMessage({
    address,
    message: "Hello, world!",
    signature,
    chainId,
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-(--vocs-color_textSecondary)">
          <code className="text-xs">personal_sign</code>
        </p>
        <button
          type="button"
          disabled={!isReady || isPending}
          onClick={() => {
            reset();
            signMessage.mutate({ message: "Hello, world!" });
          }}
          className={buttonClass}
        >
          Sign
        </button>
      </div>
      {isPending && (
        <p className="text-sm text-[var(--vocs-color_textSecondary)]">
          Waiting for wallet...
        </p>
      )}
      {error && (
        <p className="text-sm text-[var(--vocs-color_textSecondary)]">
          Cancelled or failed
        </p>
      )}
      {signature && !verifying && valid !== undefined && (
        <p className={`text-sm ${valid ? "text-green-500" : ""}`}>
          {valid ? "Valid signature" : "Invalid signature"}
        </p>
      )}
    </div>
  );
};

const PersonalSignCard = () => {
  const { isConnected } = useConnection();

  if (!isConnected) return null;

  return (
    <section className="rounded-lg border vocs:border-primary bg-[var(--vocs-color_codeBlockBackground)] px-4 py-3">
      <h3 className="mb-2 text-sm font-medium">Playground</h3>
      <PersonalSign />
    </section>
  );
};

const WalletUrlConnect = () => {
  const walletClient = useClient();
  const connections = useConnections();
  const [url, setUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [active, setActive] = useState(false);
  const session = useTryItSession();
  const walletSessionReference = useRef<Session | undefined>(undefined);
  const detachReference = useRef<(() => void) | undefined>(undefined);

  if (!walletClient) return null;

  const endSession = async () => {
    detachReference.current?.();
    detachReference.current = undefined;
    await walletSessionReference.current?.close();
    walletSessionReference.current = undefined;
    setActive(false);
    session.resetSession();
  };

  return (
    <div className="flex flex-col gap-2 border-t vocs:border-primary pt-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="openlv://..."
          disabled={connecting}
          className={`${buttonClass} block w-full grow border px-3 py-1 placeholder:text-neutral-500`}
        />
        <button
          type="button"
          disabled={connecting || !url.trim()}
          onClick={async () => {
            setConnecting(true);
            await endSession();
            session.setPhase("establishing");
            session.setPeer(peerInfoFromConnectionUrl("wallet", url));

            try {
              const walletConnector = connections[0]?.connector;
              const client = (await walletConnector?.getProvider()) as EIP1193Provider;
              // EIP-6963 icons are data URIs of arbitrary size; anything over
              // the 8 KB wire limit would make connectSession throw.
              const walletIcon
                = walletConnector?.icon && walletConnector.icon.length <= 8192
                  ? walletConnector.icon
                  : undefined;
              const s = await connectSession(
                url,
                shimWalletOnMessage("wallet", message => client.request(message as never), session),
                [webrtc()],
                walletConnector
                  ? {
                      info: {
                        // eslint-disable-next-line no-restricted-syntax
                        identity: `sh.openlv.docs.${walletConnector.id}`,
                        name: walletConnector.name,
                        ...(walletIcon && { icon: walletIcon }),
                      },
                    }
                  : undefined,
              );

              walletSessionReference.current = s;
              detachReference.current = attachTryItSession(s, "wallet", session, {
                logRequests: false,
              });
              setActive(true);
              await s.connect();

              // The panel's phase follows the session's own status from here,
              // through the subscription attachTryItSession opened above.
              const settled = await s.status.until(
                status => status === SessionStatus.CONNECTED
                  || status === SessionStatus.DISCONNECTED,
              );

              if (settled !== SessionStatus.CONNECTED) {
                throw new Error(s.error.get() ?? "Session failed to connect");
              }
            }
            catch (error) {
              session.setPhase("error");
              session.appendEntry({
                role: "wallet",
                direction: "in",
                kind: "info",
                summary: "Connection failed",
                payload: error instanceof Error ? { message: error.message } : error,
              });
            }
            finally {
              setConnecting(false);
            }
          }}
          className={buttonClass}
        >
          {connecting ? "..." : "Connect"}
        </button>
        {active && (
          <button type="button" onClick={() => endSession()} className={buttonClass}>
            End
          </button>
        )}
      </div>
    </div>
  );
};

const Connected = () => {
  const disconnect = useDisconnect();
  const { address, connector } = useConnection();
  const session = useTryItSession();

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2 border-b vocs:border-primary pb-3">
        <div className="flex items-center gap-2">
          {connector?.icon && (
            <img src={connector.icon} alt="" className="h-8 w-8 rounded-md" />
          )}
          <span className="text-sm">{trimAddress(address)}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            session.resetSession();
            disconnect.mutate();
          }}
          className={buttonClass}
        >
          Disconnect
        </button>
      </div>
      <div className="flex flex-col gap-3">
        <TryItSessionPanel />
        {connector?.type !== "openLv" && <WalletUrlConnect />}
      </div>
    </div>
  );
};

const ConnectorChip = ({ connector }: { connector: Connector; }) => {
  const connect = useConnect();

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded border vocs:border-primary px-1.5 py-0.5 text-sm hover:bg-[var(--vocs-color_codeHighlightBackground)]"
      onClick={() => connect.mutate({ connector })}
    >
      {connector.icon && <img src={connector.icon} alt="" className="h-4 w-4" />}
      {connector.name}
    </button>
  );
};

const Connectors = () => {
  const connect = useConnect();
  const connectors = useConnectors();
  const openLv = connectors.find(c => c.type === "openLv");
  const wallet = connectors.find(c => c.type !== "openLv");

  return (
    <>
      <ul className="mx-auto max-w-xs space-y-2 p-4">
        {connectors.map(connector => (
          /* eslint-disable-next-line no-restricted-syntax */
          <li key={connector.id}>
            <button
              type="button"
              onClick={() => connect.mutate({ connector })}
              className={classNames(
                "flex w-full items-center justify-between rounded-lg px-4 py-2 text-sm",
                connector.type === "openLv"
                  ? "!bg-[var(--vocs-color_codeBlockBackground)] border vocs:border-primary hover:!bg-[var(--vocs-color_backgroundAccent)]/10 font-bold"
                  : "hover:!bg-[var(--vocs-color_codeHighlightBackground)]",
              )}
            >
              {connector.name}
              {connector.icon && (
                <img src={connector.icon} alt="" className="h-10 w-10 rounded-md" />
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className="border-t vocs:border-primary bg-[var(--vocs-color_codeBlockBackground)] px-4 py-3 text-sm text-[var(--vocs-color_textSecondary)]">
        Open two tabs: connect
        {" "}
        {openLv ? <ConnectorChip connector={openLv} /> : "OpenLV"}
        {" "}
        on one and
        {" "}
        {wallet ? <ConnectorChip connector={wallet} /> : "your wallet"}
        {" "}
        on the other, then paste the connection URL into the wallet tab.
      </p>
    </>
  );
};

const TryItOutInner = () => {
  const { isConnected } = useConnection();
  const session = useTryItSession();

  return (
    <>
      <OpenLvDappMonitor
        onSessionBound={(s) => {
          const h = s.getHandshakeParameters();
          const connectionUrl = encodeConnectionURL(h);

          // Rebinding happens after the handshake too -- carry the already
          // known peer info over instead of clobbering it.
          session.setPeer(previous => ({
            role: "dapp",
            connectionUrl,
            sessionId: h.sessionId,
            protocol: h.p,
            signalingServer: h.s,
            remote: previous?.remote ?? s.peerInfo.get(),
          }));
        }}
      />
      {match(isConnected)
        .with(true, () => <Connected />)
        .with(false, () => <Connectors />)
        .exhaustive()}
    </>
  );
};

const TryItOutProviders = ({ children }: { children: ReactNode; }) => (
  <QueryClientProvider client={queryClient}>
    <WagmiProvider config={config}>
      <TryItSessionProvider>{children}</TryItSessionProvider>
    </WagmiProvider>
  </QueryClientProvider>
);

export const TryItOut = () => {
  // Branching on `window` during render makes the first client render differ
  // from the server's, which React rejects as a hydration mismatch. Mounting
  // is the signal that the client has taken over.
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    (globalThis as { OPENLV_DEBUG?: boolean; }).OPENLV_DEBUG ??= true;
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <div className="rounded-lg border vocs:border-primary" />;
  }

  return (
    <TryItOutProviders>
      <div className="space-y-3" suppressHydrationWarning>
        <div className="rounded-lg border vocs:border-primary">
          <TryItOutInner />
        </div>
        <PersonalSignCard />
      </div>
    </TryItOutProviders>
  );
};
