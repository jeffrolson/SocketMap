#!/usr/bin/env node

/**
 * generate-framed-images.mjs
 *
 * Generates polished, high-resolution (2x Retina) framed screenshots and hero visuals
 * for SocketMap documentation.
 *
 * Wraps the live application in an ultra-clean macOS dark-mode window frame with
 * subtle ambient lighting, crisp typography, and design-token alignment.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";
import { createCaptureReader } from "../src/viewer/viewer-core.mjs";
import { compareCaptures } from "../src/comparison.mjs";
import { renderComparisonHtml } from "../src/renderer/comparison.html.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viewerPath = path.join(root, "socketmap-viewer.html");
const imagesDir = path.join(root, "docs", "images");

fs.mkdirSync(imagesDir, { recursive: true });

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ];
  return candidates.find(p => p && fs.existsSync(p)) || null;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function slowerComparisonModel(model) {
  const slower = structuredClone(model);
  for (const request of slower.requests) {
    // This fixture models an added 250 ms of server wait. Keep the request's
    // visible phases, duration, and page span internally consistent.
    if (request.timing?.wait == null || request.endRecorded !== true || request.end == null || request.durationMs == null) continue;
    request.timing.wait += 250;
    request.end += 250;
    if (request.observedEnd != null) request.observedEnd += 250;
    request.durationMs += 250;
    if (request.observedDurationMs != null) request.observedDurationMs += 250;
  }
  return slower;
}

async function main() {
  if (typeof WebSocket === "undefined") throw new Error("Screenshot generation requires Node.js 22 or newer.");
  if (!fs.existsSync(viewerPath)) {
    console.error("socketmap-viewer.html is missing. Run npm run build:viewer first.");
    process.exit(1);
  }

  const browserPath = findBrowser();
  if (!browserPath) {
    console.error("No supported browser found.");
    process.exit(1);
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "socketmap-framed-"));

  // Build comparison HTML
  const netlogText = toNetLogText(buildPageLoadNetLog());
  const reader = createCaptureReader();
  reader.write(netlogText);
  const modelA = reader.finish();
  const modelB = slowerComparisonModel(modelA);
  const comparison = compareCaptures(modelA, modelB, {
    sourceA: { name: "office-direct.json", bytes: 27800 },
    sourceB: { name: "remote-vpn.json", bytes: 28400 }
  });
  const comparisonHtml = renderComparisonHtml(comparison);
  const comparisonFile = path.join(work, "comparison.html");
  fs.writeFileSync(comparisonFile, comparisonHtml, "utf8");

  // Helper function to create framed HTML container
  function createFramedHtml(innerUrl, title = "SocketMap — Data-driven insights into a page load") {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: radial-gradient(circle at 50% 15%, #172033 0%, #0b1326 50%, #060e20 100%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .window {
    width: 1440px;
    height: 920px;
    background: #0b1326;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow:
      0 40px 100px -20px rgba(0, 0, 0, 0.85),
      0 20px 40px -15px rgba(0, 0, 0, 0.7),
      0 0 0 1px rgba(255, 255, 255, 0.12),
      0 1px 0 rgba(255, 255, 255, 0.15) inset;
  }
  .titlebar {
    height: 38px;
    background: #0d1629;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    padding: 0 14px;
    position: relative;
    user-select: none;
    flex-shrink: 0;
  }
  .dots {
    display: flex;
    gap: 7px;
  }
  .dot {
    width: 11px;
    height: 11px;
    border-radius: 50%;
  }
  .dot-red { background: #ff5f56; border: 1px solid #e0443e; }
  .dot-yellow { background: #ffbd2e; border: 1px solid #dea123; }
  .dot-green { background: #27c93f; border: 1px solid #1aab29; }
  .title {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: 12px;
    font-weight: 500;
    color: #94a3b8;
    letter-spacing: 0.02em;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .title svg {
    opacity: 0.8;
  }
  .content {
    flex: 1;
    width: 100%;
    position: relative;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  }
</style>
</head>
<body>
  <div class="window">
    <div class="titlebar">
      <div class="dots">
        <div class="dot dot-red"></div>
        <div class="dot dot-yellow"></div>
        <div class="dot dot-green"></div>
      </div>
      <div class="title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7bd0ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
        ${title}
      </div>
    </div>
    <div class="content">
      <iframe src="${innerUrl}" id="app-frame" onload="this.dataset.loaded='true'"></iframe>
    </div>
  </div>
</body>
</html>`;
  }

  // Create Hero Banner HTML with branded presentation
  function createHeroBannerHtml(innerUrl) {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #060e20;
    background-image:
      radial-gradient(ellipse 90% 60% at 50% -10%, rgba(147, 204, 255, 0.18), transparent 70%),
      radial-gradient(circle at 15% 85%, rgba(78, 222, 163, 0.08), transparent 40%),
      radial-gradient(circle at 85% 85%, rgba(123, 208, 255, 0.08), transparent 40%);
    min-height: 100vh;
    padding: 60px 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #dae2fd;
  }
  .header-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(147, 204, 255, 0.1);
    border: 1px solid rgba(147, 204, 255, 0.25);
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 13px;
    font-weight: 600;
    color: #93ccff;
    letter-spacing: 0.04em;
    margin-bottom: 20px;
    backdrop-filter: blur(8px);
  }
  .header-badge .pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4edea3;
    box-shadow: 0 0 10px #4edea3;
  }
  h1 {
    font-size: 46px;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.15;
    text-align: center;
    margin-bottom: 14px;
    background: linear-gradient(180deg, #ffffff 30%, #93ccff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  p.subtitle {
    font-size: 20px;
    line-height: 1.5;
    color: #bfc7d2;
    text-align: center;
    max-width: 820px;
    margin-bottom: 34px;
  }
  .pills {
    display: flex;
    gap: 12px;
    margin-bottom: 40px;
  }
  .pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #131b2e;
    border: 1px solid #222a3d;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #dae2fd;
  }
  .pill svg { color: #7bd0ff; }
  .window {
    width: 1440px;
    height: 860px;
    background: #0b1326;
    border-radius: 14px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow:
      0 50px 120px -25px rgba(0, 0, 0, 0.9),
      0 25px 50px -20px rgba(0, 0, 0, 0.8),
      0 0 0 1px rgba(255, 255, 255, 0.14),
      0 1px 0 rgba(255, 255, 255, 0.2) inset;
  }
  .titlebar {
    height: 40px;
    background: #0d1629;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    padding: 0 16px;
    position: relative;
    user-select: none;
    flex-shrink: 0;
  }
  .dots { display: flex; gap: 8px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .dot-red { background: #ff5f56; }
  .dot-yellow { background: #ffbd2e; }
  .dot-green { background: #27c93f; }
  .title {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: 13px;
    font-weight: 500;
    color: #94a3b8;
  }
  .content { flex: 1; width: 100%; position: relative; }
  iframe { width: 100%; height: 100%; border: none; display: block; }
</style>
</head>
<body>
  <div class="header-badge">
    <div class="pulse"></div>
    OFFLINE NETWORK TRACE INTELLIGENCE
  </div>
  <h1>Data-Driven Insights into a Page Load</h1>
  <p class="subtitle">
    Transform raw browser network traces into self-contained interactive sequence diagrams. Pinpoint slow DNS, proxies, private certificates, and failures with plain-language evidence.
  </p>
  <div class="pills">
    <div class="pill">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      Zero External Dependencies
    </div>
    <div class="pill">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      100% Private & Offline
    </div>
    <div class="pill">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      Chromium NetLog + HAR + V8 Profile
    </div>
  </div>
  <div class="window">
    <div class="titlebar">
      <div class="dots">
        <div class="dot dot-red"></div>
        <div class="dot dot-yellow"></div>
        <div class="dot dot-green"></div>
      </div>
      <div class="title">SocketMap Sequence Diagram — https://portal.example.com</div>
    </div>
    <div class="content">
      <iframe src="${innerUrl}" id="app-frame" onload="this.dataset.loaded='true'"></iframe>
    </div>
  </div>
</body>
</html>`;
  }

  // Create 3-Step Visual Workflow Guide HTML
  function createWorkflowGuideHtml() {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #060e20;
    min-height: 100vh;
    padding: 60px 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #dae2fd;
  }
  .eyebrow {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #7bd0ff;
    margin-bottom: 12px;
  }
  h2 {
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin-bottom: 40px;
    text-align: center;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    max-width: 1400px;
    width: 100%;
  }
  .card {
    background: #0b1326;
    border: 1px solid #222a3d;
    border-radius: 16px;
    padding: 32px 28px;
    position: relative;
    overflow: hidden;
    box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.6);
  }
  .card::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, #93ccff, #4edea3);
  }
  .step-num {
    font-size: 14px;
    font-weight: 700;
    color: #93ccff;
    background: rgba(147, 204, 255, 0.1);
    border: 1px solid rgba(147, 204, 255, 0.2);
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
  }
  .card h3 {
    font-size: 20px;
    font-weight: 700;
    color: #ffffff;
    margin-bottom: 12px;
  }
  .card p {
    font-size: 15px;
    line-height: 1.6;
    color: #bfc7d2;
    margin-bottom: 20px;
  }
  .code-snippet {
    background: #060e20;
    border: 1px solid #171f33;
    border-radius: 8px;
    padding: 12px 14px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
    color: #93ccff;
  }
</style>
</head>
<body>
  <div class="eyebrow">Seamless Three-Step Workflow</div>
  <h2>From Raw Network Logs to Clear, Evidence-Backed Insights</h2>
  <div class="grid">
    <div class="card">
      <div class="step-num">01</div>
      <h3>Capture the Page Load</h3>
      <p>Open Chrome or Edge and start recording in seconds. Captures proxies, DNS lookups, TLS certificates, and every low-level socket event.</p>
      <div class="code-snippet">chrome://net-export</div>
    </div>
    <div class="card">
      <div class="step-num">02</div>
      <h3>Drop into the Local Viewer</h3>
      <p>Open <code>socketmap-viewer.html</code> in any browser. No installation, zero npm dependencies, and no data ever leaves your computer.</p>
      <div class="code-snippet">Drag & Drop .json or .har</div>
    </div>
    <div class="card">
      <div class="step-num">03</div>
      <h3>Inspect Plain Findings</h3>
      <p>Read plain-language findings for non-technical teammates, explore the interactive sequence diagram, and compare A/B traces side-by-side.</p>
      <div class="code-snippet">Sequence • Waterfall • Diffs</div>
    </div>
  </div>
</body>
</html>`;
  }

  let port = 9500 + Math.floor(Math.random() * 400);
  const child = spawn(browserPath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(work, "profile-dir")}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-gpu",
    "about:blank"
  ], { stdio: "ignore" });

  const cleanup = () => {
    try { child.kill(); } catch {}
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(1); });

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find(t => t.type === "page");
    } catch {}
  }

  if (!target) {
    console.error("Failed to connect to headless browser.");
    cleanup();
    process.exit(1);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;

  const waitFor = async (expression, label, timeoutMs = 12000) => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${label}.`);
  };

  const frameLoaded = "document.getElementById('app-frame')?.dataset.loaded === 'true'";

  await send("Page.enable");
  await send("DOM.enable");
  await send("Runtime.enable");

  const captureToFile = async (filePath) => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(filePath, Buffer.from(data, "base64"));
    console.log(`✔ Generated: ${path.relative(root, filePath)}`);
  };

  try {
    // 1. Hero Showcase Banner
    console.log("Generating hero banner...");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 1260,
      deviceScaleFactor: 2,
      mobile: false
    });
    // Create hero wrapper containing sequence diagram
    const heroHtmlPath = path.join(work, "hero.html");
    const demoReportPath = path.join(root, "demo-report.html");
    fs.writeFileSync(heroHtmlPath, createHeroBannerHtml(pathToFileURL(demoReportPath).href + "#sequence"), "utf8");
    await send("Page.navigate", { url: pathToFileURL(heroHtmlPath).href });
    await waitFor(frameLoaded, "the hero sequence view");
    await captureToFile(path.join(imagesDir, "hero-banner.png"));

    // 2. 3-Step Workflow Guide
    console.log("Generating workflow guide...");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1500,
      height: 480,
      deviceScaleFactor: 2,
      mobile: false
    });
    const workflowHtmlPath = path.join(work, "workflow.html");
    fs.writeFileSync(workflowHtmlPath, createWorkflowGuideHtml(), "utf8");
    await send("Page.navigate", { url: pathToFileURL(workflowHtmlPath).href });
    await waitFor("document.readyState === 'complete'", "the workflow guide");
    await captureToFile(path.join(imagesDir, "workflow-guide.png"));

    // 3. Framed Viewer Start Page
    console.log("Generating framed viewer start page...");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1540,
      height: 1040,
      deviceScaleFactor: 2,
      mobile: false
    });
    const framedStartPath = path.join(work, "framed-start.html");
    fs.writeFileSync(framedStartPath, createFramedHtml(pathToFileURL(viewerPath).href, "SocketMap Viewer — Start Page"), "utf8");
    await send("Page.navigate", { url: pathToFileURL(framedStartPath).href });
    await waitFor(frameLoaded, "the framed viewer start page");
    await captureToFile(path.join(imagesDir, "viewer-start.png"));

    // 4. Framed Report Overview
    console.log("Generating framed report overview...");
    const framedOverviewPath = path.join(work, "framed-overview.html");
    fs.writeFileSync(framedOverviewPath, createFramedHtml(pathToFileURL(demoReportPath).href + "#overview", "SocketMap Report — Findings Overview"), "utf8");
    await send("Page.navigate", { url: pathToFileURL(framedOverviewPath).href });
    await waitFor(frameLoaded, "the framed overview view");
    await captureToFile(path.join(imagesDir, "report-overview.png"));

    // 5. Framed Sequence View
    console.log("Generating framed sequence view...");
    const framedSeqPath = path.join(work, "framed-sequence.html");
    fs.writeFileSync(framedSeqPath, createFramedHtml(pathToFileURL(demoReportPath).href + "#sequence", "SocketMap Report — Interactive Sequence Diagram"), "utf8");
    await send("Page.navigate", { url: pathToFileURL(framedSeqPath).href });
    await waitFor(frameLoaded, "the framed sequence view");
    await captureToFile(path.join(imagesDir, "report-sequence.png"));

    // 6. Framed Waterfall View
    console.log("Generating framed waterfall view...");
    const framedWfPath = path.join(work, "framed-waterfall.html");
    fs.writeFileSync(framedWfPath, createFramedHtml(pathToFileURL(demoReportPath).href + "#waterfall", "SocketMap Report — Request Waterfall & Timeline"), "utf8");
    await send("Page.navigate", { url: pathToFileURL(framedWfPath).href });
    await waitFor(frameLoaded, "the framed Waterfall view");
    await captureToFile(path.join(imagesDir, "report-waterfall.png"));

    // 7. Framed Comparison View
    console.log("Generating framed comparison view...");
    const framedCompPath = path.join(work, "framed-compare.html");
    fs.writeFileSync(framedCompPath, createFramedHtml(pathToFileURL(comparisonFile).href, "SocketMap Comparison — Baseline vs Comparison"), "utf8");
    await send("Page.navigate", { url: pathToFileURL(framedCompPath).href });
    await waitFor(frameLoaded, "the framed comparison view");
    await captureToFile(path.join(imagesDir, "report-compare.png"));

    // 8. Framed Coverage View
    console.log("Generating framed coverage view...");
    const framedCoveragePath = path.join(work, "framed-coverage.html");
    fs.writeFileSync(framedCoveragePath, createFramedHtml(pathToFileURL(demoReportPath).href + "#coverage", "SocketMap Report — Evidence Coverage"), "utf8");
    await send("Page.navigate", { url: pathToFileURL(framedCoveragePath).href });
    await waitFor(frameLoaded, "the framed Coverage view");
    await captureToFile(path.join(imagesDir, "report-coverage.png"));

    console.log("\nAll framed images successfully generated at 2x Retina resolution!");
  } finally {
    cleanup();
  }
}

main().catch(err => {
  console.error("Error generating framed images:", err);
  process.exit(1);
});
