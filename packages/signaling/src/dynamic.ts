import { match } from "ts-pattern";

/**
 * Imports the signaling layer based on the protocol at runtime
 *
 * TODO: Make this a built-in feature of session/provider
 */
export const dynamicSignalingLayer = async (protocol: string) => match(protocol)
  .with("mqtt", async () => {
    const module_ = await import("./mqtt/index.js");

    return module_.mqtt;
  })
  .with("ntfy", async () => {
    const module_ = await import("./ntfy/index.js");

    return module_.ntfy;
  })
  .with("gun", async () => {
    const module_ = await import("./gundb/index.js");

    return module_.gundb;
  })
  .otherwise(() => {
    throw new Error(`Unknown signaling protocol: ${protocol}`);
  });
