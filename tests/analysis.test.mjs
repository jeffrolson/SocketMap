import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseNetLog } from "../src/parsers/netlog-parser.mjs";
import { analyzeCapture, buildAiSummary } from "../src/analysis.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";

let dir;
let model;
let analysis;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "socketmap-analysis-"));
  const path = join(dir, "page-load.json");
  writeFileSync(path, toNetLogText(buildPageLoadNetLog()));
  model = await parseNetLog(path);
  analysis = analyzeCapture(model);
});

after(() => rmSync(dir, { recursive: true, force: true }));

const host = (name) => analysis.hosts.find(h => h.host === name);
const finding = (id) => analysis.findings.find(f => f.id === id);

describe("Page selection and totals", () => {
  it("picks the page that was loaded, not background traffic", () => {
    assert.equal(analysis.page.site, "https://portal.example.com");
    assert.equal(analysis.page.url, "https://portal.example.com/sites/team/home.aspx?tempauth=[REDACTED]&view=1");
    assert.equal(analysis.page.requestCount, 5);
    assert.equal(analysis.page.hostCount, 4);
    assert.equal(analysis.page.loadMs, 2100);
    assert.equal(analysis.background.length, 1);
  });

  it("honours an explicit page choice", () => {
    const other = analyzeCapture(model, { site: "chrome-extension://abcdefghijklmnop" });
    assert.equal(other.page.requestCount, 1);
  });

  it("adds up where the time went", () => {
    assert.equal(analysis.breakdown.wait, 500 + 1200 + 48 + 200);
    assert.equal(analysis.breakdown.tls, 120 + 400);
  });
});

describe("Good / Better / Best / Poor connection ratings", () => {
  it("rates a direct h2 host with slow DNS and a slow server", () => {
    const r = host("portal.example.com").ratings;
    assert.equal(r.protocol.level, "better");
    assert.equal(r.tls.level, "best");
    assert.equal(r.connection.level, "good");
    assert.equal(r.dns.level, "good");
    assert.equal(r.path.level, "best");
    assert.equal(r.server.level, "good");
    assert.deepEqual(host("portal.example.com").ips, ["198.51.100.20"]);
  });

  it("rates a QUIC host as best", () => {
    const h = host("cdn.example.net");
    assert.equal(h.ratings.protocol.level, "best");
    assert.equal(h.ratings.path.level, "best");
    assert.equal(h.overall, "better");
  });

  it("rates an inspected, proxied host as poor", () => {
    const h = host("api.example.org");
    assert.equal(h.ratings.path.level, "poor");
    assert.equal(h.ratings.tls.level, "better");
    assert.equal(h.ratings.protocol.level, "good");
    assert.equal(h.ratings.connection.level, "poor");
    assert.equal(h.overall, "poor");
    assert.equal(h.proxy, "PROXY proxy.corp.example.com:8080");
  });

  it("rates a host it never reached as poor", () => {
    assert.equal(host("127.0.0.1").overall, "poor");
  });

  it("keeps missing DNS, setup, and TLS evidence unknown", () => {
    const uncertain = structuredClone(model);
    const portalRequests = uncertain.requests.filter(r => r.host === "portal.example.com");
    const portalConnectionIds = new Set(portalRequests.map(r => r.connectionId));
    for (const request of portalRequests) request.reusedConnection = null;
    for (const connection of uncertain.connections) {
      if (!portalConnectionIds.has(connection.id)) continue;
      connection.connectMs = null;
      connection.tlsMs = null;
      connection.dnsMs = null;
      connection.tlsVersion = null;
    }
    uncertain.dnsLookups = uncertain.dnsLookups.filter(lookup => lookup.host !== "portal.example.com");
    const ratings = analyzeCapture(uncertain).hosts.find(h => h.host === "portal.example.com").ratings;
    assert.deepEqual(ratings.dns, { level: "unknown", value: "Lookup timing not recorded" });
    assert.deepEqual(ratings.connection, { level: "unknown", value: "Setup timing not recorded" });
    assert.deepEqual(ratings.tls, { level: "unknown", value: "TLS version not recorded" });
  });

  it("does not turn a QUIC error into an asserted TCP fallback", () => {
    const uncertain = structuredClone(model);
    const cdnRequests = uncertain.requests.filter(r => r.host === "cdn.example.net");
    const cdnConnectionIds = new Set(cdnRequests.map(r => r.connectionId));
    for (const request of cdnRequests) request.protocol = "h2";
    for (const connection of uncertain.connections) if (cdnConnectionIds.has(connection.id)) connection.error = "ERR_QUIC_HANDSHAKE_FAILED";
    const protocol = analyzeCapture(uncertain).hosts.find(h => h.host === "cdn.example.net").ratings.protocol;
    assert.deepEqual(protocol, { level: "better", value: "h2" });
    assert.doesNotMatch(protocol.value, /fell back/i);
  });
});

describe("Findings", () => {
  it("flags a private root as evidence to investigate, without asserting inspection", () => {
    const f = finding("tls-inspection");
    assert.equal(f.severity, "high");
    assert.match(f.detail, /can be TLS inspection or a privately managed certificate/);
    assert.match(f.detail, /does not prove which/);
    assert.ok(f.evidence.some(e => e.includes("api.example.org") && e.includes("Contoso Inspection CA")));
    assert.ok(f.team);
  });

  it("flags calls to services on this computer", () => {
    const f = finding("local-service");
    assert.ok(f.evidence.some(e => e.includes("127.0.0.1:8769") && e.includes("ERR_CONNECTION_REFUSED")));
  });

  it("flags the proxy, slow server responses, slow connections, and failures", () => {
    assert.ok(finding("proxy").evidence.some(e => e.includes("proxy.corp.example.com:8080")));
    assert.ok(finding("slow-server").evidence.some(e => e.includes("/_layouts/15/app.js")));
    assert.ok(finding("slow-connection").evidence.some(e => e.includes("api.example.org")));
    assert.ok(finding("failed-requests").evidence.some(e => e.includes("127.0.0.1")));
  });

  it("orders findings by severity", () => {
    const order = { high: 0, medium: 1, info: 2 };
    const sev = analysis.findings.map(f => order[f.severity]);
    assert.deepEqual(sev, [...sev].sort((a, b) => a - b));
  });
});

describe("AI summary", () => {
  it("is portable, redacted, and carries bounded evidence and next-test instructions", () => {
    const previousBadProxies = model.environment.proxy.badProxies;
    model.environment.proxy.badProxies = [{ proxyUri: "PROXY bad-proxy.example:8080", badUntil: "123456789" }];
    const text = buildAiSummary(model, analysis, { source: { name: "capture?token=SOURCESECRET.json", bytes: 4096 } });
    model.environment.proxy.badProxies = previousBadProxies;
    assert.ok(text.length < 24000);
    assert.ok(text.includes("portal.example.com"));
    assert.ok(text.includes("Contoso Inspection CA"));
    assert.ok(text.includes("192.0.2.10"));
    assert.ok(text.includes("#1: GET https://portal.example.com/sites/team/home.aspx?tempauth=[REDACTED]&view=1"));
    assert.ok(text.includes("RECORDED CONNECTION DETAILS"));
    assert.ok(text.includes("DERIVED FROM RECORDED DATA: BUILT-IN FINDINGS"));
    assert.ok(text.includes("RECORDED REQUEST DETAILS: FAILURES AND REDIRECTS"));
    assert.ok(text.includes("ERR_CONNECTION_REFUSED"));
    assert.ok(text.includes("MISSING OR LIMITED DATA"));
    assert.ok(text.includes("WHAT THIS CAPTURE COULD AND COULD NOT SEE"));
    assert.ok(text.indexOf("WHAT THIS CAPTURE COULD AND COULD NOT SEE") < text.indexOf("AI ANALYSIS INSTRUCTIONS"));
    assert.ok(text.includes("AI ANALYSIS INSTRUCTIONS"));
    assert.ok(text.includes("Source: capture?token=[REDACTED]"));
    assert.ok(text.includes("PROXY bad-proxy.example:8080 (bad until 123456789)"));
    assert.ok(!text.includes("[object Object]"));
    assert.ok(!text.includes("SECRET123"));
    assert.ok(!text.includes("SOURCESECRET"));
  });
});
