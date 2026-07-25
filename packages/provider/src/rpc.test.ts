import { RequestFailedError } from "@openlv/session";
import { Provider, RpcResponse } from "ox";
import { describe, expect, test } from "vitest";

import { createWalletRpcClient, jsonRpcRequest } from "./rpc.js";

const respondWith = (response: unknown) => createWalletRpcClient(async () => response);

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

  test.each([
    ["a bare result", ["0x1"]],
    ["no jsonrpc member", { ["id"]: 1, result: "0x1" }],
    ["jsonrpc 1.0", { jsonrpc: "1.0", ["id"]: 1, result: "0x1" }],
    ["another request's id", { jsonrpc: "2.0", ["id"]: 2, result: "0x1" }],
    ["neither result nor error", { jsonrpc: "2.0", ["id"]: 1 }],
    ["both result and error", { jsonrpc: "2.0", ["id"]: 1, result: "0x1", error: { code: 4001, message: "no" } }],
    ["an error without a code", { jsonrpc: "2.0", ["id"]: 1, error: { message: "no" } }],
  ])("rejects a response with %s", async (_name, response) => {
    await expect(respondWith(response).call({ method: "eth_chainId" })).rejects.toThrow(
      "expected { jsonrpc: \"2.0\", id, result | error }",
    );
  });

  test("keeps a returned 4001 for connect, getAccounts and request alike", async () => {
    const rpc = createWalletRpcClient(async (payload) => {
      const requestIdentifier = jsonRpcRequest.parse(payload)["id"];

      return {
        jsonrpc: "2.0",
        ["id"]: requestIdentifier,
        error: { code: 4001, message: "User Rejected Request" },
      };
    });

    await expect(rpc.call({ method: "eth_accounts" })).rejects.toBeInstanceOf(
      Provider.UserRejectedRequestError,
    );
    await expect(
      Provider.from({ request: async () => await rpc.call({ method: "eth_accounts" }) })
        .request({ method: "eth_accounts" }),
    ).rejects.toMatchObject({ code: 4001 });
  });

  test("turns a failed request into a generic internal error", async () => {
    const rpc = createWalletRpcClient(async () => {
      throw new RequestFailedError();
    });

    await expect(rpc.call({ method: "personal_sign", params: ["0x1", "0x2"] })).rejects.toMatchObject({
      code: -32_603,
      message: "Internal error",
    });
    await expect(rpc.call({ method: "eth_accounts" })).rejects.toBeInstanceOf(RpcResponse.InternalError);
  });
});
