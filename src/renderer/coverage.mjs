/** Coverage tab: a map of the request path with what the capture recorded at each stage. */

import { STATUS_LABELS } from "../coverage.mjs";

const ORDER = ["recorded", "partial", "missing", "never"];
const GLYPHS = { recorded: "✓", partial: "◐", missing: "○", never: "×" };

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function coverageCss() {
  return `.coverage{display:grid;gap:20px}.coverage h2{margin:0}.cov-lead{margin:6px 0 0;color:var(--text-muted)}.st-recorded{--st:var(--success)}.st-partial{--st:var(--warning)}.st-missing{--st:var(--danger)}.st-never{--st:var(--unknown)}
.cov-legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin:0;padding:0;list-style:none;font-size:12px;color:var(--text-muted)}.cov-legend li{display:flex;align-items:center;gap:6px}
.cov-glyph{display:inline-flex;align-items:center;justify-content:center;flex:none;width:20px;height:20px;border-radius:50%;border:1.5px solid var(--st);color:var(--st);font:700 11px/1 var(--font-mono)}.st-never .cov-glyph{border-style:dashed}
.cov-map{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;margin:0;padding:0;list-style:none}.cov-map li{position:relative}.cov-map li:not(:last-child)::after{content:"";position:absolute;top:50%;right:-11px;width:8px;height:8px;border-top:2px solid var(--text-muted);border-right:2px solid var(--text-muted);transform:translateY(-50%) rotate(45deg)}
.cov-tile{display:grid;gap:8px;height:100%;padding:12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);text-decoration:none}.cov-tile:hover{border-color:var(--secondary)}.cov-tile strong{font-size:14px}.cov-tile small{color:var(--text-muted);line-height:1.4}
.cov-bar{display:flex;gap:2px;height:8px;overflow:hidden;border-radius:99px;background:var(--canvas)}.cov-bar i{display:block;background:var(--st)}.cov-bar i.st-never{background:repeating-linear-gradient(135deg,var(--st) 0 3px,transparent 3px 6px)}
.cov-counts{font:11px var(--font-mono);color:var(--text-muted)}
.cov-stage{padding:16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}.cov-stage h3{margin:0}.cov-stage>p{margin:4px 0 8px;color:var(--text-muted)}
.cov-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:4px 12px;align-items:start;padding:10px 0;border-top:1px solid var(--border)}.cov-item .cov-glyph{margin-top:1px}.cov-item strong{font-size:13px}.cov-item p{grid-column:2;margin:0;color:var(--text-muted);font-size:12px;line-height:1.5;overflow-wrap:anywhere}
.cov-status{padding:2px 8px;border:1px solid var(--st);border-radius:99px;color:var(--st);font-size:11px;font-weight:600;white-space:nowrap}
.cov-next{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.cov-step{display:grid;gap:6px;align-content:start;padding:14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--canvas)}.cov-step h4{margin:0;font-size:13px}.cov-step p{margin:0;font-size:12px;color:var(--text-muted);line-height:1.5}
.cov-covers{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}.cov-covers li{padding:1px 8px;border:1px solid var(--border);border-radius:99px;font-size:11px;color:var(--text-muted)}
@media(max-width:1100px){.cov-map{grid-template-columns:repeat(2,minmax(0,1fr))}.cov-map li::after{display:none}}@media(max-width:600px){.cov-map{grid-template-columns:1fr}.cov-item{grid-template-columns:auto minmax(0,1fr)}.cov-status{grid-column:2;justify-self:start}}`;
}

function bar(items) {
  return `<span class="cov-bar" aria-hidden="true">${ORDER.map(status => {
    const n = items.filter(entry => entry.status === status).length;
    return n ? `<i class="st-${status}" style="flex:${n}"></i>` : "";
  }).join("")}</span>`;
}

function legend() {
  return `<ul class="cov-legend" aria-label="Status key">${ORDER.map(status => `<li class="st-${status}"><span class="cov-glyph" aria-hidden="true">${GLYPHS[status]}</span>${esc(STATUS_LABELS[status])}</li>`).join("")}</ul>`;
}

function itemRow(entry) {
  return `<div class="cov-item st-${entry.status}"><span class="cov-glyph" aria-hidden="true">${GLYPHS[entry.status]}</span><strong>${esc(entry.label)}</strong><span class="cov-status">${esc(STATUS_LABELS[entry.status])}</span><p>${esc(entry.detail)}</p></div>`;
}

function labelFor(coverage, id) {
  for (const stage of coverage.stages) for (const entry of stage.items) if (entry.id === id) return entry.label;
  return id;
}

function step(coverage, entry) {
  const title = entry.link ? `<a href="${esc(entry.link)}" target="_blank" rel="noopener noreferrer">${esc(entry.title)}</a>` : esc(entry.title);
  return `<article class="cov-step"><h4>${title}</h4><p>${esc(entry.why)}</p><ul class="cov-covers" aria-label="Fills these gaps">${entry.covers.map(id => `<li>${esc(labelFor(coverage, id))}</li>`).join("")}</ul></article>`;
}

/** Renders the inner section; the report supplies the surrounding view. */
export function renderCoverage(coverage) {
  const { summary } = coverage;
  const all = coverage.stages.flatMap(stage => stage.items);
  const lead = `Of ${all.length} things worth knowing about a slow page, this capture recorded ${summary.recorded}, partly recorded ${summary.partial}, could have recorded ${summary.missing} more, and cannot record ${summary.never} by design. What is not recorded is not evidence that it was fine.`;
  const counts = `${summary.recorded} recorded · ${summary.partial} partial · ${summary.missing} not in this file · ${summary.never} never in a NetLog`;
  return `<section class="coverage" id="coverage"><header><h2>What this capture could and could not see</h2><p class="cov-lead">${esc(lead)}</p></header>
<div><ol class="cov-map" aria-label="The request path from the page to the server">${coverage.stages.map(stage => {
    const recorded = stage.items.filter(entry => entry.status === "recorded").length;
    return `<li><a class="cov-tile" href="#cov-${esc(stage.id)}"><strong>${esc(stage.title)}</strong><small>${esc(stage.blurb)}</small>${bar(stage.items)}<span class="cov-counts">${recorded} of ${stage.items.length} recorded</span></a></li>`;
  }).join("")}</ol><p class="cov-counts">${esc(counts)}</p>${legend()}</div>
${coverage.stages.map(stage => `<section class="cov-stage" id="cov-${esc(stage.id)}"><h3>${esc(stage.title)}</h3><p>${esc(stage.blurb)}</p>${stage.items.map(itemRow).join("")}</section>`).join("")}
<section class="cov-stage"><h3>Worth capturing next</h3><p>Collect these separately to fill the gaps above. SocketMap does not read them yet; use them alongside this report.</p><div class="cov-next">${coverage.next.map(entry => step(coverage, entry)).join("")}</div></section></section>`;
}
