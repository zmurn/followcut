#!/usr/bin/env node
/**
 * Optional local phone handoff server.
 *
 * This is NOT a cloud service and NOT the default architecture. It runs on your
 * computer, serves the same single-file app over your local network, holds a
 * normalized session in memory for ten minutes, and lets a phone pick it up by
 * scanning a QR code. Nothing is written to disk and nothing leaves the LAN.
 *
 * The standalone dist/index.html remains strict `default-src 'none'`. Only pages
 * served by this companion get a same-origin `connect-src` for the handoff API.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import QRCode from 'qrcode';

const PORT = Number(process.env.PORT || 4173);
const BIND = process.env.HOST || '0.0.0.0';
const TTL_MS = Number(process.env.HANDOFF_TTL_MS || 10 * 60 * 1000);
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000);
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_SESSIONS = 20;
const DIST = resolve(process.cwd(), 'dist', 'index.html');

let appHtml;
try {
  appHtml = readFileSync(DIST, 'utf8');
} catch {
  console.error('FOLLOW/CUT: dist/index.html is missing. Run `npm run build` first.');
  process.exit(1);
}
if (!appHtml.includes('FOLLOW/CUT') || !appHtml.includes('<div id="app"></div>')) {
  console.error('FOLLOW/CUT: dist/index.html does not look like the built app. Run `npm run build` again.');
  process.exit(1);
}

function lanCandidates() {
  const out = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses || []) {
      if ((address.family === 'IPv4' || address.family === 4) && !address.internal) {
        out.push({ name, address: address.address });
      }
    }
  }
  const score = item => {
    if (/^en0$|^en1$|^eth0$|^wlan0$/i.test(item.name)) return 0;
    if (/^192\.168\./.test(item.address)) return 1;
    if (/^10\./.test(item.address)) return 2;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(item.address)) return 3;
    if (/^169\.254\./.test(item.address)) return 9;
    return 5;
  };
  return out.sort((a, b) => score(a) - score(b) || a.address.localeCompare(b.address));
}

const candidates = lanCandidates();
const lanIp = process.env.PUBLIC_HOST || candidates[0]?.address || null;
const baseHost = lanIp || 'localhost';
const baseUrl = `http://${baseHost}:${PORT}`;
const sessions = new Map();

function touchSession(session) {
  // The QR code itself is short-lived; once a phone (or the computer) opens
  // the code, keep the live sync session for the longer working window.
  session.expiresAt = Date.now() + SESSION_TTL_MS;
}

const SHARE_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src https://www.instagram.com; base-uri 'none'; form-action 'none'";

function sharePage(payloadBase64) {
  let html = appHtml;
  const before = html;
  html = html.replace(
    /<meta http-equiv="Content-Security-Policy" content="[^"]*"\s*\/?>/,
    () => `<meta http-equiv="Content-Security-Policy" content="${SHARE_CSP}" />`
  );
  if (html === before) throw new Error('Could not replace the CSP in the built app.');
  const flag = payloadBase64
    ? `<script>window.__FOLLOWCUT_SHARE_MODE__=true;window.__FOLLOWCUT_HANDOFF__=${JSON.stringify(payloadBase64)};</script>\n`
    : '<script>window.__FOLLOWCUT_SHARE_MODE__=true;</script>\n';
  const marker = '<script>\n';
  if (!html.includes(marker)) throw new Error('Could not find the app script to inject the handoff.');
  html = html.replace(marker, () => `${flag}${marker}`);
  return html;
}

function headers(res, type, extra = {}) {
  res.writeHead(200, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra
  });
}

function sendHtml(res, html, status = 200, noStore = false) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...(noStore ? { 'Cache-Control': 'no-store' } : {})
  });
  res.end(html);
}

function sendJson(res, status, value) {
  headers(res, 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function prune() {
  const now = Date.now();
  for (const [code, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(code);
  }
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
}

async function createHandoff(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    return sendJson(res, error.message === 'body_too_large' ? 413 : 400, { error: 'Could not read the handoff.' });
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return sendJson(res, 400, { error: 'The handoff was not valid JSON.' });
  }
  if (!parsed || parsed.format !== 'followcut-backup' || parsed.version !== 1) {
    return sendJson(res, 400, { error: 'The handoff was not a FOLLOW/CUT session backup.' });
  }
  prune();
  const code = randomBytes(18).toString('base64url');
  const expiresAt = Date.now() + TTL_MS;
  sessions.set(code, {
    payload: Buffer.from(body, 'utf8').toString('base64'),
    expiresAt,
    revision: 1,
    updatedAt: Date.now()
  });
  const url = `${baseUrl}/p/${code}`;
  let qr;
  try {
    qr = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 360,
      color: { dark: '#191712', light: '#fffcf6' }
    });
  } catch {
    sessions.delete(code);
    return sendJson(res, 500, { error: 'Could not render the QR code.' });
  }
  console.log(`Created a phone handoff (${Math.round(TTL_MS / 60000)} min, ${(body.length / 1024).toFixed(0)} kB normalized session).`);
  sendJson(res, 200, {
    code,
    url,
    qr,
    expiresAt,
    revision: 1,
    lanIp,
    warning: lanIp ? undefined : 'No LAN IPv4 address was detected. Connect this computer to Wi-Fi and restart the share server so the phone can reach it.'
  });
}

function expiredPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FOLLOW/CUT handoff expired</title><style>body{margin:0;background:#f4f0e7;color:#1a1813;font:18px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;display:grid;place-items:center;min-height:100dvh}a{color:#c23a13}main{max-width:34rem;padding:2rem}h1{font-size:2rem;line-height:1.1;letter-spacing:-.03em}p{color:#514b41}</style></head><body><main><h1>This phone handoff expired.</h1><p>On the computer, open the app, choose <strong>Continue on phone</strong>, and scan the new QR code.</p><p><a href="/">Open FOLLOW/CUT</a></p></main></body></html>`;
}

function isLocalPeer(raw) {
  const address = String(raw || '').replace(/^::ffff:/, '');
  if (address === '::1' || address === '127.0.0.1' || address.startsWith('127.')) return true;
  if (/^10\./.test(address) || /^192\.168\./.test(address) || /^169\.254\./.test(address)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(address) || /^fe80:/i.test(address)) return true;
  return false;
}

const server = createServer(async (req, res) => {
  try {
    if (!isLocalPeer(req.socket.remoteAddress)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('FOLLOW/CUT phone handoff is available only on the local network.');
      return;
    }
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (req.method === 'GET' && pathname === '/') {
      return sendHtml(res, sharePage(null), 200, true);
    }
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, sessions: sessions.size });
    }
    if (req.method === 'POST' && pathname === '/api/handoff') {
      return createHandoff(req, res);
    }
    const apiMatch = pathname.match(/^\/api\/handoff\/([^/]+)$/);
    if (apiMatch && (req.method === 'GET' || req.method === 'PUT')) {
      const code = apiMatch[1];
      const session = sessions.get(code);
      if (!session || session.expiresAt <= Date.now()) {
        if (session) sessions.delete(code);
        return sendJson(res, 410, { error: 'This live session expired. Create a new phone handoff on the computer.' });
      }
      touchSession(session);
      if (req.method === 'GET') {
        return sendJson(res, 200, {
          code,
          revision: session.revision,
          updatedAt: session.updatedAt,
          expiresAt: session.expiresAt,
          backup: Buffer.from(session.payload, 'base64').toString('utf8')
        });
      }
      let body;
      try {
        body = await readBody(req);
      } catch (error) {
        return sendJson(res, error.message === 'body_too_large' ? 413 : 400, { error: 'Could not read the live session update.' });
      }
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: 'The live update was not valid JSON.' });
      }
      if (!parsed || parsed.format !== 'followcut-backup' || parsed.version !== 1) {
        return sendJson(res, 400, { error: 'The live update was not a FOLLOW/CUT session.' });
      }
      session.payload = Buffer.from(body, 'utf8').toString('base64');
      session.revision += 1;
      session.updatedAt = Date.now();
      return sendJson(res, 200, {
        revision: session.revision,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt
      });
    }
    if (req.method === 'GET' && pathname.startsWith('/p/')) {
      const code = pathname.slice(3);
      const session = sessions.get(code);
      if (!session || session.expiresAt <= Date.now()) {
        if (session) sessions.delete(code);
        return sendHtml(res, expiredPage(), 410, true);
      }
      touchSession(session);
      console.log('A phone opened a live handoff.');
      return sendHtml(res, sharePage(session.payload), 200, true);
    }
    if (req.method === 'GET' && pathname === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }
    sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    console.error('Handoff error:', error instanceof Error ? error.message : error);
    if (!res.headersSent) sendJson(res, 500, { error: 'The handoff server hit an error.' });
    else res.end();
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`FOLLOW/CUT: port ${PORT} is already in use. Try PORT=4174 npm run share.`);
  } else {
    console.error('FOLLOW/CUT share server error:', error);
  }
  process.exit(1);
});

server.listen(PORT, BIND, () => {
  console.log('');
  console.log('FOLLOW/CUT phone handoff');
  console.log(`  On this computer:  http://localhost:${PORT}/`);
  if (lanIp) console.log(`  Local network:     ${baseUrl}/`);
  else console.log('  Local network:     no LAN IPv4 address found (connect to Wi-Fi, then restart)');
  if (candidates.length > 1) {
    console.log('  LAN addresses seen: ' + candidates.map(item => `${item.address} (${item.name})`).join(', '));
    if (process.env.PUBLIC_HOST) console.log(`  Using PUBLIC_HOST=${process.env.PUBLIC_HOST}`);
  }
  console.log('');
  console.log('  Open the computer URL, import or restore your session there,');
  console.log('  then click "Continue on phone" and scan the QR with your phone.');
  console.log('  Same trusted Wi-Fi only; non-local addresses are refused.');
  console.log('  QR handoff codes expire after ' + Math.round(TTL_MS / 60000) + ' minutes.');
  console.log('  Once opened, the live session stays for ' + Math.round(SESSION_TTL_MS / 3600000) + ' hours while this server runs.');
  console.log('  The server holds normalized session data in memory only; stop it with Ctrl+C.');
  console.log('');
});

setInterval(prune, 60_000).unref();

const shutdown = () => {
  console.log('\nClosing the phone handoff server. Any phone page already loaded keeps its local data.');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
