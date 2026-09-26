import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createNetLogTokenizer } from "../src/parsers/netlog-stream.mjs";
import { parseNetLog } from "../src/parsers/netlog-parser.mjs";
import { buildPageLoadNetLog, buildManyRequestsNetLog, toNetLogText } from "./fixtures/netlog-builder.mjs";

let dir;
let pageLoadPath;
let model;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "socketmap-netlog-"));
  pageLoadPath = join(dir, "page-load.json");
  writeFileSync(pageLoadPath, toNetLogText(buildPageLoadNetLog()));
  model = await parseNetLog(pageLoadPath);
});

after(() => rmSync(dir, { recursive: true, force: true }));

const req = (id) => model.requests.find(r => r.id === id);

describe("NetLog tokenizer", () => {
  function tokenize(text, chunkSize) {
    const out = { events: [], top: {} };
    const t = createNetLogTokenizer({
      onTopLevel: (key, value) => { out.top[key] = value; },
      onEvent: (ev) => out.events.push(ev)
    });
    for (let i = 0; i < text.length; i += chunkSize) t.write(text.slice(i, i + chunkSize));
    t.end();
    return out;
  }

  it("emits constants, every event, and polledData", () => {
    const netlog = buildPageLoadNetLog();
    const out = tokenize(toNetLogText(netlog), 65536);
    assert.equal(out.events.length, netlog.events.length);
    assert.ok(out.top.constants.logEventTypes);
    assert.deepEqual(out.top.polledData.hostResolverInfo.dns_config.nameservers, ["192.0.2.53:53"]);
  });

  it("gives identical results whatever the chunk boundaries", () => {
    const text = toNetLogText(buildPageLoadNetLog());
    const whole = tokenize(text, text.length);
    for (const size of [1, 7, 333]) {
      assert.deepEqual(tokenize(text, size), whole, `chunk size ${size}`);
    }
  });

  it("ignores braces and escaped quotes inside strings", () => {
    const text = '{"constants":{"a":"}{"},"events":[{"type":1,"params":{"s":"x\\"}]{"}},{"type":2}]}';
    const out = tokenize(text, 3);
    assert.equal(out.events.length, 2);
    assert.equal(out.events[0].params.s, 'x"}]{');
  });

  it("keeps complete events from a capture Chrome never finished writing", () => {
    const netlog = buildPageLoadNetLog();
    const out = tokenize(toNetLogText(netlog, { truncate: true }), 4096);
    assert.equal(out.events.length, netlog.events.length);
    assert.equal(out.top.polledData, undefined);
  });
});

describe("NetLog capture model", () => {
  it("describes the capture environment", () => {
    const env = model.environment;
    assert.equal(env.browser, "Google Chrome 153.0.1.0");
    assert.equal(env.os, "Windows NT: 10.0.26100 (x86_64)");
    assert.equal(env.captureMode, "Default");
    assert.deepEqual(env.localAddresses, ["192.0.2.10"]);
    assert.deepEqual(env.dns.servers, ["192.0.2.53"]);
    assert.deepEqual(env.dns.search, ["corp.example.com"]);
    assert.equal(env.proxy.mode, "PAC script");
    assert.equal(env.proxy.detail, "http://wpad.corp.example.com/proxy.pac");
    assert.ok(env.captureStartedAt.startsWith("2026-"));
  });

  it("finds the page and separates background traffic", () => {
    const page = model.pages.find(p => p.site === "https://portal.example.com");
    assert.ok(page);
    assert.equal(page.requestCount, 5);
    assert.equal(page.isBackground, false);
    const ext = model.pages.find(p => p.site.startsWith("chrome-extension://"));
    assert.ok(ext.isBackground);
    assert.equal(req(50).isBackground, true);
    assert.equal(req(50).fromCache, true);
  });

  it("breaks the main document into real timing phases", () => {
    const r = req(1);
    assert.equal(r.host, "portal.example.com");
    assert.equal(r.requestType, "main frame");
    assert.equal(r.protocol, "h2");
    assert.equal(r.status, 200);
    assert.equal(r.proxy, "DIRECT");
    assert.equal(r.reusedConnection, false);
    assert.equal(r.durationMs, 850);
    assert.deepEqual(r.timing, {
      redirect: null, queue: 5, proxy: 40, dns: 80, connect: 40, tls: 120, stalled: 5, send: 1, wait: 500, download: 59
    });
    assert.equal(r.bytesWire, 40000);
  });

  it("links requests to the connection they actually used", () => {
    const main = model.connections.find(c => c.id === req(1).connectionId);
    assert.equal(main.kind, "tcp");
    assert.equal(main.remoteIp, "198.51.100.20");
    assert.equal(main.remotePort, 443);
    assert.equal(main.tlsVersion, "TLS 1.3");
    assert.equal(main.alpn, "h2");
    assert.equal(main.dnsMs, 80);
    assert.equal(main.connectMs, 40);
    assert.equal(main.tlsMs, 120);
    assert.equal(main.cert.knownRoot, true);
    assert.equal(main.cert.subject, "portal.example.com");
    assert.equal(main.cert.issuer, "Example Public CA");

    const reused = req(10);
    assert.equal(reused.connectionId, req(1).connectionId);
    assert.equal(reused.reusedConnection, true);
    assert.equal(reused.timing.dns, null);
    assert.equal(reused.timing.wait, 1200);
  });

  it("follows QUIC sessions, including DNS and handshake time", () => {
    const r = req(20);
    assert.equal(r.protocol, "h3");
    const c = model.connections.find(x => x.id === r.connectionId);
    assert.equal(c.kind, "quic");
    assert.equal(c.remoteIp, "203.0.113.5");
    assert.equal(c.dnsMs, 5);
    assert.equal(c.connectMs, 30);
    assert.equal(c.tlsVersion, "TLS 1.3");
    assert.equal(c.cert.issuer, "Example Public CA");
  });

  it("records failures and local network access", () => {
    const r = req(30);
    assert.equal(r.host, "127.0.0.1");
    assert.equal(r.netError, "ERR_CONNECTION_REFUSED");
    assert.equal(r.status, null);
    assert.equal(r.addressSpace, "loopback");
  });

  it("records the proxy and the certificate the browser was really given", () => {
    const r = req(40);
    assert.equal(r.proxy, "PROXY proxy.corp.example.com:8080");
    assert.equal(r.method, "POST");
    assert.equal(r.timing.proxy, 80);
    const c = model.connections.find(x => x.id === r.connectionId);
    assert.equal(c.remoteIp, "198.51.100.99");
    assert.equal(c.cert.knownRoot, false);
    assert.equal(c.cert.issuer, "Contoso Inspection CA");
    assert.equal(c.cert.issuerOrg, "Contoso Security");
  });

  it("records DNS lookups with their answers", () => {
    const lookup = model.dnsLookups.find(d => d.host === "portal.example.com");
    assert.equal(lookup.durationMs, 80);
    assert.deepEqual(lookup.addresses, ["198.51.100.20"]);
  });

  it("strips secrets but keeps everything else", () => {
    const text = JSON.stringify(model);
    for (const secret of ["SECRET123", "SUPERSECRET", "SECRETCOOKIE", "abc.def.ghi", "TOKENSECRET", "PROXYSECRET", "APIKEYSECRET", "DIGESTSECRET"]) {
      assert.ok(!text.includes(secret), `${secret} must be redacted`);
    }
    assert.ok(req(1).url.includes("view=1"), "non-secret query values stay");
    assert.ok(req(1).url.includes("/sites/team/home.aspx"), "document paths stay");
    assert.ok(text.includes("192.0.2.10"), "IP addresses stay");
  });

  it("never invents values that are not in the capture", () => {
    const cached = req(50);
    assert.equal(cached.protocol, null);
    assert.equal(cached.status, null);
    assert.equal(cached.connectionId, null);
    assert.equal(cached.timing.wait, null);
  });

  it("keeps every request, with no cap", async () => {
    const path = join(dir, "many.json");
    writeFileSync(path, toNetLogText(buildManyRequestsNetLog(150)));
    const big = await parseNetLog(path);
    assert.equal(big.requests.length, 156);
  });

  it("supports a URL filter", async () => {
    const filtered = await parseNetLog(pageLoadPath, { filter: "cdn\\.example" });
    assert.deepEqual(filtered.requests.map(r => r.id), [20]);
    await assert.rejects(parseNetLog(pageLoadPath, { filter: "nothing-matches" }), /No matching HTTP requests/);
  });
});
