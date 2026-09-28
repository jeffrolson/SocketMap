import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildDiagnosticNetLog, SNAPSHOT_KEYS } from "../src/demo/diagnostic-capture.mjs";
import { parseNetLog } from "../src/parsers/netlog-parser.mjs";
import { createCaptureReader } from "../src/viewer/viewer-core.mjs";
import { analyzeCapture } from "../src/analysis.mjs";
import { renderReportHtml } from "../src/renderer/report.html.mjs";
import { createEvidenceSanitizer } from "../src/redact.mjs";
import { createEventQuery } from "../src/viewer/event-replay.mjs";

function read(text, constants) {
  const reader = createCaptureReader(constants ? { constants } : undefined);
  for (let index = 0; index < text.length; index += 71) reader.write(text.slice(index, index + 71));
  return reader.finish();
}

describe("diagnostic capture coverage", () => {
  it("has the constants required by the deployed NetLog Viewer", () => {
    const constants = buildDiagnosticNetLog().constants;
    assert.equal(constants.logFormatVersion, 1);
    for (const name of ["logEventPhase", "logEventTypes", "logSourceType", "netError"]) {
      assert.ok(constants[name] && Object.keys(constants[name]).length, name);
    }
  });

  it("preserves every deployed-shaped snapshot while redacting each canary", () => {
    const model = read(JSON.stringify(buildDiagnosticNetLog()));
    assert.deepEqual(Object.keys(model.diagnostics.snapshots).sort(), [...SNAPSHOT_KEYS].sort());
    assert.equal(model.diagnostics.sources.some(source => source.type === "UNRECOGNIZED_DIAGNOSTIC_SOURCE"), true);
    const timeline = model.diagnostics.timeline.reduce((totals, bin) => ({
      sent: totals.sent + (bin.sentBytes || 0), received: totals.received + (bin.receivedBytes || 0),
      diskRead: totals.diskRead + (bin.diskReadBytes || 0), diskWrite: totals.diskWrite + (bin.diskWriteBytes || 0)
    }), { sent: 0, received: 0, diskRead: 0, diskWrite: 0 });
    assert.deepEqual(timeline, { sent: 31, received: 47, diskRead: 13, diskWrite: 17 });
    const output = JSON.stringify(model);
    for (const canary of ["COMMENT_CANARY", "PAC_CANARY", "BAD_PROXY_CANARY", "DOH_CANARY", "REPORT_CANARY", "SERVICE_CANARY", "EXT_CANARY", "EVENT_CANARY"]) assert.equal(output.includes(canary), false, canary);
    assert.ok(output.includes("192.0.2.53"), "documentation addresses remain useful evidence");
  });

  it("renders diagnostics without HTTP requests", () => {
    const model = read(JSON.stringify(buildDiagnosticNetLog({ noHttp: true })));
    assert.equal(model.requests.length, 0);
    const analysis = analyzeCapture(model);
    const html = renderReportHtml(model, analysis);
    assert.ok(html.includes("Browser diagnostics"));
    assert.ok(html.includes("UNRECOGNIZED_DIAGNOSTIC_SOURCE"));
  });

  it("matches a constants-seeded viewer reread and bounded Node second pass", async () => {
    const text = JSON.stringify(buildDiagnosticNetLog({ lateConstants: true }));
    const first = read(text);
    assert.equal(first.diagnostics.constantsLate, true);
    const seeded = read(text, first.diagnostics.constants);
    const dir = mkdtempSync(join(tmpdir(), "socketmap-diagnostic-"));
    try {
      const path = join(dir, "late.json");
      writeFileSync(path, text);
      const node = await parseNetLog(path);
      assert.equal(node.diagnostics.constantsLate, false);
      assert.deepEqual(node.stats, seeded.stats);
      const filtered = await parseNetLog(path, { filter: "cdn.example" });
      assert.equal(filtered.requests.length, 1);
      assert.deepEqual(node.diagnostics.eventTypes, seeded.diagnostics.eventTypes);
      assert.deepEqual(node.diagnostics.sources, seeded.diagnostics.sources);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("replay counts every original diagnostic event after redaction", () => {
    const capture = buildDiagnosticNetLog();
    const query = createEventQuery({ sanitizeFn: createEvidenceSanitizer(), limit: 1000 });
    query.setConstants(capture.constants);
    capture.events.forEach(event => query.addEvent(event));
    const result = query.finish();
    assert.equal(result.total, capture.events.length);
    assert.equal(result.rows.length, capture.events.length);
    assert.equal(JSON.stringify(result).includes("EVENT_CANARY"), false);
  });
});
