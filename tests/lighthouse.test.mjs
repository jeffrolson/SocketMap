import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readLighthouse, joinLighthouse, attachLighthouse, lighthouseEvidenceText, scoreLevel } from "../src/lighthouse.mjs";
import { readCpuProfile, attachCpuProfile, cpuProfileEvidenceText } from "../src/cpuprofile.mjs";
import { renderLighthousePanel, renderLighthouseSource } from "../src/renderer/lighthouse.mjs";
import { renderCpuProfilePanel } from "../src/renderer/cpuprofile.mjs";
import { buildSampleLighthouse } from "../src/demo/sample-lighthouse.mjs";
import { buildCoverage } from "../src/coverage.mjs";
import { analyzeCapture, buildAiSummary } from "../src/analysis.mjs";
import { createCaptureReader, looksLikeLighthouse, looksLikeCpuProfile } from "../src/viewer/viewer-core.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";

const sampleModel = () => { const r = createCaptureReader(); r.write(toNetLogText(buildPageLoadNetLog())); return r.finish(); };
const model = sampleModel();
const sample = buildSampleLighthouse(model);

describe("Lighthouse reader", () => {
  it("recognizes only a Lighthouse report", () => {
    assert.equal(readLighthouse(sample).recognized, true);
    for (const other of [null, [], "x", {}, { audits: {} }, { lighthouseVersion: "1" }, { log: { entries: [] } }]) assert.equal(readLighthouse(other).recognized, false);
    assert.equal(looksLikeLighthouse('{"lighthouseVersion":"13.0.0","requestedUrl":'), true);
    assert.equal(looksLikeLighthouse('{"log":{}}'), false);
  });
  const { data } = readLighthouse(sample);
  it("keeps the score, lab settings and the core metrics", () => {
    assert.equal(data.categories[0].score, 0.58);
    assert.equal(data.formFactor, "mobile");
    assert.equal(data.throttlingMethod, "simulate");
    assert.equal(data.throttling.cpuSlowdown, 4);
    assert.equal(data.metrics.lcp.value, 4600);
    assert.equal(data.metrics.lcp.score, 0.31);
    assert.equal(data.metrics.cls.unit, "");
    assert.deepEqual(["good", "fair", "poor", "unknown"], [scoreLevel(0.95), scoreLevel(0.6), scoreLevel(0.2), scoreLevel(null)]);
  });
  it("keeps failing audits worst first, with the URLs they name and bounded items", () => {
    assert.ok(data.findings.length >= 3);
    assert.deepEqual(data.findings.map(f => f.score), [...data.findings.map(f => f.score)].sort((a, b) => a - b));
    const unused = data.findings.find(f => f.id === "unused-javascript");
    assert.equal(unused.savingsMs, 610);
    assert.equal(unused.items[0].wastedBytes, 90112);
    assert.ok(!data.findings.some(f => f.id === "total-byte-weight" || f.id === "first-contentful-paint"), "passing audits and metrics are not findings");
    const many = { ...sample, audits: { ...sample.audits, "unused-css-rules": { title: "x", score: 0, scoreDisplayMode: "metricSavings", details: { type: "opportunity", items: Array.from({ length: 50 }, (_, i) => ({ url: `https://a.example.com/${i}.css`, wastedBytes: 10 })) } } } };
    assert.equal(readLighthouse(many).data.findings.find(f => f.id === "unused-css-rules").items.length, 6);
    assert.equal(readLighthouse(many).data.findings.find(f => f.id === "unused-css-rules").itemCount, 50);
  });
  it("drops what it does not need: page snippets, screenshots, prose, non-web URLs, and credentials in URLs", () => {
    const messy = { ...sample, fullPageScreenshot: { screenshot: { data: "A".repeat(50000) } }, audits: { ...sample.audits, "unsized-images": { title: "Images", score: 0.5, scoreDisplayMode: "metricSavings", description: "long prose", details: { type: "table", items: [{ url: "", node: { snippet: "<img src=secret>" } }, { url: "data:image/png;base64,AAAA" }, { url: "https://cdn.example.com/a.png?token=abc12345&w=10" }] } } } };
    const out = readLighthouse(messy).data;
    const text = JSON.stringify(out);
    assert.ok(!text.includes("secret") && !text.includes("AAAA") && !text.includes("abc12345") && !text.includes("long prose"));
    assert.ok(text.length < 20000);
    assert.equal(out.findings.find(f => f.id === "unsized-images").items.length, 1);
  });
  it("says nothing it was not told", () => {
    const bare = readLighthouse({ lighthouseVersion: "1.0", audits: {} }).data;
    assert.equal(bare.formFactor, null);
    assert.equal(bare.metrics.lcp, null);
    assert.deepEqual(bare.findings, []);
    assert.equal(bare.totalBytes, null);
  });
});

describe("joining Lighthouse to a capture", () => {
  const lh = attachLighthouse(sampleModel(), readLighthouse(sample).data);
  it("marks the capture's requests Lighthouse named, and how far apart the runs were", () => {
    assert.ok(lh.join.urlsInCapture >= 1);
    assert.ok(lh.perRequest.size >= 1);
    assert.equal(lh.gapMinutes, 10);
    assert.equal(lh.sameSite, true);
  });
  it("matches by address without the query only when it is unambiguous, and says so", () => {
    const m = sampleModel();
    const target = m.requests.find(r => !r.isBackground && r.requestType !== "main frame");
    const data = readLighthouse({ ...sample, audits: { "unused-javascript": { title: "u", score: 0, scoreDisplayMode: "metricSavings", details: { type: "opportunity", items: [{ url: `${target.url.split("?")[0]}?v=OTHERHASH`, wastedBytes: 100 }] } } } }).data;
    const joined = joinLighthouse(m, data);
    const entry = joined.perRequest.get(target.id)?.[0];
    assert.ok(entry && entry.similar === true);
    m.requests.push({ ...target, id: 9999 });
    assert.equal(joinLighthouse(m, data).perRequest.size, 0, "two candidates: no guess");
  });
  it("is worded as a separate lab load, never as the capture", () => {
    const html = renderLighthousePanel(lh);
    assert.ok(html.includes("What Lighthouse measured (a separate lab load)") && html.includes("simulated throttling") && html.includes("not what happened in this capture"));
    assert.ok(html.includes("58") && html.includes("Largest contentful paint"));
    assert.ok(renderLighthouseSource(lh.perRequest.values().next().value).includes("From Lighthouse (lab)"));
    assert.equal(renderLighthouseSource([]), "");
    const text = lighthouseEvidenceText(lh);
    assert.match(text, /not the load in this capture/);
    assert.match(text, /Lab numbers are estimates/);
  });
  it("escapes what it shows", () => {
    const evil = readLighthouse({ ...sample, audits: { ...sample.audits, "unused-javascript": { title: "<img src=x onerror=alert(1)>", score: 0, scoreDisplayMode: "metricSavings", details: { type: "opportunity", items: [] } } } }).data;
    assert.ok(!renderLighthousePanel(attachLighthouse(sampleModel(), evil)).includes("<img src=x"));
  });
  it("adds to the AI summary and Coverage without pretending it measured the capture", () => {
    const m = sampleModel(); attachLighthouse(m, readLighthouse(sample).data);
    assert.ok(buildAiSummary(m, analyzeCapture(m, {})).includes("LIGHTHOUSE (a separate lab load"));
    const items = buildCoverage(m).stages.flatMap(s => s.items);
    assert.equal(items.find(i => i.id === "rendering").status, "partial");
    assert.match(items.find(i => i.id === "rendering").detail, /separate lab load/);
    assert.equal(items.find(i => i.id === "javascript").status, "partial");
    assert.ok(buildCoverage(m).comparison.loaded.includes("lighthouse"));
  });
});

describe("CPU profile reader", () => {
  const profile = () => {
    // root(1) -> app(2, 3 samples) and idle(3, 2 samples); every sample lasts 1000 microseconds
    return { nodes: [{ id: 1, callFrame: { functionName: "(root)", url: "", lineNumber: -1 }, children: [2, 3, 4] }, { id: 2, callFrame: { functionName: "render", url: "https://app.example.com/app.js?token=abc12345", lineNumber: 41 } }, { id: 3, callFrame: { functionName: "(idle)", url: "" } }, { id: 4, callFrame: { functionName: "(garbage collector)", url: "" } }], startTime: 1000, endTime: 8000, samples: [2, 2, 2, 3, 3, 4], timeDeltas: [0, 1000, 1000, 1000, 1000, 1000] };
  };
  it("recognizes only a CPU profile", () => {
    assert.equal(readCpuProfile(profile()).recognized, true);
    for (const other of [null, [], {}, { nodes: [] }, { nodes: [{}], samples: [1], timeDeltas: [] }, { lighthouseVersion: "1", audits: {} }]) assert.equal(readCpuProfile(other).recognized, false);
    assert.equal(looksLikeCpuProfile('{"nodes":[{"id":1,"callFrame":{"functionName":"(root)"'), true);
    assert.equal(looksLikeCpuProfile('{"traceEvents":[{"callFrame":1'), false);
    assert.equal(looksLikeCpuProfile('{"lighthouseVersion":"1"}'), false);
  });
  it("attributes each sample to the time until the next one, and separates idle and garbage collection", () => {
    const { data } = readCpuProfile(profile());
    assert.equal(data.functions[0].name, "render");
    assert.equal(data.functions[0].selfMs, 3, "three samples of render, each lasting until the next one");
    assert.equal(data.idleMs, 2);
    assert.equal(data.gcMs, 1, "the last sample has no following delta, so it reuses the previous interval");
    assert.equal(data.durationMs, 7);
    assert.ok(!JSON.stringify(data).includes("abc12345"), "credentials in a script URL are masked");
    assert.equal(data.functions[0].line, 42);
  });
  it("shows in the report, the AI summary and Coverage", () => {
    const m = sampleModel(); attachCpuProfile(m, readCpuProfile(profile()).data);
    assert.ok(renderCpuProfilePanel(m.cpuProfile).includes("Where JavaScript CPU time went") && renderCpuProfilePanel(m.cpuProfile).includes("not lined up with the waterfall"));
    assert.ok(cpuProfileEvidenceText(m.cpuProfile).includes("not placed on the network timeline"));
    assert.equal(buildCoverage(m).stages.flatMap(s => s.items).find(i => i.id === "javascript").status, "partial");
    assert.equal(renderCpuProfilePanel(null), "");
  });
});

describe("real files (only when recorded locally)", () => {
  it("captures/real-lighthouse.json reads to a small summary with the real metrics", { skip: !existsSync("captures/real-lighthouse.json") }, () => {
    const raw = readFileSync("captures/real-lighthouse.json", "utf8");
    const out = readLighthouse(JSON.parse(raw));
    assert.equal(out.recognized, true);
    assert.ok(JSON.stringify(out.data).length < raw.length / 20);
    assert.ok(out.data.metrics.lcp.value > 0 && out.data.findings.length > 0);
  });
  it("captures/real.cpuprofile reads and finds the busy function", { skip: !existsSync("captures/real.cpuprofile") }, () => {
    const out = readCpuProfile(JSON.parse(readFileSync("captures/real.cpuprofile", "utf8")));
    assert.equal(out.recognized, true);
    assert.equal(out.data.functions[0].name, "fib");
    assert.ok(out.data.busyMs > 300);
  });
});
