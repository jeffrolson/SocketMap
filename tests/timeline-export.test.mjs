import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderReportHtml } from "../src/renderer/report.html.mjs";
import { analyzeCapture } from "../src/analysis.mjs";
import { createCaptureReader } from "../src/viewer/viewer-core.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";
import { buildViewerHtml } from "../scripts/build-viewer.mjs";

function report(mutate) {
  const r = createCaptureReader();
  r.write(toNetLogText(buildPageLoadNetLog()));
  const model = r.finish();
  if (mutate) mutate(model);
  return renderReportHtml(model, analyzeCapture(model, {}), { source: { name: "t.json", bytes: 1 } });
}

describe("waterfall timeline", () => {
  const html = report();
  it("marks every problem request on the strip and lets each marker find its row", () => {
    const flagged = (html.match(/class="wf-row[^"]*flag-(?:error|slow)/g) || []).length;
    const marks = [...html.matchAll(/class="tl-mark tl-(?:error|slow)"[^>]*data-req="(req-\d+)"/g)].map(m => m[1]);
    assert.ok(marks.length >= 1);
    assert.equal(marks.length, flagged, "one marker per flagged request");
    for (const id of marks) assert.ok(html.includes(`id="${id}"`), id);
  });
  it("gives each row the times the window filter needs", () => {
    const rows = [...html.matchAll(/<details class="wf-row[^>]*data-t0="(-?\d+)" data-t1="(-?\d+)"/g)];
    assert.ok(rows.length >= 4);
    for (const [, t0, t1] of rows) assert.ok(Number(t1) >= Number(t0), `${t0}..${t1}`);
  });
  it("has accessible handles, a reset, and a legend", () => {
    for (const expected of ['id="tl-from"', 'id="tl-to"', 'aria-label="Start of the time window"', 'id="tl-reset"', "Failed or errored"]) assert.ok(html.includes(expected), expected);
  });
});

describe("sequence image export", () => {
  const html = report();
  it("offers PNG and SVG and builds them from the page itself, with no fetch or remote resource", () => {
    assert.ok(html.includes('id="seq-save-png"') && html.includes('id="seq-save-svg"'));
    assert.ok(html.includes("foreignObject") && html.includes("getComputedStyle"));
    const script = html.slice(html.indexOf("Export the sequence as an image"), html.indexOf("Timeline: a window over the page load"));
    assert.ok(script.length > 500);
    assert.ok(!/\bfetch\(|XMLHttpRequest|https?:\/\/(?!www\.w3\.org)/.test(script), "no network use in the export code");
  });
});

describe("viewer toolbar", () => {
  const viewer = buildViewerHtml({});
  it("folds the Add buttons into one menu and keeps the ids the code uses", () => {
    const menu = viewer.slice(viewer.indexOf('<details class="add-menu"'), viewer.indexOf("</details>", viewer.indexOf('<details class="add-menu"')));
    for (const id of ["add-har", "add-profile", "add-path", "add-lighthouse", "add-cpu"]) assert.ok(menu.includes(`id="${id}"`), id);
    assert.ok(!viewer.slice(0, viewer.indexOf('<details class="add-menu"')).includes('id="add-har"'));
  });
  it("uses one row for the page picker instead of a second toolbar, and keeps comparison controls for comparisons", () => {
    assert.ok(viewer.indexOf('id="page-select"') < viewer.indexOf('<details class="add-menu"'), "the picker sits in the main row");
    assert.ok(viewer.includes('id="comparison-toolbar" hidden'));
  });
});
