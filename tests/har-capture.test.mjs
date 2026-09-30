import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHarReader } from "../src/parsers/har-stream.mjs";
import { buildCaptureFromHar } from "../src/har-capture.mjs";
import { analyzeCapture } from "../src/analysis.mjs";
import { renderReportHtml } from "../src/renderer/report.html.mjs";
import { buildCoverage } from "../src/coverage.mjs";
import { buildSampleHar } from "../src/demo/sample-har.mjs";
import { createCaptureReader } from "../src/viewer/viewer-core.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";

const netlogModel = () => { const r = createCaptureReader(); r.write(toNetLogText(buildPageLoadNetLog())); return r.finish(); };
const entry = (over = {}) => ({
  pageref: "page_1", startedDateTime: "2026-09-30T12:00:00.000Z", time: 300,
  request: { method: "GET", url: "https://app.example.com/", headers: [{ name: "Authorization", value: "Bearer secret-request-token" }] },
  response: { status: 200, httpVersion: "h2", content: { size: 1000, mimeType: "text/html" }, _transferSize: 500, headers: [{ name: "Server-Timing", value: "db;dur=53" }, { name: "Set-Cookie", value: "sid=abc123456789; Path=/" }, { name: "Content-Type", value: "text/html" }] },
  timings: { blocked: 5, dns: 20, connect: 60, ssl: 40, send: 1, wait: 150, receive: 24 },
  _resourceType: "document", _priority: "VeryHigh", _connectionId: "77", serverIPAddress: "203.0.113.10", ...over
});
const har = (entries, pages = [{ id: "page_1", startedDateTime: "2026-09-30T12:00:00.000Z", pageTimings: { onLoad: 800 } }]) => ({ log: { version: "1.2", creator: { name: "WebInspector", version: "537.36" }, pages, entries } });
const read = (obj, options) => { const r = createHarReader(options); r.write(JSON.stringify(obj)); return r.finish(); };

describe("a capture model built from a HAR", () => {
  const list = [
    entry(),
    entry({ startedDateTime: "2026-09-30T12:00:00.400Z", time: 100, request: { method: "GET", url: "https://app.example.com/app.js" }, _resourceType: "script", timings: { blocked: 1, dns: -1, connect: -1, ssl: -1, send: 0, wait: 60, receive: 30 } }),
    entry({ pageref: undefined, startedDateTime: "2026-09-30T12:00:00.500Z", request: { method: "POST", url: "https://beacon.example.net/collect" }, _resourceType: "xhr" })
  ];
  const model = buildCaptureFromHar(read(har(list), { keepHeaders: true }), { name: "x.har" });
  it("has the same shape as a NetLog model and says where it came from", () => {
    for (const key of ["environment", "pages", "requests", "connections", "dnsLookups", "stats", "diagnostics"]) assert.ok(key in model, key);
    assert.deepEqual(model.source && { kind: model.source.kind, name: model.source.name }, { kind: "har", name: "x.har" });
    assert.equal(buildCaptureFromHar({ recognized: false }), null);
  });
  it("maps timings honestly: TLS is taken out of connect, blocked stays queue time", () => {
    const first = model.requests[0];
    assert.equal(first.timing.tls, 40);
    assert.equal(first.timing.connect, 20, "connect 60 includes 40 of TLS");
    assert.equal(first.timing.queue, 5);
    assert.equal(first.timing.wait, 150);
    assert.equal(first.timing.download, 24);
    assert.equal(first.start, 0);
    assert.equal(first.end, 300);
    assert.equal(model.requests[1].start, 400);
  });
  it("never invents what a HAR does not record", () => {
    const r = model.requests[0];
    for (const key of ["proxy", "netError", "statusText"]) assert.equal(r[key], null, key);
    assert.equal(r.timing.proxy, null);
    assert.equal(r.timing.stalled, null);
    assert.equal(model.requests[1].timing.dns, null, "a reused connection has no lookup, and that is not a zero");
    assert.equal(model.environment.browser, null);
    assert.equal(model.environment.os, null);
    assert.equal(model.environment.polledDataPresent, false);
    assert.equal(model.connections[0].tlsVersion, null);
    assert.equal(model.connections[0].cert, null);
  });
  it("groups entries into the HAR's pages and treats entries with no page as background", () => {
    assert.deepEqual(model.pages.map(p => [p.site, p.requestCount, p.isBackground]), [["https://example.com", 2, false], ["unknown", 1, true]]);
    assert.equal(model.requests[0].requestType, "main frame");
    assert.equal(model.requests[2].isBackground, true);
    assert.equal(analyzeCapture(model, {}).page.requestCount, 2);
  });
  it("keeps response headers with credentials masked, and only when asked", () => {
    const headers = model.requests[0].responseHeaders.join("\n");
    assert.ok(headers.includes("Server-Timing: db;dur=53"));
    assert.ok(!headers.includes("abc123456789") && headers.includes("[REDACTED]"));
    assert.ok(!JSON.stringify(model).includes("secret-request-token"), "request headers are never kept");
    const plain = buildCaptureFromHar(read(har(list)), { name: "y.har" });
    assert.deepEqual(plain.requests[0].responseHeaders, []);
  });
  it("feeds the report: server insights, connections and DNS come from what the HAR recorded", () => {
    assert.equal(model.connections.length, 1, "one connection id");
    assert.equal(model.connections[0].dnsMs, 20);
    assert.deepEqual(model.dnsLookups.map(d => d.host), ["app.example.com", "beacon.example.net"], "one lookup per host");
    const html = renderReportHtml(model, analyzeCapture(model, {}), { source: { name: "x.har", bytes: 10 } });
    assert.ok(html.includes("built from a HAR") && html.includes("requests read from a HAR"));
    assert.ok(!html.includes('data-nav="diagnostics"') && !html.includes('data-nav="event-replay"'), "NetLog-only tabs are not offered");
    assert.ok(html.includes("db;dur=53") || html.includes("db"), "Server-Timing is read");
  });
  it("marks what a HAR cannot see as not recorded in Coverage, not as a finding", () => {
    const items = buildCoverage(model).stages.flatMap(s => s.items);
    const status = (id) => items.find(i => i.id === id).status;
    assert.notEqual(status("proxy"), "recorded");
    assert.notEqual(status("tls"), "recorded");
    assert.equal(status("timing"), "recorded");
  });
  it("treats a HAR that never names its pages on entries as one page", () => {
    const one = buildCaptureFromHar(read(har(list.map(e => ({ ...e, pageref: undefined })))), { name: "z.har" });
    assert.equal(one.pages.length, 1);
    assert.ok(one.requests.every(r => !r.isBackground));
  });
  it("works for the sample HAR too, and accepts a profile or helper file afterwards", () => {
    const sample = buildCaptureFromHar(read(buildSampleHar(netlogModel()), { keepHeaders: true }), { name: "sample.har" });
    assert.ok(sample.requests.length > 3);
    const analysis = analyzeCapture(sample, {});
    assert.ok(analysis.page.requestCount > 0);
    assert.ok(renderReportHtml(sample, analysis, { source: { name: "s.har", bytes: 1 } }).length > 50000);
  });
});
