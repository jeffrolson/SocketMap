import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderEnrichmentPanel, renderRequestSource, renderMilestones, enrichmentCss } from "../src/renderer/enrichment.mjs";
import { attachHar } from "../src/enrichment.mjs";
import { createHarReader } from "../src/parsers/har-stream.mjs";
import { createCaptureReader, buildReport } from "../src/viewer/viewer-core.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";
import { buildSampleHar } from "../src/demo/sample-har.mjs";
import { buildCoverage } from "../src/coverage.mjs";
import { selectPageSite } from "../src/analysis.mjs";

function modelWith(har = true) {
  const reader = createCaptureReader();
  reader.write(toNetLogText(buildPageLoadNetLog()));
  const model = reader.finish();
  if (har) {
    const harReader = createHarReader();
    harReader.write(JSON.stringify(buildSampleHar(model)));
    attachHar(model, harReader.finish());
  }
  return model;
}
const model = modelWith();
const enrichment = model.enrichment;
const item = (coverage, id) => coverage.stages.flatMap(stage => stage.items).find(entry => entry.id === id);

describe("HAR panel", () => {
  const html = renderEnrichmentPanel(enrichment);
  it("shows the join quality, what the page is made of, and who asked for it", () => {
    assert.ok(html.includes('id="enrichment"') && html.includes("What the page is made of"));
    assert.ok(html.includes('class="enr-ring"') && html.includes("--pct:"), "matched ring");
    assert.match(html, /clock difference/i);
    assert.ok(html.includes("enr-types") && html.includes("script") && html.includes("stylesheet"));
    assert.ok(html.includes("Who asked for what") && html.includes("app.js"));
    assert.match(html, /memory cache/i);
    assert.ok(html.includes("service worker"));
    assert.ok(html.includes("In the HAR but not in the NetLog"));
    assert.ok(html.includes("redirect step"));
  });
  it("uses tokens only and no script or remote resource", () => {
    assert.doesNotMatch(enrichmentCss(), /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    assert.doesNotMatch(html, /<script|src=|@import/);
  });
  it("escapes what a HAR contains", () => {
    const evil = { ...enrichment, requesters: [{ kind: "script", url: "https://a.example.com/<img src=x>.js", fn: "<b>f</b>", count: 2, transferBytes: 10 }], harOnly: [{ reason: "cache", entry: { method: "GET", url: "https://a.example.com/\"><script>1</script>", status: 200 } }] };
    const out = renderEnrichmentPanel(evil);
    assert.ok(!out.includes("<img") && !out.includes("<script>1"));
    assert.ok(out.includes("&lt;img"), "shown as text");
  });
});

describe("per-request source block", () => {
  it("says what asked for the request, its type, and how it was answered", () => {
    const requests = model.requests.filter(r => !r.isBackground);
    const script = requests.map(r => enrichment.perRequest.get(r.id)).find(e => e?.initiator?.type === "script");
    const parser = requests.map(r => enrichment.perRequest.get(r.id)).find(e => e?.initiator?.type === "parser");
    assert.match(renderRequestSource(script), /Requested by/);
    assert.match(renderRequestSource(script), /loadTeamData/);
    assert.match(renderRequestSource(parser), /HTML parser/);
    assert.match(renderRequestSource(parser), /line \d+/);
    assert.equal(renderRequestSource(null), "");
  });
  it("names a cache or service worker answer", () => {
    assert.match(renderRequestSource({ initiator: null, resourceType: "image", cache: "memory", viaServiceWorker: false }), /memory cache/);
    assert.match(renderRequestSource({ initiator: null, resourceType: "fetch", cache: null, viaServiceWorker: true }), /service worker/i);
  });
});

describe("load milestones", () => {
  it("draws DOMContentLoaded and load inside the timeline, and only inside it", () => {
    const page = { startMs: 0, observedSpanMs: 3000 };
    const out = renderMilestones(enrichment, page, 3000);
    assert.equal(out.drawn, 2);
    for (const m of out.marks.matchAll(/left:([\d.]+)%/g)) assert.ok(Number(m[1]) >= 0 && Number(m[1]) <= 100);
    assert.equal(renderMilestones(enrichment, page, 1500).drawn, 1, "the later milestone is outside a short timeline");
    assert.equal(renderMilestones(null, page, 3000).drawn, 0);
  });
});

describe("in the report", () => {
  const html = buildReport(model).html;
  it("appears on the Overview, in each request's detail, and on the waterfall", () => {
    assert.ok(html.includes('id="enrichment"'));
    assert.ok(html.includes("wf-ms"), "milestone lines");
    assert.ok(html.includes("wf-type"), "resource type chips");
    assert.ok((html.match(/Requested by/g) || []).length >= 2);
  });
  it("adds nothing when no HAR was loaded", () => {
    const plain = buildReport(modelWith(false)).html;
    assert.ok(!plain.includes('id="enrichment"') && !plain.includes('class="wf-ms"') && !plain.includes("Requested by"));
  });
  it("feeds coverage and the AI summary", () => {
    const coverage = buildCoverage(model);
    assert.equal(item(coverage, "script-initiator").status, "recorded");
    assert.equal(item(coverage, "rendering").status, "partial");
    assert.equal(item(coverage, "resource-type").status, "recorded");
    assert.deepEqual(coverage.comparison.loaded, ["netlog", "har"]);
    assert.equal(item(buildCoverage(modelWith(false)), "script-initiator").status, "never");
    assert.equal(item(buildCoverage(modelWith(false)), "resource-type").status, "missing");
    assert.match(html, /HAR ENRICHMENT/);
  });
  it("stays self-contained", () => {
    assert.doesNotMatch(html, /<(script|link|img)\b[^>]*\b(src|href)=["']?https?:/i);
  });
});

describe("the selected page", () => {
  it("speaks about the selected page's own requests", () => {
    const requests = model.requests.filter(r => !r.isBackground);
    const html = renderEnrichmentPanel(enrichment, requests.slice(0, 2));
    assert.match(html, /2 of this page's 2 requests|Every request on this page has a HAR entry|of this page's/);
    const unmatched = renderEnrichmentPanel(enrichment, [{ id: 999 }, { id: 998 }]);
    assert.match(unmatched, /0 of this page's 2 requests have a HAR entry/);
  });

  it("defaults to the page the HAR describes, not just the first page", () => {
    const pages = [{ site: "https://first.example.com", url: "https://first.example.com/", isBackground: false, requestCount: 9 }, { site: "https://second.example.com", url: "https://second.example.com/", isBackground: false, requestCount: 4 }];
    const requests = [{ id: 1, site: "https://first.example.com" }, { id: 2, site: "https://second.example.com" }, { id: 3, site: "https://second.example.com" }];
    const plain = { pages, requests };
    assert.equal(selectPageSite(plain), "https://first.example.com", "no HAR: unchanged behavior");
    const withHar = { pages, requests, enrichment: { perRequest: new Map([[2, {}], [3, {}]]) } };
    assert.equal(selectPageSite(withHar), "https://second.example.com");
    const noMatches = { pages, requests, enrichment: { perRequest: new Map() } };
    assert.equal(selectPageSite(noMatches), "https://first.example.com", "a HAR that matches nothing changes nothing");
  });
});
