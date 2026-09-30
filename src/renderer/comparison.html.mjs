/** Self-contained, browser-only rendering of two analyzed NetLog captures. */

import { formatBytes, formatDuration } from "../normalizer.mjs";
import { themeCss, themeModeCss, themePreferenceScript } from "../theme.mjs";
import { DEFAULT_THEME } from "./theme.generated.mjs";

const PHASES = ["redirect", "queue", "proxy", "dns", "connect", "tls", "stalled", "send", "wait", "download"];
const PHASE_LABELS = { redirect: "Redirect", queue: "Queue", proxy: "Proxy", dns: "DNS", connect: "Connect", tls: "TLS", stalled: "Stalled", send: "Send", wait: "Server wait", download: "Download" };
const INITIAL_PAIRS = 250;

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function number(value, unit) {
  if (value == null || !Number.isFinite(value)) return "Not recorded";
  if (value === 0 && unit === "ms") return "0ms";
  if (unit === "ms") return formatDuration(value);
  if (unit === "bytes") return formatBytes(value) || "0 B";
  return Number(value).toLocaleString("en-US");
}

function signed(value, unit) {
  if (value == null || !Number.isFinite(value)) return "Not recorded";
  if (value === 0) return number(0, unit);
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${number(Math.abs(value), unit)}`;
}

function json(value) {
  try { return JSON.stringify(value, null, 2); } catch { return "Not recorded"; }
}

function requestDuration(request) {
  if (!request || request.endRecorded === false || request.durationMs == null) return null;
  return request.durationMs;
}

function outcome(request) {
  if (!request) return "Not in this capture";
  if (request.netError) return `Failed: ${request.netError}`;
  if (request.status != null) return `HTTP ${request.status}${request.statusText ? ` ${request.statusText}` : ""}`;
  return "No response recorded";
}

function sourceCard(label, data, observedSpan) {
  const source = data.source || {};
  const page = data.page || {};
  return `<article class="source source-${label.toLowerCase()}">
    <span class="eyebrow">Capture ${label} · ${label === "A" ? "Baseline" : "Comparison"}</span>
    <h2>${esc(source.name || `${label} capture`)}</h2>
    <p class="url" title="${esc(page.url)}">${esc(page.url || "Page URL not recorded")}</p>
    <dl><dt>Page requests</dt><dd>${esc(number(page.requestCount, "count"))}</dd>${observedSpan == null ? "" : `<dt>Observed span</dt><dd>${esc(number(observedSpan, "ms"))}</dd>`}<dt>Capture started</dt><dd>${esc(data.environment?.captureStartedAt || "Not recorded")}</dd><dt>Capture file</dt><dd>${esc(source.bytes == null ? "Not recorded" : formatBytes(source.bytes))}</dd></dl>
  </article>`;
}

const NOISE_MS = 10;

function metric(metric) {
  const timing = metric.unit === "ms";
  // A few milliseconds is measurement noise between two loads, not a change worth colouring.
  const withinNoise = timing && metric.delta != null && Math.abs(metric.delta) < NOISE_MS;
  const direction = timing && metric.delta != null ? (withinNoise ? "similar" : metric.delta < 0 ? "faster" : metric.delta > 0 ? "slower" : "unchanged") : "changed";
  const detail = metric.percent == null ? "" : ` (${metric.percent > 0 ? "+" : ""}${metric.percent.toFixed(1)}%)`;
  const coverage = metric.coverageA == null && metric.coverageB == null ? "" : `<span class="coverage">Observed: ${Math.round((metric.coverageA || 0) * 100)}% A · ${Math.round((metric.coverageB || 0) * 100)}% B</span>`;
  return `<article class="metric"><span>${esc(metric.label)}</span><strong>${esc(number(metric.a, metric.unit))} <i>→</i> ${esc(number(metric.b, metric.unit))}</strong><b class="delta ${direction}">${esc(signed(metric.delta, metric.unit))}${esc(detail)}${timing && metric.delta != null ? (withinNoise ? " (about the same)" : ` ${direction}`) : ""}</b>${coverage}</article>`;
}

function phaseDetail(request, label) {
  if (!request) return "";
  const items = PHASES.filter(key => request.timing?.[key] != null && !(key === "download" && request.endRecorded === false)).map(key => `<tr><th>${esc(PHASE_LABELS[key])}</th><td>${esc(number(request.timing[key], "ms"))}</td></tr>`).join("");
  const facts = [["Protocol", request.protocol], ["Proxy", request.proxy], ["Connection", request.connectionId], ["Connection reused", request.reusedConnection == null ? null : request.reusedConnection ? "Yes" : "No"], ["Wire bytes", request.bytesWire == null ? null : formatBytes(request.bytesWire)]];
  return `<div><h4>${label}</h4><p>${esc(outcome(request))}</p>${items ? `<table><tbody>${items}</tbody></table>` : "<p>Timing phases not recorded.</p>"}<table><tbody>${facts.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v ?? "Not recorded")}</td></tr>`).join("")}</tbody></table></div>`;
}

function phaseSummary(request) {
  if (!request) return "not in capture";
  const values = PHASES.filter(key => request.timing?.[key] != null && !(key === "download" && request.endRecorded === false))
    .map(key => `${PHASE_LABELS[key]} ${number(request.timing[key], "ms")}`);
  return values.length ? values.join(", ") : "not recorded";
}

function pairRow(pair, index) {
  const a = pair.a;
  const b = pair.b;
  const durationA = requestDuration(a);
  const durationB = requestDuration(b);
  const scale = Math.max(durationA || 0, durationB || 0, 1);
  const bar = (value, label, request) => !request
    ? `<div class="run"><span>${label}</span><em>Not in capture</em></div>`
    : value == null ? `<div class="run"><span>${label}</span><em>Not recorded</em></div>`
      : `<div class="run"><span>${label}</span><div class="track"><i style="width:${Math.min(100, value / scale * 100).toFixed(2)}%"></i></div><em>${esc(number(value, "ms"))}</em></div>`;
  const state = pair.change === "matched" ? (pair.changed ? "changed" : "same") : pair.change;
  const text = `${pair.method || "method not recorded"} ${pair.url || "URL not recorded"} ${outcome(a)} ${outcome(b)}`.toLowerCase();
  return `<article class="pair ${esc(state)}${index >= INITIAL_PAIRS ? " deferred" : ""}" data-state="${esc(state)}" data-search="${esc(text)}">
    <header><span class="state">${esc(state === "only-a" ? "Only A" : state === "only-b" ? "Only B" : state === "changed" ? "Changed" : "Matched")}</span><strong>${esc(pair.method || "Method not recorded")} ${esc(pair.url || "URL not recorded")}</strong>${pair.occurrence > 1 ? `<small>Occurrence ${pair.occurrence}</small>` : ""}</header>
    <div class="runs" aria-label="A and B duration bars use this row's ${esc(number(scale, "ms"))} scale">${bar(durationA, "A baseline", a)}${bar(durationB, "B comparison", b)}</div>
    <p class="outcomes"><span>A: ${esc(outcome(a))}</span><span>B: ${esc(outcome(b))}</span>${pair.change === "matched" && pair.durationDeltaMs != null ? `<span>Duration B−A: ${esc(signed(pair.durationDeltaMs, "ms"))}</span>` : ""}</p>
    <details><summary>Timing phases and response details</summary><div class="phase-grid">${phaseDetail(a, "A baseline")}${phaseDetail(b, "B comparison")}</div></details>
  </article>`;
}

function comparisonSummary(comparison) {
  const lines = ["SocketMap comparison of two Chrome NetLog captures (secrets removed).", "", `A baseline: ${comparison.a.source?.name || "not recorded"}; page ${comparison.a.page?.url || "not recorded"}.`, `B comparison: ${comparison.b.source?.name || "not recorded"}; page ${comparison.b.page?.url || "not recorded"}.`, "", "Key metrics (B minus A):"];
  comparison.metrics.forEach(m => {
    lines.push(`- ${m.label}: ${number(m.a, m.unit)} → ${number(m.b, m.unit)}; ${signed(m.delta, m.unit)}${m.percent == null ? "" : ` (${m.percent > 0 ? "+" : ""}${m.percent.toFixed(1)}%)`}.`);
    if (m.coverageA != null || m.coverageB != null) lines.push(`  Coverage: A ${Math.round((m.coverageA || 0) * 100)}%; B ${Math.round((m.coverageB || 0) * 100)}%.`);
  });
  lines.push(`Capture files: A ${comparison.a.source?.bytes == null ? "not recorded" : formatBytes(comparison.a.source.bytes)} (${comparison.a.environment?.captureStartedAt || "start not recorded"}); B ${comparison.b.source?.bytes == null ? "not recorded" : formatBytes(comparison.b.source.bytes)} (${comparison.b.environment?.captureStartedAt || "start not recorded"}).`);
  lines.push("", `Request matching: ${comparison.counts.matched} matched, ${comparison.counts.changed} changed, ${comparison.counts.onlyA} only in A, ${comparison.counts.onlyB} only in B. Matching uses method, redacted URL, and occurrence order; repeated or redacted requests are heuristic matches.`);
  const evidence = comparison.pairs.filter(pair => pair.changed || pair.change !== "matched").slice(0, 30);
  if (evidence.length) {
    lines.push("", `Changed or unpaired request evidence (first ${evidence.length}):`);
    evidence.forEach(pair => {
      const a = pair.a; const b = pair.b;
      lines.push(`- ${pair.change}: ${pair.method || "method not recorded"} ${pair.url || "URL not recorded"}; A ${outcome(a)}, total ${number(requestDuration(a), "ms")}, wait ${number(a?.timing?.wait, "ms")}, protocol ${a?.protocol || "not recorded"}, proxy ${a?.proxy || "not recorded"}, reuse ${a?.reusedConnection == null ? "not recorded" : a.reusedConnection ? "yes" : "no"}, bytes ${a?.bytesWire == null ? "not recorded" : formatBytes(a.bytesWire)}, phases ${phaseSummary(a)}; B ${outcome(b)}, total ${number(requestDuration(b), "ms")}, wait ${number(b?.timing?.wait, "ms")}, protocol ${b?.protocol || "not recorded"}, proxy ${b?.proxy || "not recorded"}, reuse ${b?.reusedConnection == null ? "not recorded" : b.reusedConnection ? "yes" : "no"}, bytes ${b?.bytesWire == null ? "not recorded" : formatBytes(b.bytesWire)}, phases ${phaseSummary(b)}.`);
    });
    const omitted = comparison.pairs.filter(pair => pair.changed || pair.change !== "matched").length - evidence.length;
    if (omitted > 0) lines.push(`- ${omitted} additional changed or unpaired request${omitted === 1 ? "" : "s"} omitted from this summary; inspect the comparison report for the full list.`);
  }
  const changedEnvironment = comparison.environment.filter(row => row.changed);
  if (changedEnvironment.length) { lines.push("", "Environment differences:"); changedEnvironment.forEach(row => lines.push(`- ${row.label}: ${row.a ?? "Not recorded"} → ${row.b ?? "Not recorded"}.`)); }
  const diagnostics = comparison.diagnostics;
  if (diagnostics) {
    lines.push("", "Capture-wide diagnostic comparison (source IDs are not paired across captures):");
    lines.push(`- Sources: ${diagnostics.totalsA?.sources ?? "not recorded"} → ${diagnostics.totalsB?.sources ?? "not recorded"}; events: ${diagnostics.totalsA?.events ?? "not recorded"} → ${diagnostics.totalsB?.events ?? "not recorded"}; error-bearing events: ${diagnostics.totalsA?.errors ?? "not recorded"} → ${diagnostics.totalsB?.errors ?? "not recorded"}.`);
    const snapshots = (diagnostics.snapshots || []).filter(row => row.changed).slice(0, 8);
    if (snapshots.length) lines.push(`- Snapshot differences (first ${snapshots.length}): ${snapshots.map(row => `${row.key} (${row.presentA ? "recorded" : "not recorded"} → ${row.presentB ? "recorded" : "not recorded"})`).join("; ")}.`);
    const families = (diagnostics.families || []).filter(row => row.changed).slice(0, 8);
    if (families.length) lines.push(`- Changed source families (first ${families.length}): ${families.map(row => `${row.type}: events ${row.aEvents ?? "not recorded"} → ${row.bEvents ?? "not recorded"}, errors ${row.aErrors ?? "not recorded"} → ${row.bErrors ?? "not recorded"}`).join("; ")}.`);
  }
  if (comparison.warnings?.length) lines.push("", "Limits:", ...comparison.warnings.map(w => `- ${w}`));
  lines.push("", "Ask: Which recorded timing changes are most likely to explain the observed difference, and what additional capture or owner would confirm that hypothesis?");
  return lines.join("\n");
}

function diagnosticComparison(diagnostics) {
  if (!diagnostics) return "";
  const totals = diagnostics.totalsA || {};
  const totalsB = diagnostics.totalsB || {};
  const families = Array.isArray(diagnostics.families) ? diagnostics.families : [];
  const snapshots = Array.isArray(diagnostics.snapshots) ? diagnostics.snapshots.filter(row => row.changed) : [];
  const familyRow = row => {
    const scale = Math.max(row.aEvents || 0, row.bEvents || 0, 1);
    const bar = value => value == null ? '<em>Not recorded</em>' : `<span class="diag-bar"><i style="width:${Math.min(100, value / scale * 100).toFixed(1)}%"></i></span><b>${esc(value)}</b>`;
    return `<tr class="${row.changed ? "env-changed" : ""}"><th>${esc(row.type)}</th><td>${bar(row.aEvents)}</td><td>${bar(row.bEvents)}</td><td>${esc(row.aErrors ?? "Not recorded")} → ${esc(row.bErrors ?? "Not recorded")}</td><td>${esc(row.aSources ?? "Not recorded")} → ${esc(row.bSources ?? "Not recorded")}</td></tr>`;
  };
  return `<section class="panel"><h2>Capture-wide diagnostic differences</h2><p class="note">Source families are aggregated independently in each capture; matching source IDs is not assumed. Bars compare recorded event totals within each family row.</p><div class="diag-totals"><span>Sources <b>${esc(totals.sources ?? "Not recorded")} → ${esc(totalsB.sources ?? "Not recorded")}</b></span><span>Events <b>${esc(totals.events ?? "Not recorded")} → ${esc(totalsB.events ?? "Not recorded")}</b></span><span>Error-bearing events <b>${esc(totals.errors ?? "Not recorded")} → ${esc(totalsB.errors ?? "Not recorded")}</b></span></div><div class="env-grid"><table><thead><tr><th>Source family</th><th>A events</th><th>B events</th><th>Errors A → B</th><th>Sources A → B</th></tr></thead><tbody>${families.map(familyRow).join("") || "<tr><td colspan=\"5\">Not recorded.</td></tr>"}</tbody></table></div><h3>Changed browser snapshots</h3><p class="note">Values are captured and sanitized. An absent snapshot means it was not recorded.</p>${snapshots.length ? `<div class="snapshot-differences">${snapshots.map(row => `<details><summary>${esc(row.key)} · ${row.presentA ? "recorded" : "not recorded"} A → ${row.presentB ? "recorded" : "not recorded"} B</summary><div class="snapshot-grid"><div><h4>A baseline</h4><pre>${esc(row.presentA ? json(row.a) : "Not recorded")}</pre></div><div><h4>B comparison</h4><pre>${esc(row.presentB ? json(row.b) : "Not recorded")}</pre></div></div></details>`).join("")}</div>` : "<p class=\"note\">No changed diagnostic snapshots were recorded.</p>"}</section>`;
}

/** Renders a self-contained comparison report. Captured values are HTML-escaped. */
export function renderComparisonHtml(comparison, { theme = DEFAULT_THEME } = {}) {
  const pairs = Array.isArray(comparison?.pairs) ? comparison.pairs : [];
  const environment = Array.isArray(comparison?.environment) ? comparison.environment : [];
  const warnings = Array.isArray(comparison?.warnings) ? comparison.warnings : [];
  const identityWarnings = warnings.filter(warning => /\b(site|url|page)\b/i.test(warning));
  const observed = comparison.metrics.find(metric => metric.key === "observed-span");
  const summary = comparisonSummary(comparison);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SocketMap capture comparison</title><style>
  :root { ${themeCss(theme)} } ${themeModeCss(theme, DEFAULT_THEME)}
  *{box-sizing:border-box}
   body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 var(--font-sans)}
   button,input{font:inherit}
   button{color:var(--text);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:7px 10px;cursor:pointer}
   button:hover,button.is-on{border-color:var(--secondary);background:var(--surface-3)}
   button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--secondary);outline-offset:2px}
  .wrap{max-width:1160px;margin:auto;padding:20px}
  .top{display:flex;gap:12px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);position:sticky;top:0;background:color-mix(in srgb,var(--bg) 94%,transparent);backdrop-filter:blur(8px);z-index:3}
  .brand{font-weight:700;font-size:18px}
  .eyebrow{font:600 11px var(--font-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--secondary)}
  h1{font-size:clamp(24px,4vw,34px);line-height:1.15;margin:14px 0 8px}
  h2{font-size:17px;margin:4px 0;overflow-wrap:anywhere}
  .note,.coverage,.url,small{color:var(--text-muted)}
  .sources,.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  .source,.metric,.panel,.pair{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;min-width:0}
  .source-b{border-color:var(--secondary)}
  .url{font-family:var(--font-mono);overflow-wrap:anywhere;margin:7px 0}
  .source dl{display:grid;grid-template-columns:1fr auto;gap:5px 12px;margin:12px 0 0}
  .source dt{color:var(--text-muted)}
  .source dd{margin:0;font-family:var(--font-mono);overflow-wrap:anywhere}
  .metrics{grid-template-columns:repeat(3,minmax(0,1fr));margin-top:14px}
  .metric{display:grid;gap:5px}
  .metric strong{font-family:var(--font-mono);font-size:13px}
  .metric strong i{color:var(--text-faint);font-style:normal}
  .delta{font-size:13px}
  .delta.faster{color:var(--success)}
  .delta.slower{color:var(--danger)}
  .coverage{font-size:11px}
  .panel{margin-top:14px}
  .filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .filters input{min-width:220px;flex:1;background:var(--canvas);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-sm);padding:7px 10px}
  .pair-list{display:grid;gap:10px;margin-top:12px}
  .pair header{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
  .pair header strong{overflow-wrap:anywhere}
  .state{font:600 10px var(--font-mono);letter-spacing:.04em;text-transform:uppercase;padding:2px 5px;border-radius:var(--radius-sm);background:var(--surface-3)}
  .changed .state{background:var(--warning);color:var(--color-on-primary)}
  .only-a .state,.only-b .state{background:var(--secondary);color:var(--color-on-primary)}
  .runs{display:grid;gap:5px;margin-top:10px}
  .run{display:grid;grid-template-columns:88px 1fr 74px;gap:8px;align-items:center;font:12px var(--font-mono)}
  .run span{color:var(--text-muted)}
  .run em{font-style:normal;text-align:right}
  .track{height:9px;background:var(--canvas);border-radius:99px;overflow:hidden}
  .track i{display:block;height:100%;background:var(--primary)}
  .run:nth-child(2) .track i{background:var(--secondary)}
  .outcomes{display:flex;gap:6px 14px;flex-wrap:wrap;margin:10px 0 0;font-size:12px}
  .outcomes span{overflow-wrap:anywhere}
  .pair details{margin-top:10px}
  .pair summary{cursor:pointer;color:var(--primary)}
  .phase-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:10px}
  .env-grid{margin-top:10px;overflow-x:auto}
  .phase-grid h4{margin:0}
  .phase-grid p{margin:3px 0;color:var(--text-muted)}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th,td{text-align:left;padding:5px;border-bottom:1px solid var(--border);overflow-wrap:anywhere}
  th{color:var(--text-muted);font-weight:500}
  .env-changed td{background:color-mix(in srgb,var(--warning) 13%,transparent)}
  .diag-totals{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.diag-totals span{background:var(--canvas);padding:6px 8px;border-radius:var(--radius-sm);font-size:12px}.diag-totals b{font-family:var(--font-mono)}.diag-bar{display:inline-block;width:88px;height:8px;margin-right:6px;background:var(--canvas);border-radius:99px;overflow:hidden}.diag-bar i{display:block;height:100%;background:var(--primary)}.snapshot-differences{display:grid;gap:8px}.snapshot-differences details{padding:8px;background:var(--canvas);border-radius:var(--radius-sm)}.snapshot-differences summary{cursor:pointer;color:var(--primary)}.snapshot-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.snapshot-grid h4{margin:8px 0 3px}.snapshot-grid pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font:11px/1.4 var(--font-mono)}
  .warning{border-left:3px solid var(--warning);padding:8px 10px;background:var(--surface-2);margin:8px 0}
  .tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  textarea{display:block;width:100%;min-height:220px;margin-top:10px;background:var(--canvas);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;font:12px/1.45 var(--font-mono)}
  .hidden{display:none!important}
  @media(max-width:700px){.wrap{padding:14px}
  .sources,.metrics,.phase-grid{grid-template-columns:1fr}
  .snapshot-grid{grid-template-columns:1fr}
  .metrics{gap:8px}
  .top{position:static}
  .run{grid-template-columns:76px 1fr 62px}
  .filters input{min-width:100%}
  .env-grid table{min-width:560px}
  }
  
  </style>${themePreferenceScript()}</head><body><header class="top"><div class="wrap"><span class="brand">SocketMap comparison</span></div><div class="wrap"><button type="button" data-theme-toggle>Theme</button></div></header><main class="wrap">
  <span class="eyebrow">Two capture comparison</span><h1>What changed between the baseline and comparison?</h1><p class="note">A bar shows each request's recorded duration on the same row scale. A shorter recorded request is faster; request additions and removals are not automatically regressions. A page-level observed span is shown only when every selected request recorded an end.</p>
  <section class="sources">${sourceCard("A", comparison.a, observed?.a)}${sourceCard("B", comparison.b, observed?.b)}</section>${identityWarnings.map(warning => `<p class="warning">${esc(warning)}</p>`).join("")}
  <section class="metrics">${comparison.metrics.map(metric).join("")}</section>
  <section class="panel"><h2>Matched request evidence</h2><p class="note">Requests are paired by method, redacted URL, and occurrence order. Repeated requests and redacted values make this a useful heuristic, not proof of the same server-side action.</p><div class="filters"><button class="is-on" data-filter="all">All (${pairs.length})</button><button data-filter="changed">Changed (${comparison.counts.changed})</button><button data-filter="only-a">Only A (${comparison.counts.onlyA})</button><button data-filter="only-b">Only B (${comparison.counts.onlyB})</button><input id="search" type="search" placeholder="Filter method, URL, or outcome" aria-label="Filter requests"><span id="shown" class="note"></span></div><div class="pair-list">${pairs.map(pairRow).join("")}</div>${pairs.length > INITIAL_PAIRS ? `<button id="show-all" type="button">Show ${pairs.length - INITIAL_PAIRS} more paired requests</button>` : ""}</section>
  <section class="panel"><h2>Environment differences</h2><p class="note">These are browser-recorded settings. A difference can explain a changed path, but does not prove it caused the timing change.</p><div class="env-grid"><table><thead><tr><th>Setting</th><th>A baseline</th><th>B comparison</th></tr></thead><tbody>${environment.map(row => `<tr class="${row.changed ? "env-changed" : ""}"><th>${esc(row.label)}</th><td>${esc(row.a ?? "Not recorded")}</td><td>${esc(row.b ?? "Not recorded")}</td></tr>`).join("") || "<tr><td colspan=\"3\">No environment fields were recorded.</td></tr>"}</tbody></table></div></section>
  ${diagnosticComparison(comparison.diagnostics)}
  <section class="panel"><h2>Share with an AI assistant</h2><p class="note">This detailed summary includes private addresses and URLs retained for troubleshooting. Use an approved assistant.</p><div class="tools"><button id="copy" type="button">Copy summary</button><button id="download" type="button">Download .txt</button><span id="copy-status" class="note" role="status"></span></div><textarea id="summary" readonly aria-label="Detailed comparison summary">${esc(summary)}</textarea></section>
  <section class="panel"><h2>Limits to keep in mind</h2>${warnings.map(w => `<p class="warning">${esc(w)}</p>`).join("") || "<p class=\"note\">The comparison only reports what each capture recorded. Missing timing is not treated as zero.</p>"}</section>
  </main><script>
  (function () {
    var mode = "all";
    var search = document.getElementById("search");
    var pairs = [].slice.call(document.querySelectorAll(".pair"));
    var shown = document.getElementById("shown");
    var expanded = false;
    var more = document.getElementById("show-all");
    var cap = ${INITIAL_PAIRS};
    function apply() {
      var q = search.value.toLowerCase();
      var matching = 0;
      var visible = 0;
      pairs.forEach(function (row) {
        var matches = (mode === "all" || row.dataset.state === mode) && (!q || row.dataset.search.indexOf(q) >= 0);
        if (matches) matching++;
        var show = matches && (expanded || visible < cap);
        row.classList.toggle("hidden", !show);
        if (show) visible++;
      });
      shown.textContent = "Showing " + visible + " of " + matching + " matching requests" + (matching !== pairs.length ? " (" + pairs.length + " total pairs)" : "");
      if (more && !expanded) { more.hidden = matching <= cap; more.textContent = "Show all " + matching + " matching requests"; }
    }
    document.querySelectorAll("[data-filter]").forEach(function (button) { button.addEventListener("click", function () { mode = button.dataset.filter; document.querySelectorAll("[data-filter]").forEach(function (b) { b.classList.toggle("is-on", b === button); }); apply(); }); });
    search.addEventListener("input", apply);
    if (more) more.addEventListener("click", function () { expanded = true; more.remove(); apply(); });
    document.getElementById("copy").addEventListener("click", async function () { var text = document.getElementById("summary").value, ok = false; try { await navigator.clipboard.writeText(text); ok = true; } catch (_) { document.getElementById("summary").select(); try { ok = document.execCommand("copy"); } catch (_) {} } document.getElementById("copy-status").textContent = ok ? "Copied." : "Select the summary and copy it."; });
    document.getElementById("download").addEventListener("click", function () { var link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([document.getElementById("summary").value], { type: "text/plain" })); link.download = "socketmap-capture-comparison.txt"; link.click(); setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000); });
    apply();
  })();
  </script></body></html>`;
}
