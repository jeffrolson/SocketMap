import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, createReadStream } from "node:fs";
import { createTraceReader } from "../src/parsers/trace-stream.mjs";
import { createCaptureReader } from "../src/viewer/viewer-core.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";
import { buildSampleTrace } from "../src/demo/sample-trace.mjs";

function sampleModel() {
  const reader = createCaptureReader();
  reader.write(toNetLogText(buildPageLoadNetLog()));
  return reader.finish();
}
const trace = buildSampleTrace(sampleModel());

function read(text, size = text.length) {
  const reader = createTraceReader();
  for (let i = 0; i < text.length; i += size) reader.write(text.slice(i, i + size));
  return reader.finish();
}

describe("trace reader: shape and chunking", () => {
  const text = JSON.stringify(trace);
  it("reads the object form and the bare-array form to the same answer", () => {
    const a = read(text);
    const b = read(JSON.stringify(trace.traceEvents));
    assert.equal(a.recognized, true);
    assert.equal(b.recognized, true);
    assert.equal(JSON.stringify({ ...a, environment: null }), JSON.stringify({ ...b, environment: null }), "metadata is the only difference");
    assert.equal(a.environment.cores, 8);
    assert.equal(b.environment.cores, null);
  });
  it("gives the same answer however the file is chunked", () => {
    const whole = JSON.stringify(read(text));
    for (const size of [1, 3, 17, 500, 4096]) assert.equal(JSON.stringify(read(text, size)), whole, `chunk ${size}`);
  });
  it("keeps complete events from a truncated file and says so", () => {
    const cut = read(text.slice(0, Math.floor(text.length * 0.6)));
    assert.equal(cut.integrity.complete, false);
    assert.ok(cut.eventCount > 5);
  });
  it("does not mistake other JSON for a profile", () => {
    for (const other of ['{"log":{"entries":[]}}', '{"events":[{"a":1}]}', "[1,2,3]", "not json", '{"traceEvents":[]}']) assert.equal(read(other).recognized, false, other);
  });
});

describe("trace reader: what it finds", () => {
  const result = read(JSON.stringify(trace));
  it("identifies the page's main thread from its navigation", () => {
    assert.match(result.page.url, /portal\.example\.com/);
    assert.equal(typeof result.page.navTsMs, "number");
  });
  it("reads paint, layout shift and load milestones relative to navigation", () => {
    assert.equal(Math.round(result.metrics.fcpMs), 320);
    assert.equal(Math.round(result.metrics.lcpMs), 760);
    assert.equal(result.metrics.lcpType, "image");
    assert.equal(Math.round(result.metrics.domContentLoadedMs), 700);
    assert.equal(Math.round(result.metrics.loadMs), 1350);
    assert.ok(Math.abs(result.metrics.layoutShiftScore - 0.021) < 1e-9);
  });
  it("finds long tasks and what ran inside them, without adding nested calls twice", () => {
    assert.equal(result.mainThread.longTaskCount, 2);
    const first = result.mainThread.longTasks[0];
    assert.equal(Math.round(first.durMs), 320);
    assert.ok(first.top[0].url.includes("app.js"));
    assert.ok(first.scriptMs <= first.durMs && Math.round(first.scriptMs) <= 280, "evaluate and its nested call are one stretch of time, not two");
    assert.equal(Math.round(result.mainThread.blockingMs), (320 - 50) + (90 - 50));
  });
  it("ranks scripts by main-thread time using the union of their events", () => {
    const app = result.scripts.find(s => s.url.includes("app.js"));
    assert.ok(app && app.totalMs > 200 && app.totalMs < 300, `${app?.totalMs}`);
    assert.equal(app.calls, 1);
    assert.ok(app.compileMs > 30 && app.compileMs < 50);
    assert.equal(result.scripts[0].url, app.url);
  });
  it("reports busy time during load and over the whole profile", () => {
    const m = result.mainThread;
    assert.ok(m.loadBusyMs > 300 && m.loadBusyFraction > 0 && m.loadBusyFraction <= 1);
    assert.ok(m.bins.length > 10 && m.bins.every(v => v >= 0 && v <= 1));
    assert.ok(m.breakdown.scriptingMs > 0 && m.breakdown.layoutMs > 0 && m.breakdown.parseMs > 0);
  });
  it("keeps the page's requests with type, priority and initiator stack", () => {
    assert.ok(result.requests.length >= 4);
    const api = result.requests.find(r => /api\./.test(r.url));
    assert.equal(api.stack.fn, "loadTeamData");
    assert.equal(api.stack.line, 2210);
    const script = result.requests.find(r => /\.js/.test(r.url));
    assert.equal(script.renderBlocking, "blocking");
    assert.equal(script.resourceType, "Script");
    assert.equal(script.status, 200);
  });
  it("reads the machine facts and drops the command line and node names", () => {
    assert.equal(result.environment.cores, 8);
    assert.equal(result.environment.memoryGb, 16);
    const out = JSON.stringify(result);
    assert.ok(!out.includes("TOPSECRET") && !out.includes("secret-flag") && !out.includes("hero"));
  });
  it("says nothing it was not told", () => {
    const bare = read(JSON.stringify({ traceEvents: [{ name: "thread_name", ph: "M", pid: 1, tid: 1, ts: 0, args: { name: "CrRendererMain" } }, { name: "navigationStart", ph: "R", pid: 1, tid: 1, ts: 5, args: { data: { documentLoaderURL: "https://a.example.com/", isLoadingMainFrame: true, isOutermostMainFrame: true }, frame: "F" } }] }));
    assert.equal(bare.metrics.fcpMs, null);
    assert.equal(bare.metrics.lcpMs, null);
    assert.equal(bare.metrics.loadMs, null);
    assert.equal(bare.metrics.layoutShiftScore, null);
    assert.equal(bare.mainThread.longTaskCount, 0);
  });
  it("stays small however many events there are", () => {
    const events = trace.traceEvents.slice();
    for (let i = 0; i < 60000; i++) events.push({ args: {}, cat: "x", dur: 5, name: "RunTask", ph: "X", pid: 4100, tid: 4101, ts: 700_000_100_000 + i * 20 });
    const out = JSON.stringify(read(JSON.stringify({ traceEvents: events })));
    assert.ok(out.length < 80000, `${out.length}`);
  });
});

// Local validation against genuinely recorded Chrome traces, when present (they are gitignored).
describe("real Chrome traces (only when recorded locally)", () => {
  for (const [file, lcp] of [["captures/real-trace.json", 485], ["captures/real-trace-heavy.json", 267]]) {
    it(`${file} reproduces DevTools' own LCP`, { skip: !existsSync(file) }, async () => {
      const reader = createTraceReader();
      await new Promise((resolve, reject) => { const s = createReadStream(file, { encoding: "utf8" }); s.on("data", c => reader.write(c)); s.on("end", resolve); s.on("error", reject); });
      const result = reader.finish();
      assert.equal(result.recognized, true);
      assert.equal(Math.round(result.metrics.lcpMs), lcp);
      assert.ok(result.metrics.domContentLoadedMs == null || result.metrics.loadMs == null || result.metrics.domContentLoadedMs <= result.metrics.loadMs);
    });
  }
});
