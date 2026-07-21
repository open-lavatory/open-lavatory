import { match } from "ts-pattern";

import {
  createTransportBase,
  type Transport,
  type TransportMessage,
} from "../index.js";
import { log } from "../utils/log.js";

export type WebRTCConfig = {
  iceServers?: RTCConfiguration["iceServers"];
};

// Deliberately STUN-only: TURN relays all traffic through a third party, so
// operators should opt in explicitly with their own infrastructure.
// (The previously bundled openrelay.metered.ca TURN service is discontinued.)
const defaultConfig: WebRTCConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.services.mozilla.com:3478" },
    {
      urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443"],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

export const webrtc: Transport = (
  config: WebRTCConfig = defaultConfig,
) => {
  const { iceServers = defaultConfig.iceServers } = config;

  return createTransportBase(({ emitter, isHost }) => {
    const rtcConfig: RTCConfiguration = { iceServers };
    let connection: RTCPeerConnection | undefined;
    let channel: RTCDataChannel | undefined;
    // Candidates can arrive over signaling before the offer/answer has been
    // applied; addIceCandidate would reject, so they are buffered until a
    // remote description exists.
    let pendingCandidates: RTCIceCandidateInit[] = [];

    const flushPendingCandidates = async () => {
      const queued = pendingCandidates;

      pendingCandidates = [];

      for (const candidate of queued) {
        await connection?.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    const onConnectionStateChange = () => {
      const state = connection?.connectionState;

      log("onConnectionStateChange", state);

      match(state)
        // "disconnected" is transient and may recover on its own; only
        // "failed"/"closed" are terminal.
        .with("failed", () => emitter.emit("error", "WebRTC connection failed"))
        .with("closed", () => emitter.emit("error", "WebRTC connection closed"))
        .otherwise(() => {});
    };
    let localCandidates = 0;

    const onIceCandidate = (c: RTCPeerConnectionIceEvent) => {
      if (channel?.readyState === "open") return;

      // End-of-candidates (null) needs no relay; the peer simply stops
      // receiving candidates.
      if (!c.candidate) return;

      localCandidates += 1;
      log("local ICE candidate", c.candidate.type, c.candidate.protocol);
      emitter.emit("candidate", JSON.stringify(c.candidate.toJSON()));
    };
    const onIceGatheringStateChange = () => {
      log("iceGatheringState", connection?.iceGatheringState);

      if (connection?.iceGatheringState === "complete" && localCandidates === 0) {
        // Deliberately not debug-gated: without a single local candidate the
        // connection can never establish, and the cause is environmental
        // (blocked UDP, no usable interface, unreachable STUN/TURN).
        console.warn(
          "[openlv] WebRTC gathered zero local ICE candidates — "
          + "the peer-to-peer connection cannot establish. "
          + "Check network/UDP access or configure reachable STUN/TURN servers.",
        );
        emitter.emit("error", "no local ICE candidates");
      }
    };
    const onDataChannel = (e: RTCDataChannelEvent) => {
      channel = e.channel;
      hookChannel(channel);
      log("onDataChannel");
    };
    const onDataChannelOpen = () => {
      log("onDataChannelOpen");
      emitter.emit("connected");
    };
    const onDataChannelMessage = (e: MessageEvent<string>) => {
      emitter.emit("message", e.data);
    };
    const onDataChannelClose = () => {
      emitter.emit("error", "Data channel closed");
    };
    const onNegotiationNeeded = async () => {
      log("onNegotiationNeeded");

      if (isHost && connection) {
        await connection.setLocalDescription();

        if (connection.localDescription)
          emitter.emit("offer", JSON.stringify(connection.localDescription));
      }
    };

    const hookChannel = (channel: RTCDataChannel) => {
      channel.addEventListener("open", onDataChannelOpen);
      channel.addEventListener("message", onDataChannelMessage);
      channel.addEventListener("close", onDataChannelClose);
    };

    const handle = async (message: TransportMessage): Promise<void> => {
      log("webrtc handle", message.type);

      if (!connection) throw new Error("Connection not found");

      return match(message)
        .with({ type: "offer" }, async ({ payload }) => {
          const offer = JSON.parse(payload) as RTCSessionDescriptionInit;

          await connection!.setRemoteDescription(
            new RTCSessionDescription(offer),
          );
          await flushPendingCandidates();

          const answer = await connection!.createAnswer();

          await connection!.setLocalDescription(answer);
          emitter.emit("answer", JSON.stringify(answer));
        })
        .with({ type: "answer" }, async ({ payload }) => {
          const answer = JSON.parse(payload) as RTCSessionDescriptionInit;

          await connection!.setRemoteDescription(
            new RTCSessionDescription(answer),
          );
          await flushPendingCandidates();
        })
        .with({ type: "candidate" }, async ({ payload }) => {
          if (!payload) return;

          const candidate = JSON.parse(payload) as RTCIceCandidateInit;

          if (!connection!.remoteDescription) {
            log("buffering remote ICE candidate until remote description is set");
            pendingCandidates.push(candidate);

            return;
          }

          log("applying remote ICE candidate");
          await connection!.addIceCandidate(new RTCIceCandidate(candidate));
        })
        .otherwise(() => {
          log("received unknown transport message type", message);
        });
    };

    const send = async (message: string) => {
      if (!channel) throw new Error("Channel not found");

      channel.send(message);
    };

    return {
      type: "webrtc",
      async setup() {
        log("webrtc setup");

        connection = new RTCPeerConnection(rtcConfig);
        connection.onconnectionstatechange = onConnectionStateChange;
        connection.onicecandidate = onIceCandidate;
        connection.onicegatheringstatechange = onIceGatheringStateChange;
        connection.ondatachannel = onDataChannel;
        connection.onnegotiationneeded = onNegotiationNeeded;

        if (isHost) {
          channel = connection.createDataChannel("openlv-data");
          hookChannel(channel);
        }
      },
      teardown() {
        log("webrtc teardown");
        pendingCandidates = [];

        if (channel) {
          // Detach the close listener first: a deliberate teardown must not
          // surface as a transport error.
          channel.removeEventListener("close", onDataChannelClose);
          channel.close();
          channel = undefined;
        }

        if (connection) {
          connection.onconnectionstatechange = null;
          connection.close();
          connection = undefined;
        }
      },
      handle,
      send,
    };
  });
};
