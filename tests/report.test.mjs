import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseNetLog } from "../src/parsers/netlog-parser.mjs";
import { analyzeCapture } from "../src/analysis.mjs";
import { renderReportHtml } from "../src/renderer/report.html.mjs";
import { buildPageLoadNetLog, toNetLogText } from "./fixtures/netlog-builder.mjs";

let dir;
let html;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "socketmap-report-"));
  const path = join(dir, "page-load.json");
  writeFileSync(path, toNetLogText(buildPageLoadNetLog()));
  const model = await parseNetLog(path);
  html = renderReportHtml(model, analyzeCapture(model));
});

after(() => rmSync(dir, { recursive: true, force: true }));

describe("Report HTML", () => {
  it("is one self-contained file with no remote resources", () => {
    assert.ok(html.startsWith("<!DOCTYPE html>"));
    assert.ok(!/<script[^>]+src=/i.test(html), "no external scripts");
    assert.ok(!/<link[^>]+href=/i.test(html), "no external stylesheets");
    assert.ok(!/url\(\s*['"]?https?:/i.test(html), "no remote CSS assets");
  });

  it("shows the environment, findings, hosts, waterfall, and sequence", () => {
    assert.ok(html.includes("portal.example.com"));
    assert.ok(html.includes("192.0.2.10"), "local IP");
    assert.ok(html.includes("192.0.2.53"), "DNS server");
    assert.ok(html.includes("Contoso Inspection CA"), "certificate issuer");
    assert.ok(html.includes("198.51.100.20"), "server IP");
    assert.ok(html.includes('id="findings"'));
    assert.ok(html.includes('id="hosts"'));
    assert.ok(html.includes('id="waterfall"'));
    assert.ok(html.includes('id="sequence"'));
    assert.ok(html.includes("<svg"), "sequence diagram");
    assert.equal((html.match(/<details class="wf-row/g) || []).length, 5, "one waterfall row per page request");
    assert.ok(html.includes('class="wf-row is-failed"'), "the refused localhost call is marked failed");
  });

  it("contains the AI summary text", () => {
    assert.ok(html.includes('id="ai-summary"'));
  });

  it("carries no secrets and no invented hops", () => {
    for (const secret of ["SECRET123", "SUPERSECRET", "SECRETCOOKIE", "TOKENSECRET", "PROXYSECRET", "APIKEYSECRET"]) {
      assert.ok(!html.includes(secret), secret);
    }
    assert.ok(!html.includes("Route Handler"));
    assert.ok(!html.includes("Upstream Handler"));
  });
});
