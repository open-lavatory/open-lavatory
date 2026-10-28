"use client";

/* The laptop running the dApp, the phone running the wallet and the message feed of the homepage connection demo. */

import type { ReactNode } from "react";
import { FiArrowLeft, FiArrowRight, FiCheck, FiX } from "react-icons/fi";

import type { DappView, ModalView, Packet, Scene } from "./connectionDemoTimeline.js";

const FEED_ROWS = 4;

const SIGNATURE = "0x7c1e...9b04";

/**
 * A decorative 21 by 21 QR-like pattern: three finder squares and seeded noise.
 * It is not a real code, so a visitor's wallet cannot scan it.
 */
const QR_PATH = (() => {
  const size = 21;
  const finders = [[0, 0], [size - 7, 0], [0, size - 7]];
  const cells: string[] = [];
  let seed = 0x2F_6A_91;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const finder = finders.find(([fx = 0, fy = 0]) => x >= fx - 1 && x <= fx + 7 && y >= fy - 1 && y <= fy + 7);
      let isOn: boolean;

      if (finder) {
        const [fx = 0, fy = 0] = finder;
        const ring = Math.max(Math.abs(x - fx - 3), Math.abs(y - fy - 3));

        isOn = ring === 3 || ring <= 1;
      }
      else {
        seed = (Math.imul(seed, 1_103_515_245) + 12_345) & 0x7F_FF_FF_FF;
        isOn = (seed >> 16) % 2 === 0;
      }

      if (isOn) cells.push(`M${x} ${y}h1v1h-1z`);
    }
  }

  return cells.join("");
})();

const Qr = () => (
  <svg className="lv-demo__qr" viewBox="-1 -1 23 23" shapeRendering="crispEdges">
    <path d={QR_PATH} />
  </svg>
);

const Spinner = () => <span className="lv-demo__spinner" />;

const Skeleton = ({ size }: { size: "short" | "mid" | "long"; }) => <span className={`lv-skel lv-skel--${size}`} />;

/** The example dApp's own logo, so openlv branding stays inside the openlv modal. */
const DappLogo = () => <span className="lv-demo__dapp-logo" />;

const Button = ({ children, pressed, primary, disabled, wide }: {
  children?: ReactNode;
  pressed?: boolean;
  primary?: boolean;
  disabled?: boolean;
  wide?: boolean;
}) => (
  <span
    className={`lv-demo__button${primary ? " lv-demo__button--primary" : ""}${wide ? " lv-demo__button--wide" : ""}`}
    data-pressed={pressed}
    data-disabled={disabled}
  >
    {children}
  </span>
);

const Account = () => (
  <span className="lv-demo__account">
    <span className="lv-demo__avatar" />
    <Skeleton size="short" />
  </span>
);

const WAITING_VIEWS: Partial<Record<ModalView, true>> = { preparing: true, connecting: true, establishing: true };

/**
 * The openlv modal (packages/modal) in its `openlv` theme, as a skeleton:
 * header with info and close, the body of the current view, and the footer
 * with the openlv logo and the status.
 */
const Modal = ({ scene }: { scene: Scene; }) => {
  const view = scene.modal;

  if (!view) return null;

  return (
    <div className="lv-demo__overlay">
      <div className="lv-modal">
        <div className="lv-modal__head">
          <span className="lv-modal__icon" />
          <span className="lv-modal__line lv-modal__line--title" />
          <FiX />
        </div>
        <div className="lv-modal__body">
          {view === "start" && (
            <>
              <span className="lv-modal__devices">
                <span className="lv-modal__tablet" />
                <span className="lv-modal__phone" />
              </span>
              <span className="lv-modal__line" />
              <span className="lv-modal__actions">
                <span className="lv-modal__primary" data-pressed={scene.press === "generate"}>Generate QR</span>
                <span className="lv-modal__square" />
              </span>
            </>
          )}
          {WAITING_VIEWS[view] && (
            <>
              <Spinner />
              <span className="lv-modal__line lv-modal__line--title" />
              <span className="lv-modal__line" />
            </>
          )}
          {view === "qr" && (
            <span className="lv-modal__card">
              <Qr />
              <span className="lv-modal__secondary" />
            </span>
          )}
          {view === "connected" && (
            <>
              <FiCheck className="lv-modal__done" />
              <span className="lv-modal__line lv-modal__line--title" />
            </>
          )}
        </div>
        <div className="lv-modal__foot">
          <img src="/icon.svg" alt="" width={12} height={12} />
          openlv
          <span className="lv-modal__status" data-on={view === "connected"} />
        </div>
      </div>
    </div>
  );
};

const CONNECTED_VIEWS: Partial<Record<DappView, true>> = { "account": true, "requesting-signature": true, "signed": true };

export const Dapp = ({ scene }: { scene: Scene; }) => {
  const isConnected = CONNECTED_VIEWS[scene.dapp] ?? false;

  return (
    <div className="lv-laptop lv-demo__dapp">
      <div className="lv-laptop__screen">
        <div className="lv-laptop__bar">
          <span className="lv-laptop__dots" />
          <Skeleton size="mid" />
        </div>
        <div className="lv-dapp">
          <div className="lv-dapp__nav">
            <DappLogo />
            <Skeleton size="short" />
            <span className="lv-dapp__spacer" />
            {isConnected
              ? <Account />
              : (
                  <Button primary pressed={scene.press === "connect"}>
                    {scene.dapp === "requesting-accounts" ? <Spinner /> : "Connect"}
                  </Button>
                )}
          </div>
          <div className="lv-dapp__body">
            <Skeleton size="long" />
            <Skeleton size="mid" />
            <div className="lv-dapp__card">
              <p className="lv-demo__message">Hello, world!</p>
              {scene.dapp === "signed"
                ? <code className="lv-dapp__signature">{SIGNATURE}</code>
                : (
                    <Button primary wide disabled={!isConnected} pressed={scene.press === "sign"}>
                      {scene.dapp === "requesting-signature" ? <Spinner /> : "Sign"}
                    </Button>
                  )}
            </div>
          </div>
          <Modal scene={scene} />
        </div>
      </div>
      <div className="lv-laptop__base" />
    </div>
  );
};

const Prompt = ({ accept, decline, children, pressed }: {
  accept: string;
  decline: string;
  children: ReactNode;
  pressed: boolean;
}) => (
  <div className="lv-phone__sheet">
    <DappLogo />
    {children}
    <div className="lv-phone__actions">
      <Button primary pressed={pressed}>{accept}</Button>
      <Button>{decline}</Button>
    </div>
  </div>
);

export const Wallet = ({ scene }: { scene: Scene; }) => {
  const view = scene.wallet;

  return (
    <div className="lv-phone lv-demo__wallet">
      <div className="lv-phone__screen">
        <span className="lv-phone__notch" />
        {(view === "idle" || view === "scanning") && (
          <div className="lv-phone__viewfinder" data-scanning={view === "scanning"}>
            {view === "scanning" && <Qr />}
            <span className="lv-phone__scanline" />
          </div>
        )}
        {view === "connecting" && <Spinner />}
        {(view === "connected" || view === "signed") && (
          <div className="lv-phone__status">
            <DappLogo />
            <span className="lv-phone__session">
              <span className="lv-phone__live" />
              <Skeleton size="short" />
            </span>
          </div>
        )}
        {view === "approve-accounts" && (
          <Prompt accept="Connect" decline="Dismiss" pressed={scene.press === "approve-accounts"}>
            <Account />
          </Prompt>
        )}
        {view === "approve-signature" && (
          <Prompt accept="Approve" decline="Reject" pressed={scene.press === "approve-signature"}>
            <p className="lv-demo__message">Sign</p>
            <p className="lv-phone__value">Hello, world!</p>
          </Prompt>
        )}
      </div>
    </div>
  );
};

export const Feed = ({ packets, time }: { packets: Packet[]; time: number; }) => {
  const arrived = packets.filter(packet => packet.arrivedAt <= time).slice(-FEED_ROWS);
  const empty = Array.from({ length: FEED_ROWS - arrived.length }, (_, index) => index);

  return (
    <ol className="lv-feed">
      {arrived.map(packet => (
        <li key={`${packet.sentAt}-${packet.label}`}>
          <span className={`lv-feed__route lv-feed__route--${packet.route}`} />
          {packet.from === "dapp" ? <FiArrowRight /> : <FiArrowLeft />}
          <code>{packet.label}</code>
        </li>
      ))}
      {empty.map(index => <li key={`empty-${index}`} />)}
    </ol>
  );
};
