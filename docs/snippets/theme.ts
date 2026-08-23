import { openlv } from "@openlv/connector"; // [!code ++]
import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors: [
    openlv({
      theme: {
        theme: "simple", // or "openlv" // [!code ++]
        mode: "auto", // or "light" or "dark" // [!code ++]
      },
    }),
  ],
  transports: {
    [mainnet.id]: http(),
  },
});
