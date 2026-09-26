import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseNetLog } from "../src/parsers/netlog-parser.mjs";
import { analyzeCapture } from "../src/analysis.mjs";
import { explainConnection, explainRequest, explainResponse, explainHost, plainSummary, describeResource } from "../src/explain.mjs";
import { buildSequenceTrace } from "../src/renderer/report.html.mjs";
import { buildPageLoadNetLog, toNetLogText } from "./fixtures/netlog-builder.mjs";

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

  it("explains TLS inspection on a connection in plain terms", () => {
    const e = explainConnection(req(40), conn(req(40)));
    assert.equal(e.tone, "bad");
    assert.ok(e.verdict.includes("TLS inspection"));
    assert.ok(e.verdict.includes("Contoso Inspection CA"));
    assert.ok(e.facts.some(([k, v]) => k === "Server address" && v === "198.51.100.99:8080"));
  });

  it("explains a refused local call", () => {
    const e = explainResponse(req(30), conn(req(30)));
    assert.equal(e.tone, "bad");
    assert.ok(e.verdict.includes("ERR_CONNECTION_REFUSED"));
    assert.ok(e.verdict.includes("Nothing answered"));
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

  it("gives every arrow and column in the diagram an explanation", () => {
    const { trace, explanations } = buildSequenceTrace(analysis, connections, model.environment);
    for (const m of trace.messages) assert.ok(explanations[m.id], `explanation for ${m.id}`);
    for (const p of trace.participants) assert.ok(explanations[`card-${p.id}`], `explanation for ${p.id}`);
  });
});
