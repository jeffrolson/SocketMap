/**
 * Viewer core: the capture-to-report pipeline without any page or file APIs.
 * The browser viewer feeds it decoded text chunks; tests feed it strings.
 */

import { createNetLogTokenizer } from "../parsers/netlog-stream.mjs";
import { createNetLogAnalyzer } from "../parsers/netlog-analyzer.mjs";
import { analyzeCapture } from "../analysis.mjs";
import { renderReportHtml } from "../renderer/report.html.mjs";

/** Incremental reader: write() text chunks as they arrive, then finish() for the capture model. */
export function createCaptureReader() {
  const analyzer = createNetLogAnalyzer();
  const tokenizer = createNetLogTokenizer({ onTopLevel: analyzer.setTopLevel, onEvent: analyzer.addEvent });
  return {
    write: (chunk) => tokenizer.write(chunk),
    finish: () => {
      tokenizer.end();
      return analyzer.finish();
    }
  };
}

/**
 * Analyzes one page of the capture (default: the page that was loaded) and renders the report.
 * theme: design tokens; omitted means the built-in DESIGN.md theme.
 */
export function buildReport(model, site, theme) {
  const analysis = analyzeCapture(model, { site: site || undefined });
  return { analysis, html: renderReportHtml(model, analysis, theme ? { theme } : {}) };
}

/** Checks the first few KB of a file before reading all of it. */
export function checkCaptureStart(head) {
  const text = String(head || "");
  if (text.includes('"constants"') || text.includes('"events"')) return { ok: true };
  if (text.includes('"log"') && (text.includes('"entries"') || text.includes('"creator"'))) {
    return { ok: false, reason: "This is a HAR file. The viewer reads NetLog captures from chrome://net-export or edge://net-export. HAR files work with the command-line tool." };
  }
  return { ok: false, reason: "This does not look like a NetLog capture. Save one from chrome://net-export or edge://net-export and drop that file here." };
}
