import { describe, it } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { renderDiagnostics, diagnosticsCss, diagnosticsScript } from "../src/renderer/diagnostics.mjs";

const model = { diagnostics: { events: 12, firstTime: 10, lastTime: 40, warnings: ["Capture began after some activity."], snapshots: { proxySettings: { mode: "direct" }, spdySessionInfo: { sessions: 1 }, strange: { value: "<unsafe>" } }, sources: [{ id: 1, type: "SOCKET", label: "<socket>", firstTime: 10, lastTime: 20, eventCount: 2, errorCount: 0, dependencies: [2], eventTypes: [{ name: "CONNECT", count: 2, firstTime: 10, lastTime: 20, beginCount: 1, endCount: 1, firstParams: { host: "example.test" }, lastParams: { status: "ok" } }] }], timeline: [{ start: 10, end: 20, events: 5, errors: 0, sentBytes: 1, receivedBytes: 2 }] } };

describe("diagnostics report", () => {
  it("renders all-source and snapshot evidence without raw event archives", () => {
    const html = renderDiagnostics(model);
    assert.ok(html.includes("Browser diagnostics"));
    assert.ok(html.includes("Proxy"));
    assert.ok(html.includes("HTTP/2"));
    assert.ok(html.includes("Other captured data"));
    assert.ok(html.includes("data-replay-source=\"1\""));
    assert.ok(html.includes("Samples below are the first and last"));
    assert.ok(html.includes("&lt;unsafe&gt;"));
    assert.ok(!html.includes("<socket>"));
    assert.ok(diagnosticsCss().includes("var(--surface)"));
  });
  it("provides a compiling, bounded interactive script", () => {
    const script = diagnosticsScript().match(/<script>([\s\S]*)<\/script>/)[1];
    assert.doesNotThrow(() => new vm.Script(script));
    assert.ok(script.includes("Showing "));
  });
});

it("groups recorded DNS, DoH, HTTP/2 sessions and nested cache tables without losing namespaces", () => {
  const html = renderDiagnostics({ diagnostics: {
    sources: [], timeline: [],
    constants: { timeTickOffset: '1000', clientInfo: { numericDate: 2000 }, same: 'constant namespace' },
    topLevel: { same: 'top-level namespace' },
    snapshots: {
      same: 'snapshot namespace',
      hostResolverInfo: { cache: { network_changes: 2, entries: [{ hostname: 'example.test', expiration: 3000, network_changes: 1 }] } },
      dohProvidersDisabledDueToFeature: ['example-provider'],
      spdySessionInfo: [{ host_port_pair: 'example.test:443', source_id: 7 }]
    }
  } });
  const dns = html.split('data-diagnostic-tab="dns"')[1].split('</section>')[0];
  assert.ok(dns.includes('snapshots.hostResolverInfo'));
  assert.ok(dns.includes('snapshots.dohProvidersDisabledDueToFeature'));
  assert.ok(dns.includes('Network changed'));
  assert.ok(dns.includes('expired'));
  for (const namespace of ['constants.same', 'topLevel.same', 'snapshots.same']) assert.ok(html.includes(namespace));
  assert.ok(html.includes('data-replay-source="7"'));
});

it("keeps a large snapshot bounded: capped tables, no duplicated nested JSON, full data still present once", () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ hostname: `host-${i}.example.test`, address: { ip: `192.0.2.${i % 250}`, family: 4 }, marker: `row-${i}` }));
  const html = renderDiagnostics({ diagnostics: { sources: [], timeline: [], snapshots: { hostResolverInfo: { cache: { entries: rows } } } } });
  const rawJson = JSON.stringify({ cache: { entries: rows } }, null, 2).length;
  assert.ok(html.length < rawJson * 1.6, `diagnostics view is ${html.length} bytes for ${rawJson} bytes of recorded data`);
  assert.equal((html.match(/<tr>/g) || []).length < 300, true, "table rows are capped");
  assert.ok(html.includes("Showing the first 100 of 5000 rows"), "the cap is stated, not hidden");
  assert.ok(html.includes("row-4999"), "the full JSON still carries every recorded row");
  assert.equal(html.split("row-4999").length - 1, 1, "each recorded value appears once");
});

describe("diagnostics report size", () => {
  const type = (name, marker) => ({ name, count: 3, firstTime: 1, lastTime: 2, beginCount: 1, endCount: 1, firstParams: { marker }, lastParams: { marker } });
  const source = (id, eventCount, errorCount) => ({ id: String(id), type: "URL_REQUEST", label: `s${id}`, firstTime: 1, lastTime: 2, eventCount, errorCount, dependencies: [], eventTypes: [type("EVENT", `sample-of-${id}`)] });
  const sources = Array.from({ length: 300 }, (_, i) => source(i + 1, i + 1, i === 0 ? 2 : 0));
  const html = renderDiagnostics({ diagnostics: { sources, timeline: [], snapshots: {}, firstTime: 1, lastTime: 2 } });
  it("keeps samples for the most eventful sources and every source with errors, and says where the rest went", () => {
    assert.ok(html.includes("sample-of-300"), "most eventful");
    assert.ok(html.includes("sample-of-201"), "within the top 100");
    assert.ok(html.includes("sample-of-1&quot;"), "a source with errors, even with few events");
    assert.ok(!html.includes("sample-of-150&quot;"), "a quiet source keeps counts, not samples");
    assert.match(html, /Samples are not kept for lower-activity sources/);
  });
  it("still lists every source and its event types", () => {
    assert.equal((html.match(/data-source-id=/g) || []).length, 300);
    assert.ok(html.includes("EVENT (3)"));
  });
});
