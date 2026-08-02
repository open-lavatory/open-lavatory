export type SessionMessage
  = | SessionMessageRequest
    | SessionMessageResponse
    | SessionMessageAck;

export type SessionMessageRequest = {
  type: "request";
  messageId: string;
  payload: object | string;
};

export type SessionMessageResponse = {
  type: "response";
  messageId: string;
  payload: object | string;
};

export type SessionMessageAck = {
  type: "ack";
  messageId: string;
};
