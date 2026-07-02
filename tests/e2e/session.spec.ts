import { expect, type Page, test } from "@playwright/test";

/**
 * Full-protocol end-to-end test: two browser tabs of the sandbox app connect
 * to each other through the default public MQTT relay.
 *
 * Asserted always:
 *   - both peers complete the signaling handshake (state `encrypted`)
 *   - WebRTC offer/answer are exchanged over encrypted signaling
 *
 * Asserted only when the environment can gather ICE candidates (sandboxed
 * CI runners often cannot):
 *   - the WebRTC data channel connects (session state `connected`)
 */

const SANDBOX_URL = "http://localhost:5199/";

type Capture = {
  lines: string[];
  waitFor: (pattern: RegExp, timeoutMs: number) => Promise<string>;
};

const captureConsole = (page: Page): Capture => {
  const lines: string[] = [];
  const waiters: { pattern: RegExp; resolve: (line: string) => void; }[] = [];

  page.on("console", (message) => {
    const text = message.text();

    lines.push(text);

    for (const [index, waiter] of [...waiters.entries()].reverse()) {
      if (waiter.pattern.test(text)) {
        waiters.splice(index, 1);
        waiter.resolve(text);
      }
    }
  });

  return {
    lines,
    waitFor: (pattern, timeoutMs) => {
      const existing = lines.find(line => pattern.test(line));

      if (existing) return Promise.resolve(existing);

      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(
            `Timed out waiting for console line ${pattern}. Last lines:\n`
            + lines.slice(-15).join("\n"),
          ));
        }, timeoutMs);

        waiters.push({
          pattern,
          resolve: (line) => {
            clearTimeout(timer);
            resolve(line);
          },
        });
      });
    },
  };
};

const openSandbox = async (page: Page) => {
  await page.addInitScript(() => {
    (globalThis as { OPENLV_DEBUG?: boolean; }).OPENLV_DEBUG = true;
  });
  await page.goto(SANDBOX_URL);
};

/** Whether this environment can produce any local ICE candidates at all. */
const probeIce = (page: Page) => page.evaluate(async () => {
  const pc = new RTCPeerConnection();

  pc.createDataChannel("probe");

  let count = 0;

  pc.onicecandidate = (e) => {
    if (e.candidate) count += 1;
  };
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise(resolve => setTimeout(resolve, 3000));
  pc.close();

  return count;
});

test("dApp and wallet link end-to-end over the public relay", async ({ browser }) => {
  const context = await browser.newContext();
  const dapp = await context.newPage();
  const wallet = await context.newPage();
  const dappLog = captureConsole(dapp);
  const walletLog = captureConsole(wallet);

  await openSandbox(dapp);
  await openSandbox(wallet);

  // dApp (host) creates a session and prints the connection URI.
  await dapp.getByText("Create Session", { exact: true }).click();

  const uriLine = await dappLog.waitFor(/session url openlv:\/\//, 30_000);
  const uri = uriLine.match(/openlv:\/\/\S+/)?.[0];

  expect(uri, "host should print an openlv:// connection URI").toBeTruthy();

  // Wallet (client) joins from the URI.
  await wallet.getByPlaceholder("URL").fill(uri!);
  await wallet.getByText("Connect", { exact: true }).click();

  // Signaling handshake must complete on both peers.
  await Promise.all([
    dappLog.waitFor(/signal state change encrypted/, 45_000),
    walletLog.waitFor(/signal state change encrypted/, 45_000),
  ]);

  // Transport negotiation must flow through encrypted signaling.
  await Promise.all([
    walletLog.waitFor(/webrtc handle offer/, 30_000),
    dappLog.waitFor(/webrtc handle answer/, 30_000),
  ]);

  // Full peer-to-peer connection requires working ICE; skip that half of the
  // assertion when the environment cannot gather candidates.
  const candidates = await probeIce(dapp);

  if (candidates === 0) {
    test.info().annotations.push({
      type: "warning",
      description: "environment gathered zero ICE candidates; skipped data-channel assertion",
    });

    return;
  }

  await Promise.all([
    dappLog.waitFor(/updateStatus connected/, 60_000),
    walletLog.waitFor(/updateStatus connected/, 60_000),
  ]);

  await context.close();
});
