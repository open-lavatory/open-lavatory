import { match } from "ts-pattern";

export const loadSignaling = async (protocol: string) => match(protocol)
  .with("mqtt", async () => {
    const module_ = await import("@openlv/signaling/mqtt");

    return module_.mqtt;
  })
  .with("ntfy", async () => {
    const module_ = await import("@openlv/signaling/ntfy");

    return module_.ntfy;
  })
  .with("nostr", async () => {
    const module_ = await import("@openlv/signaling/nostr");

    return module_.nostr;
  })
  .otherwise(() => {
    throw new Error(`Unsupported signaling protocol: ${protocol}`);
  });

export const loadTransport = async (protocol: string) => match(protocol)
  .with("webrtc", async () => {
    const module_ = await import("@openlv/transport/webrtc");

    return module_.webrtc;
  })
  .otherwise(() => {
    throw new Error(`Unknown transport protocol: ${protocol}`);
  });
