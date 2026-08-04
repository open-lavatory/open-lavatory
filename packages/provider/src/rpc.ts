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
    ["id"]: jsonRpcIdentifier,
    result: jsonRpcResult,
  }),
  z.object({
    jsonrpc: z.literal("2.0"),
    ["id"]: jsonRpcIdentifier,
    error: jsonRpcError,
  }),
]);

export const jsonRpcRequest = z.looseObject({ ["id"]: jsonRpcIdentifier });
export const decodeJsonRpcResponse = <Result>(
  payload: JsonValue,
  // Will always be a number because provider generates the request ids only as numbers.
  requestIdentifier: number,
): Result => {
  const parsed = jsonRpcResponse.safeParse(payload);

  if (!parsed.success || parsed.data["id"] !== requestIdentifier) {
    throw new Error("Invalid JSON-RPC response from wallet");
  }

  if ("error" in parsed.data) {
    throw RpcResponse.parseError(parsed.data.error);
  }

  return RpcResponse.parse<unknown, Result>(payload);
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

/** Send a 1193 request to the wallet as JSON-RPC and decode the correlated response. */
export const createWalletRpcClient = (
  send: (payload: JsonValue) => Promise<JsonValue>,
): {
  call: <methodName extends RpcSchema_ox.MethodNameGeneric<RpcSchema>>(
    request: RpcSchema_ox.ExtractRequest<RpcSchema, methodName>,
  ) => Promise<RpcSchema_ox.ExtractReturnType<RpcSchema, methodName>>;
} => {
  const encodeRequest = createJsonRpcRequestEncoder();
  const call = async <methodName extends RpcSchema_ox.MethodNameGeneric<RpcSchema>>(
    request: RpcSchema_ox.ExtractRequest<RpcSchema, methodName>,
  ): Promise<RpcSchema_ox.ExtractReturnType<RpcSchema, methodName>> => {
    const { payload, requestIdentifier } = encodeRequest(request);
    const response = await send(payload);

    return decodeJsonRpcResponse<RpcSchema_ox.ExtractReturnType<RpcSchema, methodName>>(
      response,
      requestIdentifier,
    );
  };

  return { call };
};
