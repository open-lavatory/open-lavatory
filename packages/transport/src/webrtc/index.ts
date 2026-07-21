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

  return createTransportBase("wrtc", ({ emitter, isHost }) => {
    const rtcConfig: RTCConfiguration = { iceServers };
    let connection: RTCPeerConnection | undefined;
    let channel: RTCDataChannel | undefined;
    let ready = false;
    // Candidates can arrive over signaling before the offer/answer has been
    // applied; addIceCandidate would reject, so they are buffered until a
    // remote description exists.
    let pendingCandidates: RTCIceCandidateInit[] = [];
    let localCandidates = 0;

    const markReadyIfOpen = () => {
      if (ready || channel?.readyState !== "open") return;

      ready = true;
      emitter.emit("ready");
    };

    const flushPendingCandidates = async () => {
      const queued = pendingCandidates;

      pendingCandidates = [];

      for (const candidate of queued) {
        await connection?.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    const onConnectionStateChange = () => {
      // ICE and data-channel handlers own terminal error reporting; emitting
      // here too duplicates failure notifications for the same connection.
      log("onConnectionStateChange", connection?.connectionState);
    };
    const onIceConnectionStateChange = () => {
      const state = connection?.iceConnectionState;

      log("onIceConnectionStateChange", state);

      match(state)
        .with("closed", () => {
          ready = false;
          emitter.emit("error", "WebRTC ICE connection closed");
        })
        .with("failed", () => {
          ready = false;
          emitter.emit("error", "WebRTC ICE connection failed");
        })
        .otherwise(() => {});
    };
    const onIceCandidate = (c: RTCPeerConnectionIceEvent) => {
      if (channel?.readyState === "open") return;

      // End-of-candidates (null) needs no relay; the peer simply stops
      // receiving candidates.
      if (!c.candidate) return;

      localCandidates += 1;
      log("local ICE candidate", c.candidate.type, c.candidate.protocol);
      emitter.emit("negotiate", {
        type: "candidate",
        payload: JSON.stringify(c.candidate.toJSON()),
      });
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
      ready = false;
      hookChannel(channel);
      log("onDataChannel");
    };
    const onDataChannelOpen = () => {
      log("onDataChannelOpen");
      markReadyIfOpen();
    };
    const onDataChannelClose = () => {
      ready = false;
      emitter.emit("error", "Data channel closed");
    };
    const onDataChannelMessage = (e: MessageEvent<string>) => {
      emitter.emit("message", e.data);
    };
    const onNegotiationNeeded = async () => {
      log("onNegotiationNeeded");

      if (isHost && connection) {
        await connection.setLocalDescription();

        if (connection.localDescription) {
          emitter.emit("negotiate", {
            type: "offer",
            payload: JSON.stringify(connection.localDescription),
          });
        }
      }
    };

    const hookChannel = (channel: RTCDataChannel) => {
      channel.addEventListener("open", onDataChannelOpen);
      channel.addEventListener("message", onDataChannelMessage);
      channel.addEventListener("close", onDataChannelClose);
      markReadyIfOpen();
    };
    const unhookChannel = (channel: RTCDataChannel) => {
      channel.removeEventListener("open", onDataChannelOpen);
      channel.removeEventListener("message", onDataChannelMessage);
      channel.removeEventListener("close", onDataChannelClose);
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
          emitter.emit("negotiate", { type: "answer", payload: JSON.stringify(answer) });
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
      async setup() {
        log("webrtc setup");

        connection = new RTCPeerConnection(rtcConfig);
        connection.onconnectionstatechange = onConnectionStateChange;
        connection.oniceconnectionstatechange = onIceConnectionStateChange;
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

        ready = false;
        pendingCandidates = [];

        if (channel) {
          unhookChannel(channel);
          channel.close();
          channel = undefined;
        }

        if (connection) {
          connection.onconnectionstatechange = null;
          connection.oniceconnectionstatechange = null;
          connection.onicegatheringstatechange = null;
          connection.close();
          connection = undefined;
        }
      },
      handle,
      send,
    };
  });
};
