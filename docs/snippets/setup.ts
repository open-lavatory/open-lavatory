import { openlv } from "@openlv/connector"; // [!code ++]
import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors: [openlv()], // [!code ++]
  transports: {
    // eslint-disable-next-line no-restricted-syntax
    [mainnet.id]: http(),
  },
});
