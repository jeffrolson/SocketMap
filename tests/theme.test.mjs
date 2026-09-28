import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDesignTokens, themeCss, themeModeCss, themePreferenceScript } from "../src/theme.mjs";
import { DEFAULT_THEME } from "../src/renderer/theme.generated.mjs";
import { parseNetLog } from "../src/parsers/netlog-parser.mjs";
import { analyzeCapture } from "../src/analysis.mjs";
import { renderReportHtml } from "../src/renderer/report.html.mjs";
import { buildViewerHtml } from "../scripts/build-viewer.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const designMd = readFileSync(join(ROOT, "DESIGN.md"), "utf8");
const COMPANY = `---
name: Contoso
colors:
  primary: '#123456'
  error: '#abcdef'
typography:
  headline-md:
    fontFamily: Contoso Sans
    fontSize: 1rem
---
Company theme.
`;

let dir;
let capturePath;
let model;
let analysis;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "socketmap-theme-"));
  capturePath = join(dir, "page-load.json");
  writeFileSync(capturePath, toNetLogText(buildPageLoadNetLog()));
  writeFileSync(join(dir, "DESIGN.md"), COMPANY);
  model = await parseNetLog(capturePath);
  analysis = analyzeCapture(model);
});

after(() => rmSync(dir, { recursive: true, force: true }));

describe("Design tokens", () => {
  it("reads the project's DESIGN.md front matter", () => {
    const tokens = parseDesignTokens(designMd);
    assert.equal(tokens.colors.primary, "#93ccff");
    assert.equal(tokens.colors.warning, "#f59e0b");
    assert.equal(tokens.typography["body-md"].fontFamily, "JetBrains Mono");
    assert.equal(tokens.rounded.lg, "0.5rem");
  });

  it("keeps the generated default theme in sync with DESIGN.md", () => {
    assert.deepEqual(DEFAULT_THEME, parseDesignTokens(designMd));
  });

  it("turns tokens into CSS variables with local font fallbacks", () => {
    const css = themeCss(DEFAULT_THEME);
    assert.ok(css.includes("--color-primary: #93ccff;"));
    assert.ok(css.includes('--font-sans: "Inter", -apple-system'));
    assert.ok(css.includes('--font-mono: "JetBrains Mono", "Cascadia Mono"'));
    assert.ok(css.includes("--poor: var(--danger)"));
  });

  it("derives a token-based light appearance and a local theme preference boot script", () => {
    const light = themeModeCss(DEFAULT_THEME);
    assert.ok(light.includes('html[data-theme="light"]'));
    assert.ok(light.includes("--color-background: #ffffff;"));
    assert.ok(light.includes("--color-chart-tls: #6d28d9;"));
    const customLight = themeModeCss({ "light-colors": { primary: "#123456" } }, DEFAULT_THEME);
    assert.ok(customLight.includes("--color-primary: #123456;"));
    assert.ok(customLight.includes("--color-background: #ffffff;"), "custom light tokens extend the default light palette");
    const boot = themePreferenceScript();
    assert.ok(boot.includes("socketmap-theme"));
    assert.ok(boot.includes("prefers-color-scheme: light"));
    assert.ok(boot.includes("socketmap:theme"));
    assert.ok(boot.includes("event.source !== window.parent"));
    assert.ok(boot.includes("apply(root.dataset.theme, false)"), "labels update after controls enter the DOM");
  });

  it("drops token values that could break out of the style block", () => {
    const css = themeCss({ colors: { primary: "red; } body { display: none", "bad name;": "#fff" } });
    assert.ok(!css.includes("display: none"));
    assert.ok(!css.includes("bad name"));
  });

  it("explains a missing front matter", () => {
    assert.throws(() => parseDesignTokens("# just prose"), /front matter/);
  });
});

describe("Themed output", () => {
  it("styles the report from DESIGN.md with nothing remote", () => {
    const html = renderReportHtml(model, analysis);
    assert.ok(html.includes("--color-primary: #93ccff;"));
    assert.ok(!/fonts\.googleapis|fonts\.gstatic|cdn\.tailwindcss/.test(html));
  });

  it("applies a company theme to the report", () => {
    const html = renderReportHtml(model, analysis, { theme: parseDesignTokens(COMPANY) });
    assert.ok(html.includes("--color-primary: #123456;"));
    assert.ok(html.includes('"Contoso Sans"'));
    assert.ok(html.includes("--bg: var(--color-background, #0b1326)"), "missing tokens fall back");
  });

  it("applies a company theme from the command line", () => {
    const out = join(dir, "report.html");
    execFileSync(process.execPath, [join(ROOT, "bin/traceviz.mjs"), capturePath, "-o", out, "--theme", join(dir, "DESIGN.md")]);
    assert.ok(readFileSync(out, "utf8").includes("--color-primary: #123456;"));
  });

  it("builds a company-themed viewer", () => {
    const html = buildViewerHtml({ theme: parseDesignTokens(COMPANY) });
    assert.ok(html.includes("--color-primary: #123456;"));
    assert.ok(html.includes("globalThis.SOCKETMAP_THEME"));
  });
});
