/**
 * Policy engine: reads a chrome://policy or edge://policy JSON export, matches it to the
 * curated catalog, and renders the result. Everything is inside createPolicyEngine() so the
 * same code can be embedded in the standalone report and run in the browser with
 * Function.toString(); it must not reference anything outside itself.
 *
 * Two kinds of statement are kept apart and labeled: "Documented" (paraphrased from the
 * vendor's own page) and "SocketMap guidance" (our judgment). Nothing here judges policies
 * outside the catalog; they are counted, not assessed.
 *
 * No Node APIs.
 */

export function createPolicyEngine(sanitize) {
  const BROWSER_LABEL = { chrome: "Chrome", edge: "Edge" };

  function esc(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function plural(n, one, many) { return n === 1 ? one : many; }

  function matches(when, value) {
    let v = value;
    if (when.path) v = value && typeof value === "object" ? value[when.path] : undefined;
    if ("eq" in when) return v === when.eq;
    if ("lt" in when) return typeof v === "number" && v < when.lt;
    if ("gte" in when) return typeof v === "number" && v >= when.gte;
    if ("in" in when) return when.in.includes(v);
    return false;
  }

  function show(value) {
    if (value === undefined) return "not recorded";
    const text = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
    return text.length > 240 ? text.slice(0, 237) + "..." : text;
  }

  function normalize(input) {
    const base = "This does not look like a browser policy export. In the browser, open chrome://policy or edge://policy and choose Export to JSON.";
    const keys = input && typeof input === "object" && !Array.isArray(input) ? Object.keys(input).slice(0, 8).map(k => k.replace(/[^\w .-]/g, "").slice(0, 40)).filter(Boolean) : [];
    const fail = { ok: false, reason: keys.length ? `${base} The file's top-level sections are: ${keys.join(", ")}.` : base };
    if (!input || typeof input !== "object" || Array.isArray(input)) return fail;
    const source = input.chromeMetadata || input.edgeMetadata || input.metadata || {};
    const application = String(source.application || "");
    const browser = /edge/i.test(application) ? "edge" : /chrome/i.test(application) ? "chrome" : null;
    const meta = { browser, application: application || null, version: source.version || null, os: source.OS || null, exportedAt: input.policyExportTime || null };
    const policies = [];
    function add(dict, section) {
      for (const name of Object.keys(dict)) {
        const raw = dict[name];
        const shaped = raw && typeof raw === "object" && !Array.isArray(raw) && ("value" in raw || "level" in raw || "scope" in raw || "source" in raw);
        const entry = shaped ? raw : { value: raw };
        policies.push({ name, section, level: entry.level ?? null, scope: entry.scope ?? null, source: entry.source ?? null, value: sanitize(entry.value, name), error: entry.error ?? null, warning: entry.warning ?? null, info: entry.info ?? null, ignored: entry.ignored === true, flaggedDeprecated: entry.deprecated === true, flaggedFuture: entry.future === true, restartRequired: entry.restartRequired === true, overrides: Array.isArray(entry.conflicts) ? entry.conflicts.length : 0, supersedes: Array.isArray(entry.superseded) ? entry.superseded.length : 0 });
      }
    }
    let recognized = false;
    // Newer Chrome writes policyValues; Chrome 134 and earlier wrote the same structure as policyGroups.
    const values = input.policyValues || input.policyGroups;
    if (values && typeof values === "object" && !Array.isArray(values)) {
      recognized = true;
      for (const key of Object.keys(values)) {
        const section = values[key];
        if (!section || typeof section !== "object" || key === "precedence") continue;
        if (section.policies && typeof section.policies === "object" && !Array.isArray(section.policies)) add(section.policies, key);
        else if (key === "extensions") for (const id of Object.keys(section)) { const ext = section[id]; if (ext && ext.policies && typeof ext.policies === "object") add(ext.policies, "extensions"); }
      }
    } else {
      const flat = input.chromePolicies || input.edgePolicies || input.policies;
      if (flat && typeof flat === "object" && !Array.isArray(flat)) { recognized = true; add(flat, "chrome"); }
    }
    return recognized ? { ok: true, meta, policies } : fail;
  }

  function evaluate(norm, evidence, catalog, reviewed) {
    const browser = norm.meta.browser;
    const facts = evidence || {};
    const browserPolicies = norm.policies.filter(p => p.section !== "updater");
    const byName = new Map(browserPolicies.map(p => [p.name.toLowerCase(), p]));
    const rows = [];
    const deprecated = [];
    const notes = [];
    const suggestions = [];
    const table = [];
    const known = new Set();
    for (const entry of catalog) {
      const forBrowser = browser ? entry.browsers[browser] || null : null;
      const listed = browser ? Boolean(forBrowser) : true;
      const p = byName.get(entry.name.toLowerCase());
      if (p) known.add(p.name.toLowerCase());
      const urls = browser ? (forBrowser ? [{ browser, url: forBrowser.url }] : []) : Object.keys(entry.browsers).map(b => ({ browser: b, url: entry.browsers[b].url }));
      const statuses = browser ? (forBrowser ? [forBrowser.status] : []) : Object.keys(entry.browsers).map(b => entry.browsers[b].status);
      const isDeprecated = statuses.some(status => status !== "current");
      if (listed || p) table.push({ name: entry.name, urls, state: p ? "set" : "unset", deprecated: isDeprecated, area: entry.area });
      if (p) {
        const rule = (entry.explain || []).find(r => matches(r.when, p.value));
        rows.push({ id: entry.id, name: entry.name, area: entry.area, urls, value: show(p.value), level: p.level, scope: p.scope, source: p.source, explanation: rule ? rule.text : null, what: entry.what, documented: entry.documented, deprecated: isDeprecated, unlisted: !listed, docNote: docNote(entry, browser) });
        if (isDeprecated) deprecated.push({ name: entry.name, urls, replacement: entry.replacement || null, documented: entry.documented, docNote: docNote(entry, browser), browsers: browser ? [browser] : Object.keys(entry.browsers).filter(b => entry.browsers[b].status !== "current") });
        if (entry.overriddenBy) {
          const other = byName.get(entry.overriddenBy.name.toLowerCase());
          if (other && (!browser || entry.overriddenBy.browsers.includes(browser))) notes.push({ kind: "documented", name: entry.name, text: entry.overriddenBy.text });
        }
        for (const check of entry.contradictedBy || []) if (matches(check.when, p.value) && facts[check.signal]) notes.push({ kind: "cross-check", name: entry.name, text: check.text });
      }
      for (const s of entry.suggest || []) {
        if (browser && (!forBrowser || (s.browsers && !s.browsers.includes(browser)))) continue;
        if (!facts[s.signal]) continue;
        if (s.unsetOnly && p) continue;
        if (s.setWhen && !(p && matches(s.setWhen, p.value))) continue;
        suggestions.push({ name: entry.name, area: entry.area, urls, why: s.why, documented: entry.documented, guidance: s.guidance, set: Boolean(p), docNote: docNote(entry, browser) });
      }
    }
    for (const p of browserPolicies) {
      if (p.error) notes.push({ kind: "reported", name: p.name, text: `The browser reports an error: ${show(p.error)}` });
      if (p.warning) notes.push({ kind: "reported", name: p.name, text: `The browser reports a warning: ${show(p.warning)}` });
      if (p.info) notes.push({ kind: "reported", name: p.name, text: `The browser reports: ${show(p.info)}` });
      if (p.ignored) notes.push({ kind: "reported", name: p.name, text: "The browser marks this policy as ignored, so it is set but not in effect." });
      if (p.flaggedDeprecated && !deprecated.some(d => d.name.toLowerCase() === p.name.toLowerCase())) notes.push({ kind: "reported", name: p.name, text: "The browser flags this policy as deprecated." });
      if (p.flaggedFuture) notes.push({ kind: "reported", name: p.name, text: "The browser flags this policy as not yet in effect for this version (a future policy)." });
      if (p.overrides) notes.push({ kind: "reported", name: p.name, text: `Another source also sets this policy and this value overrides ${p.overrides} of them (${plural(p.overrides, "conflict", "conflicts")} in the export).` });
      if (p.supersedes) notes.push({ kind: "reported", name: p.name, text: `A higher-precedence source supersedes ${p.supersedes} other ${plural(p.supersedes, "value", "values")} for this policy.` });
      if (p.restartRequired) notes.push({ kind: "reported", name: p.name, text: "The browser reports that a restart is needed before this value takes effect." });
    }
    const other = browserPolicies.filter(p => !known.has(p.name.toLowerCase()));
    return {
      meta: norm.meta, reviewed, browser,
      counts: { set: browserPolicies.length, checked: catalog.length, inScopeSet: rows.length, deprecated: deprecated.length, suggestions: suggestions.length, other: other.length },
      rows, deprecated, notes, suggestions, table, otherNames: other.map(p => p.name).slice(0, 60)
    };
  }

  function docNote(entry, browser) {
    const from = entry.documentedFrom || "both";
    if (from === "both" || from === browser) return null;
    const source = BROWSER_LABEL[from] || from;
    if (!browser) return `Paraphrased from ${source}'s page only. Check the other browser's page for its own details.`;
    return `Paraphrased from ${source}'s page. ${BROWSER_LABEL[browser] || browser} lists the same policy, so check its page for ${BROWSER_LABEL[browser] || browser}-specific behavior.`;
  }

  function links(urls) {
    return urls.map(u => `<a href="${esc(u.url)}" target="_blank" rel="noopener noreferrer">${urls.length > 1 ? esc(BROWSER_LABEL[u.browser] || u.browser) + " docs" : "Vendor docs"}</a>`).join(" · ");
  }

  function tag(kind) {
    if (kind === "documented") return '<span class="pol-tag pol-doc">Documented</span>';
    if (kind === "guidance") return '<span class="pol-tag pol-guide">SocketMap guidance</span>';
    if (kind === "cross-check") return '<span class="pol-tag pol-cross">Cross-check</span>';
    if (kind === "reported") return '<span class="pol-tag pol-cross">Browser reported</span>';
    return '<span class="pol-tag pol-warn">Deprecated</span>';
  }

  function render(result) {
    const { meta, counts } = result;
    const browserLabel = meta.application ? `${meta.application}${meta.version ? " " + meta.version : ""}` : "Browser not named in the export";
    const tiles = `<div class="pol-tiles">
<div class="pol-tile"><h4>Export from</h4><b class="pol-small">${esc(browserLabel)}</b><p>${esc(meta.os || "")}${meta.exportedAt ? ` · ${esc(meta.exportedAt)}` : ""}</p></div>
<div class="pol-tile"><h4>Policies set</h4><b>${counts.set}</b><p>${counts.set ? `${counts.inScopeSet} of them shape the network path.` : "This browser has no policies set."}</p></div>
<div class="pol-tile${counts.deprecated ? " is-warn" : ""}"><h4>Deprecated in use</h4><b>${counts.deprecated}</b><p>Policies the vendor has retired.</p></div>
<div class="pol-tile"><h4>Worth considering</h4><b>${counts.suggestions}</b><p>Backed by evidence in this capture.</p></div></div>`;
    const empty = counts.set === 0 ? `<div class="pol-callout"><b>No browser policies are set in this export.</b> This browser is not being managed by policy, or the export came from an unmanaged profile. The browser defaults apply, so the list below shows what SocketMap checks and any evidence-backed suggestions.</div>` : "";
    const dep = result.deprecated.map(d => `<div class="pol-callout is-warn">${tag("deprecated")} <b>${esc(d.name)}</b> is set, and the vendor documentation marks it deprecated${d.replacement ? `. The replacement is <b>${esc(d.replacement)}</b>` : ""}. ${links(d.urls)}<p>${tag("documented")} ${esc(d.documented)}${d.docNote ? ` <em>${esc(d.docNote)}</em>` : ""}</p></div>`).join("");
    const notes = result.notes.map(n => `<div class="pol-callout">${tag(n.kind)} <b>${esc(n.name)}</b>: ${esc(n.text)}</div>`).join("");
    const rows = result.rows.length ? `<section class="pol-section"><h3>Policies that shape the network path</h3><table class="pol-table"><thead><tr><th>Policy</th><th>Set to</th><th>What it means</th><th>Where it comes from</th></tr></thead><tbody>${result.rows.map(r => `<tr><th scope="row">${esc(r.name)}<small>${esc(r.area)}</small>${r.deprecated ? tag("deprecated") : ""}${r.urls.length ? `<small>${links(r.urls)}</small>` : '<small>No vendor page checked for this browser</small>'}</th><td><code>${esc(r.value)}</code></td><td>${r.explanation ? esc(r.explanation) : esc(r.what)}<small>${tag("documented")} ${esc(r.documented)}${r.docNote ? ` <em>${esc(r.docNote)}</em>` : ""}</small></td><td>${esc([r.level, r.scope, r.source].filter(Boolean).join(" · ") || "not recorded")}</td></tr>`).join("")}</tbody></table></section>` : "";
    const suggest = result.suggestions.length ? `<section class="pol-section"><h3>Worth considering</h3><p class="pol-note">Each card starts from evidence in this capture. These are things to test, not instructions.</p><div class="pol-cards">${result.suggestions.map(s => `<article class="pol-card"><h4>${esc(s.name)} <small>${esc(s.area)}</small></h4><p class="pol-why"><b>Evidence:</b> ${esc(s.why)}</p><p>${tag("documented")} ${esc(s.documented)}${s.docNote ? ` <em>${esc(s.docNote)}</em>` : ""}</p><p>${tag("guidance")} ${esc(s.guidance)}</p><p class="pol-links">${links(s.urls)}</p></article>`).join("")}</div></section>` : "";
    const catalogRows = `<details class="pol-details"><summary>Every policy SocketMap checks (${result.table.length})</summary><table class="pol-table"><thead><tr><th>Policy</th><th>Area</th><th>In this export</th><th>Vendor page</th></tr></thead><tbody>${result.table.map(t => `<tr><th scope="row">${esc(t.name)}${t.deprecated ? tag("deprecated") : ""}</th><td>${esc(t.area)}</td><td>${t.state === "set" ? "Set" : "Not set (browser default)"}</td><td>${t.urls.length ? links(t.urls) : "Not checked for this browser"}</td></tr>`).join("")}</tbody></table></details>`;
    const others = counts.other ? `<details class="pol-details"><summary>${counts.other} other ${plural(counts.other, "policy", "policies")} set, not assessed</summary><p class="pol-note">SocketMap only assesses policies that shape the network path. Names only; values are not shown.</p><p class="pol-names">${result.otherNames.map(n => `<code>${esc(n)}</code>`).join(" ")}</p></details>` : "";
    return `${tiles}${empty}${dep}${notes}${rows}${suggest}${catalogRows}${others}<p class="pol-note">Catalog reviewed ${esc(result.reviewed)} against the Chrome Enterprise and Microsoft Edge policy documentation. <b>Documented</b> is paraphrased from the vendor's own page. <b>SocketMap guidance</b> is our judgment, with the reason. Policies change between browser versions, so confirm on the vendor page before acting.</p>`;
  }

  return { normalize, evaluate, render };
}

/** Signals from the capture that policy suggestions are allowed to rest on. Never invented. */
export function buildPolicyEvidence(model, analysis) {
  const findings = new Set((analysis?.findings || []).map(f => f.id));
  const requests = (Array.isArray(model?.requests) ? model.requests : []).filter(r => !r.isBackground);
  const name = String(model?.environment?.browser || "");
  return {
    browser: /edge/i.test(name) ? "edge" : /chrome/i.test(name) ? "chrome" : null,
    quicSeen: requests.some(r => r.protocol === "h3"),
    quicFailed: findings.has("quic-failed"),
    slowProxyLookup: findings.has("slow-proxy-lookup"),
    slowDns: findings.has("slow-dns"),
    slowConnection: findings.has("slow-connection"),
    tlsInspection: findings.has("tls-inspection")
  };
}
