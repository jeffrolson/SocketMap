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
import { parseDesignTokens, themeCss } from "../src/theme.mjs";
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
  "In another tab, load the slow page or repeat the slow action.",
  "Go back and click <strong>Stop Logging</strong>. Drop the saved file here."
];

/**
 * @param {{ theme?: object }} options  theme: design tokens for a company build; default is DESIGN.md
 */
export function buildViewerHtml({ theme } = {}) {
  const bundle = bundleViewer();
  const themeOverride = theme ? `<script>globalThis.SOCKETMAP_THEME = ${JSON.stringify(theme).replace(/</g, "\\u003c")};</script>\n` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="SocketMap ${VERSION}">
<title>SocketMap: why is this page slow?</title>
<style>
  :root {
    ${themeCss(theme || DEFAULT_THEME)}
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); font: 15px/1.55 var(--font-sans); }
  #start { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
  h1 { font-size: 28px; margin: 0 0 6px; }
  .tagline { color: var(--text-muted); margin: 0 0 28px; }
  .drop { border: 2px dashed var(--border); border-radius: var(--radius); background: var(--surface); padding: 48px 24px; text-align: center; cursor: pointer; transition: border-color .15s, background .15s; }
  .drop:hover, .drop:focus-visible, .drop.is-over { border-color: var(--primary); background: var(--surface-2); outline: none; }
  .drop strong { display: block; font-size: 18px; margin-bottom: 6px; }
  .drop span { color: var(--text-muted); }
  .privacy { margin: 14px 0 0; font-size: 13.5px; color: var(--text-muted); }
  .progress { margin-top: 20px; }
  .progress-track { height: 8px; background: var(--surface-2); border-radius: 4px; overflow: hidden; }
  #progress-bar { height: 100%; width: 0; background: var(--primary); transition: width .1s; }
  #progress-text { margin-top: 8px; font-size: 13.5px; color: var(--text-muted); font-family: var(--font-mono); }
  .error { margin-top: 20px; padding: 12px 14px; border-left: 4px solid var(--poor); background: var(--surface-2); border-radius: 6px; }
  .how { margin-top: 36px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 22px; }
  .how h2 { font-size: 16px; margin: 0 0 8px; }
  .how ol { margin: 0; padding-left: 20px; }
  .how li { margin: 4px 0; }
  code { font-family: var(--font-mono); font-size: 13px; background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }
  #result { display: flex; flex-direction: column; height: 100%; }
  #result[hidden] { display: none; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; padding: 10px 16px; background: var(--surface); border-bottom: 1px solid var(--border); }
  .toolbar .brand { font-weight: 700; }
  .toolbar .file { color: var(--text-muted); font-family: var(--font-mono); font-size: 13px; }
  .toolbar label { font-size: 13.5px; color: var(--text-muted); display: flex; gap: 6px; align-items: center; }
  .toolbar .spacer { flex: 1; }
  select, button { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px; font: 13.5px var(--font-sans); }
  select { max-width: 420px; }
  button { cursor: pointer; }
  button:hover, select:hover { border-color: var(--primary); }
  button.primary { background: var(--primary); color: var(--bg); border-color: var(--primary); font-weight: 600; }
  #report-frame { flex: 1; width: 100%; border: 0; background: var(--bg); }
</style>
</head>
<body>
<main id="start">
  <h1>SocketMap</h1>
  <p class="tagline">Drop in a network capture from Chrome or Edge to see how a page loaded: every connection, request, and delay, with what slowed it down explained in plain language.</p>
  <div id="drop" class="drop" role="button" tabindex="0" aria-label="Choose a NetLog capture file">
    <strong>Drop a NetLog capture here</strong>
    <span>or click to choose the file</span>
  </div>
  <input type="file" id="file-input" accept=".json,application/json" hidden>
  <p class="privacy">Your capture never leaves this computer. This page reads it locally and uploads nothing; it works with the network turned off.</p>
  <div id="progress" class="progress" hidden>
    <div class="progress-track"><div id="progress-bar"></div></div>
    <div id="progress-text"></div>
  </div>
  <div id="error" class="error" role="alert" hidden></div>
  <section class="how">
    <h2>How to capture (2 minutes, any Chrome or Edge browser)</h2>
    <ol>${CAPTURE_STEPS.map(s => `<li>${s}</li>`).join("")}</ol>
  </section>
</main>
<div id="result" hidden>
  <div class="toolbar">
    <span class="brand">SocketMap</span>
    <span class="file" id="file-name"></span>
    <label>Page <select id="page-select" aria-label="Page to analyze"></select></label>
    <span class="spacer"></span>
    <button type="button" id="open-another">Open another capture</button>
    <button type="button" id="save-report" class="primary">Save report</button>
  </div>
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
