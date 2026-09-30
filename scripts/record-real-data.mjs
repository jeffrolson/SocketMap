/**
 * Records real data from an installed Chromium browser, headlessly, in a throwaway profile:
 *   policy: opens chrome://policy and captures what its "Copy as JSON" button produces (Chrome only;
 *           the browser reads whatever managed policies the machine has, so run it on a disposable machine)
 *   pair:   loads a page while the browser writes its own NetLog and a DevTools Performance trace is
 *           recorded, giving the paired files SocketMap validates alignment with
 *
 * Usage: node scripts/record-real-data.mjs policy <browser-path> <out-file> [chrome://policy]
 *        node scripts/record-real-data.mjs pair   <browser-path> <out-dir> <tag> [url]
 * Needs Node 22+ (global WebSocket). Used by .github/workflows/record-real-data.yml; output is validation
 * data for tests and never enters the repository.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function launch(bin, extra = [], { headed = false } = {}) {
  const port = 9333 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), "sm-rec-"));
  const child = spawn(bin, [...(headed ? [] : ["--headless=new"]), `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--no-sandbox", ...extra, "about:blank"], { stdio: "ignore" });
  const json = async (path) => { for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${port}${path}`); if (r.ok) return r.json(); } catch {} await sleep(250); } throw new Error("the browser did not start"); };
  const version = await json("/json/version");
  const targets = await json("/json/list");
  const client = (wsUrl) => {
    const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const listeners = [];
    const ready = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); } else listeners.forEach(fn => fn(msg)); };
    return { ready, on: fn => listeners.push(fn), send: (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); }) };
  };
  const browser = client(version.webSocketDebuggerUrl); await browser.ready;
  const page = client(targets.find(t => t.type === "page").webSocketDebuggerUrl); await page.ready;
  const close = async () => { await browser.send("Browser.close").catch(() => {}); await sleep(1500); try { child.kill(); } catch {} await sleep(800); try { rmSync(profile, { recursive: true, force: true }); } catch {} };
  return { version: version.Browser, browser, page, close };
}

async function policy(bin, outFile, url = "chrome://policy") {
  const { version, page, close } = await launch(bin);
  try {
    console.log("browser:", version);
    await page.send("Page.enable"); await page.send("Runtime.enable");
    // Capture what the page's own Copy as JSON button writes to the clipboard.
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__copied = null; try { Object.defineProperty(navigator, "clipboard", { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true }); } catch (e) {}` });
    await page.send("Page.navigate", { url });
    await sleep(4000);
    const clicked = await page.send("Runtime.evaluate", { returnByValue: true, expression: `(() => { const find = (root) => { for (const el of root.querySelectorAll("*")) { if (el.shadowRoot) { const x = find(el.shadowRoot); if (x) return x; } if (/^(button|cr-button)$/i.test(el.tagName) && /copy (as|to) json/i.test((el.textContent || "").trim())) return el; } return null; }; const b = find(document); if (b) b.click(); return !!b; })()` });
    if (!clicked.result.value) throw new Error("this browser's policy page has no Copy as JSON button");
    await sleep(2500);
    const text = (await page.send("Runtime.evaluate", { returnByValue: true, expression: "window.__copied" })).result.value;
    if (!text) throw new Error("nothing was copied");
    mkdirSync(join(outFile, ".."), { recursive: true });
    writeFileSync(outFile, text);
    console.log(`saved ${text.length} chars to ${outFile}`);
  } finally { await close(); }
}

// Opens the policy page in a VISIBLE browser and clicks Export to JSON, which opens a native save dialog. Something else
// (the workflow's PowerShell keystrokes) must complete the dialog; this only clicks and then keeps the browser open.
async function exportClick(bin, url = "edge://policy", holdSeconds = 45) {
  const { version, page, close } = await launch(bin, [], { headed: true });
  try {
    console.log("browser:", version);
    await page.send("Page.enable"); await page.send("Runtime.enable");
    await page.send("Page.navigate", { url });
    await sleep(5000);
    const clicked = await page.send("Runtime.evaluate", { returnByValue: true, expression: `(() => { const find = (root) => { for (const el of root.querySelectorAll("*")) { if (el.shadowRoot) { const x = find(el.shadowRoot); if (x) return x; } if (/^(button|cr-button)$/i.test(el.tagName) && /export to json/i.test((el.textContent || "").trim())) return el; } return null; }; const b = find(document); if (b) b.click(); return !!b; })()` });
    console.log("clicked export:", clicked.result.value);
    if (!clicked.result.value) throw new Error("no Export to JSON button");
    await sleep(holdSeconds * 1000);
  } finally { await close(); }
}

async function pair(bin, outDir, tag, url = "https://en.wikipedia.org/wiki/HTTP/3") {
  mkdirSync(outDir, { recursive: true });
  // Browsers resolve a relative NetLog path against their own working directory, so pass an absolute one.
  const netlog = resolve(outDir,  `pair-${tag}-netlog.json`);
  const tracePath = join(outDir, `pair-${tag}-trace.json`);
  const { version, browser, page, close } = await launch(bin, [`--log-net-log=${netlog}`, "--net-log-capture-mode=Default", "--window-size=1280,900"]);
  try {
    console.log("browser:", version);
    await page.send("Page.enable");
    let loaded = false; page.on(m => { if (m.method === "Page.loadEventFired") loaded = true; });
    const categories = "-*,devtools.timeline,v8.execute,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,toplevel,blink.console,blink.user_timing,loading,latencyInfo,disabled-by-default-lighthouse";
    let handle = null; let complete; const done = new Promise(resolve => { complete = resolve; });
    browser.on(m => { if (m.method === "Tracing.tracingComplete") { handle = m.params.stream; complete(); } });
    await browser.send("Tracing.start", { categories, transferMode: "ReturnAsStream", streamFormat: "json" });
    await sleep(300);
    await page.send("Page.navigate", { url });
    for (let i = 0; i < 120 && !loaded; i++) await sleep(250);
    await sleep(3000);
    await browser.send("Tracing.end");
    await done;
    let text = "";
    for (;;) { const r = await browser.send("IO.read", { handle, size: 4 * 1024 * 1024 }); text += r.data; if (r.eof) break; }
    writeFileSync(tracePath, text);
    console.log("trace bytes", text.length, "| loaded", loaded);
  } finally {
    await close();
    console.log("netlog", existsSync(netlog) ? statSync(netlog).size : "missing");
  }
}

const [mode, bin, a, b, c] = process.argv.slice(2);
try {
  if (mode === "policy") await policy(bin, a, b);
  else if (mode === "pair") await pair(bin, a, b, c);
  else if (mode === "export-click") await exportClick(bin, a, b ? Number(b) : undefined);
  else { console.error("Usage: record-real-data.mjs policy|pair <browser> ..."); process.exit(2); }
  process.exit(0);
} catch (error) { console.error(`failed: ${error.message}`); process.exit(1); }
