import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { compareCaptures } from "../src/comparison.mjs";
import { parseNetLog } from "../src/parsers/netlog-parser.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";

let model;
let directory;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), "socketmap-comparison-"));
  const path = join(directory, "capture.json");
  writeFileSync(path, toNetLogText(buildPageLoadNetLog()));
  model = await parseNetLog(path);
});

function copy() {
  return structuredClone(model);
}

function request(capture, id) {
  return capture.requests.find(item => item.id === id);
}

function metric(result, key) {
  return result.metrics.find(item => item.key === key);
}

describe("NetLog comparison model", () => {
  it("matches identical captures and preserves zero deltas", () => {
    const result = compareCaptures(copy(), copy(), { sourceA: { name: "before.json", bytes: 100 }, sourceB: { name: "after.json", bytes: 200 } });
    assert.equal(result.a.page.site, "https://portal.example.com");
    assert.equal(result.a.source.name, "before.json");
    assert.equal(result.b.source.bytes, 200);
    assert.equal(result.counts.matched, 5);
    assert.equal(result.counts.changed, 0);
    assert.equal(metric(result, "request-count").delta, 0);
    assert.equal(metric(result, "observed-span").delta, 0);
    assert.ok(result.pairs.every(pair => pair.change === "matched" && pair.changed === false));
  });

  it("reports slower and faster request deltas as b minus a", () => {
    const before = copy();
    const after = copy();
    const slow = request(after, 1);
    slow.end += 200;
    slow.durationMs += 200;
    slow.timing.wait += 200;
    const faster = request(after, 10);
    faster.end -= 100;
    faster.durationMs -= 100;
    faster.timing.wait -= 100;
    const result = compareCaptures(before, after);
    const main = result.pairs.find(pair => pair.a?.id === 1);
    const script = result.pairs.find(pair => pair.a?.id === 10);
    assert.equal(main.durationDeltaMs, 200);
    assert.equal(main.waitDeltaMs, 200);
    assert.equal(script.durationDeltaMs, -100);
    assert.equal(script.waitDeltaMs, -100);
    assert.equal(main.changed, true);
  });

  it("reverses deltas when the captures are swapped", () => {
    const before = copy();
    const after = copy();
    const slow = request(after, 1);
    slow.end += 200;
    slow.durationMs += 200;
    slow.timing.wait += 200;
    const result = compareCaptures(after, before);
    const main = result.pairs.find(pair => pair.b?.id === 1);
    assert.equal(main.durationDeltaMs, -200);
    assert.equal(main.waitDeltaMs, -200);
  });

  it("keeps missing requests and distinct retained query values separate", () => {
    const before = copy();
    const after = copy();
    after.requests = after.requests.filter(item => item.id !== 20);
    const queryVariant = structuredClone(request(after, 1));
    queryVariant.id = 999;
    queryVariant.start += 1;
    queryVariant.url = "https://portal.example.com/sites/team/home.aspx?tempauth=[REDACTED]&view=other";
    after.requests.push(queryVariant);
    const result = compareCaptures(before, after);
    assert.equal(result.counts.onlyA, 1);
    assert.equal(result.counts.onlyB, 1);
    assert.ok(result.pairs.some(pair => pair.change === "only-a" && pair.a.id === 20));
    assert.ok(result.pairs.some(pair => pair.change === "only-b" && pair.b.id === 999));
  });

  it("pairs repeated requests chronologically by occurrence", () => {
    const before = copy();
    const after = copy();
    const repeated = structuredClone(request(after, 10));
    repeated.id = 998;
    repeated.start += 5000;
    repeated.end += 5000;
    after.requests.push(repeated);
    const result = compareCaptures(before, after);
    const pairs = result.pairs.filter(pair => pair.url.endsWith("/_layouts/15/app.js"));
    assert.equal(pairs.length, 2);
    assert.equal(pairs[0].occurrence, 1);
    assert.equal(pairs[0].change, "matched");
    assert.equal(pairs[1].occurrence, 2);
    assert.equal(pairs[1].change, "only-b");
  });

  it("does not auto-pair unknown identifiers and redacts exported inputs", () => {
    const before = copy();
    const after = copy();
    request(after, 1).method = null;
    after.environment.proxy.pacUrl = "https://pac.example/proxy.pac?token=PACSECRET";
    after.environment.auth = "ENV_CANARY";
    const result = compareCaptures(before, after, { sourceB: { name: "after?token=FILESECRET.json", bytes: 1 } });
    assert.equal(result.counts.onlyA, 1);
    assert.equal(result.counts.onlyB, 1);
    assert.ok(result.pairs.some(pair => pair.change === "only-a" && pair.a?.id === 1));
    assert.ok(result.pairs.some(pair => pair.change === "only-b" && pair.b?.id === 1));
    assert.ok(result.warnings.some(warning => warning.includes("could not be paired")));
    const text = JSON.stringify(result);
    assert.ok(!text.includes("PACSECRET"));
    assert.ok(!text.includes("FILESECRET"));
    assert.ok(!text.includes("ENV_CANARY"));
  });

  it("suppresses completion-based values for a request without a recorded end", () => {
    const before = copy();
    const after = copy();
    const incomplete = request(after, 1);
    incomplete.endRecorded = false;
    incomplete.end += 9999;
    incomplete.durationMs += 9999;
    const result = compareCaptures(before, after);
    const pair = result.pairs.find(item => item.a?.id === 1);
    assert.equal(pair.durationDeltaMs, null);
    assert.equal(metric(result, "observed-span").b, null);
    assert.equal(metric(result, "median-duration").coverageB, 0.8);
    assert.ok(result.warnings.some(warning => warning.includes("lacks a recorded end event")));
  });

  it("marks recorded phase, byte, proxy, and completion changes even when totals match", () => {
    const before = copy();
    const after = copy();
    const changed = request(after, 1);
    changed.timing.dns += 40;
    changed.timing.tls -= 40;
    changed.bytesWire += 1;
    changed.proxy = "PROXY changed.example:8080";
    changed.endRecorded = false;
    const result = compareCaptures(before, after);
    const pair = result.pairs.find(item => item.a?.id === 1);
    assert.equal(pair.durationDeltaMs, null);
    assert.equal(pair.changed, true);
  });

  it("keeps unavailable timing distinct from a known zero failed count", () => {
    const before = copy();
    const after = copy();
    for (const item of after.requests) {
      item.timing = {};
      item.status = 200;
      item.netError = null;
    }
    const result = compareCaptures(before, after);
    const wait = metric(result, "median-server-wait");
    const failures = metric(result, "failed-count");
    assert.equal(wait.b, null);
    assert.equal(wait.coverageB, 0);
    assert.equal(failures.b, 0);
    assert.equal(failures.coverageB, 1);
    assert.equal(failures.label, "Known failed requests");
  });

  it("compares capture-wide diagnostic snapshots and source families without pairing source IDs", () => {
    const before = copy();
    const after = copy();
    before.diagnostics = {
      events: 20,
      snapshots: { proxySettings: { effective: { mode: "direct", pac_url: "https://proxy.example/pac?token=BEFORE" } }, badProxies: [] },
      sources: [{ id: 1, type: "SOCKET", eventCount: 12, errorCount: 0 }, { id: 2, type: "URL_REQUEST", eventCount: 8, errorCount: 1 }]
    };
    after.diagnostics = {
      events: 27,
      snapshots: { proxySettings: { effective: { mode: "pac", pac_url: "https://proxy.example/pac?token=AFTER" } }, badProxies: [{ proxy_uri: "https://bad.example" }] },
      sources: [{ id: 99, type: "SOCKET", eventCount: 20, errorCount: 2 }, { id: 100, type: "QUIC_SESSION", eventCount: 7, errorCount: 0 }]
    };
    const result = compareCaptures(before, after);
    assert.ok(result.diagnostics);
    assert.equal(result.diagnostics.snapshots.length, 16);
    const proxy = result.diagnostics.snapshots.find(row => row.key === "proxySettings");
    assert.equal(proxy.presentA, true);
    assert.equal(proxy.changed, true);
    assert.ok(JSON.stringify(proxy).includes("[REDACTED]"));
    assert.ok(!JSON.stringify(proxy).includes("BEFORE"));
    const socket = result.diagnostics.families.find(row => row.type === "SOCKET");
    assert.deepEqual(socket, { type: "SOCKET", aSources: 1, bSources: 1, aEvents: 12, bEvents: 20, aErrors: 0, bErrors: 2, changed: true });
    assert.equal(result.diagnostics.families.find(row => row.type === "QUIC_SESSION").aSources, null);
    assert.deepEqual(result.diagnostics.totalsA, { sources: 2, events: 20, errors: 1 });
  });
});

process.on("exit", () => { if (directory) rmSync(directory, { recursive: true, force: true }); });
