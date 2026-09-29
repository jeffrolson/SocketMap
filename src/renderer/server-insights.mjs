/** "What the servers said": server-reported timing, cache and CDN evidence. HTML and CSS only. */

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const num = (value) => Math.round(value * 10) / 10;
const ms = (value) => `${num(value).toLocaleString("en-US")} ms`;
const CACHE_LABELS = { hit: "Hit", miss: "Miss", mixed: "Mixed", other: "Other" };

export function serverInsightsCss() {
  return `.srv{display:grid;gap:18px}.srv h2{margin:0}.srv h3{margin:0;font-size:13px}.srv .note{margin:4px 0 0}
.srv-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.srv-tile{display:grid;gap:10px;align-content:start;padding:16px;border:1px solid var(--border);border-radius:var(--radius);background:linear-gradient(160deg,color-mix(in srgb,var(--secondary) 9%,var(--surface)),var(--surface) 60%)}.srv-tile p{margin:0;color:var(--text-muted);font-size:12px;line-height:1.45}
.srv-ring{position:relative;display:grid;place-items:center;width:92px;height:92px;border-radius:50%;background:conic-gradient(var(--secondary) calc(var(--pct) * 1%),var(--canvas) 0)}.srv-ring::before{content:"";position:absolute;inset:11px;border-radius:50%;background:var(--surface)}.srv-ring b{position:relative;font:700 24px var(--font-mono);color:var(--text)}.srv-ring i{font:500 12px var(--font-mono);color:var(--text-muted);font-style:normal}
.srv-big{font:700 38px/1 var(--font-mono);color:var(--text)}.srv-big small{font-size:14px;color:var(--text-muted);font-weight:500}.srv-phase{display:inline-block;width:max-content;max-width:100%;padding:2px 10px;border-radius:99px;border:1px solid var(--secondary);color:var(--secondary);font:600 12px var(--font-mono);overflow-wrap:anywhere}
.srv-nest{display:block;width:100%;position:relative;height:12px;border-radius:99px;background:var(--canvas);overflow:hidden}.srv-nest .srv-ghost,.srv-nest .srv-fill{position:absolute;left:0;top:0;bottom:0}
.srv-ghost{background:color-mix(in srgb,var(--text-muted) 46%,transparent)}.srv-fill{background:linear-gradient(90deg,var(--secondary),var(--primary));border-radius:99px}.is-over .srv-fill{background:var(--warning)}
.srv-split{display:flex;gap:2px;height:22px;border-radius:8px;overflow:hidden;background:var(--canvas)}.srv-split i{display:block;min-width:4px}.srv-hit{background:var(--success)}.srv-miss{background:var(--warning)}.srv-mixed{background:var(--secondary)}.srv-other{background:var(--unknown)}.srv-none{background:repeating-linear-gradient(135deg,var(--border) 0 3px,transparent 3px 6px)}
.srv-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0;padding:0;list-style:none;font-size:11px;color:var(--text-muted)}.srv-legend li{display:flex;align-items:center;gap:5px}.srv-legend i{display:inline-block;width:9px;height:9px;border-radius:3px}
.srv-board{display:grid;gap:4px}.srv-board h3{margin-bottom:4px}
.srv-row{display:grid;grid-template-columns:minmax(0,1.1fr) auto minmax(0,1.6fr) auto;align-items:center;gap:12px;padding:8px 10px;border:1px solid transparent;border-radius:var(--radius-sm);color:var(--text);text-decoration:none}.srv-row:hover,.srv-row:focus-visible{background:color-mix(in srgb,var(--secondary) 9%,transparent);border-color:var(--border)}
.srv-where{min-width:0;font-size:12px}.srv-where b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.srv-where small{color:var(--text-muted)}
.srv-track{display:block;min-width:0}.srv-value{font:12px var(--font-mono);color:var(--text-muted);white-space:nowrap}.srv-value b{color:var(--text)}
.srv-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.srv-panel{padding:14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--canvas)}.srv-panel h3{margin-bottom:8px}.srv-panel p{margin:8px 0 0;color:var(--text-muted);font-size:11.5px;line-height:1.45}
.srv-chip{display:inline-flex;align-items:center;gap:6px;margin:0 6px 6px 0;padding:3px 10px;border:1px solid var(--border);border-radius:99px;font-size:12px;background:var(--surface)}.srv-chip i{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--secondary)}.srv-chip small{color:var(--text-muted)}
.srv-kv{width:100%;border-collapse:collapse;font-size:12px}.srv-kv th,.srv-kv td{padding:4px 6px;text-align:left;vertical-align:top;border-bottom:1px solid var(--border);overflow-wrap:anywhere;text-transform:none;letter-spacing:0;white-space:normal;font-family:var(--font-sans)}.srv-kv td:last-child{font-family:var(--font-mono)}
.srv-id{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:12px}.srv-id code{flex:1;min-width:0;padding:2px 6px;border-radius:var(--radius-sm);background:var(--surface);font:11.5px var(--font-mono);overflow-wrap:anywhere;user-select:all}.srv-id button,.srv-detail button{padding:2px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);font-size:11px;cursor:pointer}.srv-id button:hover{border-color:var(--secondary)}
.srv-empty p{margin:6px 0 0;color:var(--text-muted);line-height:1.5}.srv-empty a{color:var(--secondary)}
.srv-detail{margin:10px 0 0;padding:12px 14px;border:1px solid var(--border);border-left:3px solid var(--secondary);border-radius:var(--radius);background:linear-gradient(160deg,color-mix(in srgb,var(--secondary) 7%,var(--surface)),var(--surface))}.srv-detail h4{margin:0 0 8px;font-size:12px}
.srv-metric{display:grid;grid-template-columns:110px minmax(0,1fr) auto;align-items:center;gap:10px;margin:0 0 6px;font-size:12px}.srv-metric b{overflow-wrap:anywhere}.srv-metric small{display:block;color:var(--text-muted);font-weight:400}
.srv-badge{display:inline-block;padding:1px 9px;border:1px solid var(--st);border-radius:99px;color:var(--st);font-size:11px;font-weight:600}.st-hit{--st:var(--success)}.st-miss{--st:var(--warning)}.st-mixed{--st:var(--secondary)}.st-other{--st:var(--unknown)}
.srv-line{margin:6px 0 0;font-size:12px;color:var(--text-muted)}.srv-line b{color:var(--text)}
.wf-bar .srv-mark{position:absolute;bottom:0;height:3px;background:var(--text);opacity:.9;pointer-events:none}
@media(max-width:1000px){.srv-tiles{grid-template-columns:1fr}.srv-row{grid-template-columns:minmax(0,1fr) auto}.srv-row .srv-track{grid-column:1 / -1}}`;
}

function nested(dur, wait, scale) {
  const ghost = wait != null ? Math.min(100, wait / scale * 100) : 0;
  const fill = Math.min(100, dur / scale * 100);
  const over = wait != null && dur > wait;
  return `<span class="srv-nest${over ? " is-over" : ""}"${over ? ' title="The server reported more than the browser waited. Phases can overlap or measure other work."' : ""}>${wait != null ? `<i class="srv-ghost" style="width:${ghost.toFixed(2)}%"></i>` : ""}<i class="srv-fill" style="width:${fill.toFixed(2)}%"></i></span>`;
}

function copyRow(id) {
  return `<div class="srv-id"><span>${esc(id.name)}</span><code>${esc(id.value)}</code><button type="button" data-copy="${esc(id.value)}">Copy</button></div>`;
}

function emptyState() {
  return `<section class="card srv srv-empty" id="server-said"><h2>What the servers said</h2>
<p>No response on this page carried Server-Timing, CDN or cache headers, timing-like headers, or request IDs. That is common: servers only report on themselves when they are set up to.</p>
<p>Waiting time therefore cannot be split into server work and network delay from this capture. To find out, ask the platform team to send the <code>Server-Timing</code> header (and to expose a request ID), then capture again and compare. See <a href="#coverage">Coverage</a> for what else could help.</p></section>`;
}

/** The Overview panel. */
export function renderServerInsights(insights) {
  if (!insights?.hasAnything) return emptyState();
  const { answered, withTiming, cache, largest, leaderboard, providers, timingHeaders, ids } = insights;
  const pct = answered ? Math.round(withTiming / answered * 100) : 0;
  const scale = Math.max(1, ...leaderboard.map(row => Math.max(row.dur, row.waitMs ?? 0)));
  const segments = [["hit", cache.hit], ["miss", cache.miss], ["mixed", cache.mixed], ["other", cache.other], ["none", cache.none]].filter(([, n]) => n > 0);
  const cacheHeadline = cache.withHeaders ? `${cache.hit} of ${cache.withHeaders} cache answers reported a hit` : "No cache or CDN headers";
  const largestTile = largest
    ? `<div class="srv-big">${esc(num(largest.dur).toLocaleString("en-US"))}<small> ms</small></div><span class="srv-phase">${esc(largest.name)}</span>${largest.waitMs != null ? nested(largest.dur, largest.waitMs, Math.max(largest.dur, largest.waitMs)) : ""}<p>${largest.waitMs != null ? `of a ${esc(ms(largest.waitMs))} wait on` : "on"} ${esc(largest.host || "")}${esc(largest.path)}${largest.waitMs == null ? ". The wait was not recorded." : ""}</p>`
    : `<div class="srv-big">-</div><p>No response reported a duration.</p>`;
  return `<section class="card srv" id="server-said"><header><h2>What the servers said</h2><p class="note">Reported by the servers in response headers, not measured by the browser. Treat it as each server's own account, and note that reported phases can overlap.</p></header>
<div class="srv-tiles">
<div class="srv-tile"><div class="srv-ring" style="--pct:${pct}" role="img" aria-label="${withTiming} of ${answered} responses reported their own timing"><b>${withTiming}<i>/${answered}</i></b></div><h3>Reported their own timing</h3><p>Responses that carried Server-Timing.</p></div>
<div class="srv-tile"><h3>${esc(cacheHeadline)}</h3><div class="srv-split" role="img" aria-label="${esc(cacheHeadline)}">${segments.map(([kind, n]) => `<i class="srv-${kind}" style="flex:${n}" title="${esc(kind === "none" ? "No cache headers" : CACHE_LABELS[kind])}: ${n}"></i>`).join("")}</div><ul class="srv-legend">${segments.map(([kind, n]) => `<li><i class="srv-${kind}"></i>${esc(kind === "none" ? "No cache headers" : CACHE_LABELS[kind])} ${n}</li>`).join("")}</ul><p>The CDN's own claim about where each answer came from.</p></div>
<div class="srv-tile"><h3>Largest reported phase</h3>${largestTile}</div>
</div>
${leaderboard.length ? `<div class="srv-board"><h3>Where servers reported spending their time</h3>${leaderboard.map(row => `<a class="srv-row" href="#req-${esc(row.id)}"><span class="srv-where"><b title="${esc(row.url)}">${esc(row.path)}</b><small>${esc(row.host || "")}</small></span><span class="srv-phase">${esc(row.name)}</span><span class="srv-track">${nested(row.dur, row.waitMs, scale)}</span><span class="srv-value"><b>${esc(ms(row.dur))}</b>${row.waitMs != null ? ` of ${esc(ms(row.waitMs))}` : " (wait not recorded)"}</span></a>`).join("")}<p class="note">Solid bar: what the server reported. Faint bar behind it: how long the browser waited. Select a row to open the request.</p></div>` : ""}
<div class="srv-facts">
${providers.length ? `<div class="srv-panel"><h3>Who is in front of the servers</h3>${providers.map(p => `<span class="srv-chip"><i></i>${esc(p.name)} <small>${esc(p.header)} · ${p.count} ${p.count === 1 ? "response" : "responses"}${p.hosts.length ? ` · ${esc(p.hosts.join(", "))}` : ""}</small></span>`).join("")}<p>A hint inferred from header names, not proof.</p></div>` : ""}
${timingHeaders.length ? `<div class="srv-panel"><h3>Other timing headers</h3><table class="srv-kv"><tbody>${timingHeaders.map(h => `<tr><th>${esc(h.name)}</th><td>${esc(h.value)}</td></tr>`).join("")}</tbody></table><p>Shown as sent. The unit and meaning are the site's own; SocketMap does not interpret them.</p></div>` : ""}
${ids.length ? `<div class="srv-panel"><h3>IDs to give the server team</h3>${ids.slice(0, 3).map(row => `<p class="srv-line"><b>${esc(row.path)}</b>${row.waitMs != null ? ` waited ${esc(ms(row.waitMs))}` : ""}</p>${row.ids.slice(0, 2).map(copyRow).join("")}`).join("")}<p>The server team can search their logs by these.</p></div>` : ""}
</div></section>`;
}

/** The block inside one request's detail. Empty when the response said nothing. */
export function renderServerDetail(info, waitMs) {
  if (!info) return "";
  const timed = info.metrics.filter(metric => metric.dur != null);
  const scale = Math.max(1, waitMs ?? 0, ...timed.map(metric => metric.dur));
  const metrics = info.metrics.map(metric => `<div class="srv-metric"><b>${esc(metric.name)}${metric.desc ? `<small>${esc(metric.desc)}</small>` : ""}</b>${metric.dur != null ? nested(metric.dur, waitMs, scale) : "<span></span>"}<span class="srv-value">${metric.dur != null ? `<b>${esc(ms(metric.dur))}</b>` : "no duration"}</span></div>`).join("");
  const cache = info.cache ? `<p class="srv-line"><span class="srv-badge st-${esc(info.cache.state)}">${esc(CACHE_LABELS[info.cache.state])}</span> <b>${esc(info.cache.header)}</b>: ${esc(info.cache.value)}${info.age != null ? `, cached copy ${esc(info.age.toLocaleString("en-US"))} s old` : ""}</p>` : info.age != null ? `<p class="srv-line">Cached copy <b>${esc(info.age.toLocaleString("en-US"))} s</b> old (age header)</p>` : "";
  const provider = info.provider ? `<p class="srv-line">Looks like <b>${esc(info.provider.name)}</b> (from ${esc(info.provider.header)})</p>` : "";
  const other = info.timingHeaders.map(h => `<p class="srv-line"><b>${esc(h.name)}</b>: ${esc(h.value)} <small>(the site's own unit and meaning)</small></p>`).join("");
  return `<div class="srv-detail"><h4>What the server said</h4>${metrics}${cache}${provider}${other}${info.ids.map(copyRow).join("")}</div>`;
}

/** Marker for the waterfall bar: a thin line under the wait segment, as wide as the largest reported phase. */
export function renderServerMark(info, request, segments) {
  if (!info?.largest) return "";
  const total = Math.max(1, request.observedDurationMs ?? request.durationMs ?? 1);
  const wait = request.timing?.wait;
  if (!(wait > 0)) return "";
  let offset = 0;
  for (const key of segments) {
    if (key === "wait") break;
    offset += request.timing?.[key] > 0 ? request.timing[key] : 0;
  }
  const left = Math.min(100, offset / total * 100);
  const width = Math.max(0, Math.min(info.largest.dur, wait) / total * 100);
  const capped = Math.min(width, 100 - left);
  return `<span class="srv-mark" style="left:${left.toFixed(2)}%;width:${capped.toFixed(2)}%" title="Server-reported time: ${esc(info.largest.name)} ${esc(ms(info.largest.dur))}"></span>`;
}
