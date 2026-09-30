import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";
import { buildSampleHar } from "../src/demo/sample-har.mjs";
import { buildSampleTrace } from "../src/demo/sample-trace.mjs";
import { buildSamplePath } from "../src/demo/sample-path.mjs";
import { buildSampleLighthouse } from "../src/demo/sample-lighthouse.mjs";
import { gzipSync } from "node:zlib";
import { parseNetLog } from "../src/parsers/netlog-parser.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, "../bin/traceviz.mjs");
const fixtureNetLog = resolve(__dirname, "temp-netlog.json");
const fixtureHar = resolve(__dirname, "fixtures/sample-har.json");
const testOutSample = resolve(__dirname, "temp-sample.html");
const testOutNetLog = resolve(__dirname, "temp-netlog.html");
const testOutHar = resolve(__dirname, "temp-har.html");
const tempHar = resolve(__dirname, "temp-enrich.har");
const tempTrace = resolve(__dirname, "temp-trace.json");
const tempTraceGz = resolve(__dirname, "temp-trace.json.gz");
const testOutEnriched = resolve(__dirname, "temp-enriched.html");
const tempPath = resolve(__dirname, "temp-path.json");
const tempLighthouse = resolve(__dirname, "temp-lighthouse.json");
const tempCpu = resolve(__dirname, "temp-cpu.cpuprofile");

describe("CLI Integration Tests", () => {
  after(() => {
    // Clean up temporary test files
    for (const f of [testOutSample, testOutNetLog, testOutHar, fixtureNetLog, tempHar, testOutEnriched, tempTrace, tempTraceGz, tempPath, tempLighthouse, tempCpu]) {
      if (existsSync(f)) {
        try { unlinkSync(f); } catch {}
      }
    }
  });

  it("should display help with --help", () => {
    const out = execFileSync(process.execPath, [cliPath, "--help"], { encoding: "utf8" });
    assert.ok(out.includes("SocketMap Trace Visualizer"));
    assert.ok(out.includes("USAGE:"));
  });

  it("should display version with --version", () => {
    const out = execFileSync(process.execPath, [cliPath, "--version"], { encoding: "utf8" });
    assert.ok(out.includes("SocketMap v0.16.0"));
  });

  it("should generate sample diagram via --sample -o", () => {
    execFileSync(process.execPath, [cliPath, "--sample", "-o", testOutSample], { encoding: "utf8" });
    assert.ok(existsSync(testOutSample), "Output file must be generated");

    const content = readFileSync(testOutSample, "utf8");
    assert.ok(content.includes("LIVE ARTIFACT"));
    assert.ok(content.includes("GET /dashboard"));
    assert.ok(content.includes("PostgreSQL"));
  });

  it("should generate a report from a NetLog capture", () => {
    writeFileSync(fixtureNetLog, toNetLogText(buildPageLoadNetLog()));
    const out = execFileSync(process.execPath, [cliPath, fixtureNetLog, "-o", testOutNetLog], { encoding: "utf8" });
    assert.ok(existsSync(testOutNetLog));
    assert.ok(out.includes("https://portal.example.com"), "console names the page");

    const content = readFileSync(testOutNetLog, "utf8");
    assert.ok(content.includes("SocketMap Report"));
    assert.ok(content.includes("198.51.100.20"));
  });

  it("adds a HAR to a NetLog report with --har", async () => {
    writeFileSync(fixtureNetLog, toNetLogText(buildPageLoadNetLog()));
    writeFileSync(tempHar, JSON.stringify(buildSampleHar(await parseNetLog(fixtureNetLog))));
    const out = execFileSync(process.execPath, [cliPath, fixtureNetLog, "--har", tempHar, "-o", testOutEnriched], { encoding: "utf8" });
    assert.match(out, /Matched \d+ of \d+ HAR entries/);
    const content = readFileSync(testOutEnriched, "utf8");
    assert.ok(content.includes('id="enrichment"') && content.includes("What the page is made of"));
    assert.ok(content.includes("HAR ENRICHMENT"));
  });

  it("adds a Performance profile with --profile, plain or gzipped", async () => {
    writeFileSync(fixtureNetLog, toNetLogText(buildPageLoadNetLog()));
    const trace = JSON.stringify(buildSampleTrace(await parseNetLog(fixtureNetLog)));
    writeFileSync(tempTrace, trace);
    writeFileSync(tempTraceGz, gzipSync(trace));
    const outputs = [];
    for (const file of [tempTrace, tempTraceGz]) {
      const out = execFileSync(process.execPath, [cliPath, fixtureNetLog, "--profile", file, "-o", testOutEnriched], { encoding: "utf8" });
      assert.match(out, /Placed on the network timeline using \d+ shared requests/);
      const content = readFileSync(testOutEnriched, "utf8");
      assert.ok(content.includes('id="profile"') && content.includes("What the page's code was doing"));
      assert.ok(content.includes("PERFORMANCE PROFILE") && content.includes("Main thread (profile)"));
      outputs.push(content);
    }
    assert.equal(outputs[0], outputs[1], "a gzipped profile gives the same report");
  });

  it("combines a HAR and a profile", async () => {
    writeFileSync(fixtureNetLog, toNetLogText(buildPageLoadNetLog()));
    const model = await parseNetLog(fixtureNetLog);
    writeFileSync(tempHar, JSON.stringify(buildSampleHar(model)));
    writeFileSync(tempTrace, JSON.stringify(buildSampleTrace(model)));
    execFileSync(process.execPath, [cliPath, fixtureNetLog, "--har", tempHar, "--profile", tempTrace, "-o", testOutEnriched], { encoding: "utf8" });
    const content = readFileSync(testOutEnriched, "utf8");
    assert.ok(content.includes('id="enrichment"') && content.includes('id="profile"'));
  });

  it("adds the network path helper's file with --path", async () => {
    writeFileSync(fixtureNetLog, toNetLogText(buildPageLoadNetLog()));
    const model = await parseNetLog(fixtureNetLog);
    writeFileSync(tempPath, JSON.stringify(buildSamplePath(model)));
    const out = execFileSync(process.execPath, [cliPath, fixtureNetLog, "--path", tempPath, "-o", testOutEnriched], { encoding: "utf8" });
    assert.match(out, /\[Path\].*measured with curl/);
    const content = readFileSync(testOutEnriched, "utf8");
    assert.ok(content.includes('id="path"') && content.includes("The path from this computer"));
    assert.ok(!content.includes('id="path-prompt"'), "the how-to card is replaced by the data");
    assert.ok(content.includes("NETWORK PATH"), "the AI summary carries it");
  });

  it("adds a Lighthouse report and a CPU profile with --lighthouse and --cpuprofile", async () => {
    writeFileSync(fixtureNetLog, toNetLogText(buildPageLoadNetLog()));
    const model = await parseNetLog(fixtureNetLog);
    writeFileSync(tempLighthouse, JSON.stringify(buildSampleLighthouse(model)));
    writeFileSync(tempCpu, JSON.stringify({ nodes: [{ id: 1, callFrame: { functionName: "(root)", url: "" }, children: [2] }, { id: 2, callFrame: { functionName: "work", url: "https://portal.example.com/app.js", lineNumber: 9 } }], startTime: 0, endTime: 5000, samples: [2, 2, 2], timeDeltas: [0, 1000, 1000] }));
    const out = execFileSync(process.execPath, [cliPath, fixtureNetLog, "--lighthouse", tempLighthouse, "--cpuprofile", tempCpu, "-o", testOutEnriched], { encoding: "utf8" });
    assert.match(out, /Lighthouse report read/);
    assert.match(out, /CPU profile read/);
    const content = readFileSync(testOutEnriched, "utf8");
    assert.ok(content.includes('id="lighthouse"') && content.includes('id="cpuprofile"'));
    assert.ok(content.includes("LIGHTHOUSE (a separate lab load") && content.includes("CPU PROFILE"));
    assert.ok(content.includes("From Lighthouse (lab)"), "the waterfall's request details carry it");
  });

  it("explains --lighthouse and --cpuprofile problems instead of failing quietly", () => {
    writeFileSync(fixtureNetLog, toNetLogText(buildPageLoadNetLog()));
    assert.throws(() => execFileSync(process.execPath, [cliPath, fixtureNetLog, "--lighthouse", "/no/such.json", "-o", testOutEnriched], { encoding: "utf8", stdio: "pipe" }), /Lighthouse report file not found/);
    writeFileSync(tempLighthouse, '{"hello":1}');
    assert.throws(() => execFileSync(process.execPath, [cliPath, fixtureNetLog, "--lighthouse", tempLighthouse, "-o", testOutEnriched], { encoding: "utf8", stdio: "pipe" }), /does not look like a Lighthouse report/);
    assert.throws(() => execFileSync(process.execPath, [cliPath, fixtureNetLog, "--cpuprofile", tempLighthouse, "-o", testOutEnriched], { encoding: "utf8", stdio: "pipe" }), /does not look like a CPU profile/);
    assert.throws(() => execFileSync(process.execPath, [cliPath, fixtureHar, "--diagram", "--lighthouse", tempLighthouse, "-o", testOutEnriched], { encoding: "utf8", stdio: "pipe" }), /needs a Chromium NetLog/);
  });

  it("shows how to collect the path when no helper file is given", () => {
    writeFileSync(fixtureNetLog, toNetLogText(buildPageLoadNetLog()));
    execFileSync(process.execPath, [cliPath, fixtureNetLog, "-o", testOutEnriched], { encoding: "utf8" });
    const content = readFileSync(testOutEnriched, "utf8");
    assert.ok(content.includes('id="path-prompt"') && content.includes("./socketmap-path.sh portal.example.com") && content.includes("socketmap-path.ps1"));
  });

  it("explains --path problems instead of failing quietly", () => {
    writeFileSync(fixtureNetLog, toNetLogText(buildPageLoadNetLog()));
    assert.throws(() => execFileSync(process.execPath, [cliPath, fixtureNetLog, "--path", "/no/such/path.json", "-o", testOutEnriched], { encoding: "utf8", stdio: "pipe" }), /Network path file not found/);
    writeFileSync(tempPath, '{"hello":1}');
    assert.throws(() => execFileSync(process.execPath, [cliPath, fixtureNetLog, "--path", tempPath, "-o", testOutEnriched], { encoding: "utf8", stdio: "pipe" }), /does not look like the output of the SocketMap network path helper/);
    assert.throws(() => execFileSync(process.execPath, [cliPath, fixtureHar, "--diagram", "--path", tempPath, "-o", testOutEnriched], { encoding: "utf8", stdio: "pipe" }), /needs a Chromium NetLog/);
    assert.throws(() => execFileSync(process.execPath, [cliPath, fixtureHar, "--path", tempPath, "-o", testOutEnriched], { encoding: "utf8", stdio: "pipe" }), /does not look like the output of the SocketMap network path helper/, "a HAR now accepts the file, and still checks it");
  });

  it("explains --profile problems instead of failing quietly", () => {
    writeFileSync(fixtureNetLog, toNetLogText(buildPageLoadNetLog()));
    assert.throws(() => execFileSync(process.execPath, [cliPath, fixtureNetLog, "--profile", "/no/such/trace.json", "-o", testOutEnriched], { encoding: "utf8", stdio: "pipe" }), /Profile file not found/);
    writeFileSync(tempTrace, '{"events":[]}');
    assert.throws(() => execFileSync(process.execPath, [cliPath, fixtureNetLog, "--profile", tempTrace, "-o", testOutEnriched], { encoding: "utf8", stdio: "pipe" }), /does not look like a DevTools Performance profile/);
    assert.throws(() => execFileSync(process.execPath, [cliPath, fixtureHar, "--diagram", "--profile", tempTrace, "-o", testOutEnriched], { encoding: "utf8", stdio: "pipe" }), /needs a Chromium NetLog/);
  });

  it("explains --har problems instead of failing quietly", () => {
    writeFileSync(fixtureNetLog, toNetLogText(buildPageLoadNetLog()));
    assert.throws(() => execFileSync(process.execPath, [cliPath, fixtureNetLog, "--har", "/no/such/file.har", "-o", testOutEnriched], { encoding: "utf8", stdio: "pipe" }), /HAR file not found/);
    writeFileSync(tempHar, '{"events":[]}');
    assert.throws(() => execFileSync(process.execPath, [cliPath, fixtureNetLog, "--har", tempHar, "-o", testOutEnriched], { encoding: "utf8", stdio: "pipe" }), /does not look like a HAR/);
    assert.throws(() => execFileSync(process.execPath, [cliPath, fixtureHar, "--har", tempHar, "-o", testOutEnriched], { encoding: "utf8", stdio: "pipe" }), /already a HAR/);
  });

  it("should report on a chosen page with --page", () => {
    writeFileSync(fixtureNetLog, toNetLogText(buildPageLoadNetLog()));
    const out = execFileSync(process.execPath, [cliPath, fixtureNetLog, "-o", testOutNetLog, "--page", "chrome-extension://abcdefghijklmnop"], { encoding: "utf8" });
    assert.ok(out.includes("chrome-extension://abcdefghijklmnop"));
  });

  it("opens a HAR on its own in the full report, with unrecorded things marked as such", () => {
    const out = execFileSync(process.execPath, [cliPath, fixtureHar, "-o", testOutHar], { encoding: "utf8" });
    assert.match(out, /Detected a HAR/);
    const content = readFileSync(testOutHar, "utf8");
    assert.ok(!content.includes("HAR Network Trace"), "not the older diagram");
    assert.ok(content.includes('id="view-waterfall"') && content.includes("api.socketmap.io"));
    assert.ok(content.includes("built from a HAR"), "the report says where it came from");
  });

  it("should generate diagram from HAR fixture with --diagram", () => {
    execFileSync(process.execPath, [cliPath, fixtureHar, "--diagram", "-o", testOutHar], { encoding: "utf8" });
    assert.ok(existsSync(testOutHar));

    const content = readFileSync(testOutHar, "utf8");
    assert.ok(content.includes("HAR Network Trace"));
    assert.ok(content.includes("api.socketmap.io"));
  });
});
