export {};

declare global {
  interface Window {
    /** Injected only by scripts/share-server.mjs. */
    __FOLLOWCUT_SHARE_MODE__?: boolean;
    /** Base64-encoded backup injected into the one-time phone page. */
    __FOLLOWCUT_HANDOFF__?: string;
  }
}
