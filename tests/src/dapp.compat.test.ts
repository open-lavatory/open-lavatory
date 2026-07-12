import { describe, test } from "vitest";

import { runCompatSession } from "./harness.js";
import { branchStack, latestStack, OPENLV_VERSIONS } from "./stacks.js";

/**
 * The branch build acts as the dApp (session host); the latest published npm
 * release acts as the wallet joining from the connection URL. Guards dapp-side
 * changes on this branch against every wallet already in the wild.
 */
describe(`Compat: branch dApp (${OPENLV_VERSIONS.branch}) <> npm latest wallet (${OPENLV_VERSIONS.latest})`, () => {
  test("connects and exchanges messages over real signaling + WebRTC", async () => {
    await runCompatSession(branchStack, latestStack);
  });
});
