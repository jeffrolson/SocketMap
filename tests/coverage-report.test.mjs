import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCoverage, STATUS_LABELS } from "../src/coverage.mjs";
import { renderCoverage, coverageCss } from "../src/renderer/coverage.mjs";
import { createCaptureReader, buildReport } from "../src/viewer/viewer-core.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";

function sampleModel() {
  const reader = createCaptureReader();
  reader.write(toNetLogText(buildPageLoadNetLog()));
  return reader.finish();
}

describe("coverage view", () => {
  const coverage = buildCoverage(sampleModel());
  const html = renderCoverage(coverage);

  it("maps the request path and lists every stage and item with a text status", () => {
    for (const stage of coverage.stages) {
      assert.ok(html.includes(`id="cov-${stage.id}"`), stage.id);
      assert.ok(html.includes(`href="#cov-${stage.id}"`), `${stage.id} tile links to its section`);
      for (const entry of stage.items) assert.ok(html.includes(entry.label.replace(/&/g, "&amp;").replace(/'/g, "&#039;")), entry.id);
    }
    for (const label of Object.values(STATUS_LABELS)) assert.ok(html.includes(label), label);
    assert.ok(html.includes("aria-label"), "the map has an accessible name");
  });

  it("says in plain words what the capture could and could not see, with computed numbers", () => {
    const { recorded, partial, missing, never } = coverage.summary;
    assert.ok(html.includes(`${recorded} recorded`) && html.includes(`${never} never`), "summary counts come from the model");
    assert.ok(html.includes("Worth capturing next"));
    for (const step of coverage.next) assert.ok(html.includes(step.title), step.id);
  });

  it("uses design tokens only and opens outbound links safely", () => {
    const css = coverageCss();
    assert.ok(css.includes("var(--success)") && css.includes("var(--danger)"));
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    for (const tag of html.match(/<a [^>]*href="https?:\/\/[^"]+"[^>]*>/g) || []) assert.match(tag, /rel="noopener noreferrer"/);
    assert.doesNotMatch(html, /<script|src=|@import/);
  });

  it("escapes recorded text", () => {
    const evil = { stages: [{ id: "page", title: "<b>x</b>", blurb: "", items: [{ id: "a", label: "<img src=x>", status: "recorded", detail: "\"quoted\" & <tag>" }] }], summary: { recorded: 1, partial: 0, missing: 0, never: 0 }, next: [] };
    const out = renderCoverage(evil);
    assert.ok(!out.includes("<img") && !out.includes("<b>x"));
    assert.ok(out.includes("&lt;tag&gt;"));
  });

  it("is a tab in the report and stays in the standalone file", () => {
    const { html: report } = buildReport(sampleModel());
    assert.ok(report.includes('data-nav="coverage"'));
    assert.ok(report.includes('id="view-coverage"'));
    assert.ok(report.includes("Worth capturing next"));
    assert.ok(report.includes("What this capture could and could not see"));
  });
});
