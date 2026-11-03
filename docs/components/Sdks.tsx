"use client";

import "./Sdks.css";

import { useEffect, useState } from "react";
import { FiArrowUpRight, FiCheck, FiCopy } from "react-icons/fi";
import { SiDart, SiJavascript, SiReact, SiRust, SiTypescript } from "react-icons/si";

const MARKS = {
  typescript: SiTypescript,
  javascript: SiJavascript,
  react: SiReact,
  rust: SiRust,
  dart: SiDart,
};

type Sdk = {
  language: "typescript" | "react-native" | "rust" | "dart";
  name: string;
  marks: (keyof typeof MARKS)[];
  install: string;
  links: { label: string; href: string; }[];
};

const SDKS: Sdk[] = [
  {
    language: "typescript",
    name: "TypeScript / JavaScript",
    marks: ["typescript", "javascript"],
    install: "pnpm add @openlv/connector",
    links: [
      { label: "Docs", href: "/getting-started" },
      { label: "GitHub", href: "https://github.com/open-lavatory/open-lavatory" },
    ],
  },
  {
    language: "rust",
    name: "Rust",
    marks: ["rust"],
    install: "cargo add openlv",
    links: [{ label: "GitHub", href: "https://github.com/open-lavatory/openlv-rs" }],
  },
  {
    language: "react-native",
    name: "React Native",
    marks: ["react"],
    install: "pnpm add @openlv/react-native",
    links: [
      { label: "Docs", href: "/wallets/react-native" },
      { label: "GitHub", href: "https://github.com/open-lavatory/open-lavatory/tree/master/packages/react-native" },
    ],
  },
  {
    language: "dart",
    name: "Dart",
    marks: ["dart"],
    install: "dart pub add openlv",
    links: [
      { label: "pub.dev", href: "https://pub.dev/packages/openlv" },
      { label: "GitHub", href: "https://github.com/open-lavatory/openlv-dart" },
    ],
  },
];

const Install = ({ command }: { command: string; }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timeout = setTimeout(() => setCopied(false), 1500);

    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="lv-sdks__install">
      <code>{command}</code>
      <button
        type="button"
        aria-label={copied ? "Copied" : `Copy ${command}`}
        onClick={() => void navigator.clipboard.writeText(command).then(() => setCopied(true))}
      >
        {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
      </button>
    </div>
  );
};

export const Sdks = () => (
  <section className="lv-sdks" aria-labelledby="lv-sdks-title">
    <h2 id="lv-sdks-title">SDKs</h2>
    <ul className="lv-sdks__tiles">
      {SDKS.map(sdk => (
        <li key={sdk.language} className="lv-sdks__tile">
          <h3>
            <span className="lv-sdks__marks" aria-hidden="true">
              {sdk.marks.map((brand) => {
                const Icon = MARKS[brand];

                return <Icon key={brand} className={`lv-sdks__mark lv-sdks__mark--${brand}`} />;
              })}
            </span>
            {sdk.name}
          </h3>
          <Install command={sdk.install} />
          <ul className="lv-sdks__links">
            {sdk.links.map(link => (
              <li key={link.href}>
                <a href={link.href}>
                  {link.label}
                  {link.href.startsWith("https://") && <FiArrowUpRight aria-hidden="true" />}
                </a>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  </section>
);
