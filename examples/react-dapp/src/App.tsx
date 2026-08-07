import { useEffect, useState } from "react";
import {
  useBalance,
  useChainId,
  useChains,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { arbitrum, base, mainnet, optimism, polygon, sepolia } from "wagmi/chains";

import { ConnectorCard } from "./components/ConnectorCard.tsx";

interface WalletInfo {
  address: string;
  ensName?: string;
  connector: string;
  chainId: number;
  isConnected: boolean;
}

const App = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const { address, isConnected, connector } = useConnection();
  const connect = useConnect();
  const connectors = useConnectors();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const chains = useChains();
  const connectError = connect.error;
  const chainId = useChainId();
  const { data: balance, isLoading: balanceLoading } = useBalance({
    address,
  });

  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);

  useEffect(() => {
    if (isConnected && address && connector) {
      setWalletInfo({
        address,
        connector: connector.name,
        chainId,
        isConnected,
      });
    }
    else {
      setWalletInfo(null);
    }
  }, [isConnected, address, connector, chainId]);

  const refreshWallets = () => {
    setRefreshKey(previous => previous + 1);
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const formatBalance = (bal: { formatted: string; symbol: string; } | undefined) => {
    if (!bal) return "0";

    const value = Number(bal.formatted);

    if (value === 0) return "0";

    if (value < 0.0001) return "< 0.0001";

    return value.toFixed(4);
  };

  const getChainName = (chainId: number) => {
    // eslint-disable-next-line no-restricted-syntax
    const chain = chains.find(chain => chain.id === chainId);

    return chain?.name || `Chain ${chainId}`;
  };

  const getChainColor = (chainId: number) => {
    const colors: Record<number, string> = {
      /* eslint-disable no-restricted-syntax */
      [mainnet.id]: "bg-blue-500",
      [sepolia.id]: "bg-purple-500",
      [arbitrum.id]: "bg-blue-600",
      [base.id]: "bg-indigo-500",
      [optimism.id]: "bg-red-500",
      [polygon.id]: "bg-purple-600",
      /* eslint-enable no-restricted-syntax */
    };

    return colors[chainId] || "bg-gray-500";
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="mb-2 font-bold text-2xl text-gray-800">
                🚀 Wallet Sandbox
              </h1>
              <p className="text-gray-600 text-sm">
                Beautiful wagmi-powered wallet connection demo
              </p>
            </div>
            <button
              onClick={refreshWallets}
              className="flex items-center gap-2 rounded-md bg-gray-100 px-4 py-2 text-gray-700 transition-colors duration-200 hover:bg-gray-200"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </div>

          {/* Connection Status */}
          <div className="flex items-center gap-3">
            <div
              className={`h-3 w-3 rounded-full ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            >
            </div>
            <span className="font-medium text-gray-600 text-sm">
              {isConnected ? "Connected" : "Disconnected"}
            </span>
            {isConnected && (
              <span className="rounded bg-gray-100 px-2 py-1 text-xs">
                {connector?.name}
              </span>
            )}
          </div>
        </div>

        {/* Available Connectors */}
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-gray-800 text-lg">
            <svg
              className="h-5 w-5 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            Available Connectors (
            {connectors.length}
            )
          </h2>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {connectors.map(conn => (
              /* eslint-disable-next-line no-restricted-syntax */
              <ConnectorCard key={conn.id} connector={conn} refreshKey={refreshKey} />
            ))}
          </div>

          {connectError && (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-red-700 text-sm">
                <span className="font-medium">Connection Error:</span>
                {" "}
                {connectError.message}
              </p>
            </div>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Wallet Information */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-gray-800 text-lg">
              <svg
                className="h-5 w-5 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Wallet Information
            </h2>

            {walletInfo ? (
              <div className="space-y-6">
                {/* Address */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <label className="mb-2 block font-medium text-gray-600 text-sm">
                    Address
                  </label>
                  <div className="flex items-center justify-between">
                    <code className="font-mono text-gray-800 text-sm">
                      {formatAddress(walletInfo.address)}
                    </code>
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(walletInfo.address)}
                      className="text-blue-500 text-sm hover:text-blue-700"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                {/* Balance */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <label className="mb-2 block font-medium text-gray-600 text-sm">
                    Balance
                  </label>
                  <div className="font-semibold text-gray-800 text-lg">
                    {balanceLoading
                      ? (
                          <div className="h-8 w-32 animate-pulse rounded bg-gray-200"></div>
                        )
                      : (
                          `${formatBalance(balance)} ${balance?.symbol || "ETH"}`
                        )}
                  </div>
                </div>

                {/* Current Chain */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <label className="mb-2 block font-medium text-gray-600 text-sm">
                    Current Chain
                  </label>
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-3 w-3 rounded-full ${getChainColor(
                        chainId,
                      )}`}
                    >
                    </div>
                    <span className="font-semibold text-gray-800">
                      {getChainName(chainId)}
                    </span>
                    <span className="text-gray-500 text-xs">
                      #
                      {chainId}
                    </span>
                  </div>
                </div>

                {/* Disconnect Button */}
                <button
                  onClick={() => disconnect.mutate()}
                  className="w-full rounded-lg bg-red-500 py-3 font-medium text-white transition-colors duration-200 hover:bg-red-600"
                >
                  Disconnect Wallet
                </button>
              </div>
            ) : (
              <div className="py-12 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                  <svg
                    className="h-8 w-8 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <h3 className="mb-2 font-medium text-base text-gray-800">
                  No Wallet Connected
                </h3>
                <p className="text-gray-600">
                  Connect a wallet to see your account information
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Available Chains */}
        {isConnected && (
          <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-gray-800 text-lg">
              <svg
                className="h-5 w-5 text-purple-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
              Available Chains (
              {chains.length}
              )
            </h2>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {chains.map(chain => (
                /* eslint-disable no-restricted-syntax */
                <div
                  key={chain.id}
                  className={`rounded-lg border-2 p-4 transition-all duration-200 ${
                    chain.id === chainId
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-gray-50 hover:border-slate-300"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-3 w-3 rounded-full ${getChainColor(
                          chain.id,
                        )}`}
                      >
                      </div>
                      <h3 className="font-medium text-gray-800">
                        {chain.name}
                      </h3>
                    </div>
                    {chain.id === chainId && (
                      <span className="rounded bg-blue-500 px-2 py-1 text-white text-xs">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mb-3 text-gray-500 text-xs">
                    Chain ID:
                    {" "}
                    {chain.id}
                    {" "}
                    •
                    {chain.nativeCurrency.symbol}
                  </p>
                  {chain.id !== chainId && (
                    <button
                      onClick={() => switchChain.mutate({
                        chainId: chain.id,
                      })}
                      className="w-full rounded-lg bg-gray-200 py-2 font-medium text-gray-700 text-sm transition-colors duration-200 hover:bg-slate-300"
                    >
                      Switch to
                      {" "}
                      {chain.name}
                    </button>
                  )}
                </div>
                /* eslint-enable no-restricted-syntax */
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-gray-500">
          <p className="text-sm">
            Built with ❤️ using
            {" "}
            <span className="font-semibold text-blue-500">wagmi</span>
            ,
            {" "}
            <span className="font-semibold text-blue-500">viem</span>
            , and
            {" "}
            <span className="font-semibold text-blue-500">React</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export { App };
