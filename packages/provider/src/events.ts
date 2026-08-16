import type { Session } from "@openlv/session";

export type EventMessage = { foo: "bar"; };

export type ProviderEvents = {
  session_started: (session: Session) => void;
};
