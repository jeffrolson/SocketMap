import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPolicyEngine, buildPolicyEvidence } from "../src/policy/engine.mjs";
import { POLICY_CATALOG, CATALOG_REVIEWED } from "../src/policy/catalog.mjs";
import { createEvidenceSanitizer } from "../src/redact.mjs";
import { buildSamplePolicyExport } from "../src/demo/sample-policy.mjs";

const engine = createPolicyEngine(createEvidenceSanitizer());
const entry = (value, extra = {}) => ({ level: "mandatory", scope: "machine", source: "platform", value, ...extra });
const chromeExport = (policies, app = "Google Chrome") => ({
  chromeMetadata: { OS: "Test OS", application: app, revision: "abc", version: "153.0.0.0 (Official Build)" },
  policyExportTime: "2026-09-29T12:00:00Z",
  policyValues: { chrome: { name: "Chrome Policies", policies }, extensionInstall: { name: "Extension Install Policies", policies: {} }, extensions: {}, precedence: { name: "Policy Precedence", policies: {}, precedenceOrder: ["Platform machine"] }, updater: { name: "Google Update Policies", policies: { AutoUpdateCheckPeriodMinutes: entry("1440") } } },
  status: { updater: { version: "1" }, user: {} }
});
const evaluate = (policies, evidence = {}, app) => engine.evaluate(engine.normalize(chromeExport(policies, app)), evidence, POLICY_CATALOG, CATALOG_REVIEWED);

describe("policy export reader", () => {
  it("reads the real Chrome export shape", () => {
    const norm = engine.normalize(chromeExport({ QuicAllowed: entry(false), HomepageLocation: entry("https://example.test/") }));
    assert.equal(norm.ok, true);
    assert.equal(norm.meta.browser, "chrome");
    assert.match(norm.meta.version, /^153\./);
    assert.deepEqual(norm.policies.filter(p => p.section === "chrome").map(p => p.name).sort(), ["HomepageLocation", "QuicAllowed"]);
    assert.equal(norm.policies.find(p => p.name === "QuicAllowed").scope, "machine");
  });
  it("accepts an unmanaged browser with no policies", () => {
    const norm = engine.normalize(chromeExport({}));
    assert.equal(norm.ok, true);
    const result = engine.evaluate(norm, {}, POLICY_CATALOG, CATALOG_REVIEWED);
    assert.equal(result.counts.set, 0);
    assert.match(engine.render(result), /No browser policies are set/);
  });
  it("recognizes Edge and tolerates other shapes", () => {
    assert.equal(engine.normalize(chromeExport({}, "Microsoft Edge")).meta.browser, "edge");
    const flat = engine.normalize({ policies: { QuicAllowed: { value: false }, DiskCacheSize: 1000 } });
    assert.equal(flat.ok, true);
    assert.deepEqual(flat.policies.map(p => p.name).sort(), ["DiskCacheSize", "QuicAllowed"]);
  });
  it("turns away files that are not policy exports", () => {
    for (const bad of [null, [], "text", 5, { events: [] }, {}]) {
      const norm = engine.normalize(bad);
      assert.equal(norm.ok, false);
      assert.match(norm.reason, /policy/i);
    }
  });
  it("removes secrets and credentials from recorded values", () => {
    const norm = engine.normalize(chromeExport({ ProxySettings: entry({ ProxyMode: "pac_script", ProxyPacUrl: "https://user:hunter2@pac.example.test/p.pac?token=SECRET123" }), SomeApiKey: entry("KEYVALUE") }));
    const text = JSON.stringify(norm.policies);
    assert.ok(!text.includes("hunter2") && !text.includes("SECRET123") && !text.includes("KEYVALUE"));
    assert.ok(text.includes("pac.example.test"), "hostnames stay");
  });
});

describe("policy evaluation", () => {
  it("flags a deprecated policy with its replacement and the vendor page", () => {
    const result = evaluate({ ProxyMode: entry("pac_script") });
    assert.equal(result.deprecated.length, 1);
    assert.equal(result.deprecated[0].name, "ProxyMode");
    assert.equal(result.deprecated[0].replacement, "ProxySettings");
    assert.equal(result.deprecated[0].urls[0].url, "https://chromeenterprise.google/policies/proxy-mode/");
  });
  it("says when a documented override applies", () => {
    const result = evaluate({ ProxyMode: entry("direct"), ProxySettings: entry({ ProxyMode: "pac_script" }) });
    assert.ok(result.notes.some(n => n.kind === "documented" && /ProxySettings wins/.test(n.text)));
    assert.ok(!evaluate({ ProxyMode: entry("direct"), ProxySettings: entry({ ProxyMode: "pac_script" }) }, {}, "Microsoft Edge").notes.some(n => /wins/.test(n.text)), "the override is documented for Chrome only");
  });
  it("cross-checks a policy against what the capture shows", () => {
    const result = evaluate({ QuicAllowed: entry(false) }, { quicSeen: true });
    assert.ok(result.notes.some(n => n.kind === "cross-check" && /HTTP\/3/.test(n.text)));
    assert.ok(!evaluate({ QuicAllowed: entry(false) }, { quicSeen: false }).notes.some(n => n.kind === "cross-check"));
  });
  it("explains values in plain words", () => {
    const row = evaluate({ MaxConnectionsPerProxy: entry(32), DnsOverHttpsMode: entry("secure") }).rows;
    assert.match(row.find(r => r.name === "MaxConnectionsPerProxy").explanation, /Lower than the default/);
    assert.match(row.find(r => r.name === "DnsOverHttpsMode").explanation, /no fallback/);
  });
  it("suggests only with evidence, labels its two kinds of source, and never for policies already set", () => {
    const suggested = evaluate({}, { quicFailed: true }).suggestions.find(s => s.name === "QuicAllowed");
    assert.ok(suggested);
    assert.ok(suggested.why && suggested.documented && suggested.guidance);
    assert.equal(evaluate({}, {}).suggestions.length, 0, "no evidence, no suggestion");
    assert.equal(evaluate({ QuicAllowed: entry(true) }, { quicFailed: true }).suggestions.filter(s => s.name === "QuicAllowed").length, 0);
    assert.ok(evaluate({ EnableOnlineRevocationChecks: entry(true) }, { slowConnection: true }).suggestions.some(s => s.name === "EnableOnlineRevocationChecks"));
    assert.ok(!evaluate({ EnableOnlineRevocationChecks: entry(false) }, { slowConnection: true }).suggestions.some(s => s.name === "EnableOnlineRevocationChecks"));
  });
  it("does not offer an Edge-only suggestion to Chrome", () => {
    assert.ok(!evaluate({}, { slowProxyLookup: true }, "Google Chrome").suggestions.some(s => s.name === "WPADQuickCheckEnabled"));
    assert.ok(evaluate({}, { slowProxyLookup: true }, "Microsoft Edge").suggestions.some(s => s.name === "WPADQuickCheckEnabled"));
  });
  it("counts what it did not judge instead of ignoring it", () => {
    const result = evaluate({ QuicAllowed: entry(true), HomepageLocation: entry("https://example.test/"), ShowHomeButton: entry(true) });
    assert.equal(result.counts.other, 2);
    assert.deepEqual(result.otherNames.sort(), ["HomepageLocation", "ShowHomeButton"]);
  });
});

describe("whose documentation a statement comes from", () => {
  it("says so when the paraphrase came from the other browser's page", () => {
    const edgeRows = evaluate({ EnableOnlineRevocationChecks: entry(true) }, {}, "Microsoft Edge").rows;
    assert.match(edgeRows[0].docNote, /Paraphrased from Chrome's page.*Edge-specific/);
    const chromeRows = evaluate({ EnableOnlineRevocationChecks: entry(true) }, {}, "Google Chrome").rows;
    assert.equal(chromeRows[0].docNote, null);
    assert.equal(evaluate({ QuicAllowed: entry(true) }, {}, "Microsoft Edge").rows[0].docNote, null, "both vendors were read");
    assert.match(engine.render(evaluate({ EnableOnlineRevocationChecks: entry(true) }, {}, "Microsoft Edge")), /Paraphrased from Chrome/);
  });
});

describe("catalog integrity", () => {
  it("cites the vendor documentation for every entry and browser", () => {
    assert.match(CATALOG_REVIEWED, /^\d{4}-\d{2}-\d{2}$/);
    const names = new Set();
    for (const policy of POLICY_CATALOG) {
      assert.ok(!names.has(policy.name), `duplicate ${policy.name}`); names.add(policy.name);
      assert.ok(["chrome", "edge", "both"].includes(policy.documentedFrom), `${policy.name} documentedFrom`);
      if (policy.documentedFrom !== "both") assert.ok(policy.browsers[policy.documentedFrom], `${policy.name}: paraphrased from a page it does not cite`);
      for (const field of ["id", "name", "area", "what", "matters", "documented"]) assert.ok(policy[field], `${policy.name} lacks ${field}`);
      assert.ok(Object.keys(policy.browsers).length >= 1, policy.name);
      for (const [browser, info] of Object.entries(policy.browsers)) {
        assert.ok(["current", "deprecated", "obsolete"].includes(info.status), `${policy.name} ${browser}`);
        if (browser === "chrome") assert.match(info.url, /^https:\/\/chromeenterprise\.google\/policies\/[a-z0-9-]+\/$/, policy.name);
        if (browser === "edge") assert.equal(info.url, `https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/${policy.name.toLowerCase()}`, policy.name);
      }
      if (Object.values(policy.browsers).some(info => info.status !== "current")) assert.ok(policy.replacement, `${policy.name} is deprecated and needs a replacement`);
      for (const s of policy.suggest || []) assert.ok(s.signal && s.why && s.guidance, `${policy.name} suggestion`);
    }
  });
});

describe("evidence from a capture", () => {
  it("summarizes signals without inventing them", () => {
    const evidence = buildPolicyEvidence({ environment: { browser: "Microsoft Edge 153.0" }, requests: [{ protocol: "h3", isBackground: false }, { protocol: "h2", isBackground: true }] }, { findings: [{ id: "quic-failed" }, { id: "slow-dns" }] });
    assert.deepEqual(evidence, { browser: "edge", quicSeen: true, quicFailed: true, slowProxyLookup: false, slowDns: true, slowConnection: false, tlsInspection: false });
    assert.equal(buildPolicyEvidence({}, {}).browser, null);
  });
});

describe("policy results view", () => {
  const html = (policies, evidence, app) => engine.render(evaluate(policies, evidence, app));
  it("shows set policies, deprecated ones, cross-checks and suggestions, each with its source label", () => {
    const out = html({ ProxyMode: entry("pac_script"), QuicAllowed: entry(false), HomepageLocation: entry("https://example.test/") }, { quicSeen: true, slowDns: true });
    assert.ok(out.includes("ProxyMode") && out.includes("Deprecated") && out.includes("ProxySettings"));
    assert.ok(out.includes("Cross-check"));
    assert.ok(out.includes("BuiltInDnsClientEnabled") && out.includes("SocketMap guidance") && out.includes("Documented"));
    assert.ok(out.includes("1 other policy") || out.includes("other policies"));
    assert.ok(out.includes(`reviewed ${CATALOG_REVIEWED}`));
    assert.match(out, /href="https:\/\/chromeenterprise\.google\/policies\/proxy-mode\/" target="_blank" rel="noopener noreferrer"/);
  });
  it("escapes what an export contains", () => {
    const out = html({ QuicAllowed: entry("<img src=x onerror=1>"), "<b>Odd</b>": entry("<script>1</script>") });
    assert.ok(!out.includes("<img") && !out.includes("<script>") && !out.includes("<b>Odd"));
  });
  it("makes no remote request and carries no script", () => {
    assert.doesNotMatch(html({ QuicAllowed: entry(true) }), /<script|src=|@import/);
  });
});

describe("sample export", () => {
  it("is synthetic, shaped like the real export, and exercises the tool", () => {
    const sample = buildSamplePolicyExport();
    const norm = engine.normalize(sample);
    assert.equal(norm.ok, true);
    const result = engine.evaluate(norm, { quicSeen: true }, POLICY_CATALOG, CATALOG_REVIEWED);
    assert.ok(result.deprecated.length >= 1);
    assert.match(JSON.stringify(sample), /example\.(com|test)/);
    assert.doesNotMatch(JSON.stringify(sample.policyValues), /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/, "no IP addresses in the policies");
  });
});
