import { RequestFailedError } from "@openlv/session";
import { Provider, RpcResponse } from "ox";
import type * as RpcSchema_ox from "ox/RpcSchema";
import { z } from "zod";

export type RpcSchema = RpcSchema_ox.Eth | RpcSchema_ox.Wallet;

type WalletRpcCall = <methodName extends RpcSchema_ox.MethodNameGeneric<RpcSchema>>(
  request: RpcSchema_ox.ExtractRequest<RpcSchema, methodName>,
) => Promise<RpcSchema_ox.ExtractReturnType<RpcSchema, methodName>>;

const jsonRpcIdentifier = z.union([z.number(), z.string(), z.null()]);

export const jsonRpcRequest = z.looseObject({ ["id"]: jsonRpcIdentifier });

const chainId = z.templateLiteral(["0x", z.string().regex(/^[\dA-Fa-f]+$/)]);
const accounts = z.array(z.templateLiteral(["0x", z.string().regex(/^[\dA-Fa-f]{40}$/)]));
const notification = z.object({ jsonrpc: z.literal("2.0"), ["id"]: z.never().optional() });

export const walletNotification = z.discriminatedUnion("method", [
  notification.extend({ method: z.literal("accountsChanged"), params: z.tuple([accounts]) }),
  notification.extend({ method: z.literal("chainChanged"), params: z.tuple([chainId]) }),
]);

const jsonRpcResponse = z.looseObject({
  jsonrpc: z.literal("2.0"),
  ["id"]: jsonRpcIdentifier,
  result: z.unknown().optional(),
  error: z.looseObject({
    code: z.number().int(),
    message: z.string(),
    data: z.unknown().optional(),
  }).optional(),
}).refine(response => "result" in response !== "error" in response);

const encode = (request: object, requestIdentifier: number) => ({
  ...request,
  jsonrpc: "2.0",
  ["id"]: requestIdentifier,
});

const decode = (payload: unknown, requestIdentifier: number): unknown => {
  const parsed = jsonRpcResponse.safeParse(payload);

  if (!parsed.success || parsed.data["id"] !== requestIdentifier) {
    throw new Error(
      "Invalid JSON-RPC response from wallet: expected { jsonrpc: \"2.0\", id, result | error }",
    );
  }

  if (parsed.data.error) throw Provider.parseError(parsed.data.error);

  return parsed.data.result;
};

export const createWalletRpcClient = (
  send: (payload: unknown) => Promise<unknown>,
): {
  call: WalletRpcCall;
} => {
  let nextRequestIdentifier = 0;

  const call: WalletRpcCall = async (request) => {
    const requestIdentifier = ++nextRequestIdentifier;
    let response: unknown;

    try {
      response = await send(encode(request, requestIdentifier));
    }
    catch (error) {
      // The wallet's handler threw. The session carries no detail, so the
      // caller sees a plain JSON-RPC internal error.
      if (error instanceof RequestFailedError) {
        throw new RpcResponse.InternalError({ message: "Internal error" });
      }

      throw error;
    }

    // The wallet is untrusted, so the schema's return type is the EIP-1193
    // contract, not something the validation above proves.
    return decode(response, requestIdentifier) as RpcSchema_ox.ExtractReturnType<
      RpcSchema,
      typeof request.method
    >;
  };

  return { call };
};
