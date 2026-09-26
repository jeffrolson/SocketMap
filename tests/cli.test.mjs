import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPageLoadNetLog, toNetLogText } from "./fixtures/netlog-builder.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, "../bin/traceviz.mjs");
const fixtureNetLog = resolve(__dirname, "temp-netlog.json");
const fixtureHar = resolve(__dirname, "fixtures/sample-har.json");
const testOutSample = resolve(__dirname, "temp-sample.html");
const testOutNetLog = resolve(__dirname, "temp-netlog.html");
const testOutHar = resolve(__dirname, "temp-har.html");

describe("CLI Integration Tests", () => {
  after(() => {
    // Clean up temporary test files
    for (const f of [testOutSample, testOutNetLog, testOutHar, fixtureNetLog]) {
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
    assert.ok(out.includes("SocketMap v0.3.0"));
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

  it("should report on a chosen page with --page", () => {
    writeFileSync(fixtureNetLog, toNetLogText(buildPageLoadNetLog()));
    const out = execFileSync(process.execPath, [cliPath, fixtureNetLog, "-o", testOutNetLog, "--page", "chrome-extension://abcdefghijklmnop"], { encoding: "utf8" });
    assert.ok(out.includes("chrome-extension://abcdefghijklmnop"));
  });

  it("should generate diagram from HAR fixture", () => {
    execFileSync(process.execPath, [cliPath, fixtureHar, "-o", testOutHar], { encoding: "utf8" });
    assert.ok(existsSync(testOutHar));

    const content = readFileSync(testOutHar, "utf8");
    assert.ok(content.includes("HAR Network Trace"));
    assert.ok(content.includes("api.socketmap.io"));
  });
});
