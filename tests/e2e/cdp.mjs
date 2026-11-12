// Minimal Chrome DevTools Protocol driver (Node 22+ global WebSocket, no deps).
// Launches a throwaway headless Chrome with its own temporary profile.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function findChrome() {
  const found = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found || !existsSync(found)) {
    throw new Error('Google Chrome not found. Set CHROME_PATH to the Chrome or Chromium executable.');
  }
  return found;
}

export async function launch({ port = Number(process.env.E2E_CDP_PORT) || 9333 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'qk-e2e-chrome-'));
  const proc = spawn(findChrome(), [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    'about:blank',
  ], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 75; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      if (targets.some((t) => t.type === 'page')) break;
    } catch { /* not up yet */ }
    await delay(200);
  }
  const page = targets.find((t) => t.type === 'page');
  if (!page) {
    proc.kill();
    throw new Error(`Chrome did not start a debuggable page on port ${port}.`);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message}`)) : resolve(msg.result);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  const errors = [];
  listeners.push((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const requests = [];
  listeners.push((m) => { if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');

  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}\n  in: ${expression.slice(0, 200)}`);
    return r.result.value;
  }
  async function waitFor(expression, timeout = 10000, label = expression) {
    const t0 = Date.now();
    for (;;) {
      const v = await evaluate(expression).catch(() => null);
      if (v) return v;
      if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for: ${label}`);
      await delay(100);
    }
  }
  async function viewport(width, height, { mobile = true, dpr = 3 } = {}) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile, screenOrientation: width > height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
  }
  async function tap(x, y) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await delay(40);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await delay(60);
  }
  async function drag(x0, y0, x1, y1, steps = 8) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    for (let i = 1; i <= steps; i++) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, id: 1 }] });
      await delay(16);
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await delay(60);
  }
  async function pinch(cx, cy, d0, d1, steps = 10) {
    const pts = (d) => [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }];
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0) });
    for (let i = 1; i <= steps; i++) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 + ((d1 - d0) * i) / steps) });
      await delay(16);
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await delay(80);
  }
  async function click(selector) {
    const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
    if (!ok) throw new Error(`click: no element ${selector}`);
    await delay(50);
  }
  async function goto(url) {
    await send('Page.navigate', { url });
    await delay(300);
  }
  async function close() {
    try { await send('Browser.close'); } catch { /* closed */ }
    proc.kill();
    // Chrome may hold profile files briefly after exit (Windows).
    for (let i = 0; i < 10; i++) {
      try { rmSync(profile, { recursive: true, force: true }); break; } catch { await delay(300); }
    }
  }
  return { send, evaluate, waitFor, viewport, tap, drag, pinch, click, goto, close, errors, requests, delay };
}
