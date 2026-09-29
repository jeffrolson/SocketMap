/**
 * Viewer core: the capture-to-report pipeline without any page or file APIs.
 * The browser viewer feeds it decoded text chunks; tests feed it strings.
 */

import { createNetLogTokenizer } from "../parsers/netlog-stream.mjs";
import { createNetLogAnalyzer } from "../parsers/netlog-analyzer.mjs";
import { analyzeCapture } from "../analysis.mjs";
import { renderReportHtml } from "../renderer/report.html.mjs";
import { compareCaptures } from "../comparison.mjs";
import { renderComparisonHtml } from "../renderer/comparison.html.mjs";

/** Incremental reader: write() text chunks as they arrive, then finish() for the capture model. */
export function createCaptureReader({ constants } = {}) {
  const analyzer = createNetLogAnalyzer();
  if (constants) analyzer.setTopLevel("constants", constants);
  const tokenizer = createNetLogTokenizer({ onTopLevel: analyzer.setTopLevel, onEvent: analyzer.addEvent });
  return {
    write: (chunk) => tokenizer.write(chunk),
    finish: () => {
      analyzer.setTopLevel("captureIntegrity", tokenizer.end());
      return analyzer.finish();
    }
  };
}

/**
 * Analyzes one page of the capture (default: the page that was loaded) and renders the report.
 * theme: design tokens; omitted means the built-in DESIGN.md theme.
 * source: { name, bytes } of the capture file, shown in the report header.
 */
export function buildReport(model, site, theme, source) {
  const analysis = analyzeCapture(model, { site: site || undefined });
  const options = {};
  if (theme) options.theme = theme;
  if (source) options.source = source;
  return { analysis, html: renderReportHtml(model, analysis, options) };
}

/** Both capture models stay local. The resulting comparison is a standalone HTML document. */
export function buildComparison(modelA, modelB, options = {}) {
  const comparison = compareCaptures(modelA, modelB, options);
  return { comparison, html: renderComparisonHtml(comparison, options.theme ? { theme: options.theme } : {}) };
}

/** True when the first bytes look like a HAR (HTTP Archive) rather than a NetLog. */
export function looksLikeHar(head) {
  const text = String(head || "");
  if (text.includes('"constants"') || text.includes('"events"')) return false;
  return text.includes('"log"') && (text.includes('"entries"') || text.includes('"creator"') || text.includes('"pages"'));
}

/** True when the first bytes look like a Chrome trace (a DevTools Performance profile). */
export function looksLikeTrace(head) {
  const text = String(head || "");
  if (text.includes('"constants"') && text.includes('"events"')) return false;
  if (text.includes('"log"') && text.includes('"entries"')) return false;
  return text.includes('"traceEvents"') || (text.trimStart().startsWith("[") && /"ph"\s*:/.test(text) && /"ts"\s*:/.test(text));
}

/** Checks the first few KB of a file before reading all of it. */
export function checkCaptureStart(head) {
  const text = String(head || "");
  if (text.includes('"constants"') || text.includes('"events"')) return { ok: true };
  if (text.includes('"log"') && (text.includes('"entries"') || text.includes('"creator"'))) {
    return { ok: false, reason: "This is a HAR file. The viewer reads NetLog captures from chrome://net-export or edge://net-export. HAR files work with the command-line tool." };
  }
  // A long comment can precede the NetLog keys. Let the streaming analyzer
  // validate plausible JSON rather than rejecting it from a short prefix.
  if (text.trimStart().startsWith("{")) return { ok: true };
  return { ok: false, reason: "This does not look like a NetLog capture. Save one from chrome://net-export or edge://net-export and drop that file here." };
}
