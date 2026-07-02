export class OpenLVError extends Error {
  override name = "OpenLVError";
}

export class SignalNoConnectionError extends OpenLVError {
  override name = "SignalNoConnectionError";

  constructor() {
    super("Signaling connection is not established");
  }
}
