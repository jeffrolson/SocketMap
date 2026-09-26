import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildViewerHtml } from "../scripts/build-viewer.mjs";
import { parseNetLog } from "../src/parsers/netlog-parser.mjs";
import { analyzeCapture } from "../src/analysis.mjs";
import { renderReportHtml } from "../src/renderer/report.html.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";

let dir;
let html;
let viewerApi;
let text;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "socketmap-viewer-"));
  text = toNetLogText(buildPageLoadNetLog());
  writeFileSync(join(dir, "page-load.json"), text);
  html = buildViewerHtml();
  const bundle = html.match(/<script id="socketmap-bundle">([\s\S]*?)<\/script>/)[1];
  // Run the bundle the way a browser would, minus the page: no document, so only the API is exposed.
  const context = vm.createContext({ TextDecoder, atob, URL, console, setTimeout });
  context.globalThis = context;
  vm.runInContext(bundle, context);
  viewerApi = context.SocketMap;
});

after(() => rmSync(dir, { recursive: true, force: true }));

describe("Drag-and-drop viewer", () => {
  it("is one self-contained HTML file", () => {
    assert.ok(html.startsWith("<!DOCTYPE html>"));
    assert.ok(!/<script[^>]+src=/i.test(html), "no external scripts");
    assert.ok(!/<link[^>]+href=/i.test(html), "no external stylesheets");
    assert.ok(!/^\s*(import|export)\s/m.test(html.match(/<script id="socketmap-bundle">([\s\S]*?)<\/script>/)[1]), "no module syntax left in the bundle");
  });

  it("tells people what to do and that nothing is uploaded", () => {
    assert.ok(html.includes("Drop a NetLog capture here"));
    assert.ok(html.includes("never leaves this computer"));
    assert.ok(html.includes("chrome://net-export"));
    assert.ok(html.includes("edge://net-export"));
    assert.ok(html.includes("explained in plain language"));
    assert.ok(!html.includes("which team to talk to"));
  });

  it("explains what SocketMap does, truthfully, before anything is dropped", () => {
    for (const id of ['id="how"', 'id="what"', 'id="privacy"', 'id="limits"']) assert.ok(html.includes(id), id);
    assert.ok(html.includes("data-open-sample"), "sample capture button");
    assert.ok(html.includes("What a network log cannot show"));
    for (const claim of ["PCAP", "gRPC", "WebSocket frame", "npx socketmap", "npm install -g"]) {
      assert.ok(!html.includes(claim), `does not claim ${claim}`);
    }
  });

  it("builds the same report in the browser as the command line does", async () => {
    const model = await parseNetLog(join(dir, "page-load.json"));
    const expected = renderReportHtml(model, analyzeCapture(model));

    const reader = viewerApi.createCaptureReader();
    for (let i = 0; i < text.length; i += 4096) reader.write(text.slice(i, i + 4096));
    const { html: actual } = viewerApi.buildReport(reader.finish());
    assert.equal(actual, expected);
  });

  it("builds a report for another page in the same capture", () => {
    const reader = viewerApi.createCaptureReader();
    reader.write(text);
    const { analysis } = viewerApi.buildReport(reader.finish(), "chrome-extension://abcdefghijklmnop");
    assert.equal(analysis.page.requestCount, 1);
  });

  it("recognizes a NetLog and turns away other files with a clear reason", () => {
    assert.equal(viewerApi.checkCaptureStart(text.slice(0, 4096)).ok, true);
    const har = viewerApi.checkCaptureStart('{"log":{"version":"1.2","entries":[]}}');
    assert.equal(har.ok, false);
    assert.ok(har.reason.includes("HAR"));
    assert.equal(viewerApi.checkCaptureStart("hello").ok, false);
  });
});
