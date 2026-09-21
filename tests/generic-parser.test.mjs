import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseGenericTrace, parseHar, isHarTrace } from "../src/parsers/generic-parser.mjs";
import { normalizeTrace, getRoleColor, formatDuration, formatBytes } from "../src/normalizer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const harFixturePath = resolve(__dirname, "fixtures/sample-har.json");
const traceFixturePath = resolve(__dirname, "fixtures/sample-trace.json");

describe("Generic & HAR Parser", () => {
  it("should parse HAR traces with timing metrics and redact credentials", () => {
    const ir = parseGenericTrace(harFixturePath);

    assert.ok(ir.title.includes("HAR Network Trace: GET api.socketmap.io"));
    assert.equal(ir.participants.length, 4);

    const serialized = JSON.stringify(ir);
    assert.ok(!serialized.includes("secret_api_key_xyz"), "HAR Authorization should be redacted");
    assert.ok(!serialized.includes("sid=secret123"), "HAR Set-Cookie should be redacted");

    const reqMsg = ir.messages.find(m => m.method === "GET");
    assert.ok(reqMsg);
    assert.equal(reqMsg.bytes, 180);
  });

  it("should parse native JSON traces directly", () => {
    const ir = parseGenericTrace(traceFixturePath);

    assert.equal(ir.title, "Custom Service Mesh Execution");
    assert.equal(ir.participants.length, 3);
    assert.equal(ir.messages.length, 5);

    const selfLoop = ir.messages.find(m => m.isLoop);
    assert.ok(selfLoop, "Should identify self loop");
    assert.equal(selfLoop.from, "service");
    assert.equal(selfLoop.to, "service");
  });

  it("should normalize empty or minimal traces gracefully", () => {
    const minimal = {
      messages: [
        { from: "alpha", to: "beta", label: "Ping" }
      ]
    };
    const ir = normalizeTrace(minimal);

    assert.equal(ir.participants.length, 2);
    assert.equal(ir.participants[0].id, "alpha");
    assert.equal(ir.participants[1].id, "beta");
    assert.equal(ir.messages[0].label, "Ping");
  });

  it("should correctly format helper utilities", () => {
    assert.equal(formatDuration(0.5), "<1ms");
    assert.equal(formatDuration(42), "42ms");
    assert.equal(formatDuration(1500), "1.50s");

    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(2048), "2.0 KB");
    assert.equal(formatBytes(1048576 * 2.5), "2.50 MB");

    assert.equal(getRoleColor("client"), "#06b6d4");
    assert.equal(getRoleColor("auth"), "#f43f5e");
  });
});
