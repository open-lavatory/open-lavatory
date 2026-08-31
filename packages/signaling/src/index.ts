import {
  createRepeater,
  createScope,
  createTimeout,
  make,
  type Observable,
  observable,
} from "@openlv/core";
import type { EncryptionKey, SymmetricKey } from "@openlv/core/encryption";
import { parseEncryptionKey, validatePublicKeyHash } from "@openlv/core/encryption";
import { EventEmitter } from "eventemitter3";
import { match } from "ts-pattern";

import {
  handshake,
  HANDSHAKE_RESEND_INTERVAL_MS,
  HANDSHAKE_TIMEOUT_MS,
  XR_H_PREFIX,
  XR_PREFIX,
} from "./handshake.js";
import {
  type PeerCapabilities,
  type SignalMessage,
} from "./messages.js";
import type { SignalingChannel } from "./protocol.js";
import { log } from "./utils/log.js";

export * from "./messages.js";
export * from "./protocol.js";

export const Status = {
  STANDBY: "standby",
  CONNECTING: "connecting",
  READY: "ready",
  HANDSHAKE: "handshake",
  HANDSHAKE_PARTIAL: "handshake-partial",
  ENCRYPTED: "encrypted",
  ERROR: "error",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export type SignalEventMap = {
  message: (message: object) => void;
};

export type SignalingHooks = {
  isHost: boolean;
  h: string;
  k: SymmetricKey;
  // Our capabilities, advertised to the peer during the handshake
  capabilities: PeerCapabilities;
  // Decrypt using our private key
  decrypt: (message: string) => Promise<string>;
  // Encrypt to relying party
  encrypt: (message: string) => Promise<string>;
  // our public key
  publicKey: EncryptionKey;
  canEncrypt: () => boolean;
};

export type SignalingContext = {
  type: string;

  // Sending only works once keys are exchanged
  send: (message: object) => Promise<void>;
  setup: () => Promise<void>;
  teardown: () => Promise<void>;

  status: Observable<Status>;
  peerKey: Observable<EncryptionKey | undefined>;
  peerCapabilities: Observable<PeerCapabilities | undefined>;
};
export type SignalingLayer = EventEmitter<SignalEventMap> & SignalingContext;
export type SignalingLayerFunction = (
  hooks: SignalingHooks,
) => Promise<SignalingLayer>;

export type CreateSignalingLayerFunction = (
  base: SignalingChannel,
) => SignalingLayerFunction;

/**
 * Base Signaling Layer implementation
 *
 * https://openlv.sh/api/signaling
 */
export const createSignalingLayer: CreateSignalingLayerFunction = channel => async (hooks: SignalingHooks) => {
  const {
    canEncrypt,
    encrypt,
    decrypt,
    capabilities,
    h,
    k: handshakeKey,
    publicKey,
    isHost,
  } = hooks;

  const [status, setStatus] = observable<Status>(Status.STANDBY);
  const [peerKey, setPeerKey] = observable<EncryptionKey | undefined>(undefined);
  const [peerCapabilities, setPeerCapabilities] = observable<PeerCapabilities | undefined>(undefined);

  const acceptPeerKey = (key: EncryptionKey) => {
    if (peerKey.get() !== undefined) return false;

    setStatus(Status.HANDSHAKE_PARTIAL);

    return setPeerKey(key);
  };

  const emitter = new EventEmitter<SignalEventMap>();

  const { frame, parse } = handshake({
    isHost,
    handshakeKey,
    encrypt,
    decrypt,
  });

  const send = async (method: "handshake" | "encrypted", payload: SignalMessage) => await channel.publish(await frame(method, payload));

  let repeatingFrame: () => Promise<void> = async () => {};
  const resend = createRepeater(
    () => repeatingFrame(),
    HANDSHAKE_RESEND_INTERVAL_MS,
    (error: unknown) => log("handshake send failed, will retry", error),
  );
  const deadline = createTimeout();

  let connection: {
    scope: ReturnType<typeof createScope>;
    handshakeScope: ReturnType<typeof createScope>;
  } | undefined;

  const sendRepeating = (method: "handshake" | "encrypted", payload: SignalMessage) => {
    repeatingFrame = () => send(method, payload);

    return resend.start();
  };

  const startHandshakeDeadline = () => {
    deadline.schedule(() => {
      if (status.get() === Status.ENCRYPTED) return;

      log("handshake timed out");
      void connection?.handshakeScope.close()
        .catch(error => log("failed to clean up timed-out handshake", error));
      setStatus(Status.ERROR);
    }, HANDSHAKE_TIMEOUT_MS);
  };

  const capabilitiesMessage = (): SignalMessage => ({
    type: "capabilities",
    payload: capabilities,
    timestamp: Date.now(),
  });
  const pubkeyMessage = (): SignalMessage => ({
    type: "pubkey",
    payload: { publicKey: publicKey.toString() },
    timestamp: Date.now(),
  });

  const handleHandshakeFrame = async (message: SignalMessage) => {
    await match({ msg: message, status: status.get(), isHost })
      .with({ msg: { type: "flash" }, status: Status.READY, isHost: true }, async () => {
        setStatus(Status.HANDSHAKE);
        startHandshakeDeadline();
        await sendRepeating("handshake", pubkeyMessage());
      })
      .with({ msg: { type: "pubkey" }, status: Status.HANDSHAKE, isHost: false }, async ({ msg: { payload: messagePayload } }) => {
        let receivedKey: EncryptionKey;

        try {
          receivedKey = await parseEncryptionKey(messagePayload.publicKey);

          if (!await validatePublicKeyHash(receivedKey, h)) {
            await connection?.handshakeScope.close();
            setStatus(Status.ERROR);
            log("Received host public key does not match expected hash -- possible tampering");

            return;
          }
        }
        catch {
          await connection?.handshakeScope.close();
          setStatus(Status.ERROR);
          log("Failed to parse received host public key");

          return;
        }

        if (!acceptPeerKey(receivedKey)) return;

        return await sendRepeating("encrypted", pubkeyMessage());
      })
      .otherwise(() => {
        log("Ignoring handshake frame", message.type, "in status", status.get());
      });
  };

  const handleEncryptedFrame = async (message: SignalMessage) => {
    await match({ msg: message, status: status.get(), isHost })
      // Host: client responded with its public key.
      .with(
        { msg: { type: "pubkey" }, isHost: true, status: Status.HANDSHAKE },
        async ({ msg: { payload: messagePayload } }) => {
          const receivedKey = await parseEncryptionKey(messagePayload.publicKey);

          if (!acceptPeerKey(receivedKey)) return;

          return await sendRepeating("encrypted", capabilitiesMessage());
        },
      )
      .with(
        { msg: { type: "capabilities" }, status: Status.HANDSHAKE_PARTIAL },
        async ({ msg: { payload: messagePayload } }) => {
          await setPeerCapabilities(messagePayload);
          await connection?.handshakeScope.close();
          setStatus(Status.ENCRYPTED);

          if (isHost) return;

          return await send("encrypted", capabilitiesMessage());
        },
      )
      // Client already encrypted, but the host is still re-sending its
      // capabilities (our final packet was lost): answer again so the host
      // can finish.
      .with(
        { msg: { type: "capabilities" }, status: Status.ENCRYPTED, isHost: false },
        async () => await send("encrypted", capabilitiesMessage()),
      )
      .with({ msg: { type: "data" }, status: Status.ENCRYPTED }, async () => {
        emitter.emit("message", message.payload as object);
      })
      .otherwise(() => {
        log("Ignoring encrypted frame", message.type, "in status", status.get());
      });
  };

  const onReceive = async (payload: string) => {
    try {
      const parsed = await parse(payload);

      if (!parsed) return;

      const [stage, message] = parsed;

      if (stage === XR_H_PREFIX && message) return await handleHandshakeFrame(message);

      if (stage === XR_PREFIX && message) return await handleEncryptedFrame(message);

      log("Dropping frame with unknown prefix");
    }
    catch (error) {
      log("Dropping undecryptable or malformed frame", error);
    }
  };

  const setup = async () => {
    const scope = createScope();
    const handshakeScope = createScope();
    const nextConnection = { scope, handshakeScope };

    handshakeScope.add([resend.stop, deadline.cancel]);
    scope.add([
      handshakeScope.close,
      channel.teardown,
      () => {
        if (connection === nextConnection) connection = undefined;
      },
    ]);
    connection = nextConnection;

    try {
      setStatus(Status.CONNECTING);
      await channel.setup();
      const unsubscribe = await channel.subscribe(onReceive);

      if (unsubscribe !== undefined) scope.add(unsubscribe);

      if (canEncrypt()) {
        await handshakeScope.close();
        setStatus(Status.ENCRYPTED);

        return;
      }

      setStatus(Status.READY);

      if (!isHost) {
        // Enter HANDSHAKE before publishing: the host's pubkey reply can
        // arrive while the publish is still in flight.
        setStatus(Status.HANDSHAKE);
        startHandshakeDeadline();
        await sendRepeating("handshake", {
          type: "flash",
          payload: {},
          timestamp: Date.now(),
        });
      }
    }
    catch (error) {
      await scope.close();
      throw error;
    }
  };

  const teardown = () => {
    log("teardown");

    return connection?.scope.close() ?? Promise.resolve();
  };

  return make(emitter, {
    type: channel.type,
    setup,
    teardown,
    send(message: object) {
      if (!canEncrypt()) {
        return Promise.reject(
          new Error("Cannot encrypt message before keys are exchanged"),
        );
      }

      return send("encrypted", {
        type: "data",
        payload: message,
        timestamp: Date.now(),
      });
    },
    status,
    peerKey,
    peerCapabilities,
  });
};
