import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseNetLog } from "../src/parsers/netlog-parser.mjs";
import { analyzeCapture } from "../src/analysis.mjs";
import { renderReportHtml } from "../src/renderer/report.html.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";

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
  it("emits executable scripts that compile after HTML extraction", () => {
    for (const [, attributes, script] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (attributes.includes("application/json")) continue;
      assert.doesNotThrow(() => new vm.Script(script));
    }
  });

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
    assert.equal((html.match(/<details class="wf-row/g) || []).length, 5, "one waterfall row per page request");
    assert.ok(/<details class="wf-row[^"]*flag-error[^"]*" id="req-30"/.test(html), "the refused localhost call is marked failed");
  });

  it("lays the report out as views with a sidebar, top bar, and status bar", () => {
    for (const view of ["overview", "view-waterfall", "view-sequence", "view-environment", "view-ai", "view-learn"]) {
      assert.ok(html.includes(`id="${view}"`), view);
    }
    for (const nav of ["#overview", "#waterfall", "#sequence", "#environment", "#ai-summary", "#learn"]) {
      assert.ok(html.includes(`href="${nav}" data-nav=`), nav);
    }
    assert.ok(html.includes('class="topbar"'));
    assert.ok(html.includes('class="statusbar"'));
    assert.ok(html.includes("events read"));
  });

  it("shows the sequence as rows under a sticky host header", () => {
    assert.ok(/\.seq-head \{ position: sticky/.test(html), "host header stays pinned");
    assert.ok(html.includes('title="portal.example.com (198.51.100.20)"'), "each host names its IP");
    const rows = html.match(/<div class="seq-row [^"]*"/g) || [];
    assert.equal(rows.filter(r => r.includes("kind-request")).length, 5, "one row per request");
    assert.ok(rows.some(r => r.includes("kind-connect") && r.includes("flag-inspected")), "inspected handshake is flagged");
    assert.ok(html.includes('<span class="seq-t">+0ms</span>') || html.includes('<span class="seq-t">+&lt;1ms</span>') || /<span class="seq-t">\+/.test(html), "time offsets");
    assert.ok(html.includes('class="tag tone-proto">H2<'), "protocol chips");
  });

  it("offers a shared filter with problem counts", () => {
    assert.ok(html.includes('id="filter-text"'));
    assert.ok(/data-filter="problems"[^>]*>Problems <span class="count">2<\/span>/.test(html), "failed localhost call and inspected API call");
    assert.ok(/data-filter="local"[^>]*>Local calls <span class="count">1<\/span>/.test(html));
    assert.ok(/data-flags="error local"/.test(html));
  });

  it("explains protocol and result labels on hover", () => {
    assert.ok(/<span class="wf-proto" data-tip="HTTP\/2: [^"]*Rated Better/.test(html), "waterfall protocol cells");
    assert.ok(/<span class="wf-proto" data-tip="HTTP\/3 \(QUIC\): [^"]*Rated Best/.test(html));
    assert.ok(/<span class="wf-status" data-tip="ERR_CONNECTION_REFUSED: Nothing answered/.test(html), "waterfall result cells");
    assert.ok(/class="tag tone-proto" data-tip="HTTP\/2: /.test(html), "sequence protocol tags");
    assert.ok(/class="tag tone-plain" data-tip="Server wait: /.test(html), "sequence wait tags");
    assert.ok(/class="chip lvl-better" data-tip="HTTP\/2: /.test(html), "host table protocol ratings");
    assert.ok(html.includes('id="tip-box"'));
  });

  it("compares the protocol versions in a collapsible guide", () => {
    const guide = html.match(/<details class="proto-guide">[\s\S]*?<\/details>/)[0];
    for (const name of ["HTTP/3 (QUIC)", "HTTP/2", "HTTP/1.1"]) assert.ok(guide.includes(name), name);
    assert.ok(guide.includes("This page used H2 for 2 requests, H3 for 1 request, HTTP/1.1 for 1 request."));
    assert.ok(guide.includes("UDP port 443"));
  });

  it("lets people hide the details panel", () => {
    assert.ok(html.includes('id="toggle-details"'));
    assert.ok(html.includes(".seq-layout.details-hidden"));
    assert.ok(html.includes('<details class="how-to" open>'), "how-to-read can be collapsed");
  });

  it("docks a tabbed inspector", () => {
    for (const tab of ["explained", "timing", "connection", "headers"]) assert.ok(html.includes(`data-tab="${tab}"`), tab);
  });

  it("explains every arrow in plain language when clicked", () => {
    const json = html.match(/<script type="application\/json" id="seq-explain">([\s\S]*?)<\/script>/);
    assert.ok(json, "explanations are embedded");
    const explanations = JSON.parse(json[1]);
    assert.ok(Object.keys(explanations).length >= 10);
    assert.ok(html.includes('id="explain"'), "explanation panel");
    assert.ok(html.includes("How to read this view"));
    assert.ok(html.includes('id="req-1"'), "waterfall rows can be opened from the panel");
    assert.ok(html.includes('class="plain"'), "plain-language summary in each waterfall row");
  });

  it("has a Learn section with safe outbound links and a glossary", () => {
    assert.ok(html.includes('id="learn"'));
    assert.ok(html.includes('href="#learn"'));
    assert.ok(html.includes("https://web.dev/articles/vitals"));
    assert.ok(html.includes("https://developer.chrome.com/docs/modern-web-guidance"));
    assert.ok(html.includes("https://www.wireshark.org/"));
    assert.ok(html.includes('class="glossary"'));
    const external = html.match(/<a href="https?:[^"]+"[^>]*>/g) || [];
    assert.ok(external.length >= 20);
    for (const a of external) assert.ok(a.includes('target="_blank"') && a.includes('rel="noopener noreferrer"'), a);
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
