import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseNetLog, streamNetLogEvents } from "../src/parsers/netlog-parser.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, "fixtures/sample-netlog.json");

describe("NetLog Parser", () => {
  it("should stream events and extract constants", async () => {
    let eventCount = 0;
    const constants = await streamNetLogEvents(fixturePath, (event) => {
      eventCount++;
      assert.ok(event.source);
      assert.ok(event.type);
    });

    assert.ok(constants, "Constants should be extracted");
    assert.equal(eventCount, 9, "Should parse all 9 events from stream");
    assert.equal(constants.logEventTypes.HOST_RESOLVER_IMPL_JOB, 1);
  });

  it("should correlate DNS, TLS, and HTTP transaction", async () => {
    const ir = await parseNetLog(fixturePath);

    assert.ok(ir.title.includes("POST https://api.socketmap.dev/v1/telemetry"));
    assert.equal(ir.participants.length, 4);

    // Verify participants
    const client = ir.participants.find(p => p.id === "client");
    const dns = ir.participants.find(p => p.id === "dns");
    const edge = ir.participants.find(p => p.id === "edge");
    const origin = ir.participants.find(p => p.id === "origin");

    assert.ok(client);
    assert.ok(dns);
    assert.ok(edge);
    assert.ok(origin);

    // Verify correlated messages
    assert.ok(ir.messages.length >= 4);

    const dnsQuery = ir.messages.find(m => m.from === "client" && m.to === "dns");
    assert.ok(dnsQuery);
    assert.equal(dnsQuery.latencyMs, 22);

    const tlsHandshake = ir.messages.find(m => m.from === "client" && m.to === "edge" && m.label.includes("Handshake"));
    assert.ok(tlsHandshake);
    assert.equal(tlsHandshake.latencyMs, 30);

    const httpReq = ir.messages.find(m => m.method === "POST");
    assert.ok(httpReq);
    assert.ok(httpReq.label.includes("POST /v1/telemetry"));
  });

  it("should redact sensitive credentials", async () => {
    const ir = await parseNetLog(fixturePath);
    const serialized = JSON.stringify(ir);

    assert.ok(!serialized.includes("super-secret-jwt-token-12345"), "JWT token must be redacted");
    assert.ok(!serialized.includes("top-secret-cookie"), "Cookie session must be redacted");
    assert.ok(!serialized.includes("user_pref=confidential"), "Set-Cookie must be redacted");
    assert.ok(serialized.includes("[REDACTED]"), "Should have [REDACTED] markers");
  });

  it("should support regex filtering on URLs", async () => {
    const ir = await parseNetLog(fixturePath, { filter: "telemetry" });
    assert.ok(ir.messages.length > 0);

    await assert.rejects(
      async () => {
        await parseNetLog(fixturePath, { filter: "non_existent_path" });
      },
      /No matching HTTP requests found/
    );
  });
});
