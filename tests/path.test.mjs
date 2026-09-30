import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readPathFile, joinPath, attachPath, pathEvidenceText, hostsToMeasure, isPrivateAddress, wifiQuality } from "../src/path.mjs";
import { renderPathPanel, renderPathPrompt } from "../src/renderer/path.mjs";
import { buildSamplePath } from "../src/demo/sample-path.mjs";
import { buildCoverage } from "../src/coverage.mjs";
import { analyzeCapture, buildAiSummary } from "../src/analysis.mjs";
import { createCaptureReader, looksLikePath } from "../src/viewer/viewer-core.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";
import { HELPER_SH, HELPER_PS1 } from "../src/renderer/helper-scripts.generated.mjs";

function sampleModel() {
  const reader = createCaptureReader();
  reader.write(toNetLogText(buildPageLoadNetLog()));
  return reader.finish();
}
const model = sampleModel();
const sample = buildSamplePath(model);
const read = (obj) => readPathFile(obj);

describe("network path file reader", () => {
  it("recognizes only the helper's own file", () => {
    assert.equal(read(sample).recognized, true);
    for (const other of [null, [], "text", { kind: "other" }, { hello: 1 }, { log: { entries: [] } }]) assert.equal(read(other).recognized, false);
    assert.equal(looksLikePath(JSON.stringify(sample).slice(0, 4096)), true);
    assert.equal(looksLikePath('{ "kind": "socketmap-path" }'), true, "PowerShell writes a space after the colon");
    assert.equal(looksLikePath('{"log":{"entries":[]}}'), false);
  });
  it("keeps only known fields, bounded, and drops what does not validate", () => {
    const hostile = { ...sample, secret: "x", link: { ...sample.link, ipv4: "not an ip", extra: 1 }, hosts: [{ host: "a b; rm -rf /", dnsMs: 5 }, { host: "ok.example.com", dnsMs: -3, connectMs: "12", tlsMs: 700000, firstByteMs: 9, error: "e".repeat(999) }], dns: { servers: Array.from({ length: 30 }, (_, i) => `198.51.100.${i}`).concat(["evil"]) } };
    const { data } = read(hostile);
    assert.equal(data.secret, undefined);
    assert.equal(data.link.ipv4, null);
    assert.deepEqual(data.hosts.map(h => h.host), ["ok.example.com"]);
    assert.equal(data.hosts[0].dnsMs, null);
    assert.equal(data.hosts[0].connectMs, null, "a string is not a number");
    assert.equal(data.hosts[0].tlsMs, null, "an absurd time is not kept");
    assert.ok(data.hosts[0].error.length <= 160);
    assert.equal(data.dns.servers.length, 8);
    assert.ok(data.dns.servers.every(s => /^198\.51\.100\./.test(s)));
  });
  it("removes credentials from proxy and PAC addresses", () => {
    const { data } = read({ ...sample, proxy: { ...sample.proxy, http: "http://user:hunter2@proxy.example.com:8080", autoConfigUrl: "http://wpad.example.com/p.pac?token=abc12345" } });
    assert.ok(!JSON.stringify(data.proxy).includes("hunter2") && !JSON.stringify(data.proxy).includes("abc12345"));
    assert.ok(data.proxy.http.includes("proxy.example.com"));
  });
  it("says nothing it was not told", () => {
    const { data } = read({ kind: "socketmap-path", version: 1 });
    assert.equal(data.link.type, null);
    assert.deepEqual(data.hosts, []);
    assert.equal(data.publicIp, null);
    assert.equal(data.collectedAt, null);
  });
});

describe("joining the helper's file to a capture", () => {
  const attached = attachPath(sampleModel(), read(sample).data);
  it("measures how far apart the snapshot and the capture are", () => {
    assert.equal(attached.source.gapMinutes, 4);
    assert.equal(joinPath(model, { ...read(sample).data, collectedAt: null }).source.gapMinutes, null);
  });
  it("puts the browser's numbers next to curl's for hosts the browser used", () => {
    assert.ok(attached.compare.length >= 1);
    const item = attached.compare[0];
    assert.equal(item.curl.host, item.host);
    assert.equal(typeof item.browser.requests, "number", "the sample's hosts were used by the browser");
    assert.ok(item.browser.requests >= 1);
    const stranger = joinPath(model, read({ ...sample, hosts: [{ host: "never-used.example.net", dnsMs: 5, connectMs: 5, tlsMs: 5, firstByteMs: 5 }] }).data);
    assert.equal(stranger.compare[0].browser, null, "no invented browser numbers");
  });
  it("reports observations with their limits, not conclusions", () => {
    const ids = attached.findings.map(f => f.id);
    assert.ok(ids.includes("wifi-fair"), "a -72 dBm signal is fair");
    assert.ok(ids.includes("proxy-configured"));
    assert.ok(ids.includes("dns-public"), "documentation addresses are not private space");
    assert.ok(ids.includes("route-jump"), "delay jumps from 14 ms to 96 ms at hop 5");
    assert.ok(attached.findings.find(f => f.id === "route-jump").detail.includes("not a measurement of loss"));
    assert.ok(attached.findings.find(f => f.id === "proxy-configured").detail.includes("curl, which does not use these system settings"));
  });
  it("flags a browser that was much slower than curl on the same computer, without claiming why", () => {
    const m = sampleModel();
    const host = m.requests.find(r => !r.isBackground).host;
    for (const r of m.requests.filter(r => r.host === host)) r.timing = { ...r.timing, dns: 480 };
    const path = joinPath(m, read({ ...sample, hosts: [{ host, dnsMs: 20, connectMs: 10, tlsMs: 10, firstByteMs: 10 }] }).data);
    const f = path.findings.find(x => x.id === "dns-browser-slower");
    assert.ok(f && /not proof of the cause/.test(f.detail));
    const fine = joinPath(sampleModel(), read({ ...sample, hosts: [{ host, dnsMs: 20, connectMs: 10, tlsMs: 10, firstByteMs: 10 }] }).data);
    assert.ok(!fine.findings.some(x => x.id === "dns-browser-slower"));
  });
  it("classifies addresses and signal strength", () => {
    for (const [address, expected] of [["10.1.2.3", true], ["172.20.0.1", true], ["192.168.1.1", true], ["100.64.0.1", true], ["8.8.8.8", false], ["fd00::1", true], ["2001:4860:4860::8888", false]]) assert.equal(isPrivateAddress(address), expected, address);
    assert.deepEqual([-50, -67, -70, -75, -80, null].map(wifiQuality), ["good", "good", "fair", "fair", "weak", null]);
  });
  it("adds a labeled section to the AI summary and lifts Coverage rows from never", () => {
    const text = pathEvidenceText(attached);
    assert.match(text, /NETWORK PATH/);
    assert.match(text, /a snapshot of this computer, not of the capture/);
    const withPath = sampleModel(); attachPath(withPath, read(sample).data);
    const summary = buildAiSummary(withPath, analyzeCapture(withPath, {}));
    assert.ok(summary.includes("NETWORK PATH"));
    const status = (m, id) => buildCoverage(m).stages.flatMap(s => s.items).find(i => i.id === id).status;
    for (const id of ["hops", "local-link", "outside-timing"]) {
      assert.equal(status(sampleModel(), id), "never", `${id} without the helper`);
      assert.equal(status(withPath, id), "partial", `${id} with the helper`);
    }
  });
  it("picks the slowest real hostnames to measure", () => {
    const list = hostsToMeasure({ hosts: [{ host: "a.example.com", totalMs: 10 }, { host: "203.0.113.5", totalMs: 999 }, { host: "printer.local", totalMs: 500 }, { host: "b.example.com", totalMs: 90 }] });
    assert.deepEqual(list, ["b.example.com", "a.example.com"]);
  });
});

describe("network path views", () => {
  const attached = attachPath(sampleModel(), read(sample).data);
  const html = renderPathPanel(attached);
  it("shows the link, DNS, proxy and address, then the comparison and routes, and how old the snapshot is", () => {
    for (const expected of ["This computer's link", "DNS servers", "Proxy settings", "Public address", "The browser's timings next to curl's", "Route from this computer", "4 minutes after the capture started"]) assert.ok(html.includes(expected), expected);
    assert.ok(html.includes("-72") && html.includes("198.51.100.53"));
  });
  it("escapes what it shows", () => {
    const evil = read({ ...sample, link: { ...sample.link, wifi: { ...sample.link.wifi, ssid: "<img src=x onerror=alert(1)>" } } }).data;
    assert.ok(!renderPathPanel(attachPath(sampleModel(), evil)).includes("<img src=x"));
  });
  it("offers the commands and both scripts as offline downloads when no file is loaded", () => {
    const card = renderPathPrompt(["a.example.com", "b.example.com"]);
    assert.ok(card.includes("./socketmap-path.sh a.example.com b.example.com") && card.includes(".\\socketmap-path.ps1 a.example.com b.example.com"));
    assert.ok(card.includes('data-copy="./socketmap-path.sh a.example.com b.example.com"'));
    assert.ok(card.includes('download="socketmap-path.sh"') && card.includes('download="socketmap-path.ps1"'));
    assert.ok(!/(src|href)="https?:/.test(card), "no remote loads");
  });
});

describe("the helper scripts", () => {
  it("are the ones embedded in the report", () => {
    assert.ok(HELPER_SH.startsWith("#!/bin/bash") && HELPER_SH.includes("socketmap-path"));
    assert.ok(HELPER_PS1.includes("socketmap-path") && HELPER_PS1.includes("ConvertTo-Json"));
  });
  it("only read settings and make the requests they say they make", () => {
    for (const [name, script] of [["sh", HELPER_SH], ["ps1", HELPER_PS1]]) {
      const urls = [...script.matchAll(/https?:\/\/[^\s"'`)]+/g)].map(m => m[0]).filter(u => !/example\.com|\$\{?h|\$h/.test(u));
      assert.ok(urls.every(u => /api\.ipify\.org/.test(u) || /^https?:\/\/(www\.)?(socketmap|github)/.test(u)), `${name}: ${urls.join(" ")}`);
      assert.ok(!/\b(rm -rf|Set-ItemProperty|Remove-Item|netsh\s+(?!wlan show|winhttp show)|networksetup -set|scutil --set|sudo)\b/.test(script), `${name} changes nothing`);
    }
  });
});
