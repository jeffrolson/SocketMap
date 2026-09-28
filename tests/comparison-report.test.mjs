import { describe, it } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { renderComparisonHtml } from "../src/renderer/comparison.html.mjs";

const request = (overrides = {}) => ({ method: "GET", url: "https://portal.example.test/app", durationMs: 120, endRecorded: true, status: 200, timing: { dns: 10, wait: 80 }, ...overrides });
const comparison = {
  a: { source: { name: "baseline.json", bytes: 1000 }, page: { url: "https://portal.example.test/app", requestCount: 2, loadMs: 400 }, requests: [], environment: {} },
  b: { source: { name: "comparison.json", bytes: 2000 }, page: { url: "https://portal.example.test/app", requestCount: 2, loadMs: 700 }, requests: [], environment: {} },
  metrics: [
    { key: "observed-span", label: "Observed span", unit: "ms", a: 400, b: 700, delta: 300, percent: 75, coverageA: 1, coverageB: 1 },
    { key: "wire-bytes", label: "Wire bytes", unit: "bytes", a: null, b: 2000, delta: null, percent: null, coverageA: 0, coverageB: 1 }
  ],
  pairs: [
    { key: "one", method: "GET", url: "https://portal.example.test/app", occurrence: 1, a: request(), b: request({ durationMs: 220, status: 503, statusText: "Busy" }), change: "matched", durationDeltaMs: 100, waitDeltaMs: 20, changed: true },
    { key: "two", method: "POST", url: "https://portal.example.test/save", occurrence: 1, a: request({ method: "POST", endRecorded: false, durationMs: 999 }), b: null, change: "only-a", durationDeltaMs: null, waitDeltaMs: null, changed: false }
  ],
  counts: { matched: 1, onlyA: 1, onlyB: 0, changed: 1 },
  environment: [{ label: "Proxy", a: "Direct", b: "PAC", changed: true }, { label: "DNS", a: null, b: null, changed: false }],
  diagnostics: {
    totalsA: { sources: 2, events: 10, errors: 0 }, totalsB: { sources: 3, events: 16, errors: 2 },
    families: [{ type: "SOCKET", aSources: 1, bSources: 1, aEvents: 8, bEvents: 12, aErrors: 0, bErrors: 2, changed: true }],
    snapshots: [{ key: "proxySettings", a: { effective: "Direct" }, b: { effective: "PAC" }, presentA: true, presentB: true, changed: true }]
  },
  warnings: ["Matching is heuristic."]
};

describe("comparison report", () => {
  it("is a self-contained accessible comparison with direction and unknown values", () => {
    const html = renderComparisonHtml(comparison);
    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.includes("A baseline"));
    assert.ok(html.includes("B comparison"));
    assert.ok(html.includes("+300ms"));
    assert.ok(html.includes("slower"));
    assert.ok(html.includes("Not recorded"), "unfinished request is not shown as 999ms");
    assert.ok(html.includes("No response recorded") || html.includes("Not in this capture"));
    assert.ok(html.includes("Show 0 more") === false);
    assert.ok(html.includes("data-theme-toggle"));
    assert.ok(!/<script[^>]+src=/i.test(html));
    assert.ok(!/<link[^>]+href=/i.test(html));
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length >= 2, "theme and interaction scripts are present");
    scripts.forEach(script => assert.doesNotThrow(() => new vm.Script(script[1])));
  });

  it("keeps incomplete spans unknown and gives AI handoff concrete changed evidence", () => {
    const incomplete = structuredClone(comparison);
    incomplete.metrics[0].a = null;
    incomplete.metrics[0].b = null;
    incomplete.metrics[0].delta = null;
    const html = renderComparisonHtml(incomplete);
    assert.ok(html.includes("<span>Observed span</span><strong>Not recorded"));
    assert.ok(!html.includes("<dt>Observed span</dt>"), "source cards do not repeat an incomplete page span");
    assert.ok(html.includes("Changed or unpaired request evidence"));
    assert.ok(html.includes("Environment differences"));
    assert.ok(html.includes("HTTP 503 Busy"));
    assert.ok(html.includes("Coverage: A 100%; B 100%"));
    assert.ok(html.includes("Capture files: A 1000 B"));
    assert.ok(html.includes("Capture-wide diagnostic differences"));
    assert.ok(html.includes("Changed browser snapshots"));
    assert.ok(html.includes("Source families are aggregated independently"));
  });

  it("escapes capture-provided strings before putting them in HTML", () => {
    const unsafe = structuredClone(comparison);
    unsafe.a.source.name = '<img src=x onerror=alert(1)>';
    unsafe.pairs[0].url = '</script><img src=x onerror=alert(1)>';
    const html = renderComparisonHtml(unsafe);
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
    assert.ok(!html.includes('</script><img src=x onerror=alert(1)>'));
  });
});
