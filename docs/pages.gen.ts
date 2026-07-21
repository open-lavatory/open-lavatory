// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages } from 'waku/router'

// prettier-ignore
type Page =
  | { path: '/api/connector'; render: 'static' }
  | { path: '/api/handshake'; render: 'static' }
  | { path: '/api/intro'; render: 'static' }
  | { path: '/api/provider'; render: 'static' }
  | { path: '/api/session'; render: 'static' }
  | { path: '/api/signaling/gun'; render: 'static' }
  | { path: '/api/signaling'; render: 'static' }
  | { path: '/api/signaling/mqtt'; render: 'static' }
  | { path: '/api/signaling/ntfy'; render: 'static' }
  | { path: '/api/transport'; render: 'static' }
  | { path: '/api/transport/webrtc'; render: 'static' }
  | { path: '/api/uri'; render: 'static' }
  | { path: '/faq'; render: 'static' }
  | { path: '/getting-started'; render: 'static' }
  | { path: '/guides/configuration'; render: 'static' }
  | { path: '/guides/theme'; render: 'static' }
  | { path: '/how'; render: 'static' }
  | { path: '/'; render: 'static' }
  | { path: '/try'; render: 'static' }
  | { path: '/wallets'; render: 'static' }
  | { path: '/wallets/migrate'; render: 'static' }
  | { path: '/wallets/react-native'; render: 'static' }

// prettier-ignore
declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>
  }
  interface CreatePagesConfig {
    pages: Page
  }
}
