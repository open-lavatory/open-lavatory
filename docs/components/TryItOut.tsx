"use client";

/* eslint-disable no-restricted-syntax */
import { openlv } from "@openlv/connector";
import { createScope, encodeConnectionURL, type Scope, type SessionConnectionParameters } from "@openlv/core";
import { connectSession, createSession, type Session, SessionStatus } from "@openlv/session";
import { webrtc } from "@openlv/transport/webrtc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import classNames from "classnames";
import { useEffect, useState } from "react";
import type { Address, EIP1193EventMap } from "viem";
import {
  type Connector, createConfig, http, useChainId, useChains, useConnect, useConnection, useConnectionEffect,
  useConnectors, useDisconnect, useSignMessage, useSwitchChain, useVerifyMessage, WagmiProvider,
} from "wagmi";
import { holesky, mainnet, sepolia } from "wagmi/chains";

import { type AppendEntry, forwardWalletRequest, isWalletProvider, logSessionSend, observeSession, providerError, SessionPanel, useSessionValue, useWireLog } from "./TryItOutSession.js";
import { clearWalletSession, loadWalletSession, saveWalletSession } from "./WalletSession.js";

const config = createConfig({
  chains: [mainnet, sepolia, holesky],
  connectors: [openlv({
    config: {
      info: {
        identity: "sh.openlv.docs",
        name: "OpenLV Docs",
        icon: "https://openlv.sh/openlavatory.png",
      },
    },
  })],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [holesky.id]: http(),
  },
});

const trimAddress = (address: Address | undefined | null) => {
  if (typeof address !== "string") return address;

  return `${address.slice(0, 5)}...${address.slice(-4)}`;
};

const buttonClass
  = "!bg-[var(--vocs-color_codeTitleBackground)] hover:!bg-[var(--vocs-color_codeBlockBackground)] rounded-lg vocs:border-primary px-4 py-1 disabled:opacity-50";

const AccountSelect = ({
  account,
  onChange,
}: {
  account: Address | undefined;
  onChange: (account: Address | undefined) => void;
}) => {
  const { addresses } = useConnection();

  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-(--vocs-color_textSecondary)">
        <code className="text-xs">eth_accounts</code>
      </p>
      <select
        value={account}
        onChange={event => onChange(addresses?.find(address => address === event.target.value))}
        className={buttonClass}
      >
        {addresses?.map(address => (
          <option key={address} value={address}>
            {trimAddress(address)}
          </option>
        ))}
      </select>
    </div>
  );
};

const ChainSelect = ({ isReady }: { isReady: boolean; }) => {
  const chains = useChains();
  const switchChain = useSwitchChain();
  const { chainId } = useConnection();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-(--vocs-color_textSecondary)">
          <code className="text-xs">wallet_switchEthereumChain</code>
        </p>
        <select
          value={chainId}
          disabled={!isReady || switchChain.isPending}
          onChange={(event) => {
            const chain = chains.find(chain => String(chain.id) === event.target.value);

            if (chain) switchChain.mutate({ chainId: chain.id });
          }}
          className={buttonClass}
        >
          {chains.every(chain => chain.id !== chainId) && (
            <option value={chainId}>{`Chain ${chainId}`}</option>
          )}
          {chains.map(chain => (
            <option key={chain.id} value={chain.id}>
              {chain.name}
            </option>
          ))}
        </select>
      </div>
      {switchChain.isPending && (
        <p className="text-sm text-[var(--vocs-color_textSecondary)]">
          Waiting for wallet...
        </p>
      )}
      {switchChain.error && (
        <p className="text-sm text-[var(--vocs-color_textSecondary)]">
          Cancelled or failed
        </p>
      )}
    </div>
  );
};

const PersonalSign = ({ account, isReady }: { account: Address | undefined; isReady: boolean; }) => {
  const signMessage = useSignMessage();
  const { data: signature, error, isPending, reset } = signMessage;
  const chainId = useChainId();

  const { data: valid, isLoading: verifying } = useVerifyMessage({
    address: account,
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
            signMessage.mutate({ account, message: "Hello, world!" });
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

const Playground = ({ isReady = true }: { isReady?: boolean; }) => {
  const { address, addresses, isConnected } = useConnection();
  const [picked, setPicked] = useState<Address>();

  if (!isConnected) return null;

  const account = picked && addresses?.includes(picked) ? picked : address;

  return (
    <section className="rounded-lg border vocs:border-primary bg-[var(--vocs-color_codeBlockBackground)] px-4 py-3">
      <h3 className="mb-2 text-sm font-medium">Playground</h3>
      <div className="flex flex-col gap-3">
        <AccountSelect account={account} onChange={setPicked} />
        <ChainSelect isReady={isReady} />
        <PersonalSign account={account} isReady={isReady} />
      </div>
    </section>
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
        {openLv?.name ?? "OpenLV"}
        {" "}
        on one and
        {" "}
        {wallet?.name ?? "your wallet"}
        {" "}
        on the other, then paste the connection URL into the wallet tab.
      </p>
    </>
  );
};

const Dapp = ({ onReadyChange }: { onReadyChange: (isReady: boolean) => void; }) => {
  const [session, setSession] = useState<Session>();
  const { entries, append, clear } = useWireLog();
  const status = useSessionValue(session?.status, SessionStatus.CREATED);

  useEffect(() => {
    onReadyChange(status === SessionStatus.CONNECTED);
  }, [onReadyChange, status]);

  useEffect(() => {
    const scope = createScope();
    let isCancelled = false;

    const connect = async () => {
      const provider = await config.connectors[0].getProvider();

      if (isCancelled) return;

      let observation = scope.child();

      scope.add(provider.session.subscribe((current) => {
        void observation.close().catch(console.error);
        observation = scope.child();
        setSession(current);

        if (!current) return;

        observation.add(observeSession(current, "dapp", append));

        const send = current.send;

        current.send = logSessionSend(send, "dapp", append);
        observation.add(() => {
          current.send = send;
        });
      }));
    };

    void connect().catch((error: unknown) => {
      if (!isCancelled) append({ role: "dapp", summary: "Connection failed", payload: error });
    });

    return () => {
      isCancelled = true;
      void scope.close().catch(console.error);
    };
  }, [append]);

  return <SessionPanel session={session} role="dapp" entries={entries} onClear={clear} />;
};

const createWalletSession = async (
  connector: Connector,
  connection: string | SessionConnectionParameters,
  append: AppendEntry,
  scope: Scope,
) => {
  const provider = await connector.getProvider();

  if (!isWalletProvider(provider)) throw new Error("Wallet provider unavailable");

  const icon = connector.icon && connector.icon.length <= 8192 ? connector.icon : undefined;
  const options = {
    info: { identity: "sh.openlv.docs.wallet", name: connector.name, ...(icon && { icon }) },
  };
  const onMessage = forwardWalletRequest(request => provider.request(request), append);

  const session = typeof connection === "string"
    ? await connectSession(connection, onMessage, [webrtc()], options)
    : await createSession(connection, [webrtc()], onMessage, options);

  session.send = logSessionSend(session.send, "wallet", append);
  scope.add(() => session.close());

  const forward = (event: keyof EIP1193EventMap, encode = (value: unknown): unknown => value) => {
    const listener = (value: unknown) => {
      if (session.status.get() !== SessionStatus.CONNECTED) return;

      void session.send({ jsonrpc: "2.0", method: event, params: [encode(value)] }).catch(console.error);
    };

    provider.on(event, listener);
    scope.add(() => provider.removeListener(event, listener));
  };

  forward("accountsChanged");
  forward("chainChanged");
  forward("connect");
  forward("disconnect", error => providerError.safeParse(error).data ?? error);
  forward("message");

  return session;
};

const Wallet = ({ connector }: { connector: Connector; }) => {
  const [connectionRequest, setConnectionRequest] = useState<string | SessionConnectionParameters | undefined>(loadWalletSession);
  const [url, setUrl] = useState(() => (typeof connectionRequest === "object" ? encodeConnectionURL(connectionRequest) : ""));
  const [session, setSession] = useState<Session>();
  const { entries, append, clear } = useWireLog();
  const status = useSessionValue(session?.status, SessionStatus.CREATED);
  const isConnecting = connectionRequest !== undefined && status !== SessionStatus.CONNECTED;

  useEffect(() => {
    if (!connector || connectionRequest === undefined) return;

    const scope = createScope();
    let isCancelled = false;

    clear();
    setSession(undefined);

    void createWalletSession(connector, connectionRequest, append, scope).then((current) => {
      if (isCancelled) return;

      setSession(current);
      scope.add(observeSession(current, "wallet", append));
      scope.add(current.status.subscribe((value) => {
        if (value === SessionStatus.CONNECTED) {
          saveWalletSession(current.getResumeParameters());
        }

        if (value === SessionStatus.DISCONNECTED) {
          clearWalletSession();
          setConnectionRequest(undefined);
        }
      }));

      return current.connect();
    })
      .catch((error: unknown) => {
        if (isCancelled) return;

        setConnectionRequest(undefined);
        clearWalletSession();
        append({
          role: "wallet",
          summary: "Connection failed",
          payload: error instanceof Error ? { message: error.message } : error,
        });
      });

    return () => {
      isCancelled = true;
      void scope.close().catch(console.error);
    };
  }, [append, clear, connectionRequest, connector]);

  return (
    <div>
      <SessionPanel session={session} role="wallet" entries={entries} onClear={clear} />
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const saved = loadWalletSession();

          setConnectionRequest(saved && url.trim() === encodeConnectionURL(saved) ? saved : url.trim());
        }}
      >
        <input
          value={url}
          onChange={event => setUrl(event.target.value)}
          placeholder="openlv://..."
          aria-label="Connection URL"
          disabled={isConnecting}
          className={`${buttonClass} min-w-0 flex-1 border px-3 py-1`}
        />
        <button type="submit" disabled={isConnecting || !url.trim()} className={buttonClass}>
          {isConnecting ? "..." : "Connect"}
        </button>
        {connectionRequest !== undefined && (
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setConnectionRequest(undefined);
              setSession(undefined);
              clearWalletSession();
            }}
          >
            End
          </button>
        )}
      </form>
    </div>
  );
};

const Demo = () => {
  const { address, connector, isConnected } = useConnection();
  const [source, setSource] = useState(connector);
  const [isDappReady, setIsDappReady] = useState(false);
  const disconnect = useDisconnect();
  const isWallet = source !== undefined && source.type !== "openLv";

  // Keep the selected provider while its RPC connection is temporarily down.
  useConnectionEffect({ onConnect: connection => setSource(connection.connector) });

  return (
    <div className="space-y-3">
      <div className="rounded-lg border vocs:border-primary">
        {isConnected
          ? (
              <div className="flex items-center justify-between gap-2 border-b vocs:border-primary px-4 py-3">
                <div className="flex items-center gap-2">
                  {connector?.icon && <img src={connector.icon} alt="" className="h-8 w-8 rounded-md" />}
                  <span className="text-sm">
                    {connector?.name}
                    {" "}
                    -
                    {" "}
                    {trimAddress(address)}
                  </span>
                </div>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    if (isWallet) clearWalletSession();

                    setSource(undefined);
                    disconnect.mutate();
                  }}
                >
                  Disconnect
                </button>
              </div>
            )
          : <Connectors />}
        <div className="p-4">
          {isWallet ? <Wallet connector={source} /> : <Dapp onReadyChange={setIsDappReady} />}
        </div>
      </div>
      {isConnected && <Playground isReady={isWallet || isDappReady} />}
    </div>
  );
};

const queryClient = new QueryClient();

export const TryItOut = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);

  if (!isMounted) return <div className="rounded-lg border vocs:border-primary" />;

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <Demo />
      </WagmiProvider>
    </QueryClientProvider>
  );
};
