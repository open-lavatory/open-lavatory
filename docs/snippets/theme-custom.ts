import { openlv } from "@openlv/connector"; // [!code ++]
import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors: [
    openlv({
      theme: { // [!code ++]
        theme: { // [!code ++]
          light: { // [!code ++]
            font: { // [!code ++]
              family: "Inter, sans-serif", // [!code ++]
            }, // [!code ++]
            body: { // [!code ++]
              background: "orange", // [!code ++]
              color: "white", // [!code ++]
            }, // [!code ++]
          }, // [!code ++]
        }, // [!code ++]
        mode: "light", // [!code ++]
      }, // [!code ++]
    }),
  ],
  transports: {
    [mainnet.id]: http(),
  },
});
