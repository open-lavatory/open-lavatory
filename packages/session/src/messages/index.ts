export type SessionMessage
  = | SessionMessageRequest
    | SessionMessageResponse
    | SessionMessageAck
    | SessionMessageFailed
    | SessionMessageClose;

export type SessionMessageRequest = {
  type: "request";
  messageId: string;
  payload: unknown;
};

export type SessionMessageResponse = {
  type: "response";
  messageId: string;
  payload: unknown;
};

export type SessionMessageAck = {
  type: "ack";
  messageId: string;
};

/** The request's handler threw; carries no detail on purpose. */
export type SessionMessageFailed = {
  type: "failed";
  messageId: string;
};

export type SessionMessageClose = {
  type: "close";
};

export const isSessionMessage = (message: object): message is SessionMessage => {
  if (!("type" in message) || typeof message.type !== "string") return false;

  if (message.type === "close") return true;

  if (!("messageId" in message) || typeof message.messageId !== "string") return false;

  return message.type === "ack"
    || message.type === "failed"
    || ((message.type === "request" || message.type === "response") && "payload" in message);
};
