import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildServerInsights } from "../src/server-insights.mjs";
import { renderServerInsights, renderServerDetail, serverInsightsCss } from "../src/renderer/server-insights.mjs";
import { createCaptureReader, buildReport } from "../src/viewer/viewer-core.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";

const req = (id, headers, extra = {}) => ({ id, url: `https://app.example.com/api/${id}`, host: "app.example.com", timing: { wait: 500 }, responseHeaders: headers, status: 200, ...extra });
const insights = buildServerInsights([
  req(1, ["server-timing: db;dur=180;desc=\"SQL query\", render;dur=120", "cf-cache-status: HIT", "cf-ray: aa-SEA", "request-id: r-1", "x-response-time: 231ms"]),
  req(2, ["server-timing: auth;dur=900", "x-cache: TCP_MISS"], { timing: { wait: 300 } }),
  req(3, ["content-type: image/png"])
]);

function sampleReport() {
  const reader = createCaptureReader();
  reader.write(toNetLogText(buildPageLoadNetLog()));
  return buildReport(reader.finish()).html;
}

describe("server insights panel", () => {
  const html = renderServerInsights(insights);

  it("shows the three headline tiles with computed numbers", () => {
    assert.ok(html.includes("What the servers said"));
    assert.ok(html.includes('class="srv-ring"') && html.includes("--pct:67"), "2 of 3 responses carry server timing");
    assert.ok(html.includes("srv-split"), "cache split bar");
    assert.ok(html.includes("180") && html.includes("db"), "largest reported phase");
    assert.match(html, /reported by the servers/i, "labels the source");
  });

  it("ranks phases as nested bars against the wait, linking to the request", () => {
    assert.ok(html.includes('href="#req-2"') && html.includes('href="#req-1"'));
    assert.ok(html.includes("srv-ghost") && html.includes("srv-fill"));
    assert.ok(html.includes("is-over"), "a phase longer than the browser's wait is flagged, not hidden");
    assert.ok(html.indexOf("auth") < html.indexOf("render"), "sorted by reported time");
  });

  it("names the CDN as a hint, lists other timing headers raw, and offers IDs with copy", () => {
    assert.ok(html.includes("Cloudflare") && html.includes("cf-ray"));
    assert.ok(/hint|inferred/i.test(html));
    assert.ok(html.includes("x-response-time") && html.includes("231ms"));
    assert.ok(html.includes('data-copy="r-1"'));
  });

  it("explains itself when the servers reported nothing", () => {
    const empty = renderServerInsights(buildServerInsights([req(1, ["content-type: text/html"])]));
    assert.ok(empty.includes("No response") && empty.includes("Server-Timing"));
    assert.ok(empty.includes("srv-empty"));
    assert.ok(!empty.includes("srv-ring"));
  });

  it("escapes what servers send", () => {
    const evil = buildServerInsights([req(1, ['server-timing: "><img src=x>;dur=5;desc="<script>x</script>"', "request-id: <b>x</b>"])]);
    const out = renderServerInsights(evil) + renderServerDetail(evil.perRequest.get(1), 100);
    assert.ok(!out.includes("<img") && !out.includes("<script>x") && !out.includes("<b>x"));
  });

  it("uses tokens only and no script or remote resource", () => {
    assert.doesNotMatch(serverInsightsCss(), /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    assert.ok(serverInsightsCss().includes("var(--secondary)"));
    assert.doesNotMatch(html, /<script|src=|@import/);
  });
});

describe("per-request server block", () => {
  it("draws each reported phase against the wait and shows cache state", () => {
    const out = renderServerDetail(insights.perRequest.get(1), 500);
    assert.ok(out.includes("What the server said") && out.includes("SQL query"));
    assert.ok(out.includes("srv-fill") && out.includes("HIT"));
    assert.equal(renderServerDetail(null, 500), "");
  });
});

describe("in the report", () => {
  const html = sampleReport();
  it("appears on the Overview, in the waterfall detail, and as a marker in the wait bar", () => {
    assert.ok(html.includes('id="server-said"'));
    assert.ok(html.includes("srv-mark"), "marker inside the wait bar");
    assert.ok((html.match(/What the server said/g) || []).length >= 2);
    assert.ok(html.includes("Server-reported time"), "the waterfall key explains the marker");
  });
  it("wires the copy buttons without any remote request", () => {
    assert.ok(html.includes("[data-copy]"));
    assert.doesNotMatch(html, /<(script|link|img)\b[^>]*\b(src|href)=["']?https?:/i);
  });
  it("marker widths stay inside the bar", () => {
    for (const match of html.matchAll(/class="srv-mark" style="left:([\d.]+)%;width:([\d.]+)%/g)) {
      assert.ok(Number(match[1]) + Number(match[2]) <= 100.05, match[0]);
    }
  });
});
