import { describe, test } from "vitest";

import { runCompatSession } from "./harness.js";
import { branchStack, latestStack, OPENLV_VERSIONS } from "./stacks.js";

/**
 * The latest published npm release acts as the dApp (session host); the branch
 * build acts as the wallet joining from the connection URL. Guards wallet-side
 * changes on this branch against every dApp already in the wild.
 */
describe(`Compat: npm latest dApp (${OPENLV_VERSIONS.latest}) <> branch wallet (${OPENLV_VERSIONS.branch})`, () => {
  test("connects and exchanges messages over real signaling + WebRTC", async () => {
    await runCompatSession(latestStack, branchStack);
  });
});
