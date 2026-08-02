import type { TransportPayload } from "@openlv/transport";

export type SessionPayload = TransportPayload;

export type SessionMessage
  = | SessionMessageRequest
    | SessionMessageResponse
    | SessionMessageAck;

export type SessionMessageRequest = {
  type: "request";
  messageId: string;
  payload: SessionPayload;
};

export type SessionMessageResponse = {
  type: "response";
  messageId: string;
  payload: SessionPayload;
};

export type SessionMessageAck = {
  type: "ack";
  messageId: string;
};
