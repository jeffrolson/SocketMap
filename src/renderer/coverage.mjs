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
.coverage .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cov-cmp{padding:16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}.cov-cmp h3{margin:0}.cov-cmp>p{margin:4px 0 12px;color:var(--text-muted)}
.cmp-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;margin:0 0 10px}.cmp-toggle{width:16px;height:16px;accent-color:var(--secondary)}.cmp-bar label{display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer}
.cmp-key{display:flex;gap:16px;margin:0;padding:0;list-style:none;font-size:12px;color:var(--text-muted)}.cmp-key li{display:flex;align-items:center;gap:6px}
.coverage>*,.cov-cmp{min-width:0}.cov-tablewrap{position:relative;overflow-x:auto;max-width:100%}.cov-cmp,.cov-stage{position:relative}.cov-compare{width:100%;min-width:980px;table-layout:fixed;border-collapse:separate;border-spacing:0;font-size:11.5px}
.cov-compare th,.cov-compare td{padding:7px 8px;text-align:left;vertical-align:top;border-bottom:1px solid var(--border);overflow-wrap:anywhere;white-space:normal;text-transform:none;letter-spacing:0;font-family:var(--font-sans)}
.cov-compare col.c-q{width:17%}.cov-compare col.c-live{width:15%}
.cov-compare thead th{background:var(--surface);color:var(--text);border-bottom:2px solid var(--border-strong,var(--border));z-index:2}.cov-compare thead small{display:block;margin-top:2px;color:var(--text-muted);font-weight:400;line-height:1.35}.cov-compare thead a{color:inherit}
.cov-compare thead th.cmp-this{background:color-mix(in srgb,var(--secondary) 12%,var(--surface));box-shadow:inset 0 3px 0 var(--secondary)}
.cov-compare .cmp-group th{background:var(--canvas);color:var(--text-muted);font:600 11px var(--font-mono);letter-spacing:.06em;text-transform:uppercase}
.cmp-row th{font-weight:600;color:var(--text)}.cmp-row:hover th,.cmp-row:hover td{background:color-mix(in srgb,var(--text) 5%,transparent)}
.cmp-live{background:color-mix(in srgb,var(--secondary) 7%,transparent)}.cmp-live .cov-status{display:inline-block}.cmp-live small{margin-left:6px;font:11px var(--font-mono);color:var(--text)}
.cmp-note{display:block;margin-top:2px;color:var(--text-muted);font-size:11px;line-height:1.35}
.cmp-mark{display:inline-block;width:14px;font:700 13px/1 var(--font-mono)}.lv-2 .cmp-mark{color:var(--success)}.lv-1 .cmp-mark{color:var(--warning)}.lv-0 .cmp-mark{color:var(--text-faint,var(--text-muted))}.lv-0{color:var(--text-muted)}
.cmp-about th,.cmp-about td{background:var(--canvas);font-size:11px;line-height:1.4}.cmp-about th{color:var(--text-muted);font-weight:600}.cmp-about td{color:var(--text)}.cmp-about-first th,.cmp-about-first td{border-top:2px solid var(--border-strong,var(--border))}
.cov-cmp:has(#cov-gaps:checked) tr.is-seen{display:none}
.cov-symptoms{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}.cov-symptoms th,.cov-symptoms td{padding:9px 8px;text-align:left;vertical-align:top;border-bottom:1px solid var(--border)}.cov-symptoms th{color:var(--text-muted);font-weight:600}.cov-symptoms td:first-child{font-weight:600;width:28%}.cov-symptoms td:nth-child(2){width:22%}
.cmp-chip{display:inline-block;margin:0 4px 4px 0;padding:1px 8px;border:1px solid var(--secondary);border-radius:99px;font-size:11px}
@media(min-width:1240px){.cov-tablewrap{overflow:visible}.cov-compare{min-width:0}.cov-compare thead th{position:sticky;top:var(--topbar-h,0)}}
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

const LEVELS = { 2: ["●", "Sees it well"], 1: ["◐", "Sees part of it"], 0: ["–", "Does not show this"] };

function toolCell(cell) {
  const [glyph, words] = LEVELS[cell.level];
  return `<td class="lv-${cell.level}"><span class="cmp-mark" aria-hidden="true">${glyph}</span><span class="sr">${words}${cell.note ? ": " : ""}</span>${cell.note ? `<span class="cmp-note">${esc(cell.note)}</span>` : ""}</td>`;
}

function compareRow(row) {
  const seen = row.live.status === "recorded";
  const [first, ...rest] = row.cells;
  const live = `<td class="cmp-live st-${row.live.status}" title="${esc(row.live.detail)}"><span class="cov-status">${esc(STATUS_LABELS[row.live.status])}</span>${row.live.short ? `<small>${esc(row.live.short)}</small>` : ""}${first.note ? `<span class="cmp-note">${esc(first.note)}</span>` : ""}</td>`;
  return `<tr class="cmp-row${seen ? " is-seen" : ""}"><th scope="row">${esc(row.label)}</th>${live}${rest.map(toolCell).join("")}</tr>`;
}

function toolName(tool) {
  return tool.link ? `<a href="${esc(tool.link)}" target="_blank" rel="noopener noreferrer">${esc(tool.name)}</a>` : esc(tool.name);
}

function comparisonSection(coverage) {
  const { tools, groups, about, symptoms } = coverage.comparison;
  const nameOf = (id) => id === "repeat" ? "Repeat capture (Compare two captures)" : (tools.find(tool => tool.id === id) || { name: id }).name;
  const head = tools.map((tool, index) => index === 0
    ? `<th scope="col" class="cmp-this"><strong>This capture</strong><small>${esc(coverage.comparison.loaded && coverage.comparison.loaded.includes("har") ? "NetLog + HAR" : tool.name)}: ${esc(tool.how)}</small></th>`
    : `<th scope="col"><strong>${toolName(tool)}</strong><small>${esc(tool.how)}</small></th>`).join("");
  const body = groups.map(group => {
    const gaps = group.rows.some(row => row.live.status !== "recorded");
    return `<tr class="cmp-group${gaps ? "" : " is-seen"}"><th colspan="${tools.length + 1}">${esc(group.title)}</th></tr>${group.rows.map(compareRow).join("")}`;
  }).join("");
  const aboutRows = about.map((entry, index) => `<tr class="cmp-about${index === 0 ? " cmp-about-first" : ""}"><th scope="row">${esc(entry.label)}</th>${entry.values.map(value => `<td>${esc(value)}</td>`).join("")}</tr>`).join("");
  const legend = [2, 1, 0].map(level => `<li class="lv-${level}"><span class="cmp-mark" aria-hidden="true">${LEVELS[level][0]}</span>${esc(LEVELS[level][1])}</li>`).join("");
  return `<section class="cov-cmp" id="cov-compare"><h3>Which tool sees what</h3><p>Every way to look at a page load, side by side. The first column is your capture, measured. The other columns describe what each tool can show in general. SocketMap reads a NetLog and, optionally, a HAR; it does not read the others yet.</p>
<div class="cmp-bar"><input type="checkbox" id="cov-gaps" class="cmp-toggle"><label for="cov-gaps">Show only what this capture is missing</label><ul class="cmp-key" aria-label="Key">${legend}</ul></div>
<div class="cov-tablewrap"><table class="cov-compare"><colgroup><col class="c-q"><col class="c-live"></colgroup><thead><tr><th scope="col">Question</th>${head}</tr></thead><tbody>${body}${aboutRows}</tbody></table></div>
<h4>If you see this, add that</h4><table class="cov-symptoms"><thead><tr><th>If you see this</th><th>Add</th><th>Why</th></tr></thead><tbody>${symptoms.map(entry => `<tr><td>${esc(entry.see)}</td><td>${entry.add.map(id => `<span class="cmp-chip">${esc(nameOf(id))}</span>`).join("")}</td><td>${esc(entry.why)}</td></tr>`).join("")}</tbody></table></section>`;
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
${coverage.comparison ? comparisonSection(coverage) : ""}
${coverage.stages.map(stage => `<section class="cov-stage" id="cov-${esc(stage.id)}"><h3>${esc(stage.title)}</h3><p>${esc(stage.blurb)}</p>${stage.items.map(itemRow).join("")}</section>`).join("")}
<section class="cov-stage"><h3>Worth capturing next</h3><p>Collect these to fill the gaps above. SocketMap reads a HAR as an optional second file; use the others alongside this report.</p><div class="cov-next">${coverage.next.map(entry => step(coverage, entry)).join("")}</div></section></section>`;
}
