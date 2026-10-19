#!/usr/bin/env node

/**
 * generate-screenshots.mjs
 *
 * Drives headless Chrome to capture crisp 2x Retina screenshots of the built viewer
 * and reports for docs/images/ (Start, Overview, Waterfall, Sequence, Comparison, Coverage).
 *
 * Usage:
 *   npm run build:viewer && node scripts/generate-screenshots.mjs
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
    console.error("No supported browser found for screenshots.");
    process.exit(1);
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "socketmap-screenshots-"));

  // Build sample comparison HTML
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

  let port = 9400 + Math.floor(Math.random() * 400);
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

  const frame = (expression) =>
    `(() => { const f = document.querySelector('iframe'); const d = f && f.contentDocument; return d ? (${expression})(d) : null; })()`;

  await send("Page.enable");
  await send("DOM.enable");
  await send("Runtime.enable");

  // Set 2x Retina display metrics: 1440x900 viewport -> 2880x1800 rendered image
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false
  });

  const captureToFile = async (filePath) => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(filePath, Buffer.from(data, "base64"));
    console.log(`✔ Captured: ${path.relative(root, filePath)}`);
  };

  try {
    // 1. Viewer Start Page
    console.log("Navigating to viewer start page...");
    await send("Page.navigate", { url: pathToFileURL(viewerPath).href });
    await waitFor("!!document.querySelector('[data-open-sample]')", "the viewer start page");
    await captureToFile(path.join(imagesDir, "viewer-start.png"));

    // 2. Open Sample Report with full enrichments
    console.log("Opening sample capture with full enrichments...");
    await evaluate("document.querySelector('[data-open-sample]').click()");
    await waitFor(frame("d => !!d.querySelector('#profile') && !!d.querySelector('#path') && !!d.querySelector('#lighthouse') && !!d.querySelector('#overview.is-active')"), "the enriched sample overview");

    // Capture Overview
    console.log("Capturing Overview tab...");
    await captureToFile(path.join(imagesDir, "report-overview.png"));

    // 3. Waterfall View
    console.log("Capturing Waterfall tab...");
    await evaluate(frame("d => { const a = d.querySelector('a[href=\"#waterfall\"]'); if (a) a.click(); }"));
    await waitFor(frame("d => !!d.querySelector('#view-waterfall.is-active')"), "the Waterfall view");
    await captureToFile(path.join(imagesDir, "report-waterfall.png"));

    // 4. Sequence View
    console.log("Capturing Sequence tab...");
    await evaluate(frame("d => { const a = d.querySelector('a[href=\"#sequence\"]'); if (a) a.click(); }"));
    await waitFor(frame("d => !!d.querySelector('#view-sequence.is-active')"), "the Sequence view");
    await captureToFile(path.join(imagesDir, "report-sequence.png"));

    // 5. Coverage View
    console.log("Capturing Coverage tab...");
    await evaluate(frame("d => { const a = d.querySelector('a[href=\"#coverage\"]'); if (a) a.click(); }"));
    await waitFor(frame("d => !!d.querySelector('#view-coverage.is-active')"), "the Coverage view");
    await captureToFile(path.join(imagesDir, "report-coverage.png"));

    // 6. Capture Comparison View
    console.log("Capturing Comparison report...");
    await send("Page.navigate", { url: pathToFileURL(comparisonFile).href });
    await waitFor("!!document.querySelector('.pair-list .pair.changed')", "the comparison view");
    await captureToFile(path.join(imagesDir, "report-compare.png"));

    console.log("\nAll screenshots generated successfully at 2x Retina resolution!");
  } finally {
    cleanup();
  }
}

main().catch(err => {
  console.error("Error generating screenshots:", err);
  process.exit(1);
});
