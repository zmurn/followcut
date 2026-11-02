import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';

/**
 * The production build promises that the app cannot talk to the network.
 * The CSP is a real gate, not a slogan: default-src 'none' blocks fetch,
 * XHR, beacons, remote fonts, remote images and everything else.
 * The dev server needs its own websocket allowance for HMR.
 */
function cspPlugin(): Plugin {
  return {
    name: 'followcut-csp',
    transformIndexHtml(html, ctx) {
      const dev = Boolean(ctx.server);
      const csp = dev
        ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws:; frame-src https://www.instagram.com; base-uri 'self'; form-action 'none'"
        : "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; frame-src https://www.instagram.com; base-uri 'none'; form-action 'none'";
      return html.replace('__CSP__', csp);
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), cspPlugin()],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100 * 1024 * 1024,
    sourcemap: false,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'FollowCut',
        entryFileNames: 'assets/app.js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
});
