import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { joinHar, harEvidenceText } from "../src/enrichment.mjs";
import { createHarReader } from "../src/parsers/har-stream.mjs";
import { createCaptureReader } from "../src/viewer/viewer-core.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";
import { buildSampleHar } from "../src/demo/sample-har.mjs";

function sampleModel() {
  const reader = createCaptureReader();
  reader.write(toNetLogText(buildPageLoadNetLog()));
  return reader.finish();
}
function readHar(har) {
  const reader = createHarReader();
  reader.write(JSON.stringify(har));
  return reader.finish();
}
const model = sampleModel();
const har = readHar(buildSampleHar(model));
const joined = joinHar(model, har);

describe("joining a HAR to a NetLog", () => {
  it("matches by method and URL, nearest in time, and reports how well the clocks agree", () => {
    const page = model.requests.filter(r => !r.isBackground);
    assert.equal(joined.alignment.method, "clock");
    assert.equal(joined.alignment.matched, page.length);
    assert.ok(Math.abs(joined.alignment.medianDeltaMs) <= 2);
    assert.equal(joined.alignment.within50, page.length);
    for (const r of page) assert.ok(joined.perRequest.has(r.id), `request ${r.id} matched`);
  });

  it("explains every HAR entry with no NetLog request instead of dropping it", () => {
    const reasons = Object.fromEntries(joined.harOnly.map(h => [h.reason, h.entry.url.split("/").pop()]));
    assert.deepEqual(Object.keys(reasons).sort(), ["cache", "redirect step", "service worker"]);
  });

  it("prefers the nearest request when the same URL repeats", () => {
    const first = { id: 1, method: "GET", url: "https://a.example.com/log", start: 100, isBackground: false };
    const second = { id: 2, method: "GET", url: "https://a.example.com/log", start: 5000, isBackground: false };
    const t0 = Date.UTC(2026, 8, 29, 4, 0, 0);
    const m = { requests: [second, first], environment: { captureStartedAt: new Date(t0).toISOString() } };
    const entries = [{ method: "GET", url: "https://a.example.com/log", startedMs: t0 + 5003 }, { method: "GET", url: "https://a.example.com/log", startedMs: t0 + 98 }];
    const out = joinHar(m, { recognized: true, entries, pages: [], integrity: {} });
    assert.equal(out.perRequest.get(1).startedMs, t0 + 98);
    assert.equal(out.perRequest.get(2).startedMs, t0 + 5003);
  });

  it("falls back to order and says so when the capture has no wall clock", () => {
    const m = { requests: [{ id: 1, method: "GET", url: "https://a.example.com/x", start: 0 }], environment: { captureStartedAt: null } };
    const out = joinHar(m, { recognized: true, entries: [{ method: "GET", url: "https://a.example.com/x", startedMs: 12345 }], pages: [{ id: "p", startedMs: 1, onLoad: 5, onContentLoad: 3 }], integrity: {} });
    assert.equal(out.alignment.method, "order");
    assert.equal(out.alignment.matched, 1);
    assert.equal(out.alignment.medianDeltaMs, null);
    assert.deepEqual(out.milestones, [], "no milestones without an aligned clock");
  });

  it("does not pair requests that are far apart in time", () => {
    const t0 = Date.UTC(2026, 8, 29, 4, 0, 0);
    const m = { requests: [{ id: 1, method: "GET", url: "https://a.example.com/x", start: 0 }], environment: { captureStartedAt: new Date(t0).toISOString() } };
    const out = joinHar(m, { recognized: true, entries: [{ method: "GET", url: "https://a.example.com/x", startedMs: t0 + 600000 }], pages: [], integrity: {} });
    assert.equal(out.alignment.matched, 0);
    assert.equal(out.harOnly.length, 1);
  });

  it("puts load milestones on the NetLog timeline from the shared wall clock", () => {
    const t0 = Date.parse(model.environment.captureStartedAt);
    const page = har.pages[0];
    assert.equal(joined.milestones.length, 1);
    assert.equal(Math.round(joined.milestones[0].loadAt), Math.round(page.startedMs + 1900 - t0));
    assert.equal(Math.round(joined.milestones[0].domContentLoadedAt), Math.round(page.startedMs + 900 - t0));
  });

  it("summarizes what the page is made of and who asked for it", () => {
    const types = Object.fromEntries(joined.types.map(t => [t.type, t.count]));
    assert.ok(types.document >= 1 && types.script >= 1 && types.stylesheet >= 1);
    assert.equal(joined.initiators.parser >= 2, true);
    assert.equal(joined.requesters.some(r => /app\.js/.test(r.url) && r.count >= 1), true);
    assert.deepEqual({ memory: joined.cacheAnswers.memory, serviceWorker: joined.cacheAnswers.serviceWorker }, { memory: 1, serviceWorker: 1 });
  });

  it("writes bounded, labeled text for the AI summary", () => {
    const text = harEvidenceText(joined);
    assert.match(text, /^HAR ENRICHMENT/);
    assert.match(text, /matched/i);
    assert.ok(text.length < 3500);
    assert.ok(!/[—]|--/.test(text));
  });

  it("reports honestly when the file is not a HAR or nothing matches", () => {
    assert.equal(joinHar(model, { recognized: false, entries: [], pages: [], integrity: {} }), null);
    const none = joinHar(model, { recognized: true, entries: [], pages: [], integrity: {} });
    assert.equal(none.alignment.matched, 0);
    assert.equal(none.types.length, 0);
  });
});
