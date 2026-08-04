import { describe, expect, test } from "vitest";

import { createWalletRpcClient } from "./rpc.js";

describe("createWalletRpcClient", () => {
  test("encodes a request and decodes its correlated result", async () => {
    const sent: unknown[] = [];
    const rpc = createWalletRpcClient(async (payload) => {
      sent.push(payload);

      return { jsonrpc: "2.0", ["id"]: 1, result: ["0x1"] };
    });

    await expect(
      rpc.call({ method: "eth_accounts" }),
    ).resolves.toEqual(["0x1"]);
    expect(sent).toEqual([
      { jsonrpc: "2.0", ["id"]: 1, method: "eth_accounts" },
    ]);
  });

  test("rejects a response whose JSON-RPC id does not match", async () => {
    const rpc = createWalletRpcClient(async () => ({
      jsonrpc: "2.0",
      ["id"]: 2,
      result: null,
    }));

    await expect(rpc.call({ method: "eth_chainId" })).rejects.toThrow(
      "Invalid JSON-RPC response from wallet",
    );
  });
});
