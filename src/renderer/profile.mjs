/** Views for a DevTools Performance profile: the Overview panel, the waterfall's main-thread band, and a per-request block. HTML and CSS only. */

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const num = (value) => Math.round(value).toLocaleString("en-US");
const dur = (value) => value == null ? "not recorded" : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
const pctText = (value) => value == null ? "-" : `${Math.round(value * 100)}%`;
const fileOf = (url) => (String(url || "").split("?")[0].split("/").filter(Boolean).slice(-1)[0]) || "inline or unknown script";
const hostOf = (url) => { try { return new URL(url).host; } catch { return ""; } };

export function profileCss() {
  return `.prf{display:grid;gap:18px}.prf h2{margin:0}.prf h3{margin:0;font-size:13px}.prf .note{margin:4px 0 0}
.prf-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.prf-tile{display:grid;gap:8px;align-content:start;padding:16px;border:1px solid var(--border);border-radius:var(--radius);background:linear-gradient(160deg,color-mix(in srgb,var(--warning) 9%,var(--surface)),var(--surface) 62%)}.prf-tile p{margin:0;color:var(--text-muted);font-size:12px;line-height:1.45}
.prf-ring{position:relative;display:grid;place-items:center;width:92px;height:92px;border-radius:50%;background:conic-gradient(var(--warning) calc(var(--pct) * 1%),var(--canvas) 0)}.prf-ring::before{content:"";position:absolute;inset:11px;border-radius:50%;background:var(--surface)}.prf-ring b{position:relative;font:700 22px var(--font-mono);color:var(--text)}
.prf-big{font:700 34px/1 var(--font-mono);color:var(--text)}.prf-big small{font-size:13px;color:var(--text-muted);font-weight:500}.prf-tile.is-hot{border-color:var(--warning)}
.prf-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0;font-size:12px}.prf-kv dt{color:var(--text-muted)}.prf-kv dd{margin:0;font:600 13px var(--font-mono);color:var(--text)}
.prf-mix{display:flex;gap:2px;height:22px;border-radius:8px;overflow:hidden;background:var(--canvas)}.prf-mix i{display:block;min-width:3px;background:var(--pm)}.pm-script{--pm:var(--warning)}.pm-layout{--pm:var(--secondary)}.pm-paint{--pm:var(--success)}.pm-parse{--pm:var(--primary)}.pm-other{--pm:var(--unknown)}
.prf-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin:8px 0 0;padding:0;list-style:none;font-size:11.5px;color:var(--text-muted)}.prf-legend li{display:flex;align-items:center;gap:5px}.prf-legend i{display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--pm)}.prf-legend b{color:var(--text);font-weight:600}
.prf-board{display:grid;gap:4px}.prf-row{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1.6fr) auto;align-items:center;gap:12px;padding:7px 10px;border-radius:var(--radius-sm);font-size:12px}.prf-row:hover{background:color-mix(in srgb,var(--warning) 8%,transparent)}
.prf-who{min-width:0}.prf-who b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.prf-who small{color:var(--text-muted)}
.prf-bar{display:block;height:10px;border-radius:99px;background:var(--canvas);overflow:hidden}.prf-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--warning),var(--danger))}.prf-val{font:12px var(--font-mono);color:var(--text-muted);white-space:nowrap}.prf-val b{color:var(--text)}
.prf-task{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 14px;padding:10px 12px;border:1px solid var(--border);border-left:3px solid var(--warning);border-radius:var(--radius);background:var(--canvas);font-size:12px}.prf-task b{font:700 14px var(--font-mono);color:var(--text)}.prf-task small{display:block;margin-top:2px;color:var(--text-muted)}
.prf-chip{display:inline-block;margin:2px 6px 2px 0;padding:1px 8px;border:1px solid var(--border);border-radius:99px;font-size:11px;color:var(--text-muted)}.prf-chip b{color:var(--text);font-weight:600}
.prf-note{margin:0;font-size:12px;line-height:1.5;color:var(--text-muted)}
.wf-mainrow{display:grid;grid-template-columns:minmax(180px,34%) 70px 64px 1fr 70px;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-muted)}.wf-mainrow .wf-track{position:relative;height:18px;background:var(--canvas);border-radius:3px;overflow:hidden}.wf-mainrow .wf-label{font-weight:600;color:var(--text)}
.prf-bin{position:absolute;top:2px;bottom:2px;background:var(--warning)}.prf-long{position:absolute;top:0;bottom:0;border:1px solid var(--danger);border-radius:2px;background:color-mix(in srgb,var(--danger) 22%,transparent);pointer-events:auto}
.wf-ms.wf-ms-paint{border-left-color:var(--success)}.wf-ms-label.wf-ms-paint{color:var(--success)}
@media(max-width:1000px){.prf-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.prf-row{grid-template-columns:minmax(0,1fr) auto}.prf-row .prf-bar{grid-column:1 / -1}}@media(max-width:900px){.wf-mainrow{grid-template-columns:1fr 60px 70px}.wf-mainrow .wf-track,.wf-mainrow .wf-proto{display:none}}@media(max-width:600px){.prf-tiles{grid-template-columns:1fr}}`;
}

function inFlight(requests, task) {
  if (task.atMs == null || !Array.isArray(requests)) return null;
  const from = task.atMs;
  const to = task.atMs + task.durMs;
  return requests.filter(r => {
    const end = r.observedEnd ?? r.end ?? (r.start != null ? r.start + (r.durationMs ?? 0) : null);
    return r.start != null && end != null && r.start < to && end > from;
  }).length;
}

/** The Overview panel. `requests` are the page's NetLog requests, used to say what was in flight during a long task. */
export function renderProfilePanel(profile, requests = null) {
  if (!profile) return "";
  const { metrics: m, mainThread: t, scripts, environment: env, alignment } = profile;
  const pct = t.loadBusyFraction == null ? 0 : Math.round(t.loadBusyFraction * 100);
  const hot = t.blockingMs >= 200;
  const b = t.breakdown;
  const mix = [["script", "Scripting", b.scriptingMs], ["layout", "Layout and style", b.layoutMs], ["paint", "Paint", b.paintMs], ["parse", "Parsing HTML", b.parseMs], ["other", "Other", b.otherMs]].filter(([, , v]) => v > 0);
  const maxScript = Math.max(1, ...scripts.slice(0, 8).map(s => s.totalMs));
  const longest = [...(t.longTasks || [])].sort((x, y) => y.durMs - x.durMs).slice(0, 8).sort((x, y) => x.startMs - y.startMs);
  const maxTask = Math.max(1, ...longest.map(task => task.durMs));
  const placed = alignment.aligned && alignment.method === "clock"
    ? "Placed on the network timeline by the browser's shared clock: no request appears in both files, but the profile starts inside this capture and its site appears in it, so both were recorded in one browser session. The main-thread band and paint lines on the waterfall come from that. Per-request script details need matching requests, so they are not shown."
    : alignment.aligned
    ? `Placed on the network timeline using ${alignment.matched} request${alignment.matched === 1 ? "" : "s"} both files recorded (${alignment.within50} agree within 50 ms). The main-thread band and paint lines on the waterfall come from that.`
    : "Not lined up with the network: no request appears in both files and their clocks do not overlap, so page code cannot be matched to individual requests. The findings here stand on their own.";
  return `<section class="card prf" id="profile"><header><h2>What the page's code was doing</h2><p class="note">From a DevTools Performance profile recorded alongside this capture. It shows the page's main thread, not the network. It is not proof of a cause: a script started by another script can be attributed to the wrong file.</p></header>
<div class="prf-tiles">
<div class="prf-tile"><div class="prf-ring" style="--pct:${pct}" role="img" aria-label="Main thread busy ${pct} percent until load"><b>${pct}%</b></div><h3>Main thread busy until load</h3><p>${esc(dur(t.loadBusyMs))} of the first ${esc(dur(t.loadWindowMs))}. The page cannot respond or paint while it is busy.</p></div>
<div class="prf-tile${hot ? " is-hot" : ""}"><div class="prf-big">${t.longTaskCount}<small> long tasks</small></div><h3>Tasks over 50 ms</h3><p>${esc(dur(t.blockingMs))} beyond the 50 ms threshold. Longest ${esc(dur(t.longestMs))}.</p></div>
<div class="prf-tile"><h3>Paint and layout</h3><dl class="prf-kv"><dt>First contentful paint</dt><dd>${esc(dur(m.fcpMs))}</dd><dt>Largest contentful paint</dt><dd>${esc(dur(m.lcpMs))}${m.lcpType ? ` <small>${esc(m.lcpType)}</small>` : ""}</dd><dt>DOMContentLoaded</dt><dd>${esc(dur(m.domContentLoadedMs))}</dd><dt>Load</dt><dd>${esc(dur(m.loadMs))}</dd><dt>Layout shift</dt><dd>${m.layoutShiftScore == null ? "not recorded" : m.layoutShiftScore.toFixed(3)}</dd></dl></div>
<div class="prf-tile"><h3>Where main-thread time went</h3><div class="prf-mix" role="img" aria-label="Main-thread time by kind">${mix.map(([kind, label, value]) => `<i class="pm-${kind}" style="flex:${Math.max(1, value).toFixed(1)}" title="${esc(label)}: ${esc(dur(value))}"></i>`).join("")}</div><ul class="prf-legend">${mix.map(([kind, label, value]) => `<li class="pm-${kind}"><i></i>${esc(label)} <b>${esc(dur(value))}</b></li>`).join("")}</ul></div>
</div>
${scripts.length ? `<div class="prf-board"><h3>Scripts by main-thread time</h3>${scripts.slice(0, 8).map(s => `<div class="prf-row"><span class="prf-who"><b title="${esc(s.url)}">${esc(fileOf(s.url))}</b><small>${esc(hostOf(s.url) || "inline in the page")}</small></span><span class="prf-bar"><i style="width:${(s.totalMs / maxScript * 100).toFixed(1)}%"></i></span><span class="prf-val"><b>${esc(dur(s.totalMs))}</b>${s.compileMs >= 1 ? ` · compile ${esc(dur(s.compileMs))}` : ""}${s.calls ? ` · ${s.calls} calls` : ""}</span></div>`).join("")}<p class="prf-note">Time is counted once even when a script's calls nest inside each other.</p></div>` : ""}
${longest.length ? `<div class="prf-board"><h3>The longest tasks</h3>${longest.map(task => { const flying = inFlight(requests, task); return `<div class="prf-task"><b>${esc(dur(task.durMs))}</b><span>at +${esc(dur(task.startMs))} into the page${flying == null ? "" : ` · ${flying} request${flying === 1 ? "" : "s"} in flight`}<small>${task.top.length ? task.top.map(s => `<span class="prf-chip"><b>${esc(fileOf(s.url))}</b> ${esc(dur(s.ms))}</span>`).join("") : "no script recorded"}${task.layoutMs > 5 ? `<span class="prf-chip">layout <b>${esc(dur(task.layoutMs))}</b></span>` : ""}${task.paintMs > 5 ? `<span class="prf-chip">paint <b>${esc(dur(task.paintMs))}</b></span>` : ""}${task.parseMs > 5 ? `<span class="prf-chip">parsing <b>${esc(dur(task.parseMs))}</b></span>` : ""}</small><span class="prf-bar" style="margin-top:6px"><i style="width:${(task.durMs / maxTask * 100).toFixed(1)}%"></i></span></span></div>`; }).join("")}</div>` : `<p class="prf-note">No task on the page's main thread ran longer than 50 ms.</p>`}
<p class="prf-note">${esc(placed)}</p>
<p class="prf-note">${env.cores != null || env.memoryGb != null ? `Recorded on a computer with ${env.cores ?? "an unknown number of"} cores${env.memoryGb != null ? ` and ${env.memoryGb} GB of memory` : ""}. Load on the machine is not recorded. ` : ""}Responsiveness (INP) needs a real interaction and is not in a load profile.</p>
</section>`;
}

/** The waterfall's main-thread row. Empty unless the profile is placed on the timeline. */
export function renderMainThreadBand(profile, page, span) {
  if (!profile?.alignment?.aligned || !page || page.startMs == null || !(span > 0)) return "";
  const t = profile.mainThread;
  const startAt = t.bandStartAt;
  if (startAt == null) return "";
  const pos = (atMs, lengthMs) => {
    const left = Math.max(0, (atMs - page.startMs) / span * 100);
    const right = Math.min(100, (atMs + lengthMs - page.startMs) / span * 100);
    return right > left ? { left, width: right - left } : null;
  };
  const bins = (t.bins || []).map((busy, i) => busy >= 0.04 ? { busy, box: pos(startAt + i * t.binMs, t.binMs) } : null).filter(x => x && x.box)
    .map(({ busy, box }) => `<i class="prf-bin" style="left:${box.left.toFixed(2)}%;width:${box.width.toFixed(2)}%;opacity:${(0.25 + busy * 0.75).toFixed(2)}"></i>`).join("");
  const longs = (t.longTasks || []).filter(task => task.atMs != null).map(task => ({ task, box: pos(task.atMs, task.durMs) })).filter(x => x.box)
    .map(({ task, box }) => `<b class="prf-long" style="left:${box.left.toFixed(2)}%;width:${box.width.toFixed(2)}%" title="Long task ${esc(dur(task.durMs))}${task.top.length ? `: ${esc(fileOf(task.top[0].url))}` : ""}"></b>`).join("");
  return `<div class="wf-mainrow" title="How busy the page's main thread was, from the Performance profile. Long tasks (over 50 ms) are outlined."><span class="wf-label">Main thread (profile)</span><span class="wf-status"></span><span class="wf-proto"></span><span class="wf-track">${bins}${longs}</span><span class="wf-time">${esc(pctText(t.busyFraction))} busy</span></div>`;
}

/** The block inside one request's detail, from the profile's own view of that request. */
export function renderProfileSource(entry) {
  if (!entry || (!entry.stack && !entry.renderBlocking)) return "";
  const blocking = entry.renderBlocking && entry.renderBlocking !== "non_blocking";
  const stack = entry.stack ? `Requested by ${entry.stack.fn ? `${esc(entry.stack.fn)}() in ` : ""}${esc(fileOf(entry.stack.url))}${entry.stack.line != null ? `:${entry.stack.line}` : ""}.` : "";
  return `<div class="enr-src"><h4>From the profile</h4>${blocking ? `<p><b>Render-blocking:</b> the profile marks this request as holding back first paint (${esc(entry.renderBlocking)}).</p>` : ""}${stack ? `<p>${stack}</p>` : ""}</div>`;
}
