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
import { existsSync, readFileSync, writeFileSync, mkdtempSync, chmodSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  it("removes credentials from Windows-style bare proxy addresses too (found on a real Windows runner)", () => {
    const { data } = read({ ...sample, proxy: { ...sample.proxy, http: "user:secret@proxy.example.com:3128", https: "http=user:hunter2@proxy.example.com:3128;https=proxy.example.com:3128", autoConfigUrl: null } });
    const text = JSON.stringify(data.proxy);
    assert.ok(!text.includes("secret") && !text.includes("hunter2") && !text.includes("user:"), text);
    assert.ok(data.proxy.http.includes("proxy.example.com:3128") && data.proxy.https.includes("https=proxy.example.com:3128"));
  });
  it("says nothing it was not told", () => {
    const { data } = read({ kind: "socketmap-path", version: 1 });
    assert.equal(data.link.type, null);
    assert.deepEqual(data.hosts, []);
    assert.equal(data.publicIp, null);
    assert.equal(data.collectedAt, null);
  });
  it("keeps bounded per-hop response and timing summaries without turning silence into loss", () => {
    const { data } = read({ ...sample, routeCapabilities: { tcp: { available: false, reason: "Native tracer only uses ICMP." } }, routes: [{ host: "edge.example.com", method: "tcp", attempts: 3, hops: [
      { n: 1, ip: "192.0.2.1", responses: 2, noResponses: 1, minMs: 4, medianMs: 6, maxMs: 12 },
      { n: 2, ip: null, responses: 0, noResponses: 3, minMs: 0, medianMs: 0, maxMs: 999999 }
    ] }] });
    const route = data.routes[0];
    assert.equal(route.method, "tcp");
    assert.equal(route.attempts, 3);
    assert.deepEqual(route.hops[0], { n: 1, ip: "192.0.2.1", rttMs: 6, minMs: 4, medianMs: 6, maxMs: 12, minUpperBound: null, medianUpperBound: null, maxUpperBound: null, responses: 2, noResponses: 1 });
    assert.equal(route.hops[1].maxMs, null, "an out-of-range route timing is not kept");
    assert.equal(data.routeCapabilities.tcp.available, false);
  });
  it("rejects impossible reply counts and contradictory route timing summaries", () => {
    const route = read({ ...sample, routes: [{ host: "edge.example.com", method: "tcp", attempts: 3, hops: [{ n: 1, responses: 4, noResponses: 0, minMs: 9, medianMs: 5, maxMs: 10 }] }] }).data.routes[0];
    assert.equal(route.hops[0].responses, null);
    assert.equal(route.hops[0].noResponses, null);
    assert.equal(route.hops[0].minMs, null);
    assert.equal(route.hops[0].medianMs, null);
    assert.equal(route.hops[0].maxMs, null);
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
    assert.ok(attached.findings.find(f => f.id === "proxy-configured").detail.includes("Whether curl used a proxy was not recorded"));
  });
  it("uses reply rates as observations and never calls a silent route hop packet loss", () => {
    const quiet = read({ ...sample, routes: [{ host: "quiet.example.com", method: "tcp", attempts: 3, hops: Array.from({ length: 6 }, (_, i) => ({ n: i + 1, ip: null, responses: 0, noResponses: 3 })) }] }).data;
    const finding = joinPath(sampleModel(), quiet).findings.find(f => f.id === "route-silent");
    assert.match(finding.detail, /does not establish packet loss/);
    assert.doesNotMatch(finding.detail, /is packet loss/i);
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
  it("reports proxy environment context without claiming it proves the route curl used", () => {
    const via = joinPath(model, read({ ...sample, probeUsesProxy: true }).data);
    assert.ok(via.findings.find(f => f.id === "proxy-configured").detail.includes("Proxy environment variables were present"));
    assert.ok(renderPathPanel(via).includes("with proxy environment variables present"));
    const direct = joinPath(model, read({ ...sample, probeUsesProxy: false }).data);
    assert.ok(direct.findings.find(f => f.id === "proxy-configured").detail.includes("No proxy environment variables were recorded"));
    assert.ok(renderPathPanel(direct).includes("with no proxy environment variables recorded"));
  });
  it("does not claim curl bypassed a proxy when proxy use was not recorded", () => {
    const unknown = joinPath(model, read({ ...sample, probeUsesProxy: null }).data);
    assert.match(unknown.findings.find(f => f.id === "proxy-configured").detail, /not recorded/);
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
    assert.ok(html.includes("TCP probes") && html.includes("min 3 ms") && html.includes("no reply"));
  });
  it("explains when TCP route tracing is unavailable instead of labeling ICMP as TCP", () => {
    const noTcp = attachPath(sampleModel(), read({ ...sample, routeCapabilities: { tcp: { available: false, reason: "Native tracer uses ICMP only." } } }).data);
    const rendered = renderPathPanel(noTcp);
    assert.match(rendered, /TCP route probes were not available/);
    assert.match(rendered, /Native tracer uses ICMP only/);
  });
  it("shows a failed route command as incomplete evidence", () => {
    const incomplete = attachPath(sampleModel(), read({ ...sample, routes: [{ host: "edge.example.com", method: "tcp", attempts: 3, error: "traceroute did not complete for this host", hops: [] }] }).data);
    assert.match(renderPathPanel(incomplete), /Route command did not complete/);
  });
  it("shows Windows less-than timing as an upper bound", () => {
    const bounded = attachPath(sampleModel(), read({ ...sample, routes: [{ host: "edge.example.com", method: "icmp", attempts: 3, hops: [{ n: 1, ip: "192.0.2.1", responses: 3, noResponses: 0, minMs: 1, medianMs: 1, maxMs: 1, minUpperBound: true, medianUpperBound: true, maxUpperBound: true }] }] }).data);
    assert.match(renderPathPanel(bounded), /min &lt;1 ms/);
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
  it("mask bare user:pass@ proxy credentials and report a failed curl as an error with no timings", () => {
    for (const [name, script] of [["sh", HELPER_SH], ["ps1", HELPER_PS1]]) {
      assert.ok(/\[\^\/@ ?\\?s? ?:;=\]|\[\^\/@\\s:;=\]/.test(script), `${name}: strips a bare user:pass@`);
      assert.ok(script.includes("probeUsesProxy"), `${name}: says whether curl had a proxy`);
    }
    assert.ok(HELPER_SH.includes("rc=$?") && HELPER_SH.includes("curl exit code"), "sh checks curl's exit status");
    assert.ok(HELPER_PS1.includes("$LASTEXITCODE") && HELPER_PS1.includes("Parse-TracertHop") && HELPER_PS1.includes("SelfTestTracert"));
    assert.ok(HELPER_SH.includes("--route-probes") && HELPER_SH.includes('"destinationPort":%s') && HELPER_SH.includes("TCP_ROUTE"));
    assert.ok(HELPER_PS1.includes("attempts = 3") && HELPER_PS1.includes("routeCapabilities") && HELPER_PS1.includes("Native Windows tracert uses ICMP"));
  });
  it("only read settings and make the requests they say they make", () => {
    for (const [name, script] of [["sh", HELPER_SH], ["ps1", HELPER_PS1]]) {
      const urls = [...script.matchAll(/https?:\/\/[^\s"'`)]+/g)].map(m => m[0]).filter(u => !/example\.com|\$\{?h|\$h/.test(u));
      assert.ok(urls.every(u => /api\.ipify\.org/.test(u) || /^https?:\/\/(www\.)?(socketmap|github)/.test(u)), `${name}: ${urls.join(" ")}`);
      assert.ok(!/\b(rm -rf|Set-ItemProperty|Remove-Item|netsh\s+(?!wlan show|winhttp show)|networksetup -set|scutil --set|sudo)\b/.test(script), `${name} changes nothing`);
    }
  });
  it("shell: parses bounded repeated TCP route probes from a synthetic traceroute", () => {
    const dir = mkdtempSync(join(tmpdir(), "socketmap-path-test-"));
    const traceroute = join(dir, "traceroute");
    const uname = join(dir, "uname");
    const out = join(dir, "path.json");
    writeFileSync(traceroute, `#!/bin/bash
if [ "$1" = "--help" ]; then echo 'usage: traceroute -T, --tcp'; exit 0; fi
case " $* " in *" -T -p 443 -q 3 "*) ;; *) exit 42 ;; esac
printf '%s\\n' ' 1  192.0.2.1  2.0 ms  4.0 ms  6.0 ms' ' 2  * * *' ' 3  198.51.100.9  10.0 ms  *  14.0 ms'
`);
    chmodSync(traceroute, 0o755);
    writeFileSync(uname, "#!/bin/bash\necho Linux\n");
    chmodSync(uname, 0o755);
    try {
      const proxy = "http://user:pass@proxy.example.test:8080?ACCESS_TOKEN=PAC_CANARY&to%6Ben=CANARY2&safe=visible#access_token=CANARY3;api_key=CANARY4";
      execFileSync("bash", ["tools/socketmap-path.sh", "--no-public-ip", "--no-probe", "--out", out, "edge.example.com"], { cwd: process.cwd(), env: { ...process.env, HTTPS_PROXY: proxy, https_proxy: proxy, PATH: `${dir}:${process.env.PATH}` }, stdio: "pipe" });
      const raw = readFileSync(out, "utf8");
      assert.doesNotMatch(raw, /user:pass|PAC_CANARY|CANARY2|CANARY3|CANARY4/);
      assert.ok(raw.includes("safe=visible"), "safe query values remain in the helper file");
      const route = JSON.parse(raw).routes[0];
      assert.equal(route.method, "tcp");
      assert.equal(route.destinationPort, 443);
      assert.equal(route.attempts, 3);
      assert.equal(route.error, null);
      assert.deepEqual(route.hops.map(h => [h.responses, h.noResponses, h.minMs, h.medianMs, h.maxMs]), [[3, 0, 2, 4, 6], [0, 3, null, null, null], [2, 1, 10, 12, 14]]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("PowerShell helper parsing without machine or network access", () => {
  const runtime = process.env.SOCKETMAP_POWERSHELL || (process.platform === "win32" ? "powershell.exe" : null);
  it("preserves route reply counts, median, and less-than bounds", { skip: !runtime }, () => {
    const command = "& ./tools/socketmap-path.ps1 -SelfTestTracert @('  1    <1 ms    <1 ms    <1 ms  192.0.2.1', '  2     *        *        *     Request timed out.', '  3    45 ms     *       47 ms  203.0.113.7')";
    const output = execFileSync(runtime, ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8" });
    const hops = JSON.parse(output.replace(/^\uFEFF/, ""));
    assert.deepEqual(hops.map(h => [h.responses, h.noResponses, h.medianMs]), [[3, 0, 1], [0, 3, null], [2, 1, 46]]);
    assert.equal(hops[0].medianUpperBound, true);
    assert.equal(hops[0].maxUpperBound, true);
    assert.equal(hops[2].medianUpperBound, false);
  });
  it("redacts encoded secret names and fragment credentials before writing", { skip: !runtime }, () => {
    const value = "http://person:CANARY@proxy.example.com/pac?ACCESS_TOKEN=CANARY&to%6Ben=CANARY&apiKey=CANARY&csrf=CANARY&safe=visible#access_token=CANARY;code=CANARY";
    const output = execFileSync(runtime, ["-NoProfile", "-NonInteractive", "-File", "tools/socketmap-path.ps1", "-SelfTestRedaction", value], { encoding: "utf8" }).trim();
    assert.ok(!output.includes("CANARY") && !output.includes("person:"), "credentials must not leave the helper");
    assert.ok(output.includes("proxy.example.com/pac?") && output.includes("safe=visible"));
    assert.equal((output.match(/\[REDACTED\]/g) || []).length, 6);
  });
});

// Real helper output from disposable CI runners (gitignored). The Windows file was written by the first version of the
// script, which left a proxy credential in place; the reader must still mask it.
describe("real helper output from CI runners (only when recorded locally)", () => {
  const load = (file) => JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  it("Windows: reads the registry proxy, PAC, bypass list and auto-detect flag, and masks the credential", { skip: !existsSync("captures/real-path-windows.json") }, () => {
    const raw = load("captures/real-path-windows.json");
    assert.ok(JSON.stringify(raw.proxy).includes("secret"), "the recorded file did contain the credential");
    const { recognized, data } = read(raw);
    assert.equal(recognized, true);
    assert.equal(data.platform, "windows");
    assert.equal(data.proxy.autoDetect, true);
    assert.equal(data.proxy.autoConfigEnabled, true);
    assert.match(data.proxy.autoConfigUrl, /wpad\.corp\.example\.com\/proxy\.pac/);
    assert.ok(data.proxy.bypass.includes("<local>"));
    assert.ok(!JSON.stringify(data).includes("secret"), "no credential survives the reader");
    assert.ok(data.hosts[0].connectMs > 0 && data.hosts[0].status === 200);
  });
  it("Linux: reads the environment proxy without its password, and the failed probes as errors", { skip: !existsSync("captures/real-path-linux.json") }, () => {
    const { data } = read(load("captures/real-path-linux.json"));
    assert.ok(!JSON.stringify(data).includes("secret"));
    assert.equal(data.link.type, "ethernet");
    assert.ok(data.hosts.every(h => h.error));
  });
});
