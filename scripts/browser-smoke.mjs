/**
 * Real-browser smoke test for the built viewer (socketmap-viewer.html).
 *
 * Launches headless Chrome or Edge, opens the viewer from file://, loads the sample, then a NetLog,
 * HAR and Performance profile through the real file inputs, and checks the report, that no page
 * errors occur, and that the page never requests anything outside file:, data:, blob: or about:.
 *
 * Needs Node 22+ (global WebSocket) and an installed Chrome, Chromium or Edge. Set BROWSER_PATH to
 * choose one. Exits 0 with "skipped" when no browser is found, so it never blocks a machine without one.
 * Usage: npm run build:viewer && node scripts/browser-smoke.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";
import { buildSampleHar } from "../src/demo/sample-har.mjs";
import { buildSampleTrace } from "../src/demo/sample-trace.mjs";
import { createCaptureReader } from "../src/viewer/viewer-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viewer = process.env.VIEWER_PATH ? path.resolve(process.env.VIEWER_PATH) : path.join(root, "socketmap-viewer.html");

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ];
  return candidates.find(p => p && fs.existsSync(p)) || null;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const failures = [];
const check = (ok, label) => { console.log(`${ok ? "pass" : "FAIL"}  ${label}`); if (!ok) failures.push(label); };

async function main() {
  if (typeof WebSocket === "undefined") { console.log("skipped: needs Node 22 or newer (global WebSocket)"); return; }
  if (!fs.existsSync(viewer)) { console.error("socketmap-viewer.html is missing. Run npm run build:viewer first."); process.exit(2); }
  const browserPath = findBrowser();
  if (!browserPath) { console.log("skipped: no Chrome, Chromium or Edge found (set BROWSER_PATH)"); return; }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "socketmap-smoke-"));
  const netlogText = toNetLogText(buildPageLoadNetLog());
  const reader = createCaptureReader();
  reader.write(netlogText);
  const model = reader.finish();
  const files = {
    netlog: path.join(work, "capture.json"),
    har: path.join(work, "trace.har"),
    profile: path.join(work, "profile.json"),
    policy: path.join(work, "policies.json"),
    path: path.join(work, "socketmap-path.json"),
    lighthouse: path.join(work, "lighthouse.json"),
    cpu: path.join(work, "profile.cpuprofile")
  };
  fs.writeFileSync(files.netlog, netlogText);
  fs.writeFileSync(files.har, JSON.stringify(buildSampleHar(model)));
  fs.writeFileSync(files.profile, JSON.stringify(buildSampleTrace(model)));
  const { buildSamplePolicyExport } = await import("../src/demo/sample-policy.mjs");
  fs.writeFileSync(files.policy, JSON.stringify(buildSamplePolicyExport()));
  const { buildSamplePath } = await import("../src/demo/sample-path.mjs");
  fs.writeFileSync(files.path, JSON.stringify(buildSamplePath(model)));
  const { buildSampleLighthouse } = await import("../src/demo/sample-lighthouse.mjs");
  fs.writeFileSync(files.lighthouse, JSON.stringify(buildSampleLighthouse(model)));
  fs.writeFileSync(files.cpu, JSON.stringify({ nodes: [{ id: 1, callFrame: { functionName: "(root)", url: "" }, children: [2] }, { id: 2, callFrame: { functionName: "work", url: "https://portal.example.com/app.js", lineNumber: 9 } }], startTime: 0, endTime: 5000, samples: [2, 2, 2], timeDeltas: [0, 1000, 1000] }));

  const port = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(browserPath, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(work, "profile-dir")}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-gpu", "about:blank"], { stdio: "ignore" });
  // Wait for the browser to exit so its profile folder can be removed; leaving it would leak tens of MB per run.
  const cleanup = async () => {
    await new Promise(resolve => { child.once("exit", resolve); try { child.kill(); } catch { resolve(); } setTimeout(resolve, 5000); });
    // Best effort: Chrome's helper processes can still be writing for a moment, and cleanup must never fail the test.
    for (let attempt = 0; attempt < 5; attempt++) {
      try { fs.rmSync(work, { recursive: true, force: true }); return; } catch { await sleep(500); }
    }
    console.log(`note: could not remove ${work}`);
  };
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === "page"); } catch {}
    }
    if (!target) throw new Error("the browser did not start");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let nextId = 1;
    const pending = new Map();
    const requests = [];
    const errors = [];
    const consoleLines = [];
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(message.error.message)) : resolve(message.result); }
      else if (message.method === "Network.requestWillBeSent") requests.push(message.params.request.url);
      else if (message.method === "Runtime.consoleAPICalled" && /error|warning/.test(message.params.type)) consoleLines.push(`${message.params.type}: ${(message.params.args || []).map(a => a.value ?? a.description ?? "").join(" ").slice(0, 200)}`);
      else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
    const waitFor = async (expression, label, ms = 20000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) { if (await evaluate(expression).catch(() => false)) return true; await sleep(200); }
      check(false, `timed out waiting for ${label}`);
      const seen = await evaluate("(() => { const f = document.querySelector('iframe'); const d = f && f.contentDocument; return { viewer: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 300), report: d ? d.body.innerText.replace(/\\s+/g, ' ').slice(0, 200) : null, hasProfile: d ? !!d.querySelector('#profile') : null, frames: document.querySelectorAll('iframe').length, srcdocLen: f ? f.srcdoc.length : null, srcdocHasProfile: f ? f.srcdoc.indexOf('id=' + String.fromCharCode(34) + 'profile') >= 0 : null, state: d ? d.readyState : null }; })()").catch(() => null);
      console.log(`      page said: ${JSON.stringify(seen)}${consoleLines.length ? ` | console: ${consoleLines.slice(-3).join(" || ")}` : ""}`);
      return false;
    };
    const setFiles = async (selector, list) => {
      const { root: doc } = await send("DOM.getDocument", { depth: 1 });
      const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector });
      await send("DOM.setFileInputFiles", { files: list, nodeId });
    };
    // The report renders inside an iframe of the viewer; reach into it from the viewer page.
    const frame = (expression) => `(() => { const f = document.querySelector('iframe'); const d = f && f.contentDocument; return d ? (${expression})(d) : null; })()`;

    await send("Network.enable");
    await send("Runtime.enable");
    await send("DOM.enable");
    await send("Page.enable");

    console.log(`browser: ${path.basename(browserPath)}`);
    await send("Page.navigate", { url: pathToFileURL(viewer).href });
    await waitFor("document.readyState === 'complete'", "the viewer to load");

    check(await evaluate("!!document.querySelector('[data-open-sample]')"), "start page offers the sample capture");

    // 1. Sample capture with its made-up HAR and profile
    await evaluate("document.querySelector('[data-open-sample]').click()");
    await waitFor(frame("d => !!d.querySelector('#profile') && !!d.querySelector('#enrichment, .enr, [id*=har]')"), "the sample report").catch(() => {});
    await waitFor(frame("d => d.querySelectorAll('.view').length > 3"), "report views");
    const views = await evaluate(frame("d => [...d.querySelectorAll('nav a, .nav a')].map(a => a.textContent.trim()).filter(Boolean)"));
    for (const name of ["Overview", "Waterfall", "Policy", "Coverage", "Diagnostics"]) check(Array.isArray(views) && views.includes(name), `report has the ${name} tab`);
    check(await evaluate(frame("d => !!d.querySelector('#profile')")), "sample report shows the profile panel");
    check(await evaluate(frame("d => !!d.querySelector('#path') && !d.querySelector('#path-prompt')")), "sample report shows the network path panel");
    check(await evaluate(frame("d => !!d.querySelector('#lighthouse')")), "sample report shows the Lighthouse panel");

    // Timeline strip: markers exist and the window narrows the waterfall
    check(await evaluate(frame("d => !!d.querySelector('#timeline') && d.querySelectorAll('.tl-mark').length > 0")), "waterfall has a timeline with problem markers");
    const narrowed = await evaluate(frame("d => { const to = d.getElementById('tl-to'); to.value = 150; to.dispatchEvent(new d.defaultView.Event('input', { bubbles: true })); const t = d.getElementById('filter-count').textContent; const shown = d.querySelectorAll('.wf-row:not(.is-filtered-out)').length; d.getElementById('tl-reset').click(); return { t, shown, after: d.getElementById('filter-count').textContent, all: d.querySelectorAll('.wf-row:not(.is-filtered-out)').length, total: d.querySelectorAll('.wf-row').length }; }"));
    check(narrowed && /Showing \d+ of \d+ requests/.test(narrowed.t) && narrowed.shown < narrowed.total && narrowed.after === "" && narrowed.all === narrowed.total, "moving the timeline window narrows the waterfall and Show everything restores it");

    // Sequence export: the SVG and PNG buttons produce real files
    const exported = await evaluate(frame("d => new Promise(resolve => { const w = d.defaultView; const saved = []; const orig = w.HTMLAnchorElement.prototype.click; w.HTMLAnchorElement.prototype.click = function () { if (this.download) { const name = this.download; fetch(this.href).then(r => r.blob()).then(b => { saved.push({ name, size: b.size, type: b.type }); }); return; } return orig.call(this); }; d.getElementById('seq-save-svg').click(); d.getElementById('seq-save-png').click(); setTimeout(() => { w.HTMLAnchorElement.prototype.click = orig; resolve(saved); }, 6000); })"));
    check(Array.isArray(exported) && exported.some(f => f.name.endsWith(".svg") && f.size > 8000 && /svg/.test(f.type)), "the sequence exports as an SVG file");
    check(Array.isArray(exported) && exported.some(f => f.name.endsWith(".png") && f.size > 4000 && /png/.test(f.type)), "the sequence exports as a PNG file");

    // 2. Policy sample inside the report
    await evaluate(frame("d => { const b = [...d.querySelectorAll('button')].find(x => /sample export/i.test(x.textContent)); if (b) b.click(); return !!b; }"));
    check(await waitFor(frame("d => /Policies set/i.test((d.getElementById('policy') || d.body).innerText)"), "the policy sample", 8000), "policy sample renders results");

    // 3. Real file inputs: NetLog, then HAR and profile
    await send("Page.navigate", { url: pathToFileURL(viewer).href });
    await waitFor("document.readyState === 'complete'", "the viewer to reload");
    await setFiles("#file-input", [files.netlog, files.har, files.profile, files.path]);
    check(await waitFor(frame("d => !!d.querySelector('#profile')"), "the NetLog with its HAR and profile", 30000), "NetLog plus HAR plus profile load together through the file input");
    check(await evaluate("document.body.innerText.includes('capture.json')"), "the toolbar names the loaded file");
    check(await waitFor(frame("d => !!d.querySelector('#path')"), "the network path panel", 15000), "the helper's file loads with the others and shows its panel");
    check(await evaluate(frame("d => !!d.querySelector('#profile') && !d.querySelector('#path-prompt')")), "all three optional files are shown together");
    await setFiles("#lighthouse-input", [files.lighthouse]);
    check(await waitFor(frame("d => !!d.querySelector('#lighthouse')"), "the Lighthouse report", 15000), "a Lighthouse report can be added to the open report");
    await setFiles("#cpu-input", [files.cpu]);
    check(await waitFor(frame("d => !!d.querySelector('#cpuprofile')"), "the CPU profile", 15000), "a CPU profile can be added to the open report");

    // 4. A HAR on its own opens the report; a profile can then be added to it
    await send("Page.navigate", { url: pathToFileURL(viewer).href });
    await waitFor("document.readyState === 'complete'", "the viewer to reload for the HAR-only check");
    await setFiles("#file-input", [files.har]);
    check(await waitFor(frame("d => !!d.querySelector('#view-waterfall') && /built from a HAR/.test(d.body.textContent)"), "the HAR-only report", 30000), "a HAR on its own opens the full report");
    check(await evaluate(frame("d => !d.querySelector('[data-nav=diagnostics]') && !!d.querySelector('[data-nav=coverage]')")), "the HAR report hides the NetLog-only tabs and keeps Coverage");
    check(await evaluate("document.getElementById('add-har').hidden === true"), "the viewer does not offer to add a HAR to a HAR");
    await setFiles("#profile-input", [files.profile]);
    check(await waitFor(frame("d => !!d.querySelector('#profile')"), "a profile added to the HAR report", 20000), "a profile can be added to a HAR-based report");

    check(errors.length === 0, `no uncaught page errors${errors.length ? `: ${errors[0]}` : ""}`);
    const outside = requests.filter(url => !/^(file|data|blob|about):/i.test(url));
    check(outside.length === 0, `no requests outside the local file${outside.length ? `: ${outside[0]}` : ""}`);
    ws.close();
  } catch (error) {
    check(false, error.message);
  } finally {
    await cleanup();
  }
  if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
  console.log("\nbrowser smoke test passed");
}

main();
