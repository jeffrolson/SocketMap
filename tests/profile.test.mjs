import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, createReadStream } from "node:fs";
import { joinProfile, profileEvidenceText, attachProfile } from "../src/profile.mjs";
import { analyzeCapture, buildAiSummary } from "../src/analysis.mjs";
import { createTraceReader } from "../src/parsers/trace-stream.mjs";
import { createCaptureReader } from "../src/viewer/viewer-core.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";
import { buildSampleTrace } from "../src/demo/sample-trace.mjs";

function sampleModel() {
  const reader = createCaptureReader();
  reader.write(toNetLogText(buildPageLoadNetLog()));
  return reader.finish();
}
const readTrace = (trace) => { const r = createTraceReader(); r.write(JSON.stringify(trace)); return r.finish(); };
const model = sampleModel();
const summary = readTrace(buildSampleTrace(model));
const joined = joinProfile(model, summary);
const home = model.requests.find(r => r.requestType === "main frame");

describe("joining a profile to a NetLog", () => {
  it("aligns the two clocks from the requests they share, and says how well", () => {
    const pageCount = model.requests.filter(r => !r.isBackground).length;
    assert.equal(joined.alignment.aligned, true);
    assert.equal(joined.alignment.method, "requests");
    assert.equal(joined.alignment.matched, pageCount);
    assert.equal(joined.alignment.within50, pageCount);
    assert.ok(Number.isFinite(joined.alignment.offsetMs));
  });

  it("places the page's navigation and long tasks on the NetLog timeline", () => {
    assert.ok(Math.abs(joined.page.startAt - (home.start - 5)) <= 2);
    const first = joined.mainThread.longTasks[0];
    assert.ok(Math.abs(first.atMs - (home.start - 5 + 400)) <= 2, `${first.atMs}`);
    assert.ok(first.durMs > 300);
  });

  it("places paint and load milestones too", () => {
    const labels = joined.milestones.map(m => m.label);
    assert.deepEqual(labels, ["First contentful paint", "DOMContentLoaded", "Largest contentful paint", "Load"], "in time order");
    const byLabel = Object.fromEntries(joined.milestones.map(m => [m.label, m.atMs]));
    assert.ok(Math.abs(byLabel.Load - (home.start - 5 + 1350)) <= 2);
    assert.ok(byLabel["First contentful paint"] < byLabel["Largest contentful paint"]);
  });

  it("maps trace details onto the matching NetLog requests", () => {
    const api = model.requests.find(r => /api\./.test(r.host));
    const entry = joined.perRequest.get(api.id);
    assert.equal(entry.stack.fn, "loadTeamData");
    const script = model.requests.find(r => /app\.js/.test(r.url));
    assert.equal(joined.perRequest.get(script.id).renderBlocking, "blocking");
  });

  it("pairs repeated URLs in time order rather than guessing", () => {
    const m = { requests: [{ id: 1, method: "GET", url: "https://a.example.com/log", start: 100 }, { id: 2, method: "GET", url: "https://a.example.com/log", start: 5000 }], environment: {} };
    const s = { recognized: true, eventCount: 1, integrity: {}, environment: {}, page: { url: "https://a.example.com/", navTsMs: 1000, spanMs: 10 }, metrics: {}, mainThread: { longTasks: [], bins: [], binMs: 20 }, scripts: [], requests: [{ tsMs: 1000, url: "https://a.example.com/log", method: "GET" }, { tsMs: 5900, url: "https://a.example.com/log", method: "GET" }] };
    const out = joinProfile(m, s);
    assert.equal(out.alignment.matched, 2);
    assert.ok(out.perRequest.has(1) && out.perRequest.has(2));
  });

  it("does not place anything when no request is shared, and says so", () => {
    const m = { requests: [{ id: 1, method: "GET", url: "https://other.example.com/", start: 0 }], environment: {} };
    const out = joinProfile(m, summary);
    assert.equal(out.alignment.aligned, false);
    assert.equal(out.page.startAt, null);
    assert.deepEqual(out.milestones, []);
    assert.equal(out.mainThread.longTasks.every(t => t.atMs == null), true);
    assert.ok(out.mainThread.longTaskCount >= 1, "the findings themselves still stand");
  });

  describe("when no request is shared but the files share the browser clock", () => {
    const nav = summary.page.navTsMs;
    const mk = (firstTime, lastTime, url = "https://portal.example.com/other") => ({ requests: [{ id: 1, method: "GET", url, start: 0 }], environment: {}, diagnostics: { firstTime, lastTime } });
    it("places the profile by the clock when it starts inside the capture and its site is in it", () => {
      const out = joinProfile(mk(nav - 500, nav + 6000), summary);
      assert.equal(out.alignment.aligned, true);
      assert.equal(out.alignment.method, "clock");
      assert.equal(out.alignment.matched, 0);
      assert.equal(Math.round(out.page.startAt), 500);
      assert.ok(out.milestones.length > 0 && out.milestones.every(x => x.atMs >= 500));
      assert.equal(out.perRequest.size, 0, "per-request details need matching requests");
      assert.match(profileEvidenceText(out), /shared clock/);
    });
    it("refuses when the profile starts outside the capture (recorded in a different run)", () => {
      assert.equal(joinProfile(mk(nav + 10 * 60000, nav + 11 * 60000), summary).alignment.aligned, false);
      assert.equal(joinProfile(mk(nav - 60000, nav - 30000), summary).alignment.aligned, false);
    });
    it("refuses when the profile's site is not in the capture, even if the times overlap", () => {
      assert.equal(joinProfile(mk(nav - 500, nav + 6000, "https://elsewhere.example.net/"), summary).alignment.aligned, false);
    });
    it("prefers shared requests over the clock", () => {
      const withShared = { ...model, diagnostics: { firstTime: 0, lastTime: 1e12 } };
      assert.equal(joinProfile(withShared, summary).alignment.method, "requests");
    });
  });

  it("returns nothing for a file that is not a profile", () => {
    assert.equal(joinProfile(model, { recognized: false }), null);
    assert.equal(joinProfile(model, null), null);
    assert.equal(joinProfile(model, { recognized: true, page: null }), null);
  });

  it("attaches to the model", () => {
    const m = sampleModel();
    assert.ok(attachProfile(m, summary));
    assert.equal(m.profile.alignment.aligned, true);
  });

  it("writes bounded, labeled text for the AI summary", () => {
    const text = profileEvidenceText(joined);
    assert.match(text, /^PERFORMANCE PROFILE/);
    assert.match(text, /long task/i);
    assert.match(text, /app\.js/);
    assert.match(text, /not a proven cause|does not prove/i);
    assert.ok(text.length < 3500);
    assert.ok(!/[—]|--/.test(text));
    assert.equal(profileEvidenceText(null), "");
  });
});

describe("profile in findings and the AI summary", () => {
  it("adds a finding, worded as consistent with the page working, when long tasks add up", () => {
    const m = sampleModel();
    attachProfile(m, summary);
    const finding = analyzeCapture(m).findings.find(f => f.id === "main-thread-busy");
    assert.ok(finding, "310 ms beyond the 50 ms threshold is enough");
    assert.match(finding.detail, /consistent with|does not prove/i);
    assert.ok(finding.evidence.some(line => /app\.js/.test(line) && /320ms/.test(line)), finding.evidence.join(" | "));
    assert.equal(finding.team, "Application owner or front-end developers");
  });
  it("stays quiet when the main thread was not the problem", () => {
    const m = sampleModel();
    const quiet = { ...summary, mainThread: { ...summary.mainThread, longTasks: [], longTaskCount: 0, blockingMs: 0 } };
    attachProfile(m, quiet);
    assert.equal(analyzeCapture(m).findings.some(f => f.id === "main-thread-busy"), false);
    assert.equal(analyzeCapture(sampleModel()).findings.some(f => f.id === "main-thread-busy"), false, "no profile, no finding");
  });
  it("adds a labeled section to the AI summary before the instructions", () => {
    const m = sampleModel();
    attachProfile(m, summary);
    const text = buildAiSummary(m, analyzeCapture(m));
    assert.match(text, /PERFORMANCE PROFILE/);
    assert.ok(text.indexOf("PERFORMANCE PROFILE") < text.indexOf("AI ANALYSIS INSTRUCTIONS"));
    assert.ok(!buildAiSummary(sampleModel(), analyzeCapture(sampleModel())).includes("PERFORMANCE PROFILE"));
  });
});

// Local validation against a genuine NetLog and Performance trace recorded together (gitignored).
describe("real NetLog and trace pair (only when recorded locally)", () => {
  const netlog = "captures/pair-wiki-netlog.json";
  const tracePath = "captures/pair-wiki-trace.json";
  for (const [label, netlogFile, traceFile, browserName] of [["macOS Edge", "captures/pair-edge-netlog.json", "captures/pair-edge-trace.json", /Edge/]]) {
    it(`${label}: places the profile from shared requests and agrees with the shared browser clock`, { skip: !existsSync(netlogFile) || !existsSync(traceFile) }, async () => {
      const feed = (reader, file) => new Promise((resolve, reject) => { const s = createReadStream(file, { encoding: "utf8" }); s.on("data", c => reader.write(c)); s.on("end", resolve); s.on("error", reject); });
      const capture = createCaptureReader();
      await feed(capture, netlogFile);
      const model = capture.finish();
      assert.match(model.environment.browser, browserName, "the NetLog names the browser");
      const reader = createTraceReader();
      await feed(reader, traceFile);
      const profile = joinProfile(model, reader.finish());
      assert.equal(profile.alignment.aligned, true);
      assert.ok(profile.alignment.matched >= 25, `matched ${profile.alignment.matched}`);
      assert.ok(Math.abs(profile.alignment.offsetMs + model.diagnostics.firstTime) < 50);
    });
  }
  it("places the profile from shared requests and agrees with the shared browser clock", { skip: !existsSync(netlog) || !existsSync(tracePath) }, async () => {
    const feed = (reader, file) => new Promise((resolve, reject) => { const s = createReadStream(file, { encoding: "utf8" }); s.on("data", c => reader.write(c)); s.on("end", resolve); s.on("error", reject); });
    const capture = createCaptureReader();
    await feed(capture, netlog);
    const model = capture.finish();
    const reader = createTraceReader();
    await feed(reader, tracePath);
    const profile = joinProfile(model, reader.finish());
    assert.equal(profile.alignment.aligned, true);
    assert.ok(profile.alignment.matched >= 25, `matched ${profile.alignment.matched}`);
    assert.ok(profile.alignment.within50 >= profile.alignment.matched * 0.8);
    // Both files use Chrome's monotonic clock: trace milliseconds minus the NetLog's first tick is the placement.
    assert.ok(Math.abs(profile.alignment.offsetMs + model.diagnostics.firstTime) < 50, "request offset agrees with the clock offset");
  });
});
