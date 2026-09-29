import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderProfilePanel, renderMainThreadBand, renderProfileSource, profileCss } from "../src/renderer/profile.mjs";
import { renderMilestones } from "../src/renderer/enrichment.mjs";
import { attachProfile } from "../src/profile.mjs";
import { attachHar } from "../src/enrichment.mjs";
import { createTraceReader } from "../src/parsers/trace-stream.mjs";
import { createHarReader } from "../src/parsers/har-stream.mjs";
import { createCaptureReader, buildReport } from "../src/viewer/viewer-core.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";
import { buildSampleTrace } from "../src/demo/sample-trace.mjs";
import { buildSampleHar } from "../src/demo/sample-har.mjs";
import { buildCoverage } from "../src/coverage.mjs";

function modelWith({ profile = true, har = false } = {}) {
  const reader = createCaptureReader();
  reader.write(toNetLogText(buildPageLoadNetLog()));
  const model = reader.finish();
  if (profile) { const t = createTraceReader(); t.write(JSON.stringify(buildSampleTrace(model))); attachProfile(model, t.finish()); }
  if (har) { const h = createHarReader(); h.write(JSON.stringify(buildSampleHar(model))); attachHar(model, h.finish()); }
  return model;
}
const model = modelWith();
const profile = model.profile;
const pageRequests = model.requests.filter(r => !r.isBackground);
const item = (coverage, id) => coverage.stages.flatMap(stage => stage.items).find(entry => entry.id === id);

describe("profile panel", () => {
  const html = renderProfilePanel(profile, pageRequests);
  it("shows how busy the page was, the long tasks, the paint moments and where the time went", () => {
    assert.ok(html.includes('id="profile"') && html.includes("What the page's code was doing"));
    assert.ok(html.includes("prf-ring") && html.includes("--pct:"));
    assert.match(html, /2\s*<small>\s*long tasks|long tasks/i);
    assert.match(html, /First contentful paint/);
    assert.match(html, /Largest contentful paint/);
    assert.ok(html.includes("prf-mix"), "where the main thread's time went");
    assert.ok(html.includes("Scripting") && html.includes("Layout"));
  });
  it("ranks scripts and lists long tasks with what ran inside them and what was in flight", () => {
    assert.ok(html.includes("app.js") && html.includes("analytics.js"));
    assert.match(html, /requests? in flight/);
    assert.ok(html.includes("renderWebParts") || html.includes("app.js"));
  });
  it("is honest about attribution, responsiveness and the machine", () => {
    assert.match(html, /not proof|does not prove|consistent with/i);
    assert.match(html, /INP/);
    assert.match(html, /8 cores/);
    assert.match(html, /load on the machine is not recorded/i);
  });
  it("says when the profile could not be lined up with the network", () => {
    const unplaced = { ...profile, alignment: { ...profile.alignment, aligned: false, matched: 0, offsetMs: null }, page: { ...profile.page, startAt: null }, milestones: [], mainThread: { ...profile.mainThread, longTasks: profile.mainThread.longTasks.map(t => ({ ...t, atMs: null })) } };
    const out = renderProfilePanel(unplaced, pageRequests);
    assert.match(out, /not lined up|could not be placed/i);
    assert.ok(!/requests? in flight/.test(out));
  });
  it("escapes what a profile contains and uses tokens only", () => {
    const evil = { ...profile, scripts: [{ url: "https://a.example.com/<img src=x>.js", totalMs: 10, compileMs: 1, calls: 1 }], mainThread: { ...profile.mainThread, longTasks: [{ startMs: 1, durMs: 90, atMs: 5, scriptMs: 80, top: [{ url: "https://a.example.com/\"><script>1</script>.js", ms: 80 }], layoutMs: 0, paintMs: 0, parseMs: 0 }] } };
    const out = renderProfilePanel(evil, pageRequests);
    assert.ok(!out.includes("<img") && !out.includes("<script>1"));
    assert.doesNotMatch(profileCss(), /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    assert.doesNotMatch(out, /<script|@import/);
  });
});

describe("main thread band on the waterfall", () => {
  const page = { startMs: 0, observedSpanMs: 3000 };
  it("draws activity and long tasks inside the timeline, only when placed", () => {
    const band = renderMainThreadBand(profile, page, 3000);
    assert.ok(band.includes("wf-mainrow") && band.includes("prf-bin") && band.includes("prf-long"));
    for (const m of band.matchAll(/left:(-?[\d.]+)%;width:([\d.]+)%/g)) { assert.ok(Number(m[1]) >= 0, m[0]); assert.ok(Number(m[1]) + Number(m[2]) <= 100.05, m[0]); }
    const unplaced = { ...profile, alignment: { ...profile.alignment, aligned: false } };
    assert.equal(renderMainThreadBand(unplaced, page, 3000), "");
    assert.equal(renderMainThreadBand(null, page, 3000), "");
  });
});

describe("milestones from a profile", () => {
  it("draws first and largest contentful paint as well as load", () => {
    const out = renderMilestones(null, { startMs: 0, observedSpanMs: 3000 }, 3000, profile);
    assert.ok(out.drawn >= 4);
    assert.ok(out.labels.includes("FCP") && out.labels.includes("LCP") && out.labels.includes("Load"));
    assert.equal(out.source, "profile");
  });
  it("prefers the profile over a HAR for the same milestones instead of drawing both", () => {
    const both = modelWith({ har: true });
    const out = renderMilestones(both.enrichment, { startMs: 0, observedSpanMs: 3000 }, 3000, both.profile);
    assert.equal((out.labels.match(/>Load</g) || []).length, 1);
  });
});

describe("per-request profile block", () => {
  it("names a render-blocking request and an initiator from the profile", () => {
    const script = model.requests.find(r => /app\.js/.test(r.url));
    assert.match(renderProfileSource(profile.perRequest.get(script.id)), /render-blocking/i);
    const api = model.requests.find(r => /api\./.test(r.host));
    assert.match(renderProfileSource(profile.perRequest.get(api.id)), /loadTeamData/);
    assert.equal(renderProfileSource(null), "");
  });
});

describe("in the report", () => {
  const html = buildReport(model).html;
  it("appears on the Overview, the waterfall and the coverage", () => {
    assert.ok(html.includes('id="profile"'));
    assert.ok(html.includes("wf-mainrow"));
    assert.ok(html.includes("Main thread (profile)"));
    assert.ok(html.includes("main-thread-busy") || html.includes("kept the main thread busy"));
  });
  it("feeds coverage without pretending to know more than it does", () => {
    const coverage = buildCoverage(model);
    assert.equal(item(coverage, "javascript").status, "recorded");
    assert.equal(item(coverage, "rendering").status, "partial");
    assert.equal(item(coverage, "machine").status, "partial");
    assert.deepEqual(coverage.comparison.loaded, ["netlog", "profile"]);
    const plain = buildCoverage(modelWith({ profile: false }));
    assert.equal(item(plain, "javascript").status, "never");
    assert.equal(item(plain, "machine").status, "never");
  });
  it("adds nothing when no profile was loaded", () => {
    const plain = buildReport(modelWith({ profile: false })).html;
    assert.ok(!plain.includes('id="profile"') && !plain.includes('class="wf-mainrow"') && !plain.includes("What the page's code was doing"));
  });
  it("stays self-contained", () => {
    assert.doesNotMatch(html, /<(script|link|img)\b[^>]*\b(src|href)=["']?https?:/i);
  });
});
