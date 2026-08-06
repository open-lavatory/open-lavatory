import { defineConfig } from "vocs/config";

export default defineConfig({
  title: "openlv",
  titleTemplate: "%s - openlv",
  description:
    "Secure peer-to-peer JSON-RPC connectivity between dApps and wallets",
  rootDir: ".",
  srcDir: ".",
  editLink: {
    pattern:
      "https://github.com/open-lavatory/open-lavatory/edit/master/docs/pages/:path",
    text: "Suggest changes to this page",
  },
  sidebar: [
    {
      text: "How it works",
      link: "/how",
    },
    {
      text: "Try it out",
      link: "/try",
    },
    {
      text: "FAQ",
      link: "/faq",
    },
    {
      text: "Apps",
      items: [
        {
          text: "Getting Started",
          link: "/getting-started",
        },
        {
          text: "Configuration",
          link: "/guides/configuration",
        },
        {
          text: "Theming",
          link: "/guides/theme",
        },
      ],
    },
    {
      text: "Wallets",
      items: [
        {
          text: "Introduction",
          link: "/wallets",
        },
        {
          text: "Mobile Wallets",
          link: "/wallets/react-native",
        },
        {
          text: "Migrating from WalletConnect",
          link: "/wallets/migrate",
        },
      ],
    },
    {
      text: "API",
      items: [
        {
          text: "Introduction",
          link: "/api/intro",
        },
        {
          text: "URI Specification",
          link: "/api/uri",
        },
        {
          text: "Handshake Protocol",
          link: "/api/handshake",
        },
        {
          text: "Establishing a link",
          link: "/api/session",
        },
        {
          text: "Signaling",
          link: "/api/signaling",
          items: [
            {
              text: "MQTT",
              link: "/api/signaling/mqtt",
            },
            {
              text: "Ntfy",
              link: "/api/signaling/ntfy",
            },
            {
              text: "Gun",
              link: "/api/signaling/gun",
            },
          ],
        },
        {
          text: "Transport",
          link: "/api/transport",
          items: [
            {
              text: "WebRTC",
              link: "/api/transport/webrtc",
            },
          ],
        },
        {
          text: "Connector",
          link: "/api/connector",
        },
        {
          text: "Provider",
          link: "/api/provider",
        },
      ],
    },
  ],
  topNav: [
    {
      text: "Docs",
      link: "/getting-started",
      match: path => !(path.startsWith("specs") || path === "/"),
    },
    {
      text: "GitHub",
      link: "https://github.com/open-lavatory/open-lavatory",
    },
  ],
  socials: [
    {
      icon: "github",
      link: "https://github.com/open-lavatory/open-lavatory",
    },
  ],
  banner: {
    content: "OpenLV is still under active development.",
    dismissable: false,
  },
  iconUrl: {
    dark: "/openlavatory_dark.png",
    light: "/openlavatory.png",
  },
  logoUrl: {
    dark: "/openlv_logo_dark.svg",
    light: "/openlv_logo_light.svg",
  },
  ogImageUrl: "https://openlv.sh/openlv_banner.png",
  accentColor: "#fe7d37",
  basePath: "/",
  renderStrategy: "full-static",
  showAskAi: false,
  mcp: {
    enabled: false,
  },
});
