import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildTraceSvg, getMessageStyle } from "../src/renderer/svg-builder.mjs";
import { renderStandaloneHtml } from "../src/renderer/template.html.mjs";
import { SAMPLE_TRACE } from "../src/sample-data.mjs";
import { normalizeTrace } from "../src/normalizer.mjs";

describe("Renderer & SVG Builder", () => {
  it("should generate correct message styles for semantic interaction kinds", () => {
    const reqStyle = getMessageStyle("request");
    assert.equal(reqStyle.color, "#06b6d4");
    assert.equal(reqStyle.dasharray, "none");

    const retStyle = getMessageStyle("return");
    assert.equal(retStyle.color, "#94a3b8");
    assert.equal(retStyle.dasharray, "6 4");

    const secStyle = getMessageStyle("security");
    assert.equal(secStyle.color, "#f43f5e");

    const asyncStyle = getMessageStyle("async");
    assert.equal(asyncStyle.color, "#a855f7");

    const retryStyle = getMessageStyle("retry");
    assert.equal(retryStyle.color, "#f59e0b");
  });

  it("should build SVG containing all required signal-flow visual elements", () => {
    const trace = normalizeTrace(SAMPLE_TRACE);
    const svg = buildTraceSvg(trace);

    // Deep dark background & pattern
    assert.ok(svg.includes('fill="#070b12"'));
    assert.ok(svg.includes('id="grid-dots"'));

    // Status Badge
    assert.ok(svg.includes("LIVE ARTIFACT"));
    assert.ok(svg.includes("#10b981"));

    // Glow filters
    assert.ok(svg.includes('id="glow-cyan"'));
    assert.ok(svg.includes('id="glow-emerald"'));
    assert.ok(svg.includes('id="glow-crimson"'));

    // Arrow markers
    assert.ok(svg.includes('id="arrow-cyan"'));
    assert.ok(svg.includes('id="arrow-gray"'));

    // Participants & Lifelines
    assert.ok(svg.includes("participant-card"));
    assert.ok(svg.includes("lifeline"));
    assert.ok(svg.includes("activation-bar"));

    // Phase Dividers
    assert.ok(svg.includes("phase-divider"));

    // Bottom Legend
    assert.ok(svg.includes("INTERACTION LEGEND"));
  });

  it("should render 100% self-contained HTML with zero remote dependencies", () => {
    const trace = normalizeTrace(SAMPLE_TRACE);
    const html = renderStandaloneHtml(trace);

    // Basic structure
    assert.ok(html.startsWith("<!DOCTYPE html>"));
    assert.ok(html.includes("SOCKETMAP"));
    assert.ok(html.includes("Signal-Flow Trace Visualizer"));

    // Interactive elements
    assert.ok(html.includes('id="viewport"'));
    assert.ok(html.includes('id="tooltip"'));
    assert.ok(html.includes('id="inspector"'));
    assert.ok(html.includes('id="filter-input"'));

    // Zero external network calls (no external link tags, no remote scripts)
    assert.ok(!html.includes("<link rel=\"stylesheet\" href=\"http"));
    assert.ok(!html.includes("<script src=\"http"));
    assert.ok(!html.includes("fonts.googleapis.com"));
    assert.ok(!html.includes("cdnjs.cloudflare.com"));

    // Check all URLs in document
    const urls = html.match(/https?:\/\/[^\s"'<>]+/g) || [];
    for (const url of urls) {
      assert.equal(url, "http://www.w3.org/2000/svg", `Disallowed remote asset URL found: ${url}`);
    }
  });
});
