import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildDiagnosticEvidenceText, buildDiagnosticInsights, summarizeDnsCache } from "../src/diagnostic-insights.mjs";

const model = {
  diagnostics: {
    events: 45,
    constantsLate: true,
    integrity: { complete: false, discardedPartial: 1, malformedEntries: 2 },
    constants: { netError: { ERR_CONNECTION_REFUSED: -102 } },
    snapshots: {
      hostResolverInfo: { dns_config: { nameservers: ["192.0.2.53"] }, cache: { capacity: 100, entries: [{ hostname: "example.test" }] } },
      proxySettings: { effective: { mode: "direct" } },
      badProxies: [{ proxy_uri: "https://proxy.example" }],
      httpStreamPoolInfo: { connecting_socket_count: 2, max_socket_count: 6 }
    },
    sources: [
      { id: 7, type: "SOCKET", eventCount: 18, errorCount: 2, eventTypes: [{ firstParams: { net_error: -102 }, lastParams: {} }] },
      { id: 2, type: "URL_REQUEST", eventCount: 4, errorCount: 0, eventTypes: [] }
    ]
  }
};

describe("diagnostic insights", () => {
  it("uses only retained evidence and supplies non-causal next checks", () => {
    const cards = buildDiagnosticInsights(model);
    const error = cards.find(card => card.id === "recorded-errors");
    assert.ok(error.observation.includes("ERR_CONNECTION_REFUSED"));
    assert.deepEqual(error.sourceIds, [7]);
    assert.match(error.nextCheck, /inspect/i);
    assert.ok(cards.find(card => card.id === "capture-integrity"));
    assert.ok(cards.find(card => card.id === "constants-late"));
    assert.ok(cards.find(card => card.id === "dns-snapshot").observation.includes("cache capacity 100"));
    assert.ok(cards.find(card => card.id === "pool-snapshot").observation.includes("max_socket_count=6"));
    assert.ok(cards.find(card => card.id === "cpu-gap"));
    assert.ok(cards.find(card => card.id === "wire-gap"));
    assert.ok(cards.find(card => card.id === "server-gap"));
    for (const card of cards) assert.equal(/caused|because|proves/i.test(card.observation), false, card.id);
  });

  it("distinguishes absent snapshots from a recorded empty snapshot", () => {
    const cards = buildDiagnosticInsights({ diagnostics: { snapshots: { proxySettings: {} }, sources: [] } });
    const coverage = cards.find(card => card.id === "snapshot-coverage");
    assert.match(coverage.observation, /Recorded categories: proxySettings/);
    assert.match(coverage.observation, /Not recorded: badProxies/);
  });

  it("uses Chromium's recorded DNS cache expiry predicates without defaults", () => {
    const diagnostics = {
      constants: { clientInfo: { numericDate: "1200" }, timeTickOffset: "100" },
      snapshots: { hostResolverInfo: { cache: { network_changes: "5", entries: [
        { expiration: "1000", network_changes: "5" },
        { expiration: "2000", network_changes: "3" },
        { expiration: "2000", network_changes: "5" },
        { expiration: "not-recorded" }
      ] } } }
    };
    const summary = summarizeDnsCache(diagnostics);
    assert.deepEqual(summary.entries.map(entry => entry.label), ["expired", "expired", "current", "unknown"]);
    assert.equal(summary.entries[0].expirationDate, "1970-01-01T00:00:01.100Z");
    assert.equal(summary.entries[0].expiredByTime, true);
    assert.equal(summary.entries[1].expiredByNetworkChange, true);
    assert.deepEqual(summary.counts, { expired: 2, current: 1, unclassified: 1, expiredByTime: 1, expiredByNetworkChange: 1 });
    const card = buildDiagnosticInsights({ diagnostics: { ...diagnostics, sources: [] } }).find(item => item.id === "dns-cache-expiry");
    assert.match(card.observation, /2 known expired, 1 known current, and 1 unclassified/);
    assert.match(card.observation, /1 by recorded expiry time/);
    assert.match(card.observation, /1 by recorded network-change count/);
  });

  it("does not treat cache misses and cancellations as root failures", () => {
    const cards = buildDiagnosticInsights({ diagnostics: {
      constants: { netError: { ERR_CACHE_MISS: -400, ERR_ABORTED: -3 } }, snapshots: {},
      sources: [{ id: 1, errorCount: 2, eventCount: 2, eventTypes: [{ firstParams: { net_error: -400 }, lastParams: { net_error: -3 } }] }]
    } });
    const error = cards.find(card => card.id === "recorded-errors");
    assert.equal(error.title, "Recorded error-bearing events");
    assert.match(error.observation, /ERR_CACHE_MISS, ERR_ABORTED/);
    assert.match(error.observation, /not root-failure proof/);
  });

  it("bounds AI evidence and does not print parameter samples", () => {
    const text = buildDiagnosticEvidenceText(model);
    assert.match(text, /^CAPTURE-WIDE DIAGNOSTIC EVIDENCE/m);
    assert.ok(!text.includes("proxy_uri"));
    assert.ok(!text.includes("192.0.2.53"));
    assert.ok(text.split("\n").length <= 14);
  });
});
