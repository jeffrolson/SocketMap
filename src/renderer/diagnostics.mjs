/** Offline diagnostics panels for the browser-wide evidence in a NetLog. */

import { buildDiagnosticInsights, summarizeDnsCache } from "../diagnostic-insights.mjs";

const INITIAL_SOURCES = 250;
// Event samples (first and last parameters per event type) are most of a large report. They are kept for sources with
// errors and for the most eventful sources; other sources keep their event types, counts and times.
const SAMPLE_SOURCES = 100;
const MAX_TABLE_ROWS = 100;
const CATEGORIES = [
  ["proxy", /proxy|pac|wpad/i, "Proxy", "Shows how the browser was configured to route traffic. Check a recorded PAC address or proxy error with the network team."],
  ["dns", /dns|host.?resolver|doh/i, "DNS", "Shows resolver settings and recorded lookups. Missing data means the capture did not record it."],
  ["sockets", /socket|connect/i, "Sockets", "Shows connection-pool and socket evidence. Compare errors and active counts before drawing a path conclusion."],
  ["stream-pool", /stream.?pool/i, "StreamPool", "Shows HTTP stream-pool state when Chromium recorded it. Use it to find capacity evidence, not to assume queueing."],
  ["alt-svc", /alt.?svc/i, "Alt-Svc", "Shows alternative-service information used for protocol selection."],
  ["http2", /http.?2|h2|spdy/i, "HTTP/2", "Shows HTTP/2 session information when captured."],
  ["quic", /quic|http.?3|h3/i, "QUIC", "Shows QUIC and HTTP/3 evidence. A missing section does not prove QUIC was blocked."],
  ["reporting", /reporting|nel/i, "Reporting", "Shows browser reporting configuration and delivery evidence."],
  ["cache", /cache/i, "Cache", "Shows cache evidence. It does not establish whether a server response was healthy."],
  ["modules", /module|extension|service.?provider|field.?trial/i, "Modules", "Shows module or extension-related browser state when recorded."],
  ["prerender", /prerender/i, "Prerender", "Shows prerender evidence when the browser recorded it."]
];

function esc(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function json(value) { try { return JSON.stringify(value, null, 2); } catch { return "Not recorded"; } }
function time(value, first) { if (value == null || first == null) return "Not recorded"; const delta = value - first; return `${delta < 0 ? "−" : "+"}${Math.abs(delta).toFixed(1)} ms`; }
function duration(a, b) { return a == null || b == null ? "Not recorded" : `${Math.max(0, b - a).toFixed(1)} ms`; }
function categoryEntries(snapshots, category) { return Object.entries(snapshots || {}).filter(([key]) => category[1].test(key)); }

function fieldLabel(key) {
  const labels = { host_port_pair: "Host and port", ttl: "Time to live (TTL)", network_changes: "Network changes", negotiated_protocol: "Negotiated protocol", source_id: "Source ID", peer_address: "Remote address", alpn_protos: "Protocols offered (ALPN)" };
  return labels[key] || String(key).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, letter => letter.toUpperCase());
}

function cellValue(key, value) {
  if (/^(?:source_id|sourceId|net_log_source_id)$/.test(key) && value != null && (typeof value === "number" || typeof value === "string")) return `<button type="button" data-replay-source="${esc(value)}">${esc(value)}</button>`;
  return esc(value ?? "Not recorded");
}

function structuredValue(value, depth = 0) {
  if (depth > 5 || value == null || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    if (!value.length || !value.every(item => item && typeof item === "object" && !Array.isArray(item))) return "";
    const shown = value.slice(0, MAX_TABLE_ROWS);
    const columns = [...new Set(shown.flatMap(item => Object.keys(item)))].slice(0, 16);
    const omitted = value.length > shown.length ? `<p class="muted">Showing the first ${MAX_TABLE_ROWS} of ${value.length} rows. The full recorded JSON is in the card's raw view.</p>` : "";
    return `<div class="diag-table-wrap"><table class="diag-table"><thead><tr>${columns.map(column => `<th title="${esc(column)}">${esc(fieldLabel(column))}</th>`).join("")}</tr></thead><tbody>${shown.map(item => `<tr>${columns.map(column => {
      const cell = item[column];
      if (!cell || typeof cell !== "object") return `<td>${cellValue(column, cell)}</td>`;
      // The card's raw JSON already carries the whole cell, so only fall back to a local copy when no table can show it.
      const nested = structuredValue(cell, depth + 1);
      return `<td><details><summary>Recorded fields</summary>${nested || `<pre>${esc(json(cell))}</pre>`}</details></td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>${omitted}`;
  }
  const fields = Object.entries(value);
  const scalars = fields.filter(([, item]) => item == null || typeof item !== "object");
  return (scalars.length ? `<dl class="kv">${scalars.map(([key, item]) => `<dt title="${esc(key)}">${esc(fieldLabel(key))}</dt><dd>${cellValue(key, item)}</dd>`).join("")}</dl>` : "") + fields.filter(([, item]) => item && typeof item === "object").map(([key, item]) => {
    const table = structuredValue(item, depth + 1);
    return table ? `<details><summary>${esc(key)}${Array.isArray(item) ? ` (${item.length})` : ""}</summary>${table}</details>` : "";
  }).join("");
}

function snapshotCard(category, snapshots, diagnostics) {
  const entries = categoryEntries(snapshots, category);
  return `<section class="diag-snapshot" data-diagnostic-tab="${category[0]}"><h3>${category[2]}</h3><p>${category[3]}</p>${category[0] === "dns" ? dnsCacheMarkup(diagnostics) : ""}${entries.length ? entries.map(([key, value]) => `<details><summary>${esc(key)}</summary>${structuredValue(value)}<pre>${esc(json(value))}</pre></details>`).join("") : "<p class=\"muted\">Not recorded.</p>"}</section>`;
}

function dnsCacheMarkup(diagnostics) {
  const result = summarizeDnsCache(diagnostics);
  const cache = diagnostics.snapshots?.hostResolverInfo?.cache;
  if (!result.entries.length) return "";
  return `<h4>Cache validity at the recorded snapshot</h4><p class="note">Calculated from the recorded expiry, export time and network-change counters. Missing comparisons remain unknown.</p><div class="diag-table-wrap"><table class="diag-table"><thead><tr><th>Host</th><th>Expiry (UTC)</th><th>State</th><th>Recorded reason</th></tr></thead><tbody>${result.entries.slice(0, MAX_TABLE_ROWS).map(entry => `<tr><td>${esc(cache.entries[entry.index]?.hostname ?? "Not recorded")}</td><td>${esc(entry.expirationDate ?? "Not recorded")}</td><td>${esc(entry.label)}</td><td>${esc([entry.expiredByTime === true ? "Time elapsed" : "", entry.expiredByNetworkChange === true ? "Network changed" : ""].filter(Boolean).join("; ") || (entry.label === "unknown" ? "Not enough recorded evidence" : "Both expiry checks are current"))}</td></tr>`).join("")}</tbody></table></div>${result.entries.length > MAX_TABLE_ROWS ? `<p class="muted">Showing the first ${MAX_TABLE_ROWS} of ${result.entries.length} rows. The full recorded JSON is in the card's raw view.</p>` : ""}`;
}

function sourceRow(source, index, firstTime, lastTime, keepSamples = true) {
  const eventTypes = source.eventTypes || [];
  const search = `${source.id} ${source.type} ${source.label} ${eventTypes.map(type => type.name).join(" ")}`.toLowerCase();
  const evidence = keepSamples ? eventTypes.map(type => `<details><summary>${esc(type.name)} · ${esc(type.count)} events · ${esc(time(type.firstTime, firstTime))} to ${esc(time(type.lastTime, firstTime))}</summary><p>Begin ${esc(type.beginCount ?? "Not recorded")} · End ${esc(type.endCount ?? "Not recorded")}. Samples below are the first and last captured summaries for this event type, not its full event record.</p><div class="diag-evidence"><pre>First\n${esc(json(type.firstParams))}</pre><pre>Last\n${esc(json(type.lastParams))}</pre></div></details>`).join("") : `<p class="note">Samples are not kept for lower-activity sources; the viewer can replay this source's events from the capture file.</p><p>${eventTypes.map(type => `${esc(type.name)} (${esc(type.count)})`).join(", ")}</p>`;
  const span = Math.max(1, (lastTime ?? firstTime ?? 0) - (firstTime ?? 0));
  const window = source.firstTime == null || source.lastTime == null ? "Not recorded" : `<span class="diag-life" title="Observed activity ${esc(time(source.firstTime, firstTime))} to ${esc(time(source.lastTime, firstTime))}"><i style="margin-left:${Math.max(0, (source.firstTime - firstTime) / span * 100).toFixed(2)}%;width:${Math.max(.5, (source.lastTime - source.firstTime) / span * 100).toFixed(2)}%"></i></span> ${esc(duration(source.firstTime, source.lastTime))}`;
  return `<tr class="diag-source${index >= INITIAL_SOURCES ? " diag-deferred" : ""}" data-source-id="${esc(source.id)}" data-type="${esc(source.type)}" data-events="${esc(source.eventCount)}" data-errors="${esc(source.errorCount)}" data-window="${esc(source.firstTime == null || source.lastTime == null ? "" : source.lastTime - source.firstTime)}" data-search="${esc(search)}"><td><button type="button" data-replay-source="${esc(source.id)}">${esc(source.id)}</button></td><td>${esc(source.type || "Not recorded")}</td><td>${esc(source.label || "Not recorded")}</td><td>${esc(source.eventCount ?? "Not recorded")}</td><td>${esc(source.errorCount ?? "Not recorded")}</td><td>${window}<small>observed window</small></td><td><details><summary>${eventTypes.length} types</summary>${evidence || "<p>Not recorded.</p>"}<p>Dependencies: ${esc((source.dependencies || []).join(", ") || "Not recorded")}</p></details></td></tr>`;
}

export function diagnosticsCss() {
  return `.diagnostics{display:grid;gap:16px}.diag-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.diag-card,.diag-panel,.diag-snapshot{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;min-width:0}.diag-card strong{display:block;font:600 22px var(--font-mono)}.diag-card span,.muted{color:var(--text-muted)}.diag-tabs,.diag-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.diag-tabs button.is-on{border-color:var(--secondary);background:var(--surface-3)}.diag-snapshot[hidden]{display:none}.diag-timeline{position:relative;height:130px;border-bottom:1px solid var(--border);margin:12px 0 0;overflow:hidden}.diag-timeline i{position:absolute;bottom:0;display:block;min-width:1px;background:var(--secondary);border-radius:var(--radius-sm) var(--radius-sm) 0 0}.diag-timeline i[hidden]{display:none}.diag-chart-label{margin:10px 0;color:var(--text-muted);font-size:12px}.diag-insights{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.diag-insight{padding:14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--canvas)}.diag-insight p{font-size:12px}.diag-insight .diag-tools{margin-top:8px}.diag-tools select,.diag-tools input[type=search]{background:var(--canvas);color:var(--text);border:1px solid var(--border);padding:7px;border-radius:var(--radius-sm)}.diag-axis{display:block;width:100%;height:28px;fill:var(--text-muted);stroke:var(--border);font:12px var(--font-mono)}.diag-life{display:inline-block;width:72px;height:7px;background:var(--canvas);border-radius:99px;overflow:hidden}.diag-life i{display:block;height:100%;background:var(--primary)}.diag-table-wrap{overflow-x:auto}.diag-table{border-collapse:collapse;width:100%;font-size:12px}.diag-table th,.diag-table td{padding:7px;text-align:left;vertical-align:top;border-bottom:1px solid var(--border);overflow-wrap:anywhere}.diag-table th{color:var(--text-muted)}.diag-evidence{display:grid;grid-template-columns:1fr 1fr;gap:8px}.diag-evidence pre,.diag-snapshot pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--canvas);padding:8px;border-radius:var(--radius-sm);font:11px/1.4 var(--font-mono)}.diag-deferred[hidden]{display:none}@media(max-width:700px){.diag-grid{grid-template-columns:1fr}.diag-evidence{grid-template-columns:1fr}}`;
}

/** Renders an inner section; a parent report supplies the surrounding view and navigation. */
export function renderDiagnostics(model) {
  const diagnostics = model?.diagnostics || {};
  const sources = diagnostics.sources || [];
  const timeline = diagnostics.timeline || [];
  const first = diagnostics.firstTime;
  const errors = sources.reduce((sum, source) => sum + (source.errorCount || 0), 0);
  const sampled = new Set([...sources].filter(source => source.errorCount > 0).concat([...sources].sort((a, b) => b.eventCount - a.eventCount).slice(0, SAMPLE_SOURCES)));
  const sourceFamilies = new Set(sources.map(source => source.type).filter(Boolean)).size;
  const integrity = diagnostics.integrity || {};
  const maxVolume = Math.max(1, ...timeline.map(point => point.events || 0));
  const snapshots = Object.fromEntries([
    ...Object.entries(diagnostics.snapshots || {}).map(([key, value]) => [`snapshots.${key}`, value]),
    ...Object.entries(diagnostics.constants || {}).map(([key, value]) => [`constants.${key}`, value]),
    ...Object.entries(diagnostics.topLevel || {}).map(([key, value]) => [`topLevel.${key}`, value])
  ]);
  const matchedKeys = new Set(CATEGORIES.flatMap(category => categoryEntries(snapshots, category).map(([key]) => key)));
  const unknown = Object.entries(snapshots).filter(([key]) => !matchedKeys.has(key));
  const series = [["events", "Events"], ["errors", "Errors"], ["sentBytes", "Bytes sent"], ["receivedBytes", "Bytes received"], ["openSockets", "Observed active sockets"], ["inUseSockets", "Observed in-use sockets"], ["activeRequests", "Observed active requests"], ["activeDns", "Observed active DNS jobs"], ["diskReadBytes", "Disk cache read"], ["diskWriteBytes", "Disk cache write"]];
  const integrityWarning = integrity.complete === false || integrity.discardedPartial || integrity.malformedEntries ? `<section class="diag-panel"><p class="warning">Capture integrity: complete=${esc(integrity.complete ?? "Not recorded")}; discarded partial=${esc(integrity.discardedPartial ?? 0)}; malformed entries=${esc(integrity.malformedEntries ?? 0)}. Missing or partial evidence is not treated as healthy.</p></section>` : "";
  const span = Math.max(1, (diagnostics.lastTime ?? first ?? 0) - (first ?? 0));
  return `<section class="diagnostics" id="diagnostics"><header><h2>Browser diagnostics</h2><p class="note">Browser-wide NetLog evidence, including source families outside the selected page. Values are recorded evidence; “Not recorded” is not a healthy result.</p></header><div class="diag-grid"><article class="diag-card"><span>Events observed</span><strong>${esc(diagnostics.events ?? "Not recorded")}</strong></article><article class="diag-card"><span>Source families</span><strong>${esc(sourceFamilies)}</strong></article><article class="diag-card"><span>Error-bearing events</span><strong>${esc(errors)}</strong></article><article class="diag-card"><span>Capture window</span><strong>${esc(duration(diagnostics.firstTime, diagnostics.lastTime))}</strong></article></div>${insightsMarkup(model)}${integrityWarning}${diagnostics.warnings?.length ? `<section class="diag-panel">${diagnostics.warnings.map(warning => `<p class="warning">${esc(warning)}</p>`).join("")}</section>` : ""}<section class="diag-panel"><h3>Observed timeline</h3><p class="muted">Select a recorded bucket series. Active counts are observed snapshots, not inferred totals when the capture begins mid-activity. Buckets aggregate recorded events.</p><div class="diag-tabs">${series.map(([key, label]) => `<button type="button" data-diag-series="${key}">${label}</button>`).join("")}</div><div class="diag-tools"><label><input type="checkbox" id="diag-byte-rate" checked> Bytes per second</label><label>Start <input id="diag-range-start" type="range" min="0" max="${span}" value="0"></label><label>End <input id="diag-range-end" type="range" min="0" max="${span}" value="${span}"></label></div><p class="diag-chart-label" id="diag-chart-label" role="status"></p><div class="diag-timeline" aria-label="Observed timeline">${timeline.map(point => `<i data-start="${esc((point.start ?? first ?? 0) - (first ?? 0))}" data-end="${esc((point.end ?? first ?? 0) - (first ?? 0))}" data-events="${esc(point.events ?? "")}" data-errors="${esc(point.errors ?? "")}" data-sent-bytes="${esc(point.sentBytes ?? "")}" data-received-bytes="${esc(point.receivedBytes ?? "")}" data-open-sockets="${esc(point.openSockets ?? "")}" data-in-use-sockets="${esc(point.inUseSockets ?? "")}" data-active-requests="${esc(point.activeRequests ?? "")}" data-active-dns="${esc(point.activeDns ?? "")}" data-disk-read-bytes="${esc(point.diskReadBytes ?? "")}" data-disk-write-bytes="${esc(point.diskWriteBytes ?? "")}" style="height:${Math.max(1, Math.min(100, (point.events || 0) / maxVolume * 100)).toFixed(1)}%" title="${esc(`${time(point.start, first)} to ${time(point.end, first)}: ${point.events ?? "not recorded"} events, ${point.errors ?? "not recorded"} errors`)}"></i>`).join("") || "<span class=\"muted\">Not recorded.</span>"}</div><svg class="diag-axis" viewBox="0 0 1000 24" preserveAspectRatio="none" aria-label="Relative capture time axis"><text id="diag-axis-start" x="0" y="18">+0 ms</text><text id="diag-axis-mid" x="500" y="18" text-anchor="middle"></text><text id="diag-axis-end" x="1000" y="18" text-anchor="end"></text></svg></section><section class="diag-panel"><h3>Browser snapshots</h3><p class="muted">Categories mirror Chromium network diagnostics when matching fields were captured. Open a card to see every captured field.</p><div class="diag-tabs">${CATEGORIES.map(category => `<button type="button" data-diagnostic-tab-button="${category[0]}">${category[2]} <span class="count">${categoryEntries(snapshots, category).length}</span></button>`).join("")}${unknown.length ? '<button type="button" data-diagnostic-tab-button="unknown">Other captured data</button>' : ""}</div><div class="diag-snapshots">${CATEGORIES.map(category => snapshotCard(category, snapshots, diagnostics)).join("")}${unknown.length ? `<section class="diag-snapshot" data-diagnostic-tab="unknown"><h3>Other captured data</h3>${unknown.map(([key, value]) => `<details><summary>${esc(key)}</summary><pre>${esc(json(value))}</pre></details>`).join("")}</section>` : ""}</div></section><section class="diag-panel"><h3>All captured sources</h3><p class="muted">Use a source ID button to open the full event replay provided by the viewer. The table samples first/last summaries only and never substitutes them for raw events.</p><div class="diag-tools"><input id="diagnostic-source-search" type="search" placeholder="Filter source ID, type, label, event type" aria-label="Filter diagnostic sources"><label>Sort <select id="diagnostic-source-sort"><option value="sourceId">Source ID</option><option value="type">Source type</option><option value="events">Most events</option><option value="errors">Most errors</option><option value="window">Longest observed window</option></select></label><button id="diagnostic-show-all" type="button">Show all sources</button><span id="diagnostic-source-count" class="muted"></span></div><div class="diag-table-wrap"><table class="diag-table"><thead><tr><th>ID / replay</th><th>Type</th><th>Label</th><th>Events</th><th>Errors</th><th>Observed window</th><th>Event evidence</th></tr></thead><tbody>${sources.map((source, index) => sourceRow(source, index, first, diagnostics.lastTime, sampled.has(source))).join("") || '<tr><td colspan="7">Not recorded.</td></tr>'}</tbody></table></div></section></section>`;
}

function insightsMarkup(model) {
  const cards = buildDiagnosticInsights(model);
  const primary = cards.filter(card => !["coverage", "gap"].includes(card.category)).slice(0, 2);
  const more = cards.filter(card => !primary.includes(card));
  const render = card => `<article class="diag-insight"><h3>${esc(card.title)}</h3><p>${esc(card.observation)}</p><p><strong>Next check:</strong> ${esc(card.nextCheck)}</p><div class="diag-tools">${card.sourceIds.map(id => `<button type="button" data-replay-source="${esc(id)}">Inspect source ${esc(id)}</button>`).join("")}</div></article>`;
  return `<section class="diag-panel"><h3>What to investigate next</h3><p class="note">Recorded observations paired with a next check. These are leads, not proven causes.</p><div class="diag-insights">${primary.map(render).join("")}</div>${more.length ? `<details class="more"><summary>More context and capture blind spots (${more.length})</summary><div class="diag-insights">${more.map(render).join("")}</div></details>` : ""}</section>`;
}

// This runtime is serialized into the standalone report without external imports.
function startDiagnostics() {
  const buttons = document.querySelectorAll("[data-diagnostic-tab-button]");
  const cards = document.querySelectorAll("[data-diagnostic-tab]");
  function tab(name) {
    cards.forEach(card => { card.hidden = card.dataset.diagnosticTab !== name; });
    buttons.forEach(button => {
      const active = button.dataset.diagnosticTabButton === name;
      button.classList.toggle("is-on", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  buttons.forEach(button => button.addEventListener("click", () => tab(button.dataset.diagnosticTabButton)));
  if (buttons.length) tab(buttons[0].dataset.diagnosticTabButton);
  const bars = Array.from(document.querySelectorAll(".diag-timeline i"));
  const start = document.getElementById("diag-range-start"), end = document.getElementById("diag-range-end");
  const byteRate = document.getElementById("diag-byte-rate");
  let selected = "events";
  const recorded = (bar, key) => bar.dataset[key] == null || bar.dataset[key] === "" ? null : Number(bar.dataset[key]);
  function series() {
    if (!start || !end) return;
    const lo = Number(start.value), hi = Number(end.value), span = Math.max(1, hi - lo);
    const visible = bars.filter(bar => Number(bar.dataset.end) >= lo && Number(bar.dataset.start) <= hi);
    const rate = /Bytes$/.test(selected) && byteRate?.checked;
    const chartValue = bar => { const value = recorded(bar, selected), width = Number(bar.dataset.end) - Number(bar.dataset.start); return value == null ? null : rate ? (width > 0 ? value * 1000 / width : null) : value; };
    const values = visible.map(chartValue).filter(value => value != null && Number.isFinite(value));
    const maximum = values.length ? Math.max(...values) : null;
    const scale = Math.max(1, maximum || 0);
    const button = document.querySelector('[data-diag-series="' + selected + '"]');
    const label = button ? button.textContent : selected;
    document.getElementById("diag-chart-label").textContent = label + (maximum == null ? ": not recorded in this range" : ": 0 to " + maximum.toLocaleString() + (/Bytes$/.test(selected) ? (rate ? " bytes/second (bucket average)" : " bytes per bucket") : " per bucket")) + ". Hover for exact values.";
    bars.forEach(bar => {
      const value = chartValue(bar), from = Math.max(lo, Number(bar.dataset.start)), to = Math.min(hi, Number(bar.dataset.end));
      bar.hidden = to < from || value == null || !Number.isFinite(value);
      bar.style.left = ((from - lo) / span * 100) + "%";
      bar.style.width = Math.max(0, (to - from) / span * 100) + "%";
      bar.style.height = value == null || !Number.isFinite(value) ? "0" : Math.max(0, value) / scale * 100 + "%";
      bar.title = "+" + Number(bar.dataset.start).toFixed(1) + " to +" + Number(bar.dataset.end).toFixed(1) + " ms: " + label + " = " + (value == null ? "not recorded" : value + (rate ? " bytes/second" : ""));
    });
    const chartWidth = document.querySelector(".diag-timeline").clientWidth || 1000;
    document.querySelector(".diag-axis").setAttribute("viewBox", "0 0 " + chartWidth + " 24");
    document.getElementById("diag-axis-mid").setAttribute("x", String(chartWidth / 2));
    document.getElementById("diag-axis-end").setAttribute("x", String(chartWidth));
    for (const [id, value] of [["start", lo], ["mid", (lo + hi) / 2], ["end", hi]]) document.getElementById("diag-axis-" + id).textContent = "+" + value.toFixed(1) + " ms";
    document.querySelectorAll("[data-diag-series]").forEach(item => { item.classList.toggle("is-on", item.dataset.diagSeries === selected); item.setAttribute("aria-pressed", String(item.dataset.diagSeries === selected)); });
  }
  document.querySelectorAll("[data-diag-series]").forEach(button => button.addEventListener("click", () => { selected = button.dataset.diagSeries; series(); }));
  if (start) start.addEventListener("input", () => { if (Number(start.value) > Number(end.value)) end.value = start.value; series(); });
  if (end) end.addEventListener("input", () => { if (Number(end.value) < Number(start.value)) start.value = end.value; series(); });
  if (byteRate) byteRate.addEventListener("change", series);
  const chart = document.querySelector(".diag-timeline");
  if (chart && typeof ResizeObserver !== "undefined") new ResizeObserver(series).observe(chart);
  series();
  const input = document.getElementById("diagnostic-source-search"), rows = Array.from(document.querySelectorAll(".diag-source"));
  const sort = document.getElementById("diagnostic-source-sort"), show = document.getElementById("diagnostic-show-all"), count = document.getElementById("diagnostic-source-count");
  let all = false;
  function filter() {
    if (!input || !count) return;
    const q = input.value.toLowerCase();
    let matching = 0, visible = 0;
    rows.forEach(row => {
      const matches = !q || row.dataset.search.includes(q);
      if (matches) matching++;
      row.hidden = !(matches && (all || visible < 250));
      if (!row.hidden) visible++;
    });
    count.textContent = "Showing " + visible + " of " + matching + " matching sources";
    show.hidden = all || matching <= 250;
  }
  if (sort) sort.addEventListener("change", () => {
    const key = sort.value;
    rows.sort((a, b) => key === "type" || key === "sourceId" ? String(a.dataset[key]).localeCompare(String(b.dataset[key]), undefined, {numeric:true}) : Number(b.dataset[key] || -1) - Number(a.dataset[key] || -1));
    if (rows.length) { const parent = rows[0].parentNode; for (const row of rows) parent.appendChild(row); }
    filter();
  });
  if (input) input.addEventListener("input", filter);
  if (show) show.addEventListener("click", () => { all = true; filter(); });
  filter();
}

export function diagnosticsScript() {
  return `<script>(${startDiagnostics.toString()})();</script>`;
}
