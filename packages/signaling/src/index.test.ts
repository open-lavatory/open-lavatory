import { deriveSymmetricKey, generateKeyPair } from "@openlv/core/encryption";
import { describe, expect, it } from "vitest";

import { mqtt } from "./mqtt/index.js";
import { ntfy } from "./ntfy/index.js";
import type { SignalingProtocol, SignalingProtocolOptions } from "./protocol.js";
import { log } from "./utils/log.js";

const hKey = "test";
const K = "00112233445566778899aabbccddeeff";

const providersByType: readonly [
  string,
  readonly [string, SignalingProtocol, SignalingProtocolOptions][],
][] = [
  [
    "mqtt",
    [
      [
        "mqtt-dashboard",
        mqtt,
        {
          topic: "mytesttopic1111",
          url: "wss://mqtt-dashboard.com:8884/mqtt",
        },
      ],
      [
        "broker.emqx.io",
        mqtt,
        {
          topic: "mytesttopic1111",
          url: "ws://broker.emqx.io:8083/mqtt",
        },
      ],
      [
        "test.mosquitto.org",
        mqtt,
        {
          topic: "mytesttopic1111",
          url: "ws://test.mosquitto.org:8080/mqtt",
        },
      ],
      [
        "broker.itdata.nu",
        mqtt,
        {
          topic: "mytesttopic1111",
          url: "wss://broker.itdata.nu/mqtt",
        },
      ],
    ],
  ],
  [
    "ntfy",
    [
      [
        "ntfy.sh",
        ntfy,
        { topic: "mytesttopic1111", url: "https://ntfy.sh/" },
      ],
      [
        "ntfy.envs.net",
        ntfy,
        { topic: "mytesttopic1111", url: "https://ntfy.envs.net/" },
      ],
    ],
  ],
  // gundb is deprecated and its public relays are too lossy to assert on.
  // [
  //   "gundb",
  //   [
  //     [
  //       "try.axe.eco",
  //       gundb,
  //       { topic: "mytesttopic1111", url: "wss://try.axe.eco/gun" },
  //     ],
  //   ],
  // ],
] as const;

const testSignalingLayer = async (
  layer: SignalingProtocol,
  properties: SignalingProtocolOptions,
): Promise<void> => {
  const { encryptionKey: publicKey, decryptionKey } = await generateKeyPair();
  const h = hKey;
  const k = await deriveSymmetricKey(K);

  const signalingLayer = await layer(properties);
  const signalA = await signalingLayer({
    h,
    k,
    capabilities: { transports: ["wrtc"] },
    canEncrypt: () => true,
    encrypt: publicKey.encrypt,
    decrypt: decryptionKey.decrypt,
    publicKey,
    isHost: true,
  });

  signalA.peerKey.subscribe(v => log("rpKey", v));
  signalA.peerCapabilities.subscribe(v => log("peerCapabilities", v));

  const signalB = await signalingLayer({
    h,
    k,
    capabilities: { transports: ["wrtc"] },
    canEncrypt: () => true,
    encrypt: publicKey.encrypt,
    decrypt: decryptionKey.decrypt,
    publicKey,
    isHost: false,
  });

  signalB.peerKey.subscribe(v => log("rpKey", v));
  signalB.peerCapabilities.subscribe(v => log("peerCapabilities", v));

  expect(signalA).toBeDefined();
  expect(signalB).toBeDefined();

  await Promise.all([signalA.setup(), signalB.setup()]);

  const messageReceivedA = new Promise<void>((resolve) => {
    signalA.on("message", (message) => {
      log("messageReceivedA", message);
      expect(message).toEqual({ data: "test2" });
      resolve();
    });
  });
  const messageReceivedB = new Promise<void>((resolve) => {
    signalB.on("message", (message) => {
      log("messageReceivedB", message);
      expect(message).toEqual({ data: "test1" });
      resolve();
    });
  });

  await signalA.send({ data: "test1" });

  await messageReceivedB;

  await signalB.send({ data: "test2" });

  await messageReceivedA;

  await signalA.teardown();
  await signalB.teardown();
};

const PROVIDER_TIMEOUT_MS = 5000;

type ProviderResult
  = | { url: string; ok: true; duration: number; }
    | { url: string; ok: false; error: string; };

const testProvider = async (
  layer: SignalingProtocol,
  properties: SignalingProtocolOptions,
): Promise<ProviderResult> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Timeout after ${PROVIDER_TIMEOUT_MS}ms`)),
      PROVIDER_TIMEOUT_MS,
    ),
  );

  const startTime = performance.now();

  try {
    await Promise.race([testSignalingLayer(layer, properties), timeout]);
    const duration = Math.round(performance.now() - startTime);

    return { url: properties.url, ok: true, duration };
  }
  catch (error) {
    return {
      url: properties.url,
      ok: false,
      error: (error as Error).message,
    };
  }
};

const formatResults = (typeName: string, results: ProviderResult[]): string => {
  const passed = results.filter(r => r.ok).length;
  const total = results.length;

  return [
    `${typeName.toUpperCase()}: ${passed}/${total}`,
    ...results.map(r =>
      (r.ok ? `✓ ${r.url} ${r.duration}ms` : `✗ ${r.url} - ${r.error}`),
    ),
  ].join("\n");
};

describe.for(providersByType)("signaling: %s", ([typeName, providers]) => {
  it(
    "should pass signaling messages between peers",
    { timeout: PROVIDER_TIMEOUT_MS * providers.length + 5000 },
    async () => {
      const results = await Promise.all(
        providers.map(([, layer, properties]) => testProvider(layer, properties)),
      );

      const summary = formatResults(typeName, results);

      console.log(`\n${summary}`);

      const passed = results.filter(r => r.ok).length;

      expect(passed).toBeGreaterThan(0);
    },
  );
});
