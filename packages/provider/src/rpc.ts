import type { JsonValue } from "@openlv/transport";
import { RpcResponse } from "ox";
import type * as RpcSchema_ox from "ox/RpcSchema";
import { z } from "zod";

export type RpcSchema = RpcSchema_ox.Eth | RpcSchema_ox.Wallet;

const jsonRpcIdentifier = z.union([z.number(), z.string(), z.null()]);

export const jsonRpcRequest = z.looseObject({ ["id"]: jsonRpcIdentifier });

/** Send a 1193 request to the wallet as JSON-RPC and decode the correlated response. */
export const createWalletRpcClient = (
  send: (payload: JsonValue) => Promise<JsonValue>,
): {
  call: <methodName extends RpcSchema_ox.MethodNameGeneric<RpcSchema>>(
    request: RpcSchema_ox.ExtractRequest<RpcSchema, methodName>,
  ) => Promise<RpcSchema_ox.ExtractReturnType<RpcSchema, methodName>>;
} => {
  let nextRequestIdentifier = 0;
  const encode = (request: object, requestIdentifier: number) => ({
    ...request,
    jsonrpc: "2.0",
    ["id"]: requestIdentifier,
  } satisfies JsonValue);
  const decode = <Result>(payload: JsonValue, requestIdentifier: number): Result => {
    const parsed = jsonRpcRequest.safeParse(payload);

    if (!parsed.success || parsed.data["id"] !== requestIdentifier) {
      throw new Error("Invalid JSON-RPC response from wallet");
    }

    return RpcResponse.parse<unknown, Result>(payload);
  };

  const call = async <methodName extends RpcSchema_ox.MethodNameGeneric<RpcSchema>>(
    request: RpcSchema_ox.ExtractRequest<RpcSchema, methodName>,
  ): Promise<RpcSchema_ox.ExtractReturnType<RpcSchema, methodName>> => {
    const requestIdentifier = ++nextRequestIdentifier;
    const response = await send(encode(request, requestIdentifier));

    return decode<
      RpcSchema_ox.ExtractReturnType<RpcSchema, methodName>
    >(response, requestIdentifier);
  };

  return { call };
};
