import { expect } from "vitest";

import type { CompatSession, Stack } from "./stacks.js";

const SIGNALING = { p: "ntfy", s: "https://ntfy.sh/" };

/**
 * Run the full openlv lifecycle between two (potentially different) stack
 * versions over real ntfy.sh signaling and a real WebRTC data channel:
 *
 * 1. `dapp` hosts a session and encodes the openlv:// connection URL.
 * 2. `wallet` decodes that URL and joins — URL grammar, signaling handshake,
 *    key exchange and transport negotiation all cross the version boundary.
 * 3. Both peers link over WebRTC.
 * 4. A request/response round trip is asserted in both directions.
 */
export const runCompatSession = async (dapp: Stack, wallet: Stack) => {
  console.log(
    `compat: dapp=${dapp.label}@${dapp.version} wallet=${wallet.label}@${wallet.version}`,
  );

  const dappReceived: object[] = [];
  const walletReceived: object[] = [];

  let dappSession: CompatSession | undefined;
  let walletSession: CompatSession | undefined;

  try {
    // No sessionId passed: each run gets a fresh random session topic, so
    // concurrent CI runs can never collide on the shared ntfy.sh instance.
    dappSession = await dapp.createSession(SIGNALING, async (message) => {
      dappReceived.push(message);

      return { echo: message, from: "dapp" };
    });

    expect(dappSession.getState().status).toBe("created");

    await dappSession.connect();

    const connectionUrl = dapp.encodeConnectionURL(dappSession.getHandshakeParameters());

    expect(connectionUrl).toMatch(/^openlv:\/\//);

    walletSession = await wallet.connectSession(connectionUrl, async (message) => {
      walletReceived.push(message);

      return { echo: message, from: "wallet" };
    });

    await walletSession.connect();
    await Promise.all([dappSession.waitForLink(), walletSession.waitForLink()]);

    expect(dappSession.getState().status).toBe("connected");
    expect(walletSession.getState().status).toBe("connected");

    // dApp -> wallet round trip (the eth_requestAccounts / personal_sign shape).
    const request = { method: "personal_sign", params: ["0xdeadbeef", "0xabc"] };
    const walletResponse = await dappSession.send(request);

    expect(walletResponse).toEqual({ echo: request, from: "wallet" });
    expect(walletReceived).toContainEqual(request);

    // Wallet -> dApp round trip (wallet-initiated events must survive too).
    const notification = { method: "accountsChanged", params: [["0xabc"]] };
    const dappResponse = await walletSession.send(notification);

    expect(dappResponse).toEqual({ echo: notification, from: "dapp" });
    expect(dappReceived).toContainEqual(notification);
  }
  finally {
    await Promise.allSettled([dappSession?.close(), walletSession?.close()]);
  }
};
