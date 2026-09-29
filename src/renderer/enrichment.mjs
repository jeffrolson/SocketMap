/** Views for a HAR read alongside the NetLog: the Overview panel, a per-request block, and waterfall milestones. HTML and CSS only. */

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const bytes = (value) => value == null ? "not recorded" : value >= 1048576 ? `${(value / 1048576).toFixed(1)} MB` : value >= 1024 ? `${Math.round(value / 1024).toLocaleString("en-US")} KB` : `${value} B`;
const secs = (value) => `${(value / 1000).toFixed(2)} s`;
const TYPE_CLASS = { document: "rt-doc", script: "rt-script", stylesheet: "rt-style", image: "rt-image", font: "rt-font", xhr: "rt-data", fetch: "rt-data", media: "rt-image" };
export const typeClass = (type) => TYPE_CLASS[type] || "rt-other";

function scriptLabel(url) {
  if (!url) return "inline script";
  let host = "";
  try { host = new URL(url).host; } catch { /* keep going without a host */ }
  const parts = url.split("?")[0].split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return last && last !== host && !/^https?:$/.test(last) ? last : "script at the site root";
}


export function enrichmentCss() {
  return `.rt-doc{--rt:var(--primary)}.rt-script{--rt:var(--warning)}.rt-style{--rt:var(--secondary)}.rt-image{--rt:var(--success)}.rt-font{--rt:color-mix(in srgb,var(--primary) 55%,var(--warning))}.rt-data{--rt:color-mix(in srgb,var(--secondary) 55%,var(--success))}.rt-other{--rt:var(--unknown)}
.enr{display:grid;gap:18px}.enr h2{margin:0}.enr h3{margin:0;font-size:13px}.enr .note{margin:4px 0 0}
.enr-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.enr-tile{display:grid;gap:10px;align-content:start;padding:16px;border:1px solid var(--border);border-radius:var(--radius);background:linear-gradient(160deg,color-mix(in srgb,var(--primary) 9%,var(--surface)),var(--surface) 60%)}.enr-tile p{margin:0;color:var(--text-muted);font-size:12px;line-height:1.45}
.enr-ring{position:relative;display:grid;place-items:center;width:92px;height:92px;border-radius:50%;background:conic-gradient(var(--primary) calc(var(--pct) * 1%),var(--canvas) 0)}.enr-ring::before{content:"";position:absolute;inset:11px;border-radius:50%;background:var(--surface)}.enr-ring b{position:relative;font:700 24px var(--font-mono);color:var(--text)}.enr-ring i{font:500 12px var(--font-mono);color:var(--text-muted);font-style:normal}
.enr-big{font:700 36px/1 var(--font-mono);color:var(--text)}.enr-big small{font-size:14px;color:var(--text-muted);font-weight:500}
.enr-types{display:flex;gap:2px;height:26px;border-radius:9px;overflow:hidden;background:var(--canvas)}.enr-types i{display:block;min-width:4px;background:var(--rt)}
.enr-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin:10px 0 0;padding:0;list-style:none;font-size:12px}.enr-legend li{display:flex;align-items:center;gap:6px;color:var(--text-muted)}.enr-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--rt)}.enr-legend b{color:var(--text);font-weight:600}
.enr-board{display:grid;gap:4px}.enr-row{display:grid;grid-template-columns:auto minmax(0,1.3fr) minmax(0,1.4fr) auto;align-items:center;gap:12px;padding:8px 10px;border-radius:var(--radius-sm);font-size:12px}.enr-row:hover{background:color-mix(in srgb,var(--primary) 8%,transparent)}
.enr-kind{display:inline-block;min-width:64px;padding:2px 9px;border:1px solid var(--st);border-radius:99px;color:var(--st);font:600 11px var(--font-mono);text-align:center}.enr-parser{--st:var(--primary)}.enr-script{--st:var(--warning)}.enr-other{--st:var(--unknown)}
.enr-who{min-width:0}.enr-who b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.enr-who small{color:var(--text-muted)}
.enr-bar{display:block;height:10px;border-radius:99px;background:var(--canvas);overflow:hidden}.enr-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--st),var(--primary));border-radius:99px}.enr-val{font:12px var(--font-mono);color:var(--text-muted);white-space:nowrap}.enr-val b{color:var(--text)}
.enr-details{border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;background:var(--canvas)}.enr-details summary{cursor:pointer;font-size:12.5px;font-weight:600}.enr-details[open] summary{margin-bottom:10px}
.enr-table{width:100%;border-collapse:collapse;font-size:12px}.enr-table th,.enr-table td{padding:6px 8px;text-align:left;vertical-align:top;border-bottom:1px solid var(--border);overflow-wrap:anywhere;text-transform:none;letter-spacing:0;white-space:normal;font-family:var(--font-sans)}.enr-table thead th{color:var(--text-muted);font-weight:600}
.enr-line{margin:0;font-size:12.5px;color:var(--text-muted)}.enr-line b{color:var(--text)}
.enr-src{margin:10px 0 0;padding:12px 14px;border:1px solid var(--border);border-left:3px solid var(--primary);border-radius:var(--radius);background:linear-gradient(160deg,color-mix(in srgb,var(--primary) 7%,var(--surface)),var(--surface))}.enr-src h4{margin:0 0 6px;font-size:12px}.enr-src p{margin:4px 0;font-size:12px;line-height:1.5}.enr-src .wf-type{margin-right:6px}
.wf-type{display:inline-block;margin-right:4px;padding:0 6px;border:1px solid var(--rt,var(--unknown));border-radius:99px;color:var(--rt,var(--unknown));font:600 10px/16px var(--font-mono);white-space:nowrap}
.wf-track .wf-ms{position:absolute;top:-3px;bottom:-3px;width:0;border-left:1px dashed var(--secondary);pointer-events:none;z-index:1}
.wf-axis .wf-ms-label{position:absolute;top:-1px;transform:translateX(-50%);font:600 10px var(--font-mono);color:var(--secondary);white-space:nowrap;background:var(--surface);padding:0 3px}
@media(max-width:1000px){.enr-tiles{grid-template-columns:1fr}.enr-row{grid-template-columns:auto minmax(0,1fr) auto}.enr-row .enr-bar{grid-column:1 / -1}}`;
}

function describe(initiator) {
  if (!initiator) return null;
  if (initiator.type === "parser") return `the HTML parser${initiator.url ? ` reading ${initiator.url.split("/").slice(-1)[0] || initiator.url}` : ""}${initiator.line != null ? `, line ${initiator.line}` : ""}`;
  if (initiator.type === "script") {
    const where = initiator.url ? `${initiator.url.split("?")[0].split("/").slice(-1)[0] || initiator.url}${initiator.line != null ? `:${initiator.line}` : ""}` : "an inline or evaluated script";
    return `${initiator.fn ? `${initiator.fn}() in ` : ""}${where}${initiator.async ? " (asynchronous)" : ""}`;
  }
  return `the browser (${initiator.type})`;
}

/** The block inside one request's detail. Empty when there is no HAR entry for it. */
export function renderRequestSource(entry) {
  if (!entry) return "";
  const asked = describe(entry.initiator);
  const answer = entry.cache === "memory" ? "the memory cache" : entry.cache === "disk" ? "the disk cache" : entry.cache ? `cache (${entry.cache})` : entry.viaServiceWorker ? "a service worker" : null;
  return `<div class="enr-src"><h4>From the HAR</h4>
<p>${entry.resourceType ? `<span class="wf-type ${typeClass(entry.resourceType)}">${esc(entry.resourceType)}</span>` : ""}${entry.mimeType ? `<span class="enr-line">${esc(entry.mimeType)}</span>` : ""}${entry.transferSize != null ? ` <span class="enr-line">· ${esc(bytes(entry.transferSize))} transferred</span>` : ""}</p>
${asked ? `<p><b>Requested by</b> ${esc(asked)}.</p>` : `<p class="enr-line">Requested by: not recorded.</p>`}
${answer ? `<p><b>Answered from</b> ${esc(answer)}${entry.cache ? ", so it never reached the network log" : ""}.</p>` : ""}</div>`;
}

/** Dashed lines for DOMContentLoaded and load, only inside the timeline. */
export function renderMilestones(enrichment, page, span) {
  const empty = { marks: "", labels: "", drawn: 0 };
  if (!enrichment?.milestones?.length || !page || page.startMs == null || !(span > 0)) return empty;
  const nearest = enrichment.milestones.reduce((best, m) => (best == null || Math.abs(m.startedAt - page.startMs) < Math.abs(best.startedAt - page.startMs) ? m : best), null);
  const items = [["DOMContentLoaded", nearest.domContentLoadedAt], ["Load", nearest.loadAt]].filter(([, at]) => at != null)
    .map(([label, at]) => ({ label, rel: at - page.startMs })).filter(item => item.rel >= 0 && item.rel <= span);
  const pct = (rel) => Math.min(100, rel / span * 100).toFixed(2);
  return {
    drawn: items.length,
    marks: items.map(item => `<i class="wf-ms" style="left:${pct(item.rel)}%" title="${esc(item.label)} ${esc(secs(item.rel))} into this page (from the HAR)"></i>`).join(""),
    labels: items.map(item => `<i class="wf-ms-label" style="left:${pct(item.rel)}%">${esc(item.label === "DOMContentLoaded" ? "DCL" : item.label)}</i>`).join("")
  };
}

/** The Overview panel: how well the HAR joined, what the page is made of, who asked for it. */
export function renderEnrichmentPanel(enrichment, pageRequests = null) {
  if (!enrichment) return "";
  const { alignment, source, types, requesters, cacheAnswers, harOnly, harOnlyReasons, milestones } = enrichment;
  const total = source.entryCount || 0;
  const pct = total ? Math.round(alignment.matched / total * 100) : 0;
  const answered = cacheAnswers.memory + cacheAnswers.disk + cacheAnswers.serviceWorker;
  const weight = types.reduce((sum, t) => sum + t.transferBytes, 0);
  const share = (t) => weight > 0 ? t.transferBytes : t.count;
  const scoped = Array.isArray(pageRequests) ? pageRequests : null;
  const inPage = scoped ? scoped.filter(r => enrichment.perRequest.has(r.id)).length : 0;
  const pageLine = scoped
    ? (scoped.length && inPage === scoped.length ? "Every request on this page has a HAR entry." : `${inPage} of this page's ${scoped.length} requests have a HAR entry.`)
    : (alignment.netlogOnly ? `${alignment.netlogOnly} page requests in the NetLog have no HAR entry.` : "Every page request in the NetLog has a HAR entry.");
  const clockTile = alignment.method === "clock"
    ? `<div class="enr-big">${alignment.medianDeltaMs == null ? "-" : esc(Math.abs(Math.round(alignment.medianDeltaMs)).toLocaleString("en-US"))}<small> ms</small></div><h3>Typical clock difference</h3><p>${alignment.within50} of ${alignment.matched} matches started within 50 ms of each other, so the two files describe the same moments.</p>`
    : `<div class="enr-big">-</div><h3>Matched by order</h3><p>This capture recorded no wall clock, so requests were paired by order, not by time, and load milestones are not placed on the timeline.</p>`;
  const reasons = Object.entries(harOnlyReasons);
  const page = milestones[0];
  const milestoneLine = page ? `<p class="enr-line"><b>From the HAR:</b> DOMContentLoaded ${page.domContentLoadedAt == null ? "not recorded" : esc(secs(page.domContentLoadedAt - page.startedAt))}, load ${page.loadAt == null ? "not recorded" : esc(secs(page.loadAt - page.startedAt))} after navigation start. Marked on the waterfall when they fall inside it. Paint, LCP and layout shift are not in a HAR.</p>` : "";
  return `<section class="card enr" id="enrichment"><header><h2>What the page is made of</h2><p class="note">From a HAR exported from DevTools alongside this capture, matched to NetLog requests by method and URL, nearest in time. Bodies, headers and cookies in the HAR are never read.</p></header>
<div class="enr-tiles">
<div class="enr-tile"><div class="enr-ring" style="--pct:${pct}" role="img" aria-label="${alignment.matched} of ${total} HAR entries matched"><b>${alignment.matched}<i>/${total}</i></b></div><h3>HAR entries matched to the NetLog</h3><p>${pageLine}</p></div>
<div class="enr-tile">${clockTile}</div>
<div class="enr-tile"><div class="enr-big">${answered}</div><h3>Answers that never reached the network log</h3><p>Memory cache ${cacheAnswers.memory} · disk cache ${cacheAnswers.disk} · service worker ${cacheAnswers.serviceWorker}. A NetLog cannot see these.</p></div>
</div>
${types.length ? `<div><h3>By type${weight > 0 ? ", sized by bytes transferred" : ""}</h3><div class="enr-types" role="img" aria-label="Resource types">${types.map(t => `<i class="${typeClass(t.type)}" style="flex:${Math.max(1, share(t))}" title="${esc(t.type)}: ${t.count} requests, ${esc(bytes(t.transferBytes))}"></i>`).join("")}</div><ul class="enr-legend">${types.map(t => `<li class="${typeClass(t.type)}"><i></i><b>${esc(t.type)}</b> ${t.count} · ${esc(bytes(t.transferBytes))}</li>`).join("")}</ul></div>` : ""}
${requesters.length ? `<div class="enr-board"><h3>Who asked for what</h3>${requesters.map(r => { const max = Math.max(1, requesters[0].count); const file = r.kind === "script" ? scriptLabel(r.url) : r.kind === "parser" ? "The HTML parser" : "The browser itself"; const host = r.kind === "script" && r.url ? (() => { try { return new URL(r.url).host; } catch { return ""; } })() : ""; return `<div class="enr-row enr-${esc(r.kind)}"><span class="enr-kind">${esc(r.kind)}</span><span class="enr-who"><b title="${esc(r.url || "")}">${esc(file)}</b><small>${esc(host || (r.kind === "parser" ? "requests found while reading the page" : "navigation, preloads and other browser requests"))}</small></span><span class="enr-bar"><i style="width:${(r.count / max * 100).toFixed(1)}%"></i></span><span class="enr-val"><b>${r.count}</b> ${r.count === 1 ? "request" : "requests"}${r.transferBytes ? ` · ${esc(bytes(r.transferBytes))}` : ""}</span></div>`; }).join("")}<p class="note">Scripts are listed by the file at the top of the call stack when the request was made. A script that starts many requests is a place to look for cascades.</p></div>` : ""}
${milestoneLine}
${harOnly.length ? `<details class="enr-details"><summary>In the HAR but not in the NetLog (${Object.values(harOnlyReasons).reduce((a, b) => a + b, 0)})</summary><p class="note">${reasons.map(([reason, n]) => `${n} ${esc(reason)}`).join(" · ")}. Redirect steps are recorded inside one NetLog request; cache and service worker answers never reach the network stack.</p><table class="enr-table"><thead><tr><th>Why</th><th>Request</th><th>Status</th></tr></thead><tbody>${harOnly.map(h => `<tr><td>${esc(h.reason)}</td><td>${esc(h.entry.method || "GET")} ${esc(String(h.entry.url || "").slice(0, 200))}</td><td>${esc(h.entry.status ?? "not recorded")}</td></tr>`).join("")}</tbody></table></details>` : ""}
</section>`;
}
