/**
 * The script behind the homepage connection demo.
 *
 * Network steps play at the speed of a real session. The numbers below are
 * medians of 10 sessions between two Chromium browser contexts over the
 * default relay (`wss://test.mosquitto.org:8081/mqtt`), driven by the
 * workspace `@openlv/session` and `@openlv/transport/webrtc` and timed from
 * their `OPENLV_DEBUG` logs and status changes. The relay was about 10 ms from
 * the browsers; a relay further away stretches every relay hop.
 *
 * Human steps (clicking, scanning, approving) have no real duration; they use
 * a pace that is easy to follow and are never slowed down.
 */

export type Side = "dapp" | "wallet";
export type Route = "relay" | "direct";
export type StepId = "connect" | "scan" | "handshake" | "webrtc" | "approve" | "sign";

export type ModalView
  = | "start"
    | "preparing"
    | "connecting"
    | "qr"
    | "establishing"
    | "connected";

export type DappView = "idle" | "requesting-accounts" | "account" | "requesting-signature" | "signed";

export type WalletView
  = | "idle"
    | "scanning"
    | "connecting"
    | "connected"
    | "approve-accounts"
    | "approve-signature"
    | "signed";

export type Press = "connect" | "generate" | "approve-accounts" | "sign" | "approve-signature";

export type Scene = {
  step: StepId;
  dapp: DappView;
  modal: ModalView | undefined;
  wallet: WalletView;
  /** Which peers hold a subscription on the relay. */
  onRelay: Record<Side, boolean>;
  direct: boolean;
  press: Press | undefined;
};

export type Packet = {
  label: string;
  from: Side;
  route: Route;
  /** Demo clock, ms. */
  sentAt: number;
  arrivedAt: number;
  /** Measured transit, ms. */
  transit: number;
};

export type Step = { name: StepId; label: string; at: number; };

export type Timeline = {
  /** 1 is real time; network steps take this many times longer. */
  slowdown: number;
  duration: number;
  steps: Step[];
  packets: Packet[];
  sceneAt: (t: number) => Scene;
  /**
   * Where `t` falls in the script, as a number that means the same moment at
   * every speed: the index of the human or network stretch plus how far into
   * it. `timeAt` turns it back into a time, so a speed change keeps the frame.
   */
  positionAt: (t: number) => number;
  timeAt: (position: number) => number;
};

/** ms after Generate QR. */
const DAPP_SETUP = { keys: 10, onRelay: 68 };

/**
 * ms after the wallet scanned the code. `sent` is the sender's publish,
 * `arrived` the receiver's handler.
 */
export const MEASURED = {
  walletKeys: 10,
  walletOnRelay: 68,
  relayed: [
    { label: "flash", from: "wallet", sent: 68, arrived: 80 },
    { label: "public key", from: "dapp", sent: 80, arrived: 91 },
    { label: "public key", from: "wallet", sent: 91, arrived: 106 },
    { label: "capabilities", from: "dapp", sent: 106, arrived: 120 },
    { label: "capabilities", from: "wallet", sent: 120, arrived: 135 },
    { label: "offer", from: "dapp", sent: 138, arrived: 152 },
    { label: "candidate", from: "dapp", sent: 140, arrived: 154 },
    { label: "candidate", from: "dapp", sent: 148, arrived: 162 },
    { label: "answer", from: "wallet", sent: 153, arrived: 168 },
    { label: "candidate", from: "wallet", sent: 156, arrived: 170 },
  ],
  /** The data channel opens on both sides. */
  connected: 171,
  /** One way over the data channel, half the measured request round trip. */
  direct: 2,
} as const satisfies {
  walletKeys: number;
  walletOnRelay: number;
  relayed: readonly { label: string; from: Side; sent: number; arrived: number; }[];
  connected: number;
  direct: number;
};

/** Pace of the human steps, ms. */
const HUMAN = {
  intro: 900,
  openModal: 1100,
  readQr: 1000,
  scan: 1100,
  showConnected: 1500,
  readRequest: 700,
  approve: 1300,
  reachForSign: 1000,
  hold: 3200,
  press: 180,
};

const INITIAL: Scene = {
  step: "connect",
  dapp: "idle",
  modal: undefined,
  wallet: "idle",
  onRelay: { dapp: false, wallet: false },
  direct: false,
  press: undefined,
};

export const STEP_LABELS: Record<StepId, string> = {
  connect: "Connect",
  scan: "Scan",
  handshake: "Handshake",
  webrtc: "WebRTC",
  approve: "Approve",
  sign: "Sign",
};

/**
 * Build the demo for a slowdown factor: 1 is real time, 10 plays every
 * network step ten times slower.
 */
export const buildTimeline = (slowdown: number): Timeline => {
  const cues: { at: number; patch: Partial<Scene>; }[] = [];
  const segments: { start: number; length: number; }[] = [];
  const packets: Packet[] = [];
  const steps: Step[] = [];
  let t = 0;
  let sinceScan = 0;

  /** Move the clock on by `length` demo ms. Human pauses use it unscaled. */
  const wait = (length: number) => {
    if (length > 0) segments.push({ start: t, length });

    t += length;
  };
  const network = (ms: number) => wait(ms * slowdown);
  /** Advance to `ms` after the scan on the measured clock. */
  const networkUntil = (ms: number) => {
    network(ms - sinceScan);
    sinceScan = ms;
  };
  const set = (patch: Partial<Scene>, at = t) => {
    cues.push({ at, patch });
  };
  const step = (name: StepId) => {
    steps.push({ name, label: STEP_LABELS[name], at: t });
    set({ step: name });
  };
  const press = (button: Press) => {
    set({ press: button });
    set({ press: undefined }, t + HUMAN.press);
  };
  const direct = (label: string, from: Side) => {
    const transit = MEASURED.direct;

    packets.push({ label, from, route: "direct", sentAt: t, arrivedAt: t + transit * slowdown, transit });
    network(transit);
  };

  step("connect");
  wait(HUMAN.intro);
  press("connect");
  set({ modal: "start" });
  wait(HUMAN.openModal);
  press("generate");
  set({ modal: "preparing" });
  set({ modal: "connecting" }, t + DAPP_SETUP.keys * slowdown);
  network(DAPP_SETUP.onRelay);
  set({ modal: "qr", onRelay: { dapp: true, wallet: false } });

  wait(HUMAN.readQr);
  step("scan");
  set({ wallet: "scanning" });
  wait(HUMAN.scan);

  const scannedAt = t;
  const at = (ms: number) => scannedAt + ms * slowdown;

  set({ wallet: "connecting" });
  set({ onRelay: { dapp: true, wallet: true } }, at(MEASURED.walletOnRelay));

  for (const hop of MEASURED.relayed) {
    packets.push({
      label: hop.label,
      from: hop.from,
      route: "relay",
      sentAt: at(hop.sent),
      arrivedAt: at(hop.arrived),
      transit: hop.arrived - hop.sent,
    });
  }

  const flash = MEASURED.relayed[0];
  const offer = MEASURED.relayed[5];

  networkUntil(flash.arrived);
  step("handshake");
  // The dApp's session goes to LINKING when the flash arrives.
  set({ modal: "establishing" });
  networkUntil(offer.sent);
  step("webrtc");

  networkUntil(MEASURED.connected);
  set({ direct: true, dapp: "requesting-accounts" });

  // These steps start when the request reaches the wallet, so a step button
  // lands on the prompt. The modal stays open until the wallet presses
  // Connect: that answer completes the openlv connection.
  direct("eth_requestAccounts", "dapp");
  step("approve");
  set({ wallet: "approve-accounts" });
  wait(HUMAN.readRequest + HUMAN.approve);
  press("approve-accounts");
  set({ wallet: "connected" });
  direct("accounts", "wallet");
  set({ modal: "connected" });
  wait(HUMAN.showConnected);
  set({ modal: undefined, dapp: "account" });

  wait(HUMAN.reachForSign);
  press("sign");
  set({ dapp: "requesting-signature" });
  direct("personal_sign", "dapp");
  step("sign");
  set({ wallet: "approve-signature" });
  wait(HUMAN.readRequest + HUMAN.approve);
  press("approve-signature");
  set({ wallet: "signed" });
  direct("signature", "wallet");
  set({ dapp: "signed" });
  wait(HUMAN.hold);

  cues.sort((a, b) => a.at - b.at);

  return {
    slowdown,
    duration: t,
    steps,
    packets,
    sceneAt: (time) => {
      let scene = INITIAL;

      for (const cue of cues) {
        if (cue.at > time) break;

        scene = { ...scene, ...cue.patch };
      }

      return scene;
    },
    positionAt: (time) => {
      const index = segments.findIndex(segment => time < segment.start + segment.length);
      const segment = segments[index];

      return segment ? index + (time - segment.start) / segment.length : segments.length;
    },
    timeAt: (position) => {
      const index = Math.floor(position);
      const segment = segments[index];

      return segment ? segment.start + (position - index) * segment.length : t;
    },
  };
};
