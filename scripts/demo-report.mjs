#!/usr/bin/env node

/**
 * demo-report.mjs
 * Builds a report from the built-in synthetic capture, so anyone can see what
 * SocketMap produces without capturing first:
 *   npm run demo            -> demo-report.html
 *   npm run demo -- out.html
 * The synthetic capture uses documentation IP addresses only.
 */

import { writeFileSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";
import { parseNetLog } from "../src/parsers/netlog-parser.mjs";
import { analyzeCapture } from "../src/analysis.mjs";
import { renderReportHtml } from "../src/renderer/report.html.mjs";

const out = resolve(process.cwd(), process.argv[2] || "demo-report.html");
const dir = mkdtempSync(join(tmpdir(), "socketmap-demo-"));
try {
  const capture = join(dir, "sample-capture.json");
  writeFileSync(capture, toNetLogText(buildPageLoadNetLog()));
  const model = await parseNetLog(capture);
  const html = renderReportHtml(model, analyzeCapture(model), {
    source: { name: "sample-capture.json (synthetic example)", bytes: statSync(capture).size }
  });
  writeFileSync(out, html, "utf8");
  console.log(`\x1b[32m✔ Demo report:\x1b[0m ${out}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
