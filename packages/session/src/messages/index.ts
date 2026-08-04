import type { JsonValue } from "@openlv/transport";

export type SessionMessage
  = | SessionMessageRequest
    | SessionMessageResponse
    | SessionMessageAck;

export type SessionMessageRequest = {
  type: "request";
  messageId: string;
  payload: JsonValue;
};

export type SessionMessageResponse = {
  type: "response";
  messageId: string;
  payload: JsonValue;
};

export type SessionMessageAck = {
  type: "ack";
  messageId: string;
};
