import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCoverage, coverageText } from "../src/coverage.mjs";
import { createCaptureReader } from "../src/viewer/viewer-core.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";
import { buildDiagnosticNetLog } from "../src/demo/diagnostic-capture.mjs";

async function modelFor(text) {
  const reader = createCaptureReader();
  reader.write(text);
  return reader.finish();
}
const item = (coverage, id) => coverage.stages.flatMap(stage => stage.items).find(entry => entry.id === id);

describe("coverage model", () => {
  it("reports what a complete capture recorded and what NetLog never records", async () => {
    const coverage = buildCoverage(await modelFor(toNetLogText(buildPageLoadNetLog())));
    assert.deepEqual(coverage.stages.map(stage => stage.id), ["page", "browser", "network", "path", "server"]);
    for (const id of ["requests", "dns", "snapshot", "integrity"]) assert.equal(item(coverage, id).status, "recorded", id);
    for (const id of ["connections", "tls", "protocol", "timing"]) assert.notEqual(item(coverage, id).status, "never", id);
    for (const id of ["javascript", "script-initiator", "rendering", "packets", "hops", "server-work", "extensions", "machine"]) assert.equal(item(coverage, id).status, "never", id);
    assert.equal(item(coverage, "payloads").status, "missing", "Default capture mode records metadata only");
    assert.match(item(coverage, "payloads").detail, /Default/);
  });

  it("never reports Recorded without evidence in the capture", () => {
    const coverage = buildCoverage({ environment: { polledDataPresent: false, captureMode: null }, requests: [], connections: [], dnsLookups: [], diagnostics: {} });
    for (const id of ["requests", "cache", "dns", "connections", "tls", "protocol", "timing", "snapshot", "server-ids", "integrity", "payloads"]) {
      assert.notEqual(item(coverage, id).status, "recorded", id);
    }
    assert.doesNotThrow(() => buildCoverage(null));
    assert.doesNotThrow(() => buildCoverage({}));
  });

  it("marks a truncated capture partial and says what was dropped", async () => {
    const coverage = buildCoverage(await modelFor(toNetLogText(buildPageLoadNetLog(), { truncate: true })));
    assert.equal(item(coverage, "integrity").status, "partial");
    assert.equal(item(coverage, "snapshot").status, "missing");
    assert.match(item(coverage, "snapshot").detail, /polledData/);
  });

  it("counts partial evidence instead of rounding it up", () => {
    const requests = [
      { endRecorded: true, fromCache: false, protocol: "h2", timing: { wait: 5 }, connectionId: "a", proxy: "DIRECT", responseHeaders: ["request-id: abc"] },
      { endRecorded: false, fromCache: null, protocol: null, timing: { wait: null }, connectionId: null, proxy: null, responseHeaders: [] }
    ];
    const coverage = buildCoverage({ requests, connections: [{ tlsMs: 4, tlsVersion: "TLS 1.3", cert: {} }, { tlsMs: 3, tlsVersion: null, cert: null }], dnsLookups: [], environment: { polledDataPresent: true, captureMode: "Everything" }, diagnostics: { integrity: { complete: true } } });
    assert.equal(item(coverage, "requests").status, "partial");
    assert.match(item(coverage, "requests").detail, /1 of 2/);
    assert.equal(item(coverage, "cache").status, "partial");
    assert.equal(item(coverage, "tls").status, "partial");
    assert.equal(item(coverage, "server-ids").status, "partial");
    assert.equal(item(coverage, "payloads").status, "recorded");
    assert.equal(item(coverage, "security-agent").status, "partial", "certificate issuers are evidence, not proof of agent activity");
  });

  it("handles a capture with no page requests", async () => {
    const coverage = buildCoverage(await modelFor(JSON.stringify(buildDiagnosticNetLog({ noHttp: true }))));
    assert.equal(item(coverage, "requests").status, "missing");
    assert.equal(coverage.summary.recorded + coverage.summary.partial + coverage.summary.missing + coverage.summary.never, coverage.stages.flatMap(stage => stage.items).length);
  });

  it("suggests what to collect next, only for stages that are unseen, with checked links only", async () => {
    const coverage = buildCoverage(await modelFor(toNetLogText(buildPageLoadNetLog())));
    assert.ok(coverage.next.length >= 4);
    for (const step of coverage.next) {
      assert.ok(step.title && step.why && step.covers.length, step.id);
      for (const id of step.covers) assert.ok(item(coverage, id), `${step.id} covers unknown item ${id}`);
      if (step.link) assert.match(step.link, /^https:\/\//);
    }
    const perf = coverage.next.find(step => step.id === "performance-trace");
    assert.ok(perf && perf.covers.includes("javascript"));
    assert.ok(!/SocketMap (imports|reads) /i.test(JSON.stringify(coverage.next)), "no claimed import support");
  });

  it("produces bounded plain text for the AI handoff", async () => {
    const text = coverageText(buildCoverage(await modelFor(toNetLogText(buildPageLoadNetLog()))));
    assert.match(text, /^WHAT THIS CAPTURE COULD AND COULD NOT SEE/);
    assert.match(text, /Not recorded by NetLog/);
    assert.ok(text.length < 4000);
    assert.ok(!/[—]|--/.test(text));
  });
});
