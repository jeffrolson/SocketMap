import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHarReader, summarizeHarEntry } from "../src/parsers/har-stream.mjs";

// Shaped like a Chrome DevTools export (creator WebInspector): underscore fields, bodies, cookies.
const entry = (n, extra = {}) => ({
  _initiator: { type: "script", stack: { callFrames: [{ functionName: "loadMore", scriptId: "12", url: `https://cdn.example.net/app.js?token=SECRETVALUE`, lineNumber: 410, columnNumber: 3 }, { functionName: "", url: "https://cdn.example.net/vendor.js", lineNumber: 1 }] } },
  _priority: "High", _resourceType: "script", _connectionId: "77",
  cache: {}, connection: "77", serverIPAddress: "198.51.100.20",
  startedDateTime: new Date(Date.UTC(2026, 8, 29, 4, 20, 0) + n * 100).toISOString(), time: 120.5,
  request: { method: "GET", url: `https://cdn.example.net/assets/${n}.js?sig=abc123&v=2#frag`, httpVersion: "h3", headers: [{ name: "Cookie", value: "SESSIONSECRET" }, { name: "Authorization", value: "Bearer TOPSECRET" }], cookies: [{ name: "a", value: "COOKIESECRET" }], queryString: [], headersSize: -1, bodySize: 0 },
  response: { status: 200, statusText: "", httpVersion: "h3", headers: [{ name: "Set-Cookie", value: "RESPONSECOOKIE" }], cookies: [], content: { size: 5000, mimeType: "application/javascript", text: "BODYSECRET".repeat(50) }, redirectURL: "", headersSize: -1, bodySize: -1, _transferSize: 1800, _fetchedViaServiceWorker: false },
  timings: { blocked: 3.2, dns: -1, ssl: -1, connect: -1, send: 0.2, wait: 100, receive: 17.1, _blocked_queueing: 1, _workerStart: -1 },
  ...extra
});
const har = (entries, pages = [{ id: "page_1", startedDateTime: "2026-09-29T04:20:00.000Z", title: "PAGETITLESECRET", pageTimings: { onContentLoad: 1234.5, onLoad: 2345.6 } }]) => ({ log: { version: "1.2", creator: { name: "WebInspector", version: "537.36" }, pages, entries } });

function read(text, size = text.length) {
  const reader = createHarReader();
  for (let i = 0; i < text.length; i += size) reader.write(text.slice(i, i + size));
  return reader.finish();
}

describe("HAR streaming reader", () => {
  const text = JSON.stringify(har([entry(1), entry(2), entry(3)]), null, 2);

  it("reads entries, pages and the creator", () => {
    const result = read(text);
    assert.equal(result.recognized, true);
    assert.equal(result.entries.length, 3);
    assert.equal(result.pages.length, 1);
    assert.equal(result.pages[0].onContentLoad, 1234.5);
    assert.equal(result.pages[0].onLoad, 2345.6);
    assert.equal(result.creator.name, "WebInspector");
    assert.deepEqual(result.integrity, { complete: true, discardedPartial: false, malformedEntries: 0 });
  });

  it("gives the same answer however the file is chunked, including one character at a time", () => {
    const whole = JSON.stringify(read(text));
    for (const size of [1, 2, 7, 64, 1000]) assert.equal(JSON.stringify(read(text, size)), whole, `chunk ${size}`);
  });

  it("keeps only whitelisted fields: no bodies, headers, cookies, titles or secrets", () => {
    const out = JSON.stringify(read(text));
    for (const secret of ["BODYSECRET", "SESSIONSECRET", "TOPSECRET", "COOKIESECRET", "RESPONSECOOKIE", "PAGETITLESECRET", "SECRETVALUE", "abc123"]) assert.ok(!out.includes(secret), secret);
    assert.ok(out.includes("cdn.example.net"), "hostnames stay");
  });

  it("stays small however large the bodies are", () => {
    const big = entry(1);
    big.response.content.text = "x".repeat(200000);
    const bigText = JSON.stringify(har(Array.from({ length: 40 }, (_, i) => ({ ...big, startedDateTime: entry(i).startedDateTime }))));
    assert.ok(bigText.length > 8_000_000);
    assert.ok(JSON.stringify(read(bigText, 65536)).length < 60_000, "output does not grow with body size");
  });

  it("keeps complete entries from a truncated file and says so", () => {
    const cut = text.slice(0, text.lastIndexOf('"startedDateTime"') - 20);
    const result = read(cut);
    assert.ok(result.entries.length >= 1 && result.entries.length < 3);
    assert.equal(result.integrity.complete, false);
    assert.equal(result.integrity.discardedPartial, true);
  });

  it("does not mistake other JSON for a HAR", () => {
    assert.equal(read('{"events":[{"a":1}],"constants":{}}').recognized, false);
    assert.equal(read("[1,2,3]").recognized, false);
    assert.equal(read("not json at all").entries.length, 0);
  });

  it("handles a log with entries before pages and scalar keys in any order", () => {
    const flipped = `{"log":{"entries":${JSON.stringify([entry(1)])},"version":"1.2","pages":${JSON.stringify(har([]).log.pages)},"creator":{"name":"x"}}}`;
    const result = read(flipped, 5);
    assert.equal(result.entries.length, 1);
    assert.equal(result.pages.length, 1);
  });

  it("bounds the number of entries kept and counts the rest", () => {
    const many = JSON.stringify(har(Array.from({ length: 30 }, (_, i) => entry(i))));
    const reader = createHarReader({ maxEntries: 10 });
    reader.write(many);
    const result = reader.finish();
    assert.equal(result.entries.length, 10);
    assert.equal(result.entryCount, 30);
    assert.equal(result.omitted, 20);
  });
});

describe("long URLs", () => {
  it("keeps the whole URL so it can match the NetLog, however long", () => {
    const long = "https://login.example.com/oauth/authorize?client=a&scope=" + "x".repeat(1500) + "&end=1";
    const summary = summarizeHarEntry({ request: { method: "GET", url: long }, response: {} });
    assert.equal(summary.url, long);
  });
});

describe("HAR entry summary", () => {
  const s = summarizeHarEntry(entry(1));
  it("normalizes the request, redacts the URL, drops the fragment", () => {
    assert.equal(s.method, "GET");
    assert.ok(!s.url.includes("#frag") && !s.url.includes("abc123") && s.url.includes("sig=[REDACTED]") && s.url.includes("v=2"));
    assert.equal(s.status, 200);
    assert.equal(s.httpVersion, "h3");
    assert.equal(s.resourceType, "script");
    assert.equal(s.priority, "High");
    assert.equal(s.transferSize, 1800);
    assert.equal(s.contentSize, 5000);
    assert.equal(s.mimeType, "application/javascript");
    assert.equal(s.serverIp, "198.51.100.20");
    assert.equal(typeof s.startedMs, "number");
  });
  it("turns -1 timings into unknown, never zero", () => {
    assert.equal(s.timings.dns, null);
    assert.equal(s.timings.wait, 100);
  });
  it("reads a script initiator from the top frame, 1-based line, redacted", () => {
    assert.equal(s.initiator.type, "script");
    assert.equal(s.initiator.fn, "loadMore");
    assert.equal(s.initiator.line, 411);
    assert.ok(s.initiator.url.includes("token=[REDACTED]"));
    assert.equal(s.initiator.frames, 2);
  });
  it("reads parser and other initiators, and unknown ones as null", () => {
    assert.deepEqual(summarizeHarEntry(entry(1, { _initiator: { type: "parser", url: "https://app.example.com/", lineNumber: 17 } })).initiator, { type: "parser", url: "https://app.example.com/", line: 18 });
    assert.deepEqual(summarizeHarEntry(entry(1, { _initiator: { type: "other" } })).initiator, { type: "other" });
    assert.equal(summarizeHarEntry(entry(1, { _initiator: undefined })).initiator, null);
  });
  it("recognizes cache and service worker answers from Chrome's own fields", () => {
    assert.equal(summarizeHarEntry(entry(1, { _fromCache: "disk" })).cache, "disk");
    assert.equal(s.cache, null);
    assert.equal(s.viaServiceWorker, false);
    assert.equal(summarizeHarEntry(entry(1, { timings: { ...entry(1).timings, _workerStart: 0.4 } })).viaServiceWorker, true);
    const sw = entry(1); sw.response._fetchedViaServiceWorker = true;
    assert.equal(summarizeHarEntry(sw).viaServiceWorker, true);
  });
  it("never invents a value it was not given", () => {
    const bare = summarizeHarEntry({ request: { method: "GET", url: "https://a.example.com/" }, response: {} });
    assert.equal(bare.status, null);
    assert.equal(bare.transferSize, null);
    assert.equal(bare.resourceType, null);
    assert.equal(bare.initiator, null);
    assert.equal(bare.startedMs, null);
    assert.equal(summarizeHarEntry(null), null);
  });
});
