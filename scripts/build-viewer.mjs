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

const PILLARS = [
  ["file", "One HTML file", "Nothing to install", "This page is the whole tool. Open it in Chrome or Edge on Windows or macOS: no admin rights, no Node.js, no browser add-ons.", "0 dependencies"],
  ["lock", "Local only", "Private by design", "Your capture is read inside your browser and never uploaded. Passwords, cookies, auth headers, and tokens are removed from the report; IP addresses and URLs stay so the network team can act on them.", "Works offline"],
  ["search", "Enterprise checks", "Finds the usual suspects", "TLS inspection (certificates from a private root), proxies and slow proxy lookups, calls to agents on this computer, slow DNS, slow connections, failed requests, slow servers, and blocked QUIC.", "Evidence for every finding"],
  ["chat", "Plain language", "Explained for everyone", "Click any step for what happened in everyday words, hover any label (H2, 200, wait) for a definition, and copy a summary to paste into your AI assistant.", "Learn tab with next steps"]
];

const STEPS = [
  ["01", "Capture", "Record the page load", "In Chrome or Edge, start a network log, load the page, and stop the log. Nothing to install.", "chrome://net-export"],
  ["02", "Drop", "Drop the file here", "The report builds in your browser. A 5 MB capture takes about a tenth of a second; a 300 MB capture about two seconds.", "chrome-net-export-log.json"],
  ["03", "Read and share", "Follow the findings", "Start with Findings, then open the Sequence tab and click any row. Save report creates one HTML file you can email or attach to a ticket.", "Save report → socketmap-report-site.html"]
];

const SPECS = [
  ["Reads", "Chrome and Edge network logs (net-export). HAR files work with the command-line tool, which draws a diagram view."],
  ["Shows", "Findings, host ratings (Best / Better / Good / Poor), request waterfall, sequence view, environment (local IP, DNS servers, proxy setup), what servers reported about themselves when they send it (Server-Timing, CDN and cache headers), a Coverage map of what the capture did and did not record, AI summary."],
  ["Speed", "5 MB capture: about 0.1 s. 300 MB capture: about 2 s. Measured on a laptop."],
  ["Runs in", "Current Chrome or Edge. The command line needs Node.js 18 or later."],
  ["Network access", "None. This page and every report load nothing from the internet."],
  ["Dependencies", "0"],
  ["License", "MIT"]
];

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
  html { scroll-behavior: smooth; scroll-padding-top: 72px; }
  html, body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.55 var(--font-sans); }
  a { color: var(--primary); }
  code { font-family: var(--font-mono); font-size: 13px; background: var(--surface-2); padding: 1px 6px; border-radius: var(--radius-sm); }
  .icon { flex: none; }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
  .eyebrow { font: 600 11.5px var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--success); }
  h1 { font-size: clamp(28px, 4.2vw, 40px); line-height: 1.15; letter-spacing: -0.025em; margin: 14px auto 12px; max-width: 820px; text-align: center; }
  h1 .accent { background: linear-gradient(90deg, var(--secondary), var(--accent)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  h2 { font-size: 24px; letter-spacing: -0.02em; margin: 6px 0 10px; }
  h3 { font-size: 17px; margin: 6px 0; }
  .muted { color: var(--text-muted); }
  button, .button { font: 600 13.5px var(--font-sans); color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 14px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }
  button:hover, .button:hover { border-color: var(--secondary); }
  .primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }

  /* Top bar */
  .nav { position: sticky; top: 0; z-index: 10; background: color-mix(in srgb, var(--bg) 85%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid color-mix(in srgb, var(--secondary) 18%, transparent); }
  .nav .wrap { display: flex; align-items: center; gap: 18px; height: 60px; }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 18px; }
  .brand .mark { display: inline-flex; padding: 5px; border-radius: var(--radius-sm); background: var(--surface-3); color: var(--secondary); }
  .nav-links { display: flex; gap: 4px; margin-left: 12px; }
  .nav-links a { color: var(--text-muted); text-decoration: none; padding: 6px 10px; border-radius: var(--radius); font-size: 14px; }
  .nav-links a:hover { background: var(--surface-2); color: var(--text); }
  .nav .spacer { flex: 1; }
  .theme-toggle { white-space: nowrap; }

  /* Hero */
  .hero { position: relative; padding: 36px 0 44px; text-align: center; overflow: hidden; }
  .glow { position: absolute; left: 50%; top: -140px; width: 720px; height: 340px; transform: translateX(-50%); background: color-mix(in srgb, var(--secondary) 12%, transparent); filter: blur(120px); border-radius: 50%; pointer-events: none; }
  .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; position: relative; }
  .chip { display: inline-flex; align-items: center; gap: 6px; font: 600 11px var(--font-mono); letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); background: var(--surface-2); padding: 4px 10px; border-radius: 999px; }
  .chip.ok { color: var(--success); }
  .chip .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); }
  .tagline { position: relative; max-width: 700px; margin: 0 auto 26px; color: var(--text-muted); font-size: 16.5px; }
  .drop { position: relative; max-width: 720px; margin: 0 auto; border: 2px dashed var(--border); border-radius: var(--radius); background: var(--surface); padding: 38px 24px; cursor: pointer; transition: border-color .12s, background .12s; }
  .drop:hover, .drop:focus-visible, .drop.is-over { border-color: var(--secondary); background: var(--surface-mid); outline: none; }
  .drop .icon { color: var(--secondary); margin-bottom: 8px; }
  .drop strong { display: block; font-size: 19px; margin-bottom: 4px; }
  .drop span { color: var(--text-muted); }
  .hero-actions { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 16px; }
  .privacy { position: relative; margin: 14px auto 0; max-width: 720px; font-size: 13.5px; color: var(--text-muted); }
  .progress { max-width: 720px; margin: 18px auto 0; text-align: left; }
  .progress-track { height: 8px; background: var(--surface-2); border-radius: 4px; overflow: hidden; }
  #progress-bar { height: 100%; width: 0; background: var(--secondary); transition: width .1s; }
  #progress-text { margin-top: 8px; font-size: 13.5px; color: var(--text-muted); font-family: var(--font-mono); }
  .error { max-width: 720px; margin: 18px auto 0; text-align: left; padding: 12px 14px; border-left: 4px solid var(--danger); background: var(--surface-2); border-radius: var(--radius-sm); }
  .load-feedback { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 50; width: min(720px, calc(100% - 24px)); padding: 16px; background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius); }
  .load-feedback .progress, .load-feedback .error { margin: 0; }
  .load-feedback button { margin-top: 10px; }
  .capture-shortcut { position: relative; max-width: 720px; margin: 0 auto 16px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; padding: 10px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); text-align: left; }
  .capture-shortcut strong { font-size: 13.5px; }
  .capture-shortcut code { user-select: all; color: var(--secondary); font-size: 14px; }
  .copy-status { min-height: 1.4em; flex-basis: 100%; text-align: center; color: var(--text-muted); font-size: 12.5px; }

  /* Sections */
  .band { padding: 52px 0; }
  .band.alt { background: var(--canvas); }
  .section-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: end; gap: 12px 24px; margin-bottom: 22px; }
  .section-head p { max-width: 460px; margin: 0; color: var(--text-muted); font-size: 14px; }
  .center { text-align: center; }
  .center .section-head { justify-content: center; text-align: center; }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; min-width: 0; }
  .panel-bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; font: 600 11px var(--font-mono); letter-spacing: 0.05em; text-transform: uppercase; background: var(--surface-2); padding: 6px 10px; border-radius: var(--radius-sm); margin-bottom: 12px; }
  .compare { display: grid; grid-template-columns: 5fr 7fr; gap: 16px; }
  .raw { font: 11.5px/1.6 var(--font-mono); color: var(--text-faint); white-space: pre; overflow-x: auto; }
  .raw .hot { color: var(--danger); }
  .panel-foot { margin-top: 12px; font: 600 12px var(--font-mono); display: flex; align-items: center; gap: 6px; }
  .bad-text { color: var(--danger); } .good-text { color: var(--success); }
  .mini { background: var(--canvas); border-radius: var(--radius-sm); padding: 12px; overflow-x: auto; }
  .mini-head, .mini-row { display: grid; grid-template-columns: 64px repeat(3, minmax(120px, 1fr)); gap: 6px; align-items: center; }
  .actor { background: var(--surface-2); border-radius: var(--radius-sm); padding: 5px 8px; font: 600 11.5px var(--font-mono); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .actor small { display: block; font-weight: 400; color: var(--text-faint); font-size: 10.5px; }
  .mini-row { position: relative; height: 52px; }
  .mini-row.flag { background: color-mix(in srgb, var(--danger-container) 30%, transparent); border-radius: var(--radius-sm); }
  .mini-row .t { font: 10.5px var(--font-mono); color: var(--text-faint); text-align: right; padding-right: 6px; }
  .mini-row.flag .t { color: var(--danger); font-weight: 600; }
  .arrow { position: absolute; top: 25px; height: 2px; background: var(--primary); }
  .arrow::after { content: ""; position: absolute; right: -2px; top: -5px; border: 6px solid transparent; border-left: 9px solid var(--primary); border-right: 0; }
  .arrow.dashed { background: none; border-top: 2px dashed var(--danger); height: 0; }
  .arrow.dashed::after { border-left-color: var(--danger); top: -7px; }
  .arrow .lbl { position: absolute; top: -21px; left: 50%; transform: translateX(-50%); white-space: nowrap; font: 600 10.5px var(--font-mono); background: var(--surface-2); padding: 0 6px; border-radius: var(--radius-sm); }
  .arrow .tags { position: absolute; top: 7px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; white-space: nowrap; }
  .tag { font: 600 10px var(--font-mono); padding: 0 5px; line-height: 16px; border-radius: var(--radius-sm); border: 1px solid currentColor; text-transform: uppercase; }
  .tone-proto { color: var(--secondary); } .tone-good { color: var(--success); } .tone-warn { color: var(--warning); } .tone-bad { color: var(--danger); } .tone-tls { color: var(--seg-tls); } .tone-plain { color: var(--text-muted); }
  .finding { margin-top: 10px; border-left: 4px solid var(--danger); background: var(--surface-mid); border-radius: var(--radius-sm); padding: 10px 12px; font-size: 13px; }
  .finding b { font: 700 10px var(--font-mono); text-transform: uppercase; background: var(--danger); color: var(--bg); padding: 1px 6px; border-radius: var(--radius-sm); margin-right: 6px; }
  .pillars { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
  .pillar { display: flex; flex-direction: column; }
  .pillar .ico { width: 38px; height: 38px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--secondary) 15%, transparent); color: var(--secondary); display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
  .pillar p { color: var(--text-muted); font-size: 14px; margin: 4px 0 12px; }
  .pillar .foot { margin-top: auto; font: 600 12px var(--font-mono); color: var(--text-muted); }
  .pillar .foot::before { content: "✦ "; color: var(--success); }
  .steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .step .num { display: inline-flex; width: 32px; height: 32px; border-radius: 50%; align-items: center; justify-content: center; background: var(--surface-2); color: var(--secondary); font: 700 13px var(--font-mono); }
  .step .stage { float: right; font: 600 11px var(--font-mono); text-transform: uppercase; color: var(--text-faint); margin-top: 8px; }
  .step p { color: var(--text-muted); font-size: 14px; }
  .step .cmd { font: 12.5px var(--font-mono); color: var(--secondary); background: var(--canvas); border-radius: var(--radius-sm); padding: 8px 10px; overflow-x: auto; white-space: nowrap; }
  details.capture { margin-top: 18px; }
  details.capture summary { cursor: pointer; font-weight: 600; }
  details.capture ol { margin: 10px 0 0; padding-left: 22px; }
  details.capture li { margin: 5px 0; }
  .specs { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
  .spec-row { display: grid; grid-template-columns: 130px 1fr; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
  .spec-row:last-child { border-bottom: 0; }
  .spec-row span:first-child { color: var(--text-muted); }
  .pipeline { display: flex; align-items: stretch; gap: 8px; margin-top: 14px; }
  .pipeline div { flex: 1; background: var(--surface-2); border-radius: var(--radius-sm); padding: 8px; text-align: center; font: 600 12px var(--font-mono); }
  .pipeline small { display: block; font-weight: 400; color: var(--text-faint); font-size: 10.5px; margin-top: 2px; }
  .pipeline .to { flex: 0; background: none; padding: 8px 0; color: var(--text-faint); align-self: center; }
  .limits { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
  .limits li { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 10px 12px; background: var(--surface-mid); border-radius: var(--radius-sm); font-size: 14px; }
  .limits li span:last-child { color: var(--text-muted); }
  .cta { text-align: center; }
  .cta .cli { display: inline-block; margin-top: 18px; font: 13px var(--font-mono); background: var(--canvas); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px; color: var(--secondary); }
  .ticks { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 20px; margin-top: 16px; font-size: 13.5px; color: var(--text-muted); }
  .ticks span::before { content: "✔ "; color: var(--success); }
  footer.site { background: var(--canvas); border-top: 1px solid var(--border); padding: 24px 0; font-size: 13px; color: var(--text-muted); }
  footer.site .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; }

  /* Result view */
  #result { display: flex; flex-direction: column; height: 100vh; }
  #result[hidden] { display: none; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; padding: 8px 16px; background: var(--surface); border-bottom: 1px solid var(--border); }
  .toolbar .brand { font-size: 15px; }
  .toolbar .file { color: var(--text-muted); font-family: var(--font-mono); font-size: 13px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .toolbar label { font-size: 13.5px; color: var(--text-muted); display: flex; gap: 6px; align-items: center; }
  .page-picker { min-width: 0; flex: 1 1 390px; max-width: 100%; }
  .page-picker select { min-width: 0; flex: 1; }
  .comparison-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .comparison-controls[hidden], .page-picker[hidden] { display: none; }
  .comparison-controls button[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .optional-har { margin: 8px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--text-muted); max-width: 70ch; }
  .comparison-hint { margin: 0; padding: 6px 16px; font-size: 12px; color: var(--text-muted); background: var(--surface); border-bottom: 1px solid var(--border); }
  .comparison-entry { margin: 12px auto 0; max-width: 720px; color: var(--text-muted); font-size: 13px; }
  .comparison-entry button { margin-right: 8px; }
  .capture-fast-steps { list-style: none; padding: 0; margin: 12px auto 16px; max-width: 720px; display: flex; flex-wrap: wrap; gap: 8px 18px; justify-content: center; font-size: 13px; color: var(--text-muted); }
  .capture-fast-steps strong { color: var(--text); }
  .page-context { min-width: 0; max-width: min(100%, 360px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 12px var(--font-mono); color: var(--text-muted); }
  .toolbar .spacer { flex: 1; }
  select { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px 10px; font: 13.5px var(--font-sans); max-width: 420px; }
  #report-frame { flex: 1; width: 100%; border: 0; background: var(--bg); }

  @media (max-width: 960px) {
    .compare, .specs, .steps { grid-template-columns: 1fr; }
    .specs > * { min-width: 0; }
    .pipeline { flex-wrap: wrap; }
    .pillars { grid-template-columns: 1fr 1fr; }
    .nav-links { display: none; }
  }
  @media (max-width: 600px) {
    .nav .wrap { height: auto; min-height: 60px; padding-top: 10px; padding-bottom: 10px; flex-wrap: wrap; gap: 8px; }
    .nav .brand { margin-right: auto; }
    .nav .spacer { display: none; }
    .pillars { grid-template-columns: 1fr; }
    .limits li, .spec-row { grid-template-columns: 1fr; }
  }
</style>
${themePreferenceScript()}
</head>
<body>
<div id="start">
  <nav class="nav" aria-label="SocketMap">
    <div class="wrap">
      <span class="brand"><span class="mark">${shellIcon("logo")}</span>SocketMap</span>
      <div class="nav-links"><a href="#how">How it works</a><a href="#what">What you get</a><a href="#privacy">Privacy</a><a href="#limits">Limits</a></div>
      <span class="spacer"></span>
      <button type="button" class="theme-toggle" data-theme-toggle>Theme</button>
      <button type="button" class="primary" data-open-sample>${shellIcon("play", 14)}Try the sample capture</button>
    </div>
  </nav>

  <header class="hero">
    <div class="glow" aria-hidden="true"></div>
    <div class="chips">
      <span class="chip ok"><span class="dot"></span>v${VERSION}</span>
      <span class="chip">No install</span>
      <span class="chip">Works offline</span>
      <span class="chip">Nothing uploaded</span>
    </div>
    <div class="wrap">
      <h1>Data-driven insights into <span class="accent">a page load</span></h1>
      <p class="tagline">Drop in a network capture from Chrome or Edge to understand how a page loaded. Explore recorded connections, requests, and timings through visualizations and plain-language insights that help you decide what to investigate next.</p>
      <div class="capture-shortcut" aria-label="Start a Chrome network capture">
        <strong>First, open</strong> <code id="capture-address">chrome://net-export</code>
        <button type="button" id="copy-capture-address">Copy Chrome address</button>
        <span class="copy-status" id="copy-status" aria-live="polite">Copy, then paste into Chrome's address bar and press Enter.</span>
      </div>
      <ol class="capture-fast-steps" aria-label="Quick capture steps">
        <li><strong>1. Start Logging to Disk</strong><br>Keep Strip private information selected.</li>
        <li><strong>2. Load the page</strong><br>Use another tab while logging.</li>
        <li><strong>3. Stop Logging</strong><br>Drop the saved file below.</li>
      </ol>
      <p class="optional-har">Optional: record a HAR (DevTools, Network tab, Export HAR sanitized) and a Performance profile (DevTools, Performance tab, record while reloading, Save profile) at the same time. Drop them with the NetLog, or use Add a HAR and Add a profile once the report opens, to see which script asked for each request, what came from cache, and what the page's code was doing. They are read here and never uploaded. A small helper script can also record this computer's Wi-Fi signal, DNS, proxy settings and the route to each host; the report shows how to run it once your capture is open.</p>
      <div id="drop" class="drop" role="button" tabindex="0" aria-label="Choose a NetLog capture file">
        ${shellIcon("upload", 28)}
        <strong>Drop a NetLog capture here</strong>
        <span>or click to choose the file (chrome-net-export-log.json)</span>
      </div>
      <input type="file" id="file-input" accept=".json,application/json" multiple hidden>
      <p class="comparison-entry"><button type="button" id="compare-files">Compare two captures</button>Choose or drop two NetLog files. First file is A (baseline), second is B (comparison). You can swap them.</p>
      <div class="hero-actions">
        <button type="button" data-open-sample>${shellIcon("play", 14)}No capture yet? Try the sample</button>
        <a class="button" href="#how">How to capture</a>
      </div>
      <p class="privacy">Your capture never leaves this computer. This page reads it locally and uploads nothing; it works with the network turned off.</p>
    </div>
  </header>

  <section class="band alt" aria-labelledby="compare-title">
    <div class="wrap">
      <div class="section-head">
        <div><span class="eyebrow">From raw capture to clear insights</span><h2 id="compare-title">Recorded events become visual, actionable insights</h2></div>
        <p>A browser network log records lookups, connections, certificates, and requests as separate events. SocketMap links the recorded activity together so you can understand timings, spot patterns, and decide what to investigate next.</p>
      </div>
      <div class="compare">
        <div class="panel">
          <div class="panel-bar"><span class="bad-text">Raw NetLog events</span><span class="muted">chrome-net-export-log.json</span></div>
          <div class="raw">{"phase":1,"source":{"id":5,"type":5},"time":"1125","type":33}
{"params":{"address_list":["198.51.100.99:8080"]},...}
{"phase":2,"source":{"id":45,"type":5},"type":33,
 "params":{"local_address":"192.0.2.10:50002"}}
{"params":{"certificates":["-----BEGIN CERT...
<span class="hot">{"params":{"is_issued_by_known_root":false}}</span>
{"params":{"proxy_info":"PROXY proxy.corp:8080"}}
{"params":{"source_dependency":{"id":43}},...}
... 19,000 more lines</div>
          <div class="panel-foot bad-text">Linking these by hand takes hours</div>
        </div>
        <div class="panel">
          <div class="panel-bar"><span style="color:var(--secondary)">SocketMap sequence view</span><span class="muted">report.html</span></div>
          <div class="mini" role="img" aria-label="Example of a SocketMap sequence view">
            <div class="mini-head"><span></span><span class="actor">Browser<small>192.0.2.10</small></span><span class="actor">portal.example.com<small>198.51.100.20</small></span><span class="actor">api.example.org<small>198.51.100.99</small></span></div>
            <div class="mini-row"><span class="t">+0ms</span><span class="arrow" style="left:calc(64px + (100% - 64px) * 0.1667);width:calc((100% - 64px) * 0.3333)"><span class="lbl">GET /sites/team/home.aspx</span><span class="tags"><span class="tag tone-proto">H2</span><span class="tag tone-good">200</span><span class="tag tone-plain">wait 500ms</span></span></span></div>
            <div class="mini-row"><span class="t">+904ms</span><span class="arrow" style="left:calc(64px + (100% - 64px) * 0.1667);width:calc((100% - 64px) * 0.6667)"><span class="lbl">POST /v1/data</span><span class="tags"><span class="tag tone-proto">HTTP/1.1</span><span class="tag tone-good">200</span><span class="tag tone-plain">wait 200ms</span></span></span></div>
            <div class="mini-row flag"><span class="t">+985ms</span><span class="arrow dashed" style="left:calc(64px + (100% - 64px) * 0.1667);width:calc((100% - 64px) * 0.6667)"><span class="lbl">TCP + TLS handshake</span><span class="tags"><span class="tag tone-bad">420ms</span><span class="tag tone-tls">TLS 1.2</span><span class="tag tone-bad">Private root</span></span></span></div>
          </div>
          <div class="finding"><b>High</b>TLS inspection: api.example.org's certificate was issued by Contoso Inspection CA, not a public authority. Who to involve: Network security.</div>
          <div class="panel-foot good-text">${shellIcon("check", 14)}Every connection, delay, and certificate, linked and explained</div>
        </div>
      </div>
    </div>
  </section>

  <section class="band center" id="what" aria-labelledby="pillars-title">
    <div class="wrap">
      <div class="section-head"><div><span class="eyebrow">Built for informed decisions</span><h2 id="pillars-title">Simple to use, detailed enough to act on</h2><p class="muted">No installer, no account, no cloud upload.</p></div></div>
      <div class="pillars">
        ${PILLARS.map(([ico, eyebrow, title, text, foot]) => `
        <article class="panel pillar" style="text-align:left"${ico === "lock" ? ' id="privacy"' : ""}>
          <span class="ico">${shellIcon(ico)}</span>
          <span class="eyebrow">${eyebrow}</span>
          <h3>${title}</h3>
          <p>${text}</p>
          <span class="foot">${foot}</span>
        </article>`).join("")}
      </div>
    </div>
  </section>

  <section class="band alt" id="how" aria-labelledby="how-title">
    <div class="wrap">
      <div class="section-head"><div><span class="eyebrow">How it works</span><h2 id="how-title">From a page load to insights in three steps</h2></div></div>
      <div class="steps">
        ${STEPS.map(([num, stage, title, text, cmd]) => `
        <article class="panel step">
          <span class="num">${num}</span><span class="stage">${stage}</span>
          <h3>${title}</h3>
          <p>${text}</p>
          <div class="cmd">${cmd}</div>
        </article>`).join("")}
      </div>
      <details class="capture panel" open>
        <summary>How to capture, step by step (2 minutes, any Chrome or Edge browser)</summary>
        <ol>${CAPTURE_STEPS.map(s => `<li>${s}</li>`).join("")}</ol>
      </details>
    </div>
  </section>

  <section class="band" aria-labelledby="specs-title">
    <div class="wrap">
      <div class="specs">
        <div>
          <span class="eyebrow">What you get</span>
          <h2 id="specs-title">One report, everything the capture recorded</h2>
          <p class="muted">Every number in a report comes from the capture itself. When Chrome did not record something, the report says "not recorded" instead of guessing.</p>
          <div class="pipeline" aria-label="How SocketMap processes a capture">
            <div>Capture file<small>net-export JSON</small></div><span class="to">→</span>
            <div>Streaming reader<small>one event at a time</small></div><span class="to">→</span>
            <div>Analyzer<small>links requests, DNS, certificates</small></div><span class="to">→</span>
            <div>Report<small>findings and explanations</small></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-bar"><span style="color:var(--primary)">Specification</span><span class="good-text">v${VERSION}</span></div>
          ${SPECS.map(([k, v]) => `<div class="spec-row"><span>${k}</span><span>${v}</span></div>`).join("")}
        </div>
      </div>
    </div>
  </section>

  <section class="band alt" id="limits" aria-labelledby="limits-title">
    <div class="wrap">
      <div class="section-head"><div><span class="eyebrow">Honest limits</span><h2 id="limits-title">What a network log cannot show</h2></div><p>A page load involves more than network activity. These areas need additional evidence to understand.</p></div>
      <ul class="limits">${LIMITS.map(([what, next]) => `<li><span>${what}</span><span>${next}</span></li>`).join("")}</ul>
    </div>
  </section>

  <section class="band cta" aria-labelledby="cta-title">
    <div class="wrap">
      <h2 id="cta-title">Ready to look at your own page?</h2>
      <p class="muted">Capture a page load, then drop the file at the top of this page. Or see a finished report first.</p>
      <div class="hero-actions"><a class="button primary" href="#drop">Choose a capture</a><button type="button" data-open-sample>${shellIcon("play", 14)}Try the sample capture</button></div>
      <div class="cli">Power users: <span class="muted">node bin/traceviz.mjs capture.json --open</span></div>
      <div class="ticks"><span>Nothing uploaded</span><span>No remote calls</span><span>Secrets removed from reports</span></div>
    </div>
  </section>

  <footer class="site">
    <div class="wrap"><span><strong>SocketMap</strong> v${VERSION} · MIT license · zero dependencies</span><span>Full instructions: README and docs/USER-GUIDE.md in the SocketMap repository.</span></div>
  </footer>
</div>
<input type="file" id="compare-input" accept=".json,application/json" multiple hidden>
<input type="file" id="second-input" accept=".json,application/json" hidden>
<input type="file" id="har-input" accept=".har,.json,application/json" hidden>
<input type="file" id="profile-input" accept=".json,.gz,application/json,application/gzip" hidden>
<input type="file" id="path-input" accept=".json,application/json" hidden>
<div id="load-feedback" class="load-feedback" hidden>
  <div id="progress" class="progress" hidden>
    <div class="progress-track"><div id="progress-bar"></div></div>
    <div id="progress-text" role="status"></div>
  </div>
  <div id="error" class="error" role="alert" hidden></div>
  <button type="button" id="dismiss-error" hidden>Dismiss</button>
</div>
<div id="result" hidden>
  <div class="toolbar">
    <span class="brand">SocketMap</span>
    <span class="file" id="file-name"></span>
    <span class="spacer"></span>
    <button type="button" id="add-har" hidden>Add a HAR</button>
    <button type="button" id="add-profile" hidden>Add a profile</button>
    <button type="button" id="add-path" hidden>Add network path</button>
    <button type="button" id="add-comparison">Compare with another capture</button>
    <button type="button" data-theme-toggle>Theme</button>
    <button type="button" id="open-another">Open another capture</button>
    <button type="button" id="save-report" class="primary">Save report</button>
  </div>
  <div class="toolbar">
    <div id="comparison-controls" class="comparison-controls" role="group" aria-label="Comparison views" hidden>
      <button type="button" id="view-comparison" aria-pressed="true">Comparison</button>
      <button type="button" id="view-a" aria-pressed="false">A report</button>
      <button type="button" id="view-b" aria-pressed="false">B report</button>
      <button type="button" id="swap-captures">Swap A / B</button>
    </div>
    <label class="page-picker"><span id="page-label">Page / site</span> <select id="page-select" aria-label="Page or site to analyze"></select></label>
    <label class="page-picker" id="page-picker-b" hidden>B page / site <select id="page-select-b" aria-label="B page or site to analyze"></select></label>
    <span class="page-context" id="page-context" title=""></span>
  </div>
  <p id="comparison-hint" class="comparison-hint" hidden>A is the baseline. Changes show B minus A. Select the same page or action in each capture for a useful comparison.</p>
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
