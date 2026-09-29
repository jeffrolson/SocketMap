import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCaptureReader } from "../src/viewer/viewer-core.mjs";
import { analyzeCapture, buildAiSummary } from "../src/analysis.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";
import { parseServerTiming, inspectResponse, buildServerInsights, serverInsightsText, isRequestIdHeader } from "../src/server-insights.mjs";

const req = (id, headers, extra = {}) => ({ id, url: `https://app.example.com/api/${id}?token=[REDACTED]`, host: "app.example.com", timing: { wait: 500 }, responseHeaders: headers, status: 200, ...extra });

describe("Server-Timing parser", () => {
  it("reads names, durations and descriptions", () => {
    assert.deepEqual(parseServerTiming('db;dur=53, app;dur=47.2, cache;desc=HIT'), [
      { name: "db", dur: 53, desc: null },
      { name: "app", dur: 47.2, desc: null },
      { name: "cache", dur: null, desc: "HIT" }
    ]);
  });
  it("handles quoted descriptions with commas and semicolons", () => {
    const [metric] = parseServerTiming('sql;desc="a, b; c";dur=5');
    assert.equal(metric.desc, "a, b; c");
    assert.equal(metric.dur, 5);
  });
  it("keeps unknown as null, never zero", () => {
    const [bad, none] = parseServerTiming("x;dur=abc, y");
    assert.equal(bad.dur, null);
    assert.equal(none.dur, null);
  });
  it("is bounded", () => {
    const many = Array.from({ length: 200 }, (_, i) => `m${i};dur=1`).join(",");
    assert.ok(parseServerTiming(many).length <= 50);
    assert.ok(parseServerTiming(`a;desc="${"x".repeat(999)}"`)[0].desc.length <= 120);
  });
});

describe("response inspection", () => {
  it("collects Server-Timing across repeated header lines, case-insensitively", () => {
    const info = inspectResponse(req(1, ["Server-Timing: db;dur=10", "server-timing: app;dur=30"]));
    assert.deepEqual(info.metrics.map(m => m.name), ["db", "app"]);
    assert.deepEqual(info.largest, { name: "app", dur: 30 });
  });
  it("does not add metrics together", () => {
    const info = inspectResponse(req(1, ["server-timing: db;dur=300, app;dur=250"], { timing: { wait: 400 } }));
    assert.equal(info.largest.dur, 300);
    assert.equal("totalMs" in info, false);
  });
  it("reads CDN and cache state and names the provider from its headers", () => {
    const cf = inspectResponse(req(1, ["cf-cache-status: HIT", "cf-ray: 8f1a2b3c4d5e6f70-SEA", "age: 3120"]));
    assert.equal(cf.cache.state, "hit");
    assert.equal(cf.provider.name, "Cloudflare");
    assert.equal(cf.age, 3120);
    assert.equal(inspectResponse(req(2, ["cf-cache-status: DYNAMIC"])).cache.state, "miss");
    assert.equal(inspectResponse(req(3, ["x-cache: Hit from cloudfront", "x-amz-cf-pop: SEA900-C1"])).cache.state, "hit");
    assert.equal(inspectResponse(req(3, ["x-cache: Hit from cloudfront", "x-amz-cf-pop: SEA900-C1"])).provider.name, "Amazon CloudFront");
    assert.equal(inspectResponse(req(4, ["x-cache: TCP_MISS"])).cache.state, "miss");
    assert.equal(inspectResponse(req(5, ["x-cache: HIT, MISS"])).cache.state, "mixed");
    assert.equal(inspectResponse(req(6, ["x-cache: something odd"])).cache.state, "other");
  });
  it("lists other timing-like headers raw, with no meaning attached", () => {
    const info = inspectResponse(req(1, ["SPRequestDuration: 231", "SPIISLatency: 1", "x-envoy-upstream-service-time: 45", "x-note-duration: soon", "server-timing: a;dur=1", "age: 5"]));
    assert.deepEqual(info.timingHeaders.map(h => h.name.toLowerCase()).sort(), ["spiislatency", "sprequestduration", "x-envoy-upstream-service-time"]);
    assert.equal(info.timingHeaders.find(h => /sprequestduration/i.test(h.name)).value, "231");
  });
  it("collects request IDs the server team can search by", () => {
    const info = inspectResponse(req(1, ["request-id: abc-123", "x-ms-request-id: def", "SPRequestGuid: g-1", "content-type: text/html"]));
    assert.deepEqual(info.ids.map(i => i.name.toLowerCase()), ["request-id", "x-ms-request-id", "sprequestguid"]);
    assert.ok(isRequestIdHeader("X-Correlation-Id") && isRequestIdHeader("x-azure-ref") && !isRequestIdHeader("etag"));
  });
  it("returns null for a response with none of it", () => {
    assert.equal(inspectResponse(req(1, ["content-type: text/html"])), null);
    assert.equal(inspectResponse(req(1, [])), null);
    assert.equal(inspectResponse({ id: 1 }), null);
  });
});

describe("aggregate insights", () => {
  const requests = [
    req(1, ["server-timing: db;dur=180, render;dur=120", "cf-cache-status: HIT", "cf-ray: aa-SEA", "request-id: r1"], { timing: { wait: 500 } }),
    req(2, ["server-timing: auth;dur=40", "x-cache: TCP_MISS"], { timing: { wait: 90 } }),
    req(3, ["content-type: image/png"], { timing: { wait: 10 } }),
    req(4, [], { timing: { wait: null }, status: null })
  ];
  const insights = buildServerInsights(requests);

  it("counts what is there against what could have been", () => {
    assert.equal(insights.answered, 3);
    assert.equal(insights.withTiming, 2);
    assert.deepEqual(insights.cache, { hit: 1, miss: 1, mixed: 0, other: 0, none: 1, withHeaders: 2 });
    assert.equal(insights.providers[0].name, "Cloudflare");
    assert.equal(insights.hasAnything, true);
  });
  it("ranks reported phases and keeps them next to the wait they belong to", () => {
    assert.deepEqual(insights.leaderboard.map(row => [row.name, row.dur, row.waitMs]), [["db", 180, 500], ["render", 120, 500], ["auth", 40, 90]]);
    assert.equal(insights.largest.name, "db");
  });
  it("says so plainly when nothing was reported", () => {
    const empty = buildServerInsights([req(1, ["content-type: text/html"])]);
    assert.equal(empty.hasAnything, false);
    assert.equal(empty.withTiming, 0);
    assert.equal(empty.largest, null);
    assert.deepEqual(empty.leaderboard, []);
    assert.equal(buildServerInsights([]).answered, 0);
    assert.equal(buildServerInsights(null).hasAnything, false);
  });
  it("writes bounded plain text that labels the source", () => {
    const text = serverInsightsText(insights);
    assert.match(text, /^SERVER-REPORTED TIMING AND CACHE HEADERS/);
    assert.match(text, /reported by the servers/i);
    assert.match(text, /db/);
    assert.ok(text.length < 3000);
    assert.ok(!/[—]|--/.test(text));
    assert.match(serverInsightsText(buildServerInsights([])), /No response/);
  });
});

describe("server evidence in findings and the AI summary", () => {
  const reader = createCaptureReader();
  reader.write(toNetLogText(buildPageLoadNetLog()));
  const model = reader.finish();
  const analysis = analyzeCapture(model);

  it("puts the server's own figure next to a slow wait, labeled as reported", () => {
    const finding = analysis.findings.find(f => f.id === "slow-server");
    assert.ok(finding);
    assert.ok(finding.evidence.some(line => /the server reported render at/.test(line)), finding.evidence.join(" | "));
  });
  it("adds a labeled section to the AI summary, before the instructions", () => {
    const text = buildAiSummary(model, analysis);
    assert.match(text, /SERVER-REPORTED TIMING AND CACHE HEADERS/);
    assert.ok(text.indexOf("SERVER-REPORTED TIMING") < text.indexOf("AI ANALYSIS INSTRUCTIONS"));
    assert.match(text, /render 1050 ms/);
  });
});
