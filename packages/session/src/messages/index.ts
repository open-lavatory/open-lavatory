export type SessionMessage =
  | SessionMessageRequest
  | SessionMessageResponse
  | SessionMessageAck
  | SessionMessageClose;

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

export type SessionMessageClose = {
  type: "close";
  messageId: string;
};
