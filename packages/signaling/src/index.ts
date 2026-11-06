import { createScope, make, type Observable, observable } from "@openlv/core";
import type { AcceptedPeer, Cipher, KeyPair, PublicKey } from "@openlv/core/encryption";
import {
  acceptPeer,
  createPeerCipher,
  hashPublicKey,
  parsePublicKey,
  toBase64,
} from "@openlv/core/encryption";
import { EventEmitter } from "eventemitter3";
import { match } from "ts-pattern";

import {
  composeFrame,
  HANDSHAKE_RESEND_INTERVAL_MS,
  HANDSHAKE_TIMEOUT_MS,
  parseFrame,
  type SignalingPrefix,
  XR_H_PREFIX,
  XR_PREFIX,
} from "./handshake.js";
import {
  parseSignalMessage,
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
  handshakeCipher?: Cipher;
  keyPair: KeyPair;
  // Existing peer identity used to resume a saved connection.
  resume?: boolean;
  peerKey?: PublicKey;
  // Our capabilities, advertised to the peer during the handshake.
  capabilities: PeerCapabilities;
};

export type Peer = {
  peerKey: PublicKey;
  cipher: Cipher;
};

export type SignalingContext = {
  type: string;

  send: (message: object) => Promise<void>;
  setup: () => Promise<void>;
  teardown: () => Promise<void>;
  markTransportConnected: () => void;
  resume?: () => Promise<void>;
  setResumeHandler?: (handler: () => Promise<void>) => void;

  status: Observable<Status>;
  peer: Observable<Peer | undefined>;
  peerCapabilities: Observable<PeerCapabilities | undefined>;
};
export type SignalingLayer = EventEmitter<SignalEventMap> & SignalingContext;
export type SignalingLayerFunction = (
  hooks: SignalingHooks,
) => Promise<SignalingLayer>;

const noResumeHandler = async () => {};

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
    capabilities,
    h,
    handshakeCipher,
    keyPair,
    isHost,
    resume = false,
    peerKey,
  } = hooks;

  const [status, setStatus] = observable<Status>(Status.STANDBY);
  const [peer, setPeer] = observable<Peer | undefined>(
    resume && peerKey
      ? { peerKey, cipher: await createPeerCipher(keyPair, peerKey) }
      : undefined,
  );
  const [peerCapabilities, setPeerCapabilities] = observable<PeerCapabilities | undefined>(undefined);

  const emitter = new EventEmitter<SignalEventMap>();
  const scope = createScope();
  let resumeTimer: ReturnType<typeof setInterval> | undefined;
  let resumeDeadline: ReturnType<typeof setTimeout> | undefined;
  let isTransportConnected = false;
  let finishResumeAttempt: ((error?: Error) => void) | undefined;
  let resumeHandler: () => Promise<void> = noResumeHandler;
  let pendingPeerResume: Promise<void> | undefined;

  const clearResumeTimers = () => {
    clearInterval(resumeTimer);
    clearTimeout(resumeDeadline);
    resumeTimer = undefined;
    resumeDeadline = undefined;
  };
  scope.add(clearResumeTimers);

  scope.add(() => {
    const finishResume = finishResumeAttempt;

    finishResumeAttempt = undefined;
    finishResume?.(new Error("Session closed during resume"));
  });

  scope.add(channel.teardown);

  const handshake = scope.child();

  handshake.closeWhen(status, value => value === Status.ENCRYPTED || value === Status.ERROR);

  const publish = async (prefix: SignalingPrefix, message: SignalMessage) => {
    const cipher = prefix === XR_H_PREFIX ? handshakeCipher : peer.get()?.cipher;

    if (!cipher) throw new Error("Cannot encrypt message before keys are exchanged");

    const ciphertext = await cipher.encrypt(JSON.stringify(message));

    await channel.publish(composeFrame(prefix, isHost ? "c" : "h", ciphertext));
  };

  const enterStep = (from: Status, next: Status, prefix: SignalingPrefix, message: SignalMessage, nextPeer = peer.get()) => {
    if (status.get() !== from) return;

    setPeer(nextPeer);
    setStatus(next);

    const step = handshake.child();

    step.closeWhen(status, value => value !== next);
    step.repeat(HANDSHAKE_RESEND_INTERVAL_MS, () => publish(prefix, message));
  };

  const capabilitiesMessage = (): SignalMessage => ({
    type: "capabilities",
    payload: capabilities,
    timestamp: Date.now(),
  });
  const pubkeyMessage = (): SignalMessage => ({
    type: "pubkey",
    payload: { publicKey: toBase64(keyPair.publicKey) },
    timestamp: Date.now(),
  });

  const handleHandshakeFrame = async (message: SignalMessage) => {
    await match({ msg: message, status: status.get(), isHost })
      .with({ msg: { type: "flash" }, status: Status.READY, isHost: true }, async () => {
        handshake.timeout(HANDSHAKE_TIMEOUT_MS, () => setStatus(Status.ERROR));
        enterStep(Status.READY, Status.HANDSHAKE, XR_H_PREFIX, pubkeyMessage());
      })
      .with({ msg: { type: "pubkey" }, status: Status.HANDSHAKE, isHost: false }, async ({ msg: { payload: messagePayload } }) => {
        const peerKey = parsePublicKey(messagePayload.publicKey);

        if (!peerKey || await hashPublicKey(peerKey) !== h) {
          setStatus(Status.ERROR);
          log("Received host public key is malformed or does not match expected hash -- possible tampering");

          return;
        }

        const cipher = await createPeerCipher(keyPair, peerKey);

        enterStep(Status.HANDSHAKE, Status.HANDSHAKE_PARTIAL, XR_PREFIX, pubkeyMessage(), { peerKey, cipher });
      })
      .otherwise(() => {
        log("Ignoring handshake frame", message.type, "in status", status.get());
      });
  };

  /**
   * The host has no peer key yet when the joining peer's `pubkey` arrives, so
   * the key in the frame is the only one it can check the announced key against.
   */
  const handleAcceptedPeer = async ({ peerKey, cipher, message }: AcceptedPeer) => {
    const signalMessage = parseSignalMessage(message);

    if (!isHost || status.get() !== Status.HANDSHAKE || signalMessage?.type !== "pubkey") {
      log("Ignoring first peer-key frame in status", status.get());

      return;
    }

    if (signalMessage.payload.publicKey !== toBase64(peerKey)) {
      log("Ignoring pubkey that differs from the frame key");

      return;
    }

    enterStep(Status.HANDSHAKE, Status.HANDSHAKE_PARTIAL, XR_PREFIX, capabilitiesMessage(), { peerKey, cipher });
  };

  const handleEncryptedFrame = async (message: SignalMessage) => {
    if (
      message.type === "capabilities"
      && (
        resume
        || finishResumeAttempt !== undefined
        || isTransportConnected
        || pendingPeerResume !== undefined
      )
    ) {
      const shouldRestartTransport = !resume && isTransportConnected;

      await setPeerCapabilities(message.payload);

      const finishResume = finishResumeAttempt;

      finishResumeAttempt = undefined;

      finishResume?.();

      clearResumeTimers();

      if (status.get() !== Status.ENCRYPTED) setStatus(Status.ENCRYPTED);

      if (shouldRestartTransport) {
        isTransportConnected = false;
        pendingPeerResume = resumeHandler();
      }

      const peerResume = pendingPeerResume;

      if (peerResume) {
        try {
          await peerResume;
        }
        finally {
          if (pendingPeerResume === peerResume) pendingPeerResume = undefined;
        }
      }

      if (isHost) await publish(XR_PREFIX, capabilitiesMessage());

      return;
    }

    await match({ msg: message, status: status.get(), isHost })
      .with(
        { msg: { type: "capabilities" }, status: Status.HANDSHAKE_PARTIAL },
        async ({ msg: { payload: messagePayload } }) => {
          await setPeerCapabilities(messagePayload);
          setStatus(Status.ENCRYPTED);

          if (isHost) return;

          return await publish(XR_PREFIX, capabilitiesMessage());
        },
      )
      .with(
        { msg: { type: "capabilities" }, status: Status.ENCRYPTED, isHost: false },
        async () => await publish(XR_PREFIX, capabilitiesMessage()),
      )
      .with({ msg: { type: "data" }, status: Status.ENCRYPTED }, async () => {
        emitter.emit("message", message.payload as object);
      })
      .otherwise(() => {
        log("Ignoring encrypted frame", message.type, "in status", status.get());
      });
  };

  const onReceive = async (frame: string) => {
    if (status.get() === Status.ERROR) return;

    try {
      const parsed = parseFrame(frame);

      if (parsed?.recipient !== (isHost ? "h" : "c")) return;

      const { prefix, ciphertext } = parsed;

      if (prefix === XR_H_PREFIX) {
        if (resume || !handshakeCipher) return;

        const message = parseSignalMessage(await handshakeCipher.decrypt(ciphertext));

        if (message) await handleHandshakeFrame(message);

        return;
      }

      const current = peer.get();

      if (!current) return await handleAcceptedPeer(await acceptPeer(keyPair, ciphertext));

      const message = parseSignalMessage(await current.cipher.decrypt(ciphertext));

      if (message) await handleEncryptedFrame(message);
    }
    catch (error) {
      log("Dropping undecryptable or malformed frame", error);
    }
  };

  const setup = async () => {
    if (resume && !peerKey) throw new Error("Cannot resume signaling without a peer key");

    setStatus(Status.CONNECTING);
    await channel.setup();
    await channel.subscribe(onReceive);

    setStatus(Status.READY);

    if (resume) {
      // Fail both roles if the matching peer never returns. Without this,
      // provider restoration waits forever before transport setup begins.
      resumeDeadline = setTimeout(() => {
        clearResumeTimers();
        setStatus(Status.ERROR);
        const finishResume = finishResumeAttempt;
        finishResumeAttempt = undefined;
        finishResume?.(new Error("Timed out resuming session"));
        void scope.close()
          .catch(error => log("failed to tear down timed-out resume signaling", error));
      }, 45_000);

      if (!isHost) {
        resumeTimer = setInterval(() => {
          void publish(XR_PREFIX, capabilitiesMessage())
            .catch(error => log("failed to re-advertise resume capabilities", error));
        }, 2000);
        try {
          await publish(XR_PREFIX, capabilitiesMessage());
        }
        catch (error) {
          log("initial resume capabilities publish failed; retrying", error);
        }
      }

      return;
    }

    if (!isHost) {
      handshake.timeout(HANDSHAKE_TIMEOUT_MS, () => setStatus(Status.ERROR));
      enterStep(Status.READY, Status.HANDSHAKE, XR_H_PREFIX, { type: "flash", payload: {}, timestamp: Date.now() });
    }
  };

  return make(emitter, {
    type: channel.type,
    setup,
    teardown: () => scope.close(),
    send: (message: object) => publish(XR_PREFIX, { type: "data", payload: message, timestamp: Date.now() }),
    markTransportConnected() {
      isTransportConnected = true;
    },
    async resume() {
      clearResumeTimers();
      isTransportConnected = false;

      return new Promise<void>((resolve, reject) => {
        finishResumeAttempt = (error) => {
          if (error) reject(error);
          else resolve();
        };
        resumeDeadline = setTimeout(() => {
          clearResumeTimers();
          setStatus(Status.ERROR);

          const finishResume = finishResumeAttempt;

          finishResumeAttempt = undefined;
          finishResume?.(new Error("Timed out resuming session"));
          void scope.close()
            .catch(error => log("failed to tear down interrupted signaling", error));
        }, 45_000);
        resumeTimer = setInterval(() => {
          void publish(XR_PREFIX, capabilitiesMessage())
            .catch(error => log("failed to advertise interrupted session", error));
        }, 2000);
        void publish(XR_PREFIX, capabilitiesMessage()).catch((error: unknown) => {
          clearResumeTimers();
          finishResumeAttempt?.(
            error instanceof Error ? error : new Error("Failed to advertise session resume"),
          );
          finishResumeAttempt = undefined;
        });
      });
    },
    setResumeHandler(handler: () => Promise<void>) {
      resumeHandler = handler;
    },
    status,
    peer,
    peerCapabilities,
  });
};
