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

const relays = [
  { p: "mqtt", s: "wss://mqtt-dashboard.com:8884/mqtt" },
  { p: "mqtt", s: "ws://broker.emqx.io:8083/mqtt" },
  { p: "mqtt", s: "ws://test.mosquitto.org:8080/mqtt" },
  { p: "mqtt", s: "wss://broker.itdata.nu/mqtt" },
  { p: "ntfy", s: "https://ntfy.sh/" },
  { p: "ntfy", s: "https://ntfy.envs.net/" },
] as const;

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
      if (!waiter.pattern.test(text)) {
        continue;
      }

      waiters.splice(index, 1);
      waiter.resolve(text);
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

test("dApp and wallet link over at least one public relay", async ({ browser }) => {
  const results = await Promise.all(relays.map(async (relay) => {
    const context = await browser.newContext();

    try {
      await context.addInitScript(({ key, p, s }) => {
        localStorage.setItem(key, JSON.stringify({
          version: 3,
          retainHistory: false,
          autoReconnect: false,
          signaling: { p, s: { [p]: s } },
          theme: "system",
        }));
      }, { key: "@openlv/connector/settings", ...relay });

      const dapp = await context.newPage();
      const wallet = await context.newPage();
      const dappLog = captureConsole(dapp);
      const walletLog = captureConsole(wallet);

      await openSandbox(dapp);
      await openSandbox(wallet);

      // dApp (host) creates a session and prints the connection URI.
      await dapp.getByText("Create Session", { exact: true }).click();

      const uriLine = await dappLog.waitFor(/session url openlv:\/\//, 10_000);
      const uri = uriLine.match(/openlv:\/\/\S+/)?.[0];

      expect(uri, "host should print an openlv:// connection URI").toBeTruthy();

      // Wallet (client) joins from the URI.
      await wallet.getByPlaceholder("URL").fill(uri!);
      await wallet.getByText("Connect", { exact: true }).click();

      // Signaling handshake must complete on both peers.
      await Promise.all([
        dappLog.waitFor(/signal state change encrypted/, 15_000),
        walletLog.waitFor(/signal state change encrypted/, 15_000),
      ]);

      // Transport negotiation must flow through encrypted signaling.
      await Promise.all([
        walletLog.waitFor(/webrtc handle offer/, 15_000),
        dappLog.waitFor(/webrtc handle answer/, 15_000),
      ]);

      // Full peer-to-peer connection requires working ICE; skip that half of the
      // assertion when the environment cannot gather candidates.
      const candidates = await probeIce(dapp);

      if (candidates > 0) {
        await Promise.all([
          dappLog.waitFor(/updateStatus connected/, 30_000),
          walletLog.waitFor(/updateStatus connected/, 30_000),
        ]);
      }

      return { relay, ok: true as const };
    }
    catch (error) {
      return {
        relay,
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    finally {
      await context.close();
    }
  }));

  console.log(results.map(result => (
    result.ok ? `✓ ${result.relay.s}` : `✗ ${result.relay.s} - ${result.error}`
  )).join("\n"));

  expect(results.filter(result => result.ok).length).toBeGreaterThan(0);
});
