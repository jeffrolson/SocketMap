import { describe, it } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { renderPolicyView, policyScript, policyCss } from "../src/renderer/policy.mjs";
import { POLICY_CATALOG, CATALOG_REVIEWED } from "../src/policy/catalog.mjs";
import { buildSamplePolicyExport } from "../src/demo/sample-policy.mjs";
import { createCaptureReader, buildReport } from "../src/viewer/viewer-core.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";

function reportHtml() {
  const reader = createCaptureReader();
  reader.write(toNetLogText(buildPageLoadNetLog()));
  return buildReport(reader.finish()).html;
}

// A minimal DOM: enough to run the embedded script the way a browser would.
function runScript(html, exportFile) {
  const script = html.match(/<script id="policy-script">([\s\S]*?)<\/script>/)[1];
  const nodes = {};
  const node = (id) => nodes[id] || (nodes[id] = { id, innerHTML: "", handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; }, click() { this.handlers.click?.({ preventDefault() {} }); } });
  const document = { getElementById: node };
  vm.runInNewContext(script, { document, JSON, Promise, File: class {} });
  return { node, document, exportFile };
}

describe("policy tab", () => {
  const html = reportHtml();

  it("is a tab in the report with its own upload area and a privacy note", () => {
    assert.ok(html.includes('data-nav="policy"'));
    assert.ok(html.includes('id="view-policy"'));
    assert.ok(html.includes('id="policy-file"') && html.includes('id="policy-drop"') && html.includes('id="policy-sample"'));
    assert.match(html, /Nothing is uploaded/);
    assert.ok(html.includes(`Catalog reviewed ${CATALOG_REVIEWED}`));
  });

  it("previews what it checks before anything is uploaded, naming every policy", () => {
    const view = renderPolicyView();
    for (const policy of POLICY_CATALOG) assert.ok(view.includes(policy.name), policy.name);
    assert.ok(view.includes("chrome://policy") && view.includes("edge://policy"));
  });

  it("ships a script that compiles and reaches no remote server", () => {
    const script = html.match(/<script id="policy-script">([\s\S]*?)<\/script>/)[1];
    assert.doesNotThrow(() => new vm.Script(script));
    assert.doesNotMatch(script, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon)\(/);
    assert.doesNotMatch(html, /<(script|link|img)\b[^>]*\b(src|href)=["']?https?:/i);
  });

  it("runs end to end: the embedded engine reads a dropped sample export", () => {
    const { node } = runScript(html);
    node("policy-sample").click();
    const out = node("policy-results").innerHTML;
    assert.ok(out.includes("ProxyMode") && out.includes("Deprecated") && out.includes("ProxySettings"), "deprecated policy found");
    assert.ok(out.includes("MaxConnectionsPerProxy"), "in-scope policy listed");
    assert.match(out, /2 other policies set/, "the rest are counted, not assessed");
  });

  it("explains a file that is not a policy export", () => {
    const { node } = runScript(html);
    const file = { size: 12, text: () => Promise.resolve("{\"events\":[]}") };
    node("policy-file").handlers.change({ target: { files: [file] } });
    return Promise.resolve().then(() => Promise.resolve()).then(() => {
      assert.match(node("policy-results").innerHTML, /does not look like a browser policy export/);
    });
  });

  it("uses design tokens only", () => {
    assert.doesNotMatch(policyCss(), /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    assert.ok(policyCss().includes("var(--secondary)"));
  });
});
