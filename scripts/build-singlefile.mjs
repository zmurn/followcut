// Turn the Vite output into one self-contained HTML file that works from file://.
// The app is deliberately a single distributable: no server, no module imports,
// no service worker, no fetch. Inline the hashed CSS and JS, then remove the
// now-unused asset folder. Fails loudly if anything would still call the network.
import { readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve('dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');

const cssRe = /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/i;
const cssMatch = html.match(cssRe);
if (cssMatch) {
  const cssPath = join(dist, cssMatch[1].replace(/^\.\//, ''));
  const css = readFileSync(cssPath, 'utf8').replace(/<\/style/gi, '<\\/style');
  // Use a function replacement: minified JS contains `$&` / `$`` sequences that
  // String.replace would otherwise treat as replacement patterns.
  html = html.replace(cssMatch[0], () => `<style>\n${css}\n</style>`);
}

const jsRe = /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*><\/script>/i;
const jsMatch = html.match(jsRe);
if (!jsMatch) throw new Error('Single-file build: could not find the module script tag.');
const jsPath = join(dist, jsMatch[1].replace(/^\.\//, ''));
const js = readFileSync(jsPath, 'utf8').replace(/<\/script/gi, '<\\/script');
const inlineScript = `<script>\n${js}\n</script>`;

// Vite emits the built module script in <head>. A classic inline script executes
// immediately there, before #app exists, so move it to the end of <body>.
html = html.replace(jsMatch[0], () => '');

// Module preloads are meaningless in a single file and would be external.
html = html.replace(/<link[^>]+rel=["']modulepreload["'][^>]*>/gi, '');
html = html.replace(/\s+crossorigin(?=["'\s>])/gi, '');
html = html.replace('</head>', '  <!-- FOLLOW/CUT single-file build. Everything is inline by design. -->\n</head>');
html = html.replace(
  '<head>',
  '<head>\n  <!-- FOLLOW/CUT is MIT licensed. It includes Preact, MIT, Copyright (c) 2015-present Jason Miller, and adapted export-parser ideas from IG Cleanup Tool, MIT, Copyright (c) 2026 Mahmood Saeed. Full notices: THIRD_PARTY_NOTICES.md. -->'
);
html = html.replace('</body>', () => `  ${inlineScript}\n</body>`);

if (/<(script|link)[^>]+(src|href)=["']\.\/(assets|src)\//i.test(html)) {
  throw new Error('Single-file build: an external asset reference survived inlining.');
}
if (
  !/Content-Security-Policy/.test(html) ||
  !/default-src 'none'/.test(html) ||
  !/frame-src https:\/\/www\.instagram\.com/.test(html) ||
  /connect-src/.test(html)
) {
  throw new Error('Single-file build: production CSP is missing, not strict, or has an unexpected connect-src.');
}

writeFileSync(join(dist, 'index.html'), html);
rmSync(join(dist, 'assets'), { recursive: true, force: true });

const bytes = statSync(join(dist, 'index.html')).size;
console.log(`✓ dist/index.html — ${(bytes / 1024).toFixed(1)} kB, single file, CSP locked.`);
for (const entry of readdirSync(dist)) {
  if (entry !== 'index.html') console.log(`  note: dist/${entry} remains but is not required.`);
}
