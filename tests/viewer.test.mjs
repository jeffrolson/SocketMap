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
import { buildComparison, createCaptureReader as nodeCreateReader, buildReport as nodeBuildReport } from "../src/viewer/viewer-core.mjs";
const viewerApiNode = { createCaptureReader: nodeCreateReader, buildReport: nodeBuildReport };
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";
import { buildSampleHar } from "../src/demo/sample-har.mjs";
import { createHarReader } from "../src/parsers/har-stream.mjs";
import { attachHar } from "../src/enrichment.mjs";

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
    assert.ok(html.includes("Copy Chrome address"));
    assert.ok(html.includes("data-theme-toggle"));
    assert.ok(html.includes("Browser and extension activity"));
    assert.ok(html.includes("plain-language insights"));
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

  it("bundles the two-capture pipeline and produces the same portable comparison", () => {
    const read = () => { const reader = viewerApi.createCaptureReader(); reader.write(text); return reader.finish(); };
    const a = read();
    const b = read();
    const changed = b.requests.find(request => request.id === 1);
    changed.durationMs += 250;
    changed.end += 250;
    changed.timing.wait += 250;
    const options = { sourceA: { name: "before.json", bytes: text.length }, sourceB: { name: "after.json", bytes: text.length } };
    const actual = viewerApi.buildComparison(a, b, options);
    const expected = buildComparison(a, b, options);
    assert.equal(actual.html, expected.html);
    assert.equal(actual.comparison.counts.changed, 1);
    assert.equal(actual.comparison.pairs.find(pair => pair.a?.id === 1).durationDeltaMs, 250);
    assert.ok(actual.html.includes("before.json") && actual.html.includes("after.json"));
    assert.ok(!actual.html.includes("SECRET123"));
    assert.ok(html.includes('id="compare-files"') && html.includes('id="page-select-b"'));
    assert.ok(html.includes('id="swap-captures"'));
  });

  it("recognizes a NetLog and turns away other files with a clear reason", () => {
    assert.equal(viewerApi.checkCaptureStart(text.slice(0, 4096)).ok, true);
    const har = viewerApi.checkCaptureStart('{"log":{"version":"1.2","entries":[]}}');
    assert.equal(har.ok, false);
    assert.ok(har.reason.includes("HAR"));
    assert.equal(viewerApi.checkCaptureStart("hello").ok, false);
  });
});

describe("Viewer: optional HAR", () => {
  it("offers Add a HAR, says it is optional and never uploaded", () => {
    assert.ok(html.includes('id="add-har"') && html.includes('id="har-input"'));
    assert.match(html, /Optional: record a HAR/);
    assert.match(html, /never uploaded/);
  });

  it("recognizes a HAR by its first bytes and does not confuse it with a NetLog", () => {
    assert.equal(viewerApi.looksLikeHar('{"log":{"version":"1.2","creator":{"name":"WebInspector"},"pages":[]'), true);
    assert.equal(viewerApi.looksLikeHar('{"constants":{"logEventTypes":{}},"events":['), false);
    assert.equal(viewerApi.looksLikeHar("hello"), false);
  });

  it("builds the same enriched report in the browser bundle as in Node", () => {
    const build = (api) => {
      const reader = api.createCaptureReader();
      reader.write(text);
      const model = reader.finish();
      const harReader = api.createHarReader();
      harReader.write(JSON.stringify(buildSampleHar(model)));
      api.attachHar(model, harReader.finish());
      return api.buildReport(model).html;
    };
    const inBundle = build(viewerApi);
    const inNode = build({ createCaptureReader: viewerApiNode.createCaptureReader, createHarReader, attachHar, buildReport: viewerApiNode.buildReport });
    assert.equal(inBundle, inNode);
    assert.ok(inBundle.includes('id="enrichment"'));
  });
});
