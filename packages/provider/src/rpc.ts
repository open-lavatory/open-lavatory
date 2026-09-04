import type { JsonValue } from "@openlv/transport";
import { RpcResponse } from "ox";
import type * as RpcSchema_ox from "ox/RpcSchema";
import { z } from "zod";

export type RpcSchema = RpcSchema_ox.Eth | RpcSchema_ox.Wallet;

type WalletRpcCall = <methodName extends RpcSchema_ox.MethodNameGeneric<RpcSchema>>(
  request: RpcSchema_ox.ExtractRequest<RpcSchema, methodName>,
) => Promise<RpcSchema_ox.ExtractReturnType<RpcSchema, methodName>>;

const jsonRpcIdentifier = z.union([z.number(), z.string(), z.null()]);

export const jsonRpcRequest = z.looseObject({ ["id"]: jsonRpcIdentifier });

const encode = (request: object, requestIdentifier: number) => ({
  ...request,
  jsonrpc: "2.0",
  ["id"]: requestIdentifier,
} satisfies JsonValue);

const decode = (payload: JsonValue, requestIdentifier: number): JsonValue => {
  const parsed = jsonRpcRequest.safeParse(payload);

  if (!parsed.success || parsed.data["id"] !== requestIdentifier) {
    throw new Error("Invalid JSON-RPC response from wallet");
  }

  return RpcResponse.parse(payload);
};

/** Send a 1193 request to the wallet as JSON-RPC and decode the correlated response. */
export const createWalletRpcClient = (
  send: (payload: JsonValue) => Promise<JsonValue>,
): {
  call: WalletRpcCall;
} => {
  let nextRequestIdentifier = 0;

  const call: WalletRpcCall = async (request) => {
    const requestIdentifier = ++nextRequestIdentifier;
    const response = await send(encode(request, requestIdentifier));

    return decode(response, requestIdentifier) as never;
  };

  return { call };
};
