/**
 * Theme loader: turns a DESIGN.md (Google design.md format) into CSS variables.
 *
 * Only the YAML front matter is read. Colors become `--color-<token>`; the report's
 * semantic variables (--bg, --primary, --poor, --seg-dns, ...) are defined in terms
 * of those tokens, with fallbacks, so a partial company theme still renders.
 * Fonts are named first and fall back to system faces: nothing is downloaded.
 * No Node APIs: runs in the browser too.
 */

const SANS_FALLBACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MONO_FALLBACK = '"Cascadia Mono", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

function unquote(value) {
  const v = value.trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) return v.slice(1, -1);
  return v;
}

/**
 * Parses the YAML front matter of a DESIGN.md: nested maps of scalar values, indented
 * with spaces. That is all the design.md token format uses.
 */
export function parseDesignTokens(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(markdown || ""));
  if (!match) throw new Error("DESIGN.md has no YAML front matter (--- ... ---) with design tokens.");
  const root = {};
  const stack = [{ indent: -1, node: root }];
  for (const raw of match[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    const m = /^([^:]+):(.*)$/.exec(raw.trim());
    if (!m) continue;
    const key = unquote(m[1]);
    const value = m[2].trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    if (value === "") {
      parent[key] = {};
      stack.push({ indent, node: parent[key] });
    } else {
      parent[key] = unquote(value);
    }
  }
  return root;
}

// Values end up inside a <style> block: allow only characters CSS values need.
const SAFE = /^[#a-zA-Z0-9 .,%()'"_-]+$/;
const safe = (v) => (typeof v === "string" && SAFE.test(v) ? v : null);
const fontName = (v) => (safe(v) ? `"${v.replace(/["']/g, "")}"` : null);

/** CSS custom properties for :root, from parsed design tokens. */
export function themeCss(tokens = {}) {
  const lines = [];
  for (const [name, value] of Object.entries(tokens.colors || {})) {
    if (/^[a-z0-9-]+$/i.test(name) && safe(value)) lines.push(`--color-${name}: ${value};`);
  }
  const type = tokens.typography || {};
  const sans = fontName(type["headline-md"]?.fontFamily || type["headline-lg"]?.fontFamily);
  const mono = fontName(type["body-md"]?.fontFamily || type["label-md"]?.fontFamily);
  lines.push(`--font-sans: ${sans ? `${sans}, ` : ""}${SANS_FALLBACK};`);
  lines.push(`--font-mono: ${mono ? `${mono}, ` : ""}${MONO_FALLBACK};`);
  const rounded = tokens.rounded || {};
  lines.push(`--radius-sm: ${safe(rounded.DEFAULT) || "0.25rem"};`);
  lines.push(`--radius: ${safe(rounded.lg) || "0.5rem"};`);

  // Semantic roles used by the report and viewer.
  const c = (token, fallback) => `var(--color-${token}, ${fallback})`;
  lines.push(
    `--bg: ${c("background", "#0b1326")};`,
    `--canvas: ${c("surface-container-lowest", "#060e20")};`,
    `--surface: ${c("surface-container-low", "#131b2e")};`,
    `--surface-mid: ${c("surface-container", "#171f33")};`,
    `--surface-2: ${c("surface-container-high", "#222a3d")};`,
    `--surface-3: ${c("surface-container-highest", "#2d3449")};`,
    `--border: ${c("outline-variant", "#3f4850")};`,
    `--border-strong: ${c("outline", "#89929b")};`,
    `--text: ${c("on-surface", "#dae2fd")};`,
    `--text-muted: ${c("on-surface-variant", "#bfc7d2")};`,
    `--text-faint: ${c("outline", "#89929b")};`,
    `--primary: ${c("primary", "#93ccff")};`,
    `--secondary: ${c("secondary", "#7bd0ff")};`,
    `--accent: ${c("primary-container", "#3198dc")};`,
    `--on-accent: ${c("on-primary-container", "#002c47")};`,
    `--success: ${c("tertiary", "#4edea3")};`,
    `--warning: ${c("warning", "#f59e0b")};`,
    `--danger: ${c("error", "#ffb4ab")};`,
    `--danger-container: ${c("error-container", "#93000a")};`,
    "--best: var(--success); --better: var(--secondary); --good: var(--warning); --poor: var(--danger); --unknown: var(--text-faint);",
    "--sev-high: var(--danger); --sev-medium: var(--warning); --sev-info: var(--text-faint);"
  );
  const charts = { redirect: "#c084fc", queue: "#3f4850", proxy: "#f472b6", dns: "#3198dc", connect: "#f59e0b", tls: "#a78bfa", stalled: "#89929b", send: "#bfc7d2", wait: "#4edea3", download: "#7bd0ff" };
  for (const [k, v] of Object.entries(charts)) lines.push(`--seg-${k}: ${c(`chart-${k}`, v)};`);
  return lines.join("\n    ");
}

/**
 * Semantic overrides for the light appearance. These deliberately derive from
 * the same DESIGN.md tokens as the dark appearance, so a company theme keeps
 * its identity in both modes.
 */
export function themeModeCss(tokens = {}, defaultTokens = tokens) {
  const colors = { ...(defaultTokens["light-colors"] || {}), ...(tokens["light-colors"] || {}) };
  const lines = [];
  for (const [name, value] of Object.entries(colors)) {
    if (/^[a-z0-9-]+$/i.test(name) && safe(value)) lines.push(`--color-${name}: ${value};`);
  }
  return `
  html[data-theme="light"] {
    ${lines.join("\n    ")}
  }`;
}

/**
 * Inline, browser-only boot code shared by the standalone viewer and reports.
 * It is intentionally static: no capture contents reach this script.
 */
export function themePreferenceScript() {
  return `<script>(function () {
  var key = "socketmap-theme";
  var root = document.documentElement;
  function valid(value) { return value === "light" || value === "dark"; }
  function preferred() {
    if (valid(root.dataset.theme)) return root.dataset.theme;
    try { var saved = localStorage.getItem(key); if (valid(saved)) return saved; } catch (_) {}
    return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function apply(theme, save) {
    if (!valid(theme)) return;
    root.dataset.theme = theme;
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      var next = theme === "dark" ? "light" : "dark";
      button.setAttribute("aria-pressed", String(theme === "dark"));
      button.setAttribute("aria-label", "Switch to " + next + " theme");
      button.textContent = theme === "dark" ? "Light theme" : "Dark theme";
    });
    if (save) try { localStorage.setItem(key, theme); } catch (_) {}
    window.dispatchEvent(new CustomEvent("socketmap:themechange", { detail: { theme: theme } }));
    if (save && window.parent !== window) window.parent.postMessage({ type: "socketmap:theme", theme: theme }, "*");
  }
  apply(preferred(), false);
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.addEventListener("click", function () { apply(root.dataset.theme === "dark" ? "light" : "dark", true); });
    });
    apply(root.dataset.theme, false);
  });
  window.addEventListener("message", function (event) {
    var data = event && event.data;
    if (event.source !== window.parent || !data || data.type !== "socketmap:theme" || !valid(data.theme)) return;
    apply(data.theme, false);
  });
  window.SocketMapTheme = { set: function (theme) { apply(theme, false); }, get: function () { return root.dataset.theme; } };
})();</script>`;
}
