import { describe, expect, test } from "vitest";

import {
  convertProviderStorageV0ToV1,
  migrateStorageToLatest,
  parseProviderStorage,
  type ProviderStorageV0,
  type ProviderStorageV1,
  type ProviderStorageV2,
  type ProviderStorageVAny,
} from "./version.js";

const testCases = {
  v0tov1: [
    {
      name: "basic",
      input: {
        autoReconnect: false,
        retainHistory: false,
        session: {
          p: "mqtt",
          s: "wss://test.mosquitto.org:8081/mqtt",
        },
      },
      output: {
        version: 1,
        autoReconnect: false,
        retainHistory: false,
        signaling: {
          p: "mqtt",
          s: {
            mqtt: "wss://test.mosquitto.org:8081/mqtt",
          },
        },
      },
    },
  ] as { name: string; input: ProviderStorageV0; output: ProviderStorageV1; }[],
  v1tov2: [
    {
      name: "basic",
      input: {
        version: 1,
        retainHistory: false,
        autoReconnect: false,
        signaling: {
          p: "mqtt",
          s: {
            mqtt: "wss://test.mosquitto.org:8081/mqtt",
          },
        },
      },
      output: {
        version: 2,
        autoReconnect: false,
        retainHistory: false,
        signaling: {
          p: "mqtt",
          s: {
            mqtt: "wss://test.mosquitto.org:8081/mqtt",
          },
        },
      },
    },
  ] as { name: string; input: ProviderStorageV1; output: ProviderStorageV2; }[],
  startToFinish: [
    {
      name: "v0->v1->v2->v3",
      input: {
        version: 0,
        autoReconnect: false,
        retainHistory: false,
        session: {
          p: "mqtt",
          s: "wss://test.mosquitto.org:8081/mqtt",
        },
      },
      output: {
        version: 3,
        autoReconnect: false,
        retainHistory: false,
        signaling: {
          p: "mqtt",
          s: {
            mqtt: "wss://test.mosquitto.org:8081/mqtt",
          },
        },
      },
    },
  ] as {
    name: string;
    input: ProviderStorageVAny;
    output: ProviderStorageVAny;
  }[],
} as const;

describe("Storage Migrations", () => {
  for (const testCase of testCases.v0tov1) {
    test(`v0 to v1: ${testCase.name}`, () => {
      const result = convertProviderStorageV0ToV1(testCase.input);

      expect(result).toEqual(testCase.output);
    });
  }

  for (const testCase of testCases.startToFinish) {
    test(`start to finish: ${testCase.name}`, () => {
      const result = migrateStorageToLatest(
        testCase.input as unknown as ProviderStorageVAny,
      );

      expect(result).toEqual(testCase.output);
    });
  }

  test("parseProviderStorage upgrades legacy V0 JSON without version key", () => {
    const legacy = JSON.stringify({
      autoReconnect: false,
      retainHistory: false,
      session: {
        p: "mqtt",
        s: "wss://test.mosquitto.org:8081/mqtt",
      },
    });

    const result = parseProviderStorage(legacy);

    expect(result.version).toBe(3);
    expect(result.signaling).toEqual({
      p: "mqtt",
      s: { mqtt: "wss://test.mosquitto.org:8081/mqtt" },
    });
  });

  test("parseProviderStorage loads a saved protocol it does not support", () => {
    const saved = JSON.stringify({
      version: 3,
      autoReconnect: false,
      retainHistory: false,
      signaling: { p: "gun", s: { mqtt: "wss://test.mosquitto.org:8081/mqtt", gun: "wss://try.axe.eco/gun" } },
    });

    expect(parseProviderStorage(saved).signaling).toEqual({
      p: "gun",
      s: { mqtt: "wss://test.mosquitto.org:8081/mqtt" },
    });
  });
});
