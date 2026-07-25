type Equal<A, B>
  = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

type Assert<T extends true> = T;

type UpstreamCreateSession = typeof import("@openlv/session").createSession;
type UpstreamConnectSession = typeof import("@openlv/session").connectSession;

type RNCreateSession = typeof import("../src/index.js").createSession;
type RNConnectSession = typeof import("../src/index.js").connectSession;

export type _createSessionParamsMatch = Assert<
  Equal<Parameters<RNCreateSession>, Parameters<UpstreamCreateSession>>
>;
export type _createSessionReturnMatch = Assert<
  Equal<ReturnType<RNCreateSession>, ReturnType<UpstreamCreateSession>>
>;

export type _connectSessionParamsMatch = Assert<
  Equal<Parameters<RNConnectSession>, Parameters<UpstreamConnectSession>>
>;
export type _connectSessionReturnMatch = Assert<
  Equal<ReturnType<RNConnectSession>, ReturnType<UpstreamConnectSession>>
>;
