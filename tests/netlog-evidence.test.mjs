import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createNetLogEvidence } from "../src/parsers/netlog-evidence.mjs";

const phase = { PHASE_NONE: 0, PHASE_BEGIN: 1, PHASE_END: 2 };
const types = {
  REQUEST_ALIVE: 1, SOCKET_ALIVE: 2, SOCKET_IN_USE: 3, SSL_CONNECT: 4,
  HOST_RESOLVER_IMPL_JOB: 5, SOCKET_BYTES_SENT: 6, SOCKET_BYTES_RECEIVED: 7,
  ENTRY_READ_DATA: 8, ENTRY_WRITE_DATA: 9, CUSTOM_EVENT: 10
};
const sources = { URL_REQUEST: 1, SOCKET: 2, HOST_RESOLVER_IMPL_JOB: 3, UNRECOGNIZED: 99, DISK_CACHE_ENTRY: 4 };

function make() {
  const evidence = createNetLogEvidence();
  evidence.setTopLevel("constants", { logEventTypes: types, logSourceType: sources, logEventPhase: phase });
  return evidence;
}

function event(time, source, type, eventPhase = 0, params) {
  return { time: String(time), source: { id: source[0], type: sources[source[1]] }, type: types[type], phase: eventPhase, params };
}

describe("NetLog evidence index", () => {
  it("retains exact source and event summaries while redacting retained values", () => {
    const evidence = make();
    evidence.setTopLevel("polledData", {
      proxySettings: { effective: { pac_url: "https://proxy.example/pac?token=SECRET" } },
      badProxies: [], hostResolverInfo: {}, dohProvidersDisabledDueToFeature: [], socketPoolInfo: {},
      httpStreamPoolInfo: {}, altSvcMappings: [], spdySessionInfo: {}, spdyStatus: {}, quicInfo: {},
      reportingInfo: {}, httpCacheInfo: {}, serviceProviders: [], extensionInfo: [], prerenderInfo: {},
      activeFieldTrialGroups: []
    });
    evidence.setTopLevel("clientMetadata", { command: "chrome --token TOPSECRET" });
    evidence.addEvent(event(10, [7, "URL_REQUEST"], "REQUEST_ALIVE", 1, {
      url: "https://site.example/path?access_token=EVENTSECRET",
      source_dependency: { id: 9, nested: { source_dependency: { id: 10 } } },
      headers: ["Authorization: Bearer HEADERSECRET"]
    }));
    evidence.addEvent(event(20, [7, "URL_REQUEST"], "REQUEST_ALIVE", 2, { net_error: -7 }));
    const result = evidence.finish();
    assert.equal(result.events, 2);
    assert.deepEqual(result.eventTypes, [{ name: "REQUEST_ALIVE", count: 2 }]);
    assert.equal(result.sources[0].type, "URL_REQUEST");
    assert.equal(result.sources[0].eventCount, 2);
    assert.equal(result.sources[0].errorCount, 1);
    assert.deepEqual(result.sources[0].dependencies, [9, 10]);
    assert.equal(result.sources[0].eventTypes[0].beginCount, 1);
    assert.equal(result.sources[0].eventTypes[0].endCount, 1);
    assert.match(result.sources[0].eventTypes[0].firstParams.url, /\[REDACTED\]/);
    assert.equal(JSON.stringify(result).includes("EVENTSECRET"), false);
    assert.equal(JSON.stringify(result).includes("HEADERSECRET"), false);
    assert.equal(JSON.stringify(result).includes("TOPSECRET"), false);
    assert.match(result.snapshots.proxySettings.effective.pac_url, /\[REDACTED\]/);
    assert.deepEqual(Object.keys(result.snapshots).sort(), [
      "activeFieldTrialGroups", "altSvcMappings", "badProxies", "dohProvidersDisabledDueToFeature", "extensionInfo",
      "hostResolverInfo", "httpCacheInfo", "httpStreamPoolInfo", "prerenderInfo", "proxySettings", "quicInfo",
      "reportingInfo", "serviceProviders", "socketPoolInfo", "spdySessionInfo", "spdyStatus"
    ]);
  });

  it("indexes unknown source families and never fabricates active-count negatives", () => {
    const evidence = make();
    evidence.addEvent(event(1, [20, "UNRECOGNIZED"], "CUSTOM_EVENT", 0, { label: "custom" }));
    evidence.addEvent(event(2, [2, "SOCKET"], "SOCKET_ALIVE", 2));
    evidence.addEvent(event(3, [2, "SOCKET"], "SOCKET_ALIVE", 1));
    evidence.addEvent(event(4, [2, "SOCKET"], "SOCKET_ALIVE", 1));
    evidence.addEvent(event(5, [2, "SOCKET"], "SOCKET_ALIVE", 2));
    const result = evidence.finish();
    assert.equal(result.sources.find(source => source.id === 20).type, "UNRECOGNIZED");
    assert.equal(result.sources.find(source => source.id === 20).eventTypes[0].name, "CUSTOM_EVENT");
    assert.deepEqual(result.timeline.map(bin => bin.openSockets), [null, null, 1, null, 0]);
  });

  it("uses the deployed timeline event names and parameter fields", () => {
    const evidence = make();
    evidence.addEvent(event(1, [1, "SOCKET"], "SOCKET_BYTES_SENT", 0, { byte_count: 12 }));
    evidence.addEvent(event(2, [1, "SOCKET"], "SOCKET_BYTES_RECEIVED", 0, { byte_count: 21 }));
    evidence.addEvent(event(3, [2, "DISK_CACHE_ENTRY"], "ENTRY_READ_DATA", 2, { bytes_copied: 7 }));
    evidence.addEvent(event(4, [2, "DISK_CACHE_ENTRY"], "ENTRY_WRITE_DATA", 2, { bytes_copied: 8 }));
    const result = evidence.finish();
    assert.equal(result.timeline.reduce((total, bin) => total + bin.sentBytes, 0), 12);
    assert.equal(result.timeline.reduce((total, bin) => total + bin.receivedBytes, 0), 21);
    assert.equal(result.timeline.reduce((total, bin) => total + bin.diskReadBytes, 0), 7);
    assert.equal(result.timeline.reduce((total, bin) => total + bin.diskWriteBytes, 0), 8);
  });

  it("rebuckets thousands of events without losing totals", () => {
    const evidence = make();
    for (let index = 0; index < 5000; index++) {
      evidence.addEvent(event(index, [index + 1, "UNRECOGNIZED"], "CUSTOM_EVENT", 0, index % 101 === 0 ? { error_code: -1 } : {}));
    }
    const result = evidence.finish();
    assert.ok(result.timeline.length <= 512);
    assert.equal(result.timeline.reduce((total, bin) => total + bin.events, 0), 5000);
    assert.equal(result.timeline.reduce((total, bin) => total + bin.errors, 0), 50);
    assert.equal(result.sources.length, 5000);
  });

  it("reports incomplete capture integrity without treating it as an event", () => {
    const evidence = make();
    evidence.setTopLevel("captureIntegrity", { complete: false, malformedEntries: 2 });
    evidence.addEvent(event(1, [1, "URL_REQUEST"], "REQUEST_ALIVE", 1));
    const result = evidence.finish();
    assert.deepEqual(result.integrity, { complete: false, malformedEntries: 2 });
    assert.equal(result.topLevel.captureIntegrity, undefined);
    assert.equal(result.warnings.length, 2);
  });

  it("never queues raw events when constants arrive late", () => {
    const evidence = createNetLogEvidence();
    for (let index = 0; index < 1000; index++) {
      evidence.addEvent({ time: String(index), source: { id: index, type: 77 }, type: 88, phase: 0, params: { token: "SECRET" } });
    }
    evidence.setTopLevel("constants", { logEventTypes: { LATER_EVENT: 88 }, logSourceType: { LATER_SOURCE: 77 }, logEventPhase: phase });
    const result = evidence.finish();
    assert.equal(result.events, 1000);
    assert.equal(result.sources.length, 1000);
    assert.equal(result.sources[0].type, "77");
    assert.equal(result.eventTypes[0].name, "88");
    assert.equal(result.constantsLate, true);
    assert.match(result.warnings[0], /before constants/);
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
  });

  it("does not turn absent times or byte counts into recorded zeroes", () => {
    const evidence = make();
    evidence.addEvent({ source: { id: 1, type: sources.SOCKET }, type: types.SOCKET_BYTES_SENT, phase: 0, params: {} });
    const result = evidence.finish();
    assert.equal(result.firstTime, null);
    assert.equal(result.lastTime, null);
    assert.deepEqual(result.timeline, []);
  });

  it("keeps event summary times null until a real timestamp arrives", () => {
    const evidence = make();
    evidence.addEvent({ source: { id: 1, type: sources.SOCKET }, type: types.CUSTOM_EVENT, phase: 0, params: {} });
    evidence.addEvent(event(12, [1, "SOCKET"], "CUSTOM_EVENT", 0, {}));
    const type = evidence.finish().sources[0].eventTypes[0];
    assert.equal(type.firstTime, 12);
    assert.equal(type.lastTime, 12);
  });

  it("does not present a missing transfer byte field as zero", () => {
    const evidence = make();
    evidence.addEvent(event(2, [1, "SOCKET"], "SOCKET_BYTES_SENT", 0, {}));
    const result = evidence.finish();
    assert.equal(result.timeline[0].sentBytes, null);
  });
});
