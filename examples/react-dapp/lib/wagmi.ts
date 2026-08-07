import { openlv } from "@openlv/connector";
import { injected } from "@wagmi/connectors";
import { createConfig, http } from "wagmi";
import { arbitrum, base, mainnet, optimism, polygon, sepolia } from "wagmi/chains";

export const config = createConfig({
  chains: [mainnet, sepolia, arbitrum, base, optimism, polygon],
  connectors: [
    injected(),
    openlv({}),
  ],
  multiInjectedProviderDiscovery: true,
  transports: {
    /* eslint-disable no-restricted-syntax */
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    /* eslint-enable no-restricted-syntax */
  },
});
