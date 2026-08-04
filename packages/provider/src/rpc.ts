import type { JsonValue } from "@openlv/transport";
import { RpcResponse } from "ox";
import type * as RpcSchema_ox from "ox/RpcSchema";
import { z } from "zod";

export type RpcSchema = RpcSchema_ox.Eth | RpcSchema_ox.Wallet;

const jsonRpcIdentifier = z.union([z.number(), z.string(), z.null()]);
const jsonRpcResult = z.unknown().refine(value => value !== undefined);
const jsonRpcError = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});

const jsonRpcResponse = z.union([
  z.object({
    jsonrpc: z.literal("2.0"),
    ["id"]: z.number(),
    result: jsonRpcResult,
  }),
  z.object({
    jsonrpc: z.literal("2.0"),
    ["id"]: z.number(),
    error: jsonRpcError,
  }),
]);

export const jsonRpcRequest = z.object({ ["id"]: jsonRpcIdentifier }).passthrough();
export const decodeJsonRpcResponse = (
  payload: JsonValue,
  requestIdentifier: number,
): unknown => {
  const parsed = jsonRpcResponse.safeParse(payload);

  if (!parsed.success || parsed.data["id"] !== requestIdentifier) {
    throw new Error("Invalid JSON-RPC response from wallet");
  }

  if ("error" in parsed.data) {
    throw RpcResponse.parseError(parsed.data.error);
  }

  return parsed.data.result;
};

export const createJsonRpcRequestEncoder = () => {
  let nextRequestIdentifier = 0;

  return (request: object) => {
    const requestIdentifier = ++nextRequestIdentifier;

    return {
      requestIdentifier,
      payload: {
        ...request,
        jsonrpc: "2.0",
        ["id"]: requestIdentifier,
      } satisfies JsonValue,
    };
  };
};
