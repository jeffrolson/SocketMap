import { describe, it } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

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

    // Interactive elements & toggles
    assert.ok(html.includes('id="viewport"'));
    assert.ok(html.includes('id="tooltip"'));
    assert.ok(html.includes('id="inspector"'));
    assert.ok(html.includes('id="filter-input"'));
    assert.ok(html.includes('id="btn-toggle-blocking"'));
    assert.ok(html.includes('id="btn-toggle-glow"'));
    assert.ok(html.includes('id="btn-toggle-latency"'));
    assert.ok(html.includes('id="btn-toggle-insights"'));

    // Critical Path & Modern Web Guidance markup
    assert.ok(html.includes("CRITICAL BLOCKING PATH"));
    assert.ok(html.includes("Modern Web Guidance"));
    assert.ok(html.includes("Chrome Modern Web Guidance"));

    // Zero remote asset loads (no external script src, no external stylesheet href, no web fonts)
    assert.ok(!html.includes("<link rel=\"stylesheet\" href=\"http"));
    assert.ok(!html.includes("<script src=\"http"));
    assert.ok(!html.includes("fonts.googleapis.com"));
    assert.ok(!html.includes("cdnjs.cloudflare.com"));

    // Ensure zero remote resource-fetching tags (only navigation hyperlinks and XML namespaces allowed)
    const remoteAssetTags = html.match(/<(?:script|link|img|iframe|audio|video|source)\s+[^>]*?(?:src|href)=["']https?:\/\/[^"']+/gi);
    assert.equal(remoteAssetTags, null, `Disallowed remote asset loader tag found: ${remoteAssetTags}`);
  });

  it("should extract comprehensive inventory and render interactive inventory controls", () => {
    const trace = normalizeTrace(SAMPLE_TRACE);
    
    // Inventory verification
    assert.ok(trace.inventory, "Trace should include inventory");
    assert.ok(Array.isArray(trace.inventory.domains), "Inventory should list domains");
    assert.ok(Array.isArray(trace.inventory.ports), "Inventory should list ports");
    assert.ok(Array.isArray(trace.inventory.frameworks_libraries), "Inventory should list libraries");
    assert.ok(Array.isArray(trace.inventory.infrastructure_tools), "Inventory should list infrastructure tools");
    assert.ok(Array.isArray(trace.inventory.resource_types), "Inventory should list resource types");
    assert.ok(trace.inventory.summary.totalDomains > 0, "Should detect at least one domain");
    assert.ok(trace.inventory.summary.totalPorts > 0, "Should detect at least one port");
    assert.ok(trace.inventory.summary.totalTechnologies > 0, "Should detect technologies");

    // SVG data attributes
    const svg = buildTraceSvg(trace);
    assert.ok(svg.includes("data-domain="), "SVG routes should include data-domain attribute");
    assert.ok(svg.includes("data-port="), "SVG routes should include data-port attribute");
    assert.ok(svg.includes("data-tech="), "SVG routes should include data-tech attribute");
    assert.ok(svg.includes("data-resource-type="), "SVG routes should include data-resource-type attribute");

    // HTML elements & controls
    const html = renderStandaloneHtml(trace);
    assert.ok(html.includes('id="btn-toggle-inventory"'), "HTML should include inventory button");
    assert.ok(html.includes('id="active-filter-bar"'), "HTML should include active filter bar");
    assert.ok(html.includes("openTraceInventory"), "HTML script should include openTraceInventory");
    assert.ok(html.includes("applyInventoryFilter"), "HTML script should include applyInventoryFilter");
    assert.ok(html.includes("Network &amp; Tech Stack Fingerprint"), "Inspector should include tech stack fingerprint section");
  });

  it("should generate client-side JavaScript that compiles cleanly without syntax errors in VM", () => {
    const trace = normalizeTrace(SAMPLE_TRACE);
    const html = renderStandaloneHtml(trace);
    const scriptMatch = html.match(/<script>(.*?)<\/script>/s);
    assert.ok(scriptMatch, "Rendered HTML must contain an embedded script");
    assert.doesNotThrow(() => {
      new vm.Script(scriptMatch[1], { filename: "embedded-script.js" });
    }, "Embedded script should compile with zero syntax errors");
  });
});

describe("Participant card labels", () => {
  const trace = (label) => normalizeTrace({
    title: "t",
    participants: [{ id: "a", label, sublabel: "192.0.2.1", role: "client" }],
    messages: [{ from: "a", to: "a", label: "x" }]
  });

  it("keeps short labels at full size", () => {
    const svg = buildTraceSvg(trace("Browser"));
    assert.ok(svg.includes('font-size="13.0"'));
    assert.ok(!svg.includes("textLength"));
  });

  it("shrinks and fits long labels inside the card, with the full name on hover", () => {
    const svg = buildTraceSvg(trace("static.cloudflareinsights.com"));
    assert.ok(svg.includes('font-size="10.5"'));
    assert.ok(svg.includes('textLength="112" lengthAdjust="spacingAndGlyphs"'));
    assert.ok(svg.includes("<title>static.cloudflareinsights.com (192.0.2.1)</title>"));
  });
});
