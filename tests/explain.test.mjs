import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseNetLog } from "../src/parsers/netlog-parser.mjs";
import { analyzeCapture } from "../src/analysis.mjs";
import { explainConnection, explainRequest, explainResponse, explainHost, plainSummary, describeResource, methodTip, sequenceTip } from "../src/explain.mjs";
import { buildSequenceView } from "../src/renderer/report.html.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";

let dir;
let model;
let analysis;
let connections;
const req = (id) => model.requests.find(r => r.id === id);
const conn = (r) => connections.get(r.connectionId);

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "socketmap-explain-"));
  const path = join(dir, "page-load.json");
  writeFileSync(path, toNetLogText(buildPageLoadNetLog()));
  model = await parseNetLog(path);
  analysis = analyzeCapture(model);
  connections = new Map(model.connections.map(c => [c.id, c]));
});

after(() => rmSync(dir, { recursive: true, force: true }));

describe("Plain-language explanations", () => {
  it("names what was requested in everyday words", () => {
    assert.equal(describeResource(req(1)), "the web page itself");
    assert.equal(describeResource(req(10)), "a script (code that makes the page work)");
    assert.equal(describeResource(req(20)), "a style sheet (how the page looks)");
  });

  it("explains a slow server answer and says where to look", () => {
    const e = explainResponse(req(10), conn(req(10)));
    assert.equal(e.tone, "bad");
    assert.ok(e.verdict.includes("Very slow answer"));
    assert.ok(e.insight.includes("Server wait"));
    assert.ok(e.insight.includes("Not your computer"));
    assert.ok(e.steps.some(s => s.label === "Server wait" && s.meaning.length > 20));
    assert.equal(e.requestId, 10);
  });

  it("qualifies a private certificate root without claiming its cause", () => {
    const e = explainConnection(req(40), conn(req(40)));
    assert.equal(e.tone, "bad");
    assert.ok(e.verdict.includes("consistent with TLS inspection"));
    assert.ok(e.verdict.includes("cannot identify which one"));
    assert.ok(e.verdict.includes("Contoso Inspection CA"));
    assert.ok(e.facts.some(([k, v]) => k === "Server address" && v === "198.51.100.99:8080"));
  });

  it("explains a refused local call", () => {
    const e = explainResponse(req(30), conn(req(30)));
    assert.equal(e.tone, "bad");
    assert.ok(e.verdict.includes("ERR_CONNECTION_REFUSED"));
    assert.ok(e.verdict.includes("Nothing answered"));
  });

  it("does not call unrecorded connection setup fast", () => {
    const e = explainConnection({ id: "missing", host: "api.example.org" }, {
      kind: "tcp", host: "api.example.org", connectMs: null, tlsMs: null, error: null
    });
    assert.equal(e.tone, "info");
    assert.equal(e.verdict, "Connection setup timing was not recorded.");
    assert.ok(!e.verdict.includes("Fast"));
  });

  it("explains the wait before a request was sent", () => {
    const e = explainRequest(req(40), conn(req(40)));
    assert.equal(e.tone, "warn");
    assert.ok(e.steps.some(s => s.label === "Proxy lookup"));
  });

  it("explains a host column with each rating", () => {
    const e = explainHost(analysis.hosts.find(h => h.host === "api.example.org"));
    assert.equal(e.tone, "bad");
    assert.ok(e.verdict.includes("network path"));
    assert.equal(e.steps.length, 6);
  });

  it("summarizes a request in one plain paragraph", () => {
    const text = plainSummary(req(10));
    assert.ok(text.startsWith("The browser asked portal.example.com for a script"));
    assert.ok(text.includes("200 (OK: the request worked.)"));
    assert.ok(text.includes("Server wait"));
  });

  it("gives every row and column in the sequence view an explanation", () => {
    const { actors, rows, explanations } = buildSequenceView(analysis, connections, model.environment);
    for (const row of rows) assert.ok(explanations[row.key], `explanation for ${row.key}`);
    for (const a of actors) assert.ok(explanations[a.key], `explanation for ${a.key}`);
  });

  it("explains a whole request with timing bars and headers", async () => {
    const { explainTransaction } = await import("../src/explain.mjs");
    const e = explainTransaction(req(10), conn(req(10)));
    assert.equal(e.tone, "bad");
    assert.ok(e.plain.includes("got status 200"));
    assert.ok(e.timing.some(t => t.key === "wait" && t.ms === 1200));
    assert.ok(e.headers.request.some(h => h.startsWith(":path")));
    assert.ok(!JSON.stringify(e).includes("DIGESTSECRET"));
  });

  it("explains common HTTP methods and keeps an unknown method evidence-bound", () => {
    assert.match(methodTip("get"), /^GET: asks the server to send/);
    assert.match(methodTip("POST"), /may create or trigger/);
    assert.match(methodTip("OPTIONS"), /CORS preflight/);
    assert.match(methodTip("CONNECT"), /proxy to open a tunnel/);
    assert.match(methodTip("BREW"), /records the method, but not what the server is designed to do/);
    assert.match(methodTip(), /not recorded/);
  });

  it("explains sequence labels as attempts without inventing success", () => {
    assert.match(sequenceTip("TCP + TLS handshake", { host: "portal.example.com" }), /attempts to negotiate encryption/);
    assert.match(sequenceTip("connect", { host: "portal.example.com" }, { tlsVersion: "TLS 1.3" }), /TCP \+ TLS handshake/);
    assert.match(sequenceTip("QUIC handshake", { host: "cdn.example.net" }), /does not prove a later request succeeded/);
    assert.match(sequenceTip("request", { method: "POST", host: "api.example.org" }), /POST: sends data/);
    const failedRequest = sequenceTip("request", { method: "GET", host: "api.example.org", netError: "ERR_TIMED_OUT" });
    assert.match(failedRequest, /GET: asks the server to send/);
    assert.match(failedRequest, /ERR_TIMED_OUT before a completed response/);
    assert.doesNotMatch(failedRequest, /Connection attempt/);
    assert.match(sequenceTip("connection failed", {}, { host: "localhost", error: "ERR_CONNECTION_REFUSED" }), /failed: ERR_CONNECTION_REFUSED/);
  });
});
