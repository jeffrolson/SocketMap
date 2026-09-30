/** Views for a Lighthouse report: the Overview panel and a per-request block. HTML and CSS only. */

import { scoreLevel } from "../lighthouse.mjs";

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const dur = (value) => value == null ? "not recorded" : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
const size = (bytes) => bytes == null ? null : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
const fileOf = (url) => (String(url || "").split("?")[0].split("/").filter(Boolean).slice(-1)[0]) || url || "unknown";
const hostOf = (url) => { try { return new URL(url).host; } catch { return ""; } };

export function lighthouseCss() {
  return `.lh{display:grid;gap:18px}.lh h2{margin:0}.lh h3{margin:0;font-size:13px}.lh .note{margin:4px 0 0}
.lh-top{display:grid;grid-template-columns:auto minmax(0,1fr);gap:22px;align-items:center}.lh-ring{position:relative;display:grid;place-items:center;width:104px;height:104px;border-radius:50%;background:conic-gradient(var(--lh) calc(var(--pct) * 1%),var(--canvas) 0)}.lh-ring::before{content:"";position:absolute;inset:11px;border-radius:50%;background:var(--surface)}.lh-ring b{position:relative;font:700 30px var(--font-mono);color:var(--text)}
.lh-good{--lh:var(--success)}.lh-fair{--lh:var(--warning)}.lh-poor{--lh:var(--danger)}.lh-unknown{--lh:var(--unknown)}
.lh-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.lh-metric{padding:11px 13px;border:1px solid var(--border);border-left:3px solid var(--lh);border-radius:var(--radius);background:var(--canvas)}.lh-metric h3{color:var(--text-muted);font-weight:500}.lh-metric b{display:block;margin-top:3px;font:700 20px var(--font-mono);color:var(--text)}
.lh-board{display:grid;gap:8px}.lh-find{padding:11px 13px;border:1px solid var(--border);border-left:3px solid var(--lh);border-radius:var(--radius);background:var(--canvas);font-size:12.5px}.lh-find b{display:block}.lh-find .sv{float:right;font:600 12px var(--font-mono);color:var(--text-muted)}.lh-find ul{margin:6px 0 0;padding:0;list-style:none;display:grid;gap:2px;font:11.5px var(--font-mono);color:var(--text-muted)}.lh-find li{display:flex;justify-content:space-between;gap:12px}.lh-find li span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lh-mix{display:flex;gap:2px;height:20px;border-radius:8px;overflow:hidden;background:var(--canvas)}.lh-mix i{display:block;min-width:3px;background:var(--pm)}.lh-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin:8px 0 0;padding:0;list-style:none;font-size:11.5px;color:var(--text-muted)}
.lh-row{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1.6fr) auto;gap:12px;align-items:center;padding:6px 10px;font-size:12px}.lh-row .bar{display:block;height:9px;border-radius:99px;background:var(--canvas);overflow:hidden}.lh-row .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--warning),var(--danger))}
.lh-note{margin:0;font-size:12px;line-height:1.5;color:var(--text-muted)}
@media(max-width:1000px){.lh-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.lh-top{grid-template-columns:1fr}}`;
}

const MIX_COLORS = ["var(--warning)", "var(--secondary)", "var(--success)", "var(--primary)", "var(--unknown)", "var(--danger)"];

/** The Overview panel for a Lighthouse report. */
export function renderLighthousePanel(lh) {
  if (!lh) return "";
  const d = lh.source;
  const perf = d.categories.find(c => c.id === "performance") || d.categories[0];
  const pct = perf?.score == null ? 0 : Math.round(perf.score * 100);
  const level = scoreLevel(perf?.score);
  const lab = `${d.formFactor ? `${d.formFactor} ` : ""}${d.throttlingMethod === "simulate" ? "with simulated throttling (modeled estimates)" : d.throttlingMethod === "devtools" ? "with throttling applied in the browser" : "without throttling"}${d.throttling.cpuSlowdown ? `, CPU ${d.throttling.cpuSlowdown}x slower` : ""}`;
  const metrics = Object.values(d.metrics).filter(Boolean);
  const totalMain = d.mainThread.reduce((sum, item) => sum + item.ms, 0) || 1;
  const maxScript = Math.max(1, ...d.scripts.map(s => s.totalMs || 0));
  const gap = lh.gapMinutes;
  const join = lh.join.urlsNamed ? `${lh.join.urlsInCapture} of the ${lh.join.urlsNamed} URLs Lighthouse named appear in this capture${lh.join.requestsNamed ? `, and are marked in the waterfall's request details` : ""}.` : "Lighthouse named no URLs to match.";
  return `<section class="card lh" id="lighthouse"><header><h2>What Lighthouse measured (a separate lab load)</h2><p class="note">Lighthouse loaded the page itself ${esc(lab)}, ${gap == null ? "at a time not compared with the capture" : Math.abs(gap) < 2 ? "at about the same time as the capture" : `${Math.abs(gap)} minutes ${gap > 0 ? "after" : "before"} the capture started`}. Its numbers are estimates from that load, not what happened in this capture, so use them to see what a clean run would flag, and do not set them against the capture's timings. ${esc(join)}${lh.sameSite === false ? " The page it tested is not one of this capture's sites." : ""}</p></header>
<div class="lh-top"><div class="lh-ring lh-${level}" style="--pct:${pct}" role="img" aria-label="Lighthouse ${esc(perf?.title || "performance")} score ${pct}"><b>${perf?.score == null ? "-" : pct}</b></div>
<div class="lh-metrics">${metrics.map(m => `<div class="lh-metric lh-${scoreLevel(m.score)}"><h3>${esc(m.label)}</h3><b>${esc(m.unit ? dur(m.value) : String(m.value))}</b></div>`).join("") || `<p class="lh-note">No metrics were recorded in this report.</p>`}</div></div>
${d.findings.length ? `<div class="lh-board"><h3>What Lighthouse says to look at</h3>${d.findings.map(f => `<div class="lh-find lh-${scoreLevel(f.score)}"><span class="sv">${[f.savingsMs ? `~${dur(f.savingsMs)}` : "", f.savingsBytes ? size(f.savingsBytes) : ""].filter(Boolean).join(" · ")}</span><b>${esc(f.title || f.id)}</b>${f.displayValue ? `<span class="lh-note">${esc(f.displayValue)}</span>` : ""}${f.items.length ? `<ul>${f.items.map(i => `<li><span title="${esc(i.url)}">${esc(fileOf(i.url))} <small>${esc(hostOf(i.url))}</small></span><span>${esc([i.wastedBytes ? `${size(i.wastedBytes)} wasted` : "", i.cacheLifetimeMs != null && i.cacheLifetimeMs >= 0 ? `cached ${dur(i.cacheLifetimeMs)}` : "", i.wastedMs ? `${dur(i.wastedMs)}` : ""].filter(Boolean).join(" · "))}</span></li>`).join("")}${f.itemCount > f.items.length ? `<li><span>and ${f.itemCount - f.items.length} more</span><span></span></li>` : ""}</ul>` : f.itemCount ? `<span class="lh-note">${f.itemCount} item${f.itemCount === 1 ? "" : "s"} with no request address to match</span>` : ""}</div>`).join("")}</div>` : `<p class="lh-note">Lighthouse flagged nothing below its passing score.</p>`}
${d.mainThread.length ? `<div><h3>Where main-thread time went (lab)</h3><div class="lh-mix" role="img" aria-label="Main-thread time by kind">${d.mainThread.map((item, i) => `<i style="flex:${Math.max(1, item.ms / totalMain * 100).toFixed(1)};--pm:${MIX_COLORS[i % MIX_COLORS.length]}" title="${esc(item.label)}: ${esc(dur(item.ms))}"></i>`).join("")}</div><ul class="lh-legend">${d.mainThread.map((item, i) => `<li><span style="color:${MIX_COLORS[i % MIX_COLORS.length]}">&#9632;</span> ${esc(item.label)} ${esc(dur(item.ms))}</li>`).join("")}</ul></div>` : ""}
${d.scripts.length ? `<div class="lh-board"><h3>Scripts by execution time (lab)</h3>${d.scripts.map(s => `<div class="lh-row"><span title="${esc(s.url)}"><b>${esc(fileOf(s.url))}</b> <small>${esc(hostOf(s.url))}</small></span><span class="bar"><i style="width:${Math.max(2, (s.totalMs || 0) / maxScript * 100).toFixed(1)}%"></i></span><span>${esc(dur(s.totalMs))}</span></div>`).join("")}</div>` : ""}
<p class="lh-note">${[d.longTasks.count ? `${d.longTasks.count} long task${d.longTasks.count === 1 ? "" : "s"}${d.longTasks.longestMs ? `, longest ${dur(d.longTasks.longestMs)}` : ""}` : "", d.totalBytes != null ? `${size(d.totalBytes)} transferred` : "", d.requestCount ? `${d.requestCount} requests` : "", d.version ? `Lighthouse ${d.version}` : ""].filter(Boolean).join(" · ")}${d.warnings.length ? `. Lighthouse warned: ${esc(d.warnings.join(" "))}` : ""}</p></section>`;
}

/** The block in a request's detail when Lighthouse named it. */
export function renderLighthouseSource(entries) {
  if (!entries?.length) return "";
  return `<div class="req-block"><h4>From Lighthouse (lab)</h4><ul>${entries.map(e => `<li><b>${esc(e.title || e.id)}</b>${e.similar ? " <small>(same address without the query string)</small>" : ""}${e.wastedBytes ? `: ${esc(size(e.wastedBytes))} of ${esc(size(e.totalBytes) || "unknown size")} unused` : ""}${e.cacheLifetimeMs != null && e.cacheLifetimeMs >= 0 ? `, cache lifetime ${esc(dur(e.cacheLifetimeMs))}` : ""}${e.wastedMs ? `, ${esc(dur(e.wastedMs))}` : ""}</li>`).join("")}</ul></div>`;
}
