#!/usr/bin/env node

/**
 * build-viewer.mjs
 * Builds socketmap-viewer.html: one self-contained page that turns a dropped
 * NetLog capture into the SocketMap report, entirely inside the browser.
 *
 * A minimal bundler (no dependencies) wraps each browser-portable module in a
 * function scope and links them by path. It supports only the module syntax
 * this repo uses: named imports from relative paths, and `export function` /
 * `export const`. Anything else fails the build instead of shipping broken code.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDesignTokens, themeCss, themeModeCss, themePreferenceScript } from "../src/theme.mjs";
import { DEFAULT_THEME } from "../src/renderer/theme.generated.mjs";
import { renderPageHeader, PAGE_HEADER_CSS } from "../src/renderer/page-header.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = resolve(ROOT, "src/viewer/viewer-app.mjs");
const VERSION = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version;

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*"(\.{1,2}\/[^"]+)";?\s*$/gm;
const EXPORT_RE = /^export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)/gm;

function transformModule(file) {
  const id = relative(ROOT, file);
  let code = readFileSync(file, "utf8");
  const deps = [];

  code = code.replace(IMPORT_RE, (_, names, spec) => {
    const target = resolve(dirname(file), spec);
    deps.push(target);
    const bindings = names.split(",").map(n => n.trim()).filter(Boolean)
      .map(n => n.replace(/^([\w$]+)\s+as\s+([\w$]+)$/, "$1: $2")).join(", ");
    return `const { ${bindings} } = __require(${JSON.stringify(relative(ROOT, target))});`;
  });

  const exported = [];
  code = code.replace(EXPORT_RE, (match, name) => {
    exported.push(name);
    return match.replace(/^export\s+/, "");
  });

  const leftover = code.match(/^\s*(import|export)\b.*$/m);
  if (leftover) throw new Error(`${id}: unsupported module syntax for the viewer bundle: ${leftover[0].trim()}`);
  if (/["']node:|\brequire\(|\bprocess\./.test(code)) throw new Error(`${id}: uses Node APIs and cannot run in the browser viewer`);

  return {
    id,
    deps,
    code: `__define(${JSON.stringify(id)}, function () {\n${code}\nreturn { ${exported.join(", ")} };\n});`
  };
}

/** Bundles the viewer entry and everything it imports into one script. */
export function bundleViewer(entry = ENTRY) {
  const modules = new Map();
  const visit = (file) => {
    if (modules.has(file)) return;
    const mod = transformModule(file);
    modules.set(file, mod);
    mod.deps.forEach(visit);
  };
  visit(entry);
  const body = [...modules.values()].map(m => m.code).join("\n\n");
  const script = `(function () {
"use strict";
var __factories = {}, __cache = {};
function __define(id, factory) { __factories[id] = factory; }
function __require(id) {
  if (!(id in __cache)) {
    if (!__factories[id]) throw new Error("SocketMap viewer: missing module " + id);
    __cache[id] = __factories[id]();
  }
  return __cache[id];
}
${body}
__require(${JSON.stringify(relative(ROOT, entry))});
})();`;
  // Keep the page's <script> element from closing early on strings that contain it.
  return script.replace(/<\/script/gi, "<\\/script");
}

const CAPTURE_STEPS = [
  "Close other tabs so their traffic does not mix in.",
  "Open a new tab and go to <code>chrome://net-export</code> (in Edge: <code>edge://net-export</code>).",
  "Keep <strong>Strip private information</strong> selected and click <strong>Start Logging to Disk</strong>. Save the file.",
  "In another tab, load the page or perform the action you want to understand.",
  "Go back and click <strong>Stop Logging</strong>. Drop the saved file on this page."
];

const SHELL_ICONS = {
  logo: '<path d="M3 16l4-5 4 3 5-7 5 6"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  check: '<path d="M5 12l4 4 10-10"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>'
};

function shellIcon(name, size = 18) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SHELL_ICONS[name]}</svg>`;
}

const LIMITS = [
  ["Time spent running the page's own code", "Record a Performance profile in Chrome DevTools."],
  ["Security software acting inside the browser", "Compare a capture with the software paused, if policy allows."],
  ["Packet-level problems such as retransmissions", "Use Wireshark or your network team's packet capture."],
  ["What the servers do internally", "Ask the application owner or vendor; the report shows how long they took."]
];

export function buildViewerHtml({ theme } = {}) {
  const bundle = bundleViewer();
  const themeOverride = theme ? `<script>globalThis.SOCKETMAP_THEME = ${JSON.stringify(theme).replace(/</g, "\\u003c")};</script>\n` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="SocketMap ${VERSION}">
<title>SocketMap: data-driven insights into a page load</title>
<style>
  :root {
    ${themeCss(theme || DEFAULT_THEME)}
  }
  ${themeModeCss(theme || DEFAULT_THEME, DEFAULT_THEME)}
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 var(--font-sans); }
  [hidden] { display: none !important; }
  button, .button, select, summary { font: 600 13px var(--font-sans); }
  button, .button, select { color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 12px; cursor: pointer; }
  button:hover, summary:hover { border-color: var(--secondary); }
  button:focus-visible, summary:focus-visible, select:focus-visible { outline: 2px solid var(--secondary); outline-offset: 2px; }
  .primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  code { font: 13px var(--font-mono); overflow-wrap: anywhere; }
  .icon { vertical-align: middle; flex: none; }
  ${PAGE_HEADER_CSS}
  .start-content { max-width: 1000px; margin: 0 auto; padding: 12px 16px; }
  .capture-shortcut { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .capture-shortcut button { display: flex; align-items: center; gap: 12px; background: var(--surface); border-color: var(--secondary); }
  .capture-shortcut code { color: var(--secondary); font-size: 15px; }
  .capture-shortcut > span { color: var(--text-muted); font-size: 12px; }
  .drop { display: flex; align-items: center; justify-content: center; gap: 16px; min-height: 132px; padding: 20px; border: 2px dashed var(--border); border-radius: var(--radius); background: var(--surface); cursor: pointer; }
  .drop:hover, .drop:focus-visible, .drop.is-over { border-color: var(--secondary); background: var(--surface-mid); outline: none; }
  .drop .icon { color: var(--secondary); }
  .drop strong { display: block; font-size: 18px; }
  .drop span { color: var(--text-muted); }
  .capture-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
  .copy-status, .privacy { color: var(--text-muted); font-size: 12px; margin: 10px 0; }
  .about { margin-top: 16px; border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; }
  summary { cursor: pointer; }
  .about h2 { font-size: 17px; margin: 16px 0 8px; }
  .about p, .about li { color: var(--text-muted); }
  .about li { margin: 6px 0; }
  .about ol, .about ul { padding-left: 22px; }
  .about code { color: var(--text); }
  .load-feedback { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 50; width: min(720px, calc(100% - 24px)); padding: 16px; background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius); }
  .progress-track { height: 8px; background: var(--surface-2); border-radius: var(--radius-sm); overflow: hidden; }
  #progress-bar { height: 100%; width: 0; background: var(--secondary); transition: width .1s; }
  #progress-text { margin-top: 8px; color: var(--text-muted); }
  .error { padding: 12px 14px; border-left: 4px solid var(--danger); }
  .load-feedback button { margin-top: 10px; }
  #result { display: flex; flex-direction: column; height: 100vh; height: 100dvh; }
  .toolbar { flex-shrink: 0; }
  .toolbar .page-controls { flex: 1; justify-content: flex-end; }
  .page-picker { display: flex; gap: 6px; align-items: center; min-width: 0; max-width: 380px; flex: 1; }
  .page-picker span { color: var(--text-muted); white-space: nowrap; font-size: 12px; }
  .page-picker select { min-width: 0; width: 100%; text-overflow: ellipsis; }
  .viewer-menu, .add-menu { position: relative; }
  .viewer-menu > summary, .add-menu > summary { padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); white-space: nowrap; }
  .viewer-panel { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; display: grid; gap: 10px; width: min(360px, calc(100vw - 24px)); max-height: calc(100dvh - 76px); overflow: auto; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
  .viewer-panel .page-picker { max-width: none; }
  .viewer-panel button { text-align: left; }
  .file, .page-context, .comparison-hint { font-size: 12px; color: var(--text-muted); overflow-wrap: anywhere; margin: 0; }
  .comparison-controls { display: flex; flex-wrap: wrap; gap: 6px; }
  .comparison-controls button[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); }
  .add-panel { display: grid; gap: 6px; padding-top: 6px; }
  #report-frame { flex: 1; min-height: 0; width: 100%; border: 0; background: var(--bg); }
  @media (max-width: 600px) {
    .start-content { padding: 10px; }
    .start-header .page-controls button { padding: 8px; }
    .capture-shortcut { display: block; }
    .capture-shortcut button { width: 100%; justify-content: space-between; }
    .capture-shortcut > span { display: none; }
    .drop { min-height: 120px; gap: 10px; padding: 14px; }
    .drop strong { font-size: 16px; }
    .drop span { font-size: 12px; }
    .toolbar .page-picker > span { display: none; }
    .toolbar .page-controls { gap: 5px; }
    .toolbar .page-heading { flex-shrink: 0; }
    .toolbar button, .toolbar select, .viewer-menu > summary { padding: 8px; font-size: 12px; }
    #save-report { max-width: 66px; overflow: hidden; white-space: nowrap; }
  }
</style>
${themePreferenceScript()}
</head>
<body>
<div id="start">
  ${renderPageHeader({ title: "SocketMap", subtitle: "Data-driven insights into a page load", className: "start-header", controls: '<button type="button" data-theme-toggle>Theme</button><button type="button" data-open-sample>Try sample</button>' })}
  <main class="start-content">
    <div class="capture-shortcut" aria-label="Start a Chrome network capture">
      <button type="button" id="copy-capture-address" aria-label="Copy Chrome address"><code id="capture-address">chrome://net-export</code><span>Copy address</span></button>
      <span>Paste into Chrome to start recording.</span>
    </div>
    <div id="drop" class="drop" role="button" tabindex="0" aria-label="Choose a NetLog capture file">
      ${shellIcon("upload", 28)}
      <div><strong>Drop a NetLog capture here</strong><span>or click to choose a NetLog or HAR file</span></div>
    </div>
    <input type="file" id="file-input" accept=".json,.har,.cpuprofile,application/json" multiple hidden>
    <div class="capture-actions"><button type="button" id="compare-files">Compare two captures</button><span class="privacy">Local only. Works offline.</span></div>
    <p class="copy-status" id="copy-status" aria-live="polite">Start logging → load the page → stop logging → open the file here.</p>
    <details class="about">
      <summary>About this page</summary>
      <div id="what"><h2>Data-driven insights into a page load</h2><p>Explore recorded connections, requests, and timings through visualizations and plain-language insights. Compare two captures to see what changed. Results describe recorded evidence and suggest what to check next.</p></div>
      <div id="how"><h2>Collect a capture</h2><ol>${CAPTURE_STEPS.map(s => `<li>${s}</li>`).join("")}</ol></div>
      <p class="optional-har">Optional: record a HAR (DevTools, Network tab, Export HAR sanitized) and a Performance profile (DevTools, Performance tab, record while reloading, Save profile) at the same time. Drop them with the NetLog, or use the Files menu once the report opens. A HAR on its own also opens the report. Other local files can add browser policy, network-path, Lighthouse, or CPU evidence.</p>
      <div id="privacy"><h2>Sharing and privacy</h2><p>Your capture never leaves this computer. Files are read locally and never uploaded. Saved reports remove credentials, but keep URLs, IP addresses, hostnames, and certificate details. Review those details before sharing. Full event inspection in a saved report requires attaching the original local NetLog.</p></div>
      <div id="limits"><h2>What a network log cannot show</h2><ul>${LIMITS.map(([what, next]) => `<li><strong>${what}.</strong> ${next}</li>`).join("")}</ul></div>
      <p>SocketMap v${VERSION} · MIT license · self-contained HTML</p>
    </details>
  </main>
</div>
<input type="file" id="compare-input" accept=".json,application/json" multiple hidden>
<input type="file" id="second-input" accept=".json,application/json" hidden>
<input type="file" id="har-input" accept=".har,.json,application/json" hidden>
<input type="file" id="profile-input" accept=".json,.gz,application/json,application/gzip" hidden>
<input type="file" id="path-input" accept=".json,application/json" hidden>
<input type="file" id="lighthouse-input" accept=".json,application/json" hidden>
<input type="file" id="cpu-input" accept=".cpuprofile,.json,application/json" hidden>
<div id="load-feedback" class="load-feedback" hidden>
  <div id="progress" class="progress" hidden>
    <div class="progress-track"><div id="progress-bar"></div></div>
    <div id="progress-text" role="status"></div>
  </div>
  <div id="error" class="error" role="alert" hidden></div>
  <button type="button" id="dismiss-error" hidden>Dismiss</button>
</div>
<div id="result" hidden>
  ${renderPageHeader({ title: "SocketMap", className: "toolbar", controls: `
    <label class="page-picker"><span id="page-label">Page / site</span><select id="page-select" aria-label="Page or site to analyze"></select></label>
    <details class="viewer-menu" id="viewer-menu"><summary>Files</summary><div class="viewer-panel">
      <span class="file" id="file-name"></span>
      <label class="page-picker" id="page-picker-b" hidden><span>B page / site</span><select id="page-select-b" aria-label="B page or site to analyze"></select></label>
      <span class="page-context" id="page-context" hidden></span>
      <div id="comparison-toolbar" hidden><div id="comparison-controls" class="comparison-controls" role="group" aria-label="Comparison views" hidden>
        <button type="button" id="view-comparison" aria-pressed="true">Comparison</button><button type="button" id="view-a" aria-pressed="false">A report</button><button type="button" id="view-b" aria-pressed="false">B report</button><button type="button" id="swap-captures">Swap A / B</button>
      </div></div>
      <p id="comparison-hint" class="comparison-hint" hidden>A is the baseline. Changes show B minus A. Select the same page or action in each capture.</p>
      <details class="add-menu" id="add-menu" hidden><summary>Add files</summary><div class="add-panel" role="menu" aria-label="Add another file to this capture">
        <button type="button" id="add-har" hidden role="menuitem">Add a HAR</button><button type="button" id="add-profile" hidden role="menuitem">Add a profile</button><button type="button" id="add-path" hidden role="menuitem">Add network path</button><button type="button" id="add-lighthouse" hidden role="menuitem">Add Lighthouse</button><button type="button" id="add-cpu" hidden role="menuitem">Add CPU profile</button>
      </div></details>
      <button type="button" id="add-comparison">Compare with another capture</button>
      <button type="button" data-theme-toggle>Theme</button><button type="button" id="open-another">Open another capture</button>
    </div></details>
    <button type="button" id="save-report" class="primary" title="Save the self-contained report">Save</button>` })}
  <iframe id="report-frame" title="SocketMap report"></iframe>
</div>
${themeOverride}<script id="socketmap-bundle">${bundle}</script>
</body>
</html>
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const themeAt = args.indexOf("--theme");
  const themePath = themeAt >= 0 ? args.splice(themeAt, 2)[1] : null;
  const theme = themePath ? parseDesignTokens(readFileSync(resolve(process.cwd(), themePath), "utf8")) : undefined;
  const out = resolve(process.cwd(), args[0] || "socketmap-viewer.html");
  writeFileSync(out, buildViewerHtml({ theme }), "utf8");
  console.log(`\x1b[32m✔ Built viewer:\x1b[0m ${out}`);
}
