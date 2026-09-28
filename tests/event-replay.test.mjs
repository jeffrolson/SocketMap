import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createEvidenceSanitizer } from "../src/redact.mjs";
import { createEventQuery, eventReplayMarkup, eventReplayScript } from "../src/viewer/event-replay.mjs";

const constants = {
  logEventTypes: { SOCKET_ALIVE: 1, TCP_CONNECT: 2 },
  logSourceType: { SOCKET: 5 },
  logEventPhase: { PHASE_NONE: 0, PHASE_BEGIN: 1, PHASE_END: 2 },
  netError: { ERR_NAME_NOT_RESOLVED: -105 },
  quicErrorCode: { QUIC_HANDSHAKE_FAILED: 7 },
  quicRstStreamError: { QUIC_STREAM_CANCELLED: 8 },
  loadFlag: { LOAD_BYPASS_CACHE: 1, LOAD_DO_NOT_SAVE_COOKIES: 2 },
  loadState: { LOAD_STATE_WAITING_FOR_RESPONSE: 4 },
  certStatusFlag: { CERT_STATUS_COMMON_NAME_INVALID: 1, CERT_STATUS_DATE_INVALID: 2 },
  certVerifierFlags: { CERT_VERIFIER_FLAG_DISABLE_NETWORK_FETCHES: 4 },
  certVerifyFlags: { CERT_VERIFY_REV_CHECKING_ENABLED: 8 },
  certPathBuilderDigestPolicy: { DIGEST_POLICY_WEAK_ALLOW: 2 }
};

const events = [
  { time: "100", source: { id: 7, type: 5 }, type: 1, phase: 1, params: { authorization: "Bearer secret", source_dependency: { id: 9, type: 5 } } },
  { time: "145", source: { id: 7, type: 5 }, type: 1, phase: 2, params: { net_error: -102, body: "private body" } },
  { time: "160", source: { id: 8, type: 5 }, type: 2, phase: 0, params: { url: "https://example.test/?token=secret" } }
];

function query(options = {}) {
  const value = createEventQuery({ sanitizeFn: createEvidenceSanitizer(), ...options });
  value.setConstants(constants);
  events.forEach(event => value.addEvent(event));
  return value.finish();
}

describe("event replay", () => {
  it("counts every match while retaining only the requested page", () => {
    const result = query({ source: "7", limit: 1, offset: 1 });
    assert.equal(result.total, 2);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].eventType, "SOCKET_ALIVE");
    assert.equal(result.rows[0].phase, "PHASE_END");
    assert.equal(result.rows[0].durationMs, 45);
  });

  it("filters decoded types and errors without exposing credentials or bodies", () => {
    const result = query({ type: "socket", errorsOnly: true });
    assert.equal(result.total, 1);
    assert.equal(result.rows[0].sourceId, "7");
    const replay = query({ source: "7" });
    assert.equal(replay.rows[0].dependency, "9");
    assert.ok(JSON.stringify(replay).includes("[REDACTED]"));
    assert.ok(!JSON.stringify(replay).includes("Bearer secret"));
    assert.ok(!JSON.stringify(replay).includes("private body"));
  });

  it("uses only recorded, ordered begin/end times and supports multiple source IDs", () => {
    const value = createEventQuery({ sanitizeFn: createEvidenceSanitizer(), source: "7, 8" });
    value.setConstants(constants);
    value.addEvent({ time: null, source: { id: 7, type: 5 }, type: 1, phase: 1 });
    value.addEvent({ time: "20", source: { id: 7, type: 5 }, type: 1, phase: 1 });
    value.addEvent({ time: "15", source: { id: 7, type: 5 }, type: 1, phase: 2 });
    value.addEvent({ time: "25", source: { id: 8, type: 5 }, type: 2, phase: 0 });
    const result = value.finish();
    assert.equal(result.total, 4);
    assert.equal(result.rows[0].timeMs, null, "null time is not converted to zero");
    assert.equal(result.rows[2].durationMs, null, "a reversed pair has no observed duration");
  });

  it("does not treat false or empty error markers as failures", () => {
    const value = createEventQuery({ sanitizeFn: createEvidenceSanitizer(), errorsOnly: true });
    value.setConstants(constants);
    value.addEvent({ time: 1, source: { id: 7, type: 5 }, type: 1, phase: 0, params: { failed: false, net_error: 0 } });
    value.addEvent({ time: 2, source: { id: 7, type: 5 }, type: 1, phase: 0, params: { failure: "" } });
    value.addEvent({ time: 3, source: { id: 7, type: 5 }, type: 1, phase: 0, params: { net_error: -7 } });
    assert.equal(value.finish().total, 1);
  });

  it("adds only dictionary-backed explanations and preserves raw decoded fields", () => {
    const value = createEventQuery({ sanitizeFn: createEvidenceSanitizer() });
    value.setConstants(constants);
    value.addEvent({ time: 1, source: { id: 7, type: 5 }, type: 1, phase: 0, params: {
      netError: -105, quic_error: 7, quicRstStreamError: 8, load_flags: 3, load_state: 4,
      cert_status: 3, verifier_flags: 4, verify_flags: 8, digest_policy: 2,
      source_dependency: { id: 9, nested: { source_dependency: { id: 10 } } }
    } });
    const row = value.finish().rows[0];
    assert.deepEqual(row.dependencies, ["9", "10"]);
    assert.equal(row.params.netError, -105, "raw sanitized params remain available");
    assert.ok(row.decodedParams.some(note => note.includes("ERR_NAME_NOT_RESOLVED")));
    assert.ok(row.decodedParams.some(note => note.includes("LOAD_BYPASS_CACHE")));
    assert.ok(row.decodedParams.some(note => note.includes("CERT_STATUS_DATE_INVALID")));
  });

  it("does not invent a decoded meaning for zero, absent maps, or unknown values", () => {
    const zero = createEventQuery({ sanitizeFn: createEvidenceSanitizer() });
    zero.setConstants(constants);
    zero.addEvent({ time: 1, source: { id: 7, type: 5 }, type: 1, phase: 0, params: { load_flags: 0 } });
    assert.deepEqual(zero.finish().rows[0].decodedParams, []);

    const unknown = createEventQuery({ sanitizeFn: createEvidenceSanitizer() });
    unknown.setConstants(constants);
    unknown.addEvent({ time: 1, source: { id: 7, type: 5 }, type: 1, phase: 0, params: { net_error: -999 } });
    assert.match(unknown.finish().rows[0].decodedParams[0], /-999 \(unrecognized recorded value\)/);

    const noMap = createEventQuery({ sanitizeFn: createEvidenceSanitizer() });
    noMap.setConstants({ ...constants, netError: undefined });
    noMap.addEvent({ time: 1, source: { id: 7, type: 5 }, type: 1, phase: 0, params: { net_error: -105 } });
    assert.deepEqual(noMap.finish().rows[0].decodedParams, []);
  });

  it("emits self-contained offline markup and executable runtime", () => {
    const markup = eventReplayMarkup();
    assert.ok(markup.includes('id="replay-file"'));
    assert.ok(markup.includes('id="replay-file-name"'));
    assert.ok(markup.includes("hidden"));
    assert.ok(markup.includes('id="replay-source"'));
    assert.ok(markup.includes("comma-separated"));
    const script = eventReplayScript();
    assert.ok(!/https?:\/\//.test(script));
    const source = script.replace(/^<script>|<\/script>$/g, "");
    assert.doesNotThrow(() => new Function(source));
  });
});
