"use client";

import "./ConnectionDemo.css";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { FiLock, FiPause, FiPlay, FiServer } from "react-icons/fi";

import { Dapp, Feed, Wallet } from "./ConnectionDemoScreens.js";
import {
  buildTimeline,
  MEASURED,
  type Packet,
  type Scene,
  type Side,
  type Timeline,
} from "./connectionDemoTimeline.js";

const SPEEDS = {
  "0.02x": { slowdown: 50, next: "0.1x" },
  "0.1x": { slowdown: 10, next: "1x" },
  "1x": { slowdown: 1, next: "0.02x" },
} as const;

type Speed = keyof typeof SPEEDS;

const SUMMARY = "An animation of one openlv session. The dApp opens the openlv modal and generates a QR code, "
  + "which creates keys and subscribes to a public relay. The wallet scans the code and subscribes to the same relay. "
  + "Five encrypted handshake packets and the WebRTC offer, answer and candidates go through the relay. "
  + "The relay cannot read them, but it sees the session id, the sender, the size and the time of each packet, "
  + "and the IP address of each peer. "
  + `In the recorded sessions, the direct WebRTC channel opened a median ${MEASURED.connected} ms after the scan. `
  + "The dApp then requests the account and a signature of \"Hello, world!\" over the direct channel, "
  + "and the wallet approves both.";

/**
 * Lane geometry in fractions: `u` runs from the dApp (0) to the wallet (1),
 * `v` across the lane. Phones stack the peers, which turns the lane on its
 * side, so CSS swaps the axes there. On desktop the message feed sits in the
 * lane under `direct`.
 */
const LANE = {
  relay: { u: 0.5, v: 0.16 },
  relayEdge: 0.4,
  direct: 0.6,
};

/** Demo ms a line stays lit after a packet, so sub-frame hops still show. */
const LIT_MS = 120;

/** Packets slower than this (demo ms) are drawn as moving dots. */
const MIN_VISIBLE_FLIGHT_MS = 60;

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);

    update();
    query.addEventListener("change", update);

    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
};

/** Point on the relayed path, `p` from 0 (sender) to 1 (receiver). */
const relayPoint = (from: Side, p: number) => {
  const start = from === "dapp" ? 0 : 1;
  const isToRelay = p < 0.5;
  const k = (isToRelay ? p : p - 0.5) / 0.5;
  const [u0, v0, u1, v1] = isToRelay
    ? [start, LANE.relayEdge, LANE.relay.u, LANE.relay.v]
    : [LANE.relay.u, LANE.relay.v, 1 - start, LANE.relayEdge];

  return { u: u0 + (u1 - u0) * k, v: v0 + (v1 - v0) * k };
};

/** Which lines carry a packet at `time`. */
const litLines = (packets: Packet[], time: number) => {
  const lit = { dapp: false, wallet: false, direct: false };

  for (const packet of packets) {
    if (time < packet.sentAt) continue;

    if (packet.route === "direct") {
      if (time < Math.max(packet.arrivedAt, packet.sentAt + LIT_MS)) lit.direct = true;

      continue;
    }

    const middle = (packet.sentAt + packet.arrivedAt) / 2;
    const to: Side = packet.from === "dapp" ? "wallet" : "dapp";

    if (time < Math.max(middle, packet.sentAt + LIT_MS)) lit[packet.from] = true;

    if (time >= middle && time < Math.max(packet.arrivedAt, middle + LIT_MS)) lit[to] = true;
  }

  return lit;
};

const point = (u: number, v: number): CSSProperties => ({ "--u": u, "--v": v } as CSSProperties);

const Lane = ({ timeline, scene, time, reducedMotion }: {
  timeline: Timeline;
  scene: Scene;
  time: number;
  reducedMotion: boolean;
}) => {
  const lit = litLines(timeline.packets, time);
  // A peer's line comes on while it subscribes, before the dApp shows the QR
  // code or the wallet starts the handshake.
  const isDappSubscribing = scene.modal === "connecting";
  const isWalletSubscribing = scene.wallet === "connecting" && !scene.onRelay.wallet;
  const onRelay = {
    dapp: scene.onRelay.dapp || isDappSubscribing,
    wallet: scene.onRelay.wallet || isWalletSubscribing,
  };
  const flying = reducedMotion
    ? []
    : timeline.packets.filter(packet => packet.arrivedAt - packet.sentAt >= MIN_VISIBLE_FLIGHT_MS
      && time >= packet.sentAt
      && time < packet.arrivedAt);
  const lines = (isVertical: boolean) => {
    const xy = (u: number, v: number) => (isVertical ? `${v * 100},${u * 100}` : `${u * 100},${v * 100}`);

    return (
      <svg
        className={`lv-demo__lines lv-demo__lines--${isVertical ? "vertical" : "horizontal"}`}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <polyline
          className="lv-demo__line lv-demo__line--relay"
          data-on={onRelay.dapp}
          data-lit={lit.dapp || isDappSubscribing}
          points={`${xy(0, LANE.relayEdge)} ${xy(LANE.relay.u, LANE.relay.v)}`}
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          className="lv-demo__line lv-demo__line--relay"
          data-on={onRelay.wallet}
          data-lit={lit.wallet || isWalletSubscribing}
          points={`${xy(LANE.relay.u, LANE.relay.v)} ${xy(1, LANE.relayEdge)}`}
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          className="lv-demo__line lv-demo__line--direct"
          data-on={scene.direct}
          data-lit={lit.direct}
          points={`${xy(0, LANE.direct)} ${xy(1, LANE.direct)}`}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  };

  return (
    <div className="lv-demo__lane">
      {lines(false)}
      {lines(true)}
      <span
        className="lv-demo__relay"
        data-on={onRelay.dapp || onRelay.wallet}
        data-idle={scene.direct}
        style={point(LANE.relay.u, LANE.relay.v)}
      >
        <FiServer />
      </span>
      <span className="lv-demo__lock" data-on={scene.direct} style={point(0.5, LANE.direct)}>
        <FiLock />
      </span>
      {flying.map((packet) => {
        const p = (time - packet.sentAt) / (packet.arrivedAt - packet.sentAt);
        const at = packet.route === "relay"
          ? relayPoint(packet.from, p)
          : { u: packet.from === "dapp" ? p : 1 - p, v: LANE.direct };

        return (
          <span
            key={`${packet.sentAt}-${packet.label}`}
            className={`lv-demo__packet lv-demo__packet--${packet.route}`}
            style={point(at.u, at.v)}
          />
        );
      })}
    </div>
  );
};

export const ConnectionDemo = () => {
  const [speed, setSpeed] = useState<Speed>("0.1x");
  const timeline = useMemo(() => buildTimeline(SPEEDS[speed].slowdown), [speed]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const root = useRef<HTMLElement>(null);
  const scene = timeline.sceneAt(time);

  // Reduced motion: no autoplay. Show the finished exchange (time past the
  // end) and let the visitor press Play, which starts from the top, or pick a
  // step.
  useEffect(() => {
    if (!reducedMotion) return;

    setPlaying(false);
    setTime(Infinity);
  }, [reducedMotion]);

  useEffect(() => {
    const element = root.current;

    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false));

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;

    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      // A background tab pauses frames; resume where it stopped.
      const delta = Math.min(now - last, 100);

      last = now;
      setTime(previous => (Math.min(previous, timeline.duration) + delta) % timeline.duration);
      frame = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(frame);
  }, [playing, visible, timeline]);

  const changeSpeed = () => {
    const nextSpeed = SPEEDS[speed].next;

    setSpeed(nextSpeed);
    setTime(buildTimeline(SPEEDS[nextSpeed].slowdown).timeAt(timeline.positionAt(time)));
  };

  return (
    <section className="lv-demo" aria-labelledby="lv-demo-title" data-playing={playing && visible} ref={root}>
      <h2 id="lv-demo-title">See it in action</h2>
      <p className="lv-demo__sr">{SUMMARY}</p>
      <div className="lv-demo__stage" aria-hidden="true">
        <Dapp scene={scene} />
        <Lane timeline={timeline} scene={scene} time={time} reducedMotion={reducedMotion} />
        <Feed packets={timeline.packets} time={time} />
        <Wallet scene={scene} />
      </div>
      <div className="lv-demo__controls">
        <button
          type="button"
          className="lv-demo__play"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => setPlaying(value => !value)}
        >
          {playing ? <FiPause /> : <FiPlay />}
        </button>
        <ol className="lv-demo__steps" aria-label="Steps">
          {timeline.steps.map((step, index) => {
            const end = timeline.steps[index + 1]?.at ?? timeline.duration;
            const fill = Math.min(Math.max((time - step.at) / (end - step.at), 0), 1);

            return (
              <li key={step.name}>
                <button
                  type="button"
                  className="lv-demo__step"
                  aria-current={scene.step === step.name ? "step" : undefined}
                  style={{ "--fill": fill } as CSSProperties}
                  onClick={() => setTime(step.at)}
                >
                  <span className="lv-demo__step-label">{step.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" className="lv-demo__speed" aria-label={`Speed ${speed}`} onClick={changeSpeed}>
          {speed}
        </button>
      </div>
    </section>
  );
};
