/** Overview panel for a V8 CPU profile. HTML and CSS only. */

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
const dur = (value) => value == null ? "not recorded" : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
const fileOf = (url) => (String(url || "").split("?")[0].split("/").filter(Boolean).slice(-1)[0]) || url || "unknown";
const hostOf = (url) => { try { return new URL(url).host; } catch { return ""; } };

export function cpuProfileCss() {
  return `.cpu{display:grid;gap:16px}.cpu h2{margin:0}.cpu h3{margin:0;font-size:13px}.cpu .note{margin:4px 0 0}
.cpu-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.cpu-tile{padding:14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--canvas)}.cpu-tile b{display:block;margin-top:4px;font:700 22px var(--font-mono);color:var(--text)}.cpu-tile p{margin:4px 0 0;font-size:12px;color:var(--text-muted)}
.cpu-row{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1.6fr) auto;gap:12px;align-items:center;padding:6px 10px;font-size:12px}.cpu-row .bar{display:block;height:9px;border-radius:99px;background:var(--canvas);overflow:hidden}.cpu-row .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--warning),var(--danger))}
@media(max-width:1000px){.cpu-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
}

export function renderCpuProfilePanel(cpu) {
  if (!cpu) return "";
  const maxScript = Math.max(1, ...cpu.scripts.map(s => s.selfMs));
  const maxFn = Math.max(1, ...cpu.functions.map(f => f.selfMs));
  const share = cpu.durationMs > 0 ? Math.round(cpu.busyMs / cpu.durationMs * 100) : null;
  return `<section class="card cpu" id="cpuprofile"><header><h2>Where JavaScript CPU time went</h2><p class="note">From a V8 CPU profile (${esc(dur(cpu.durationMs))}, ${esc(cpu.sampleCount.toLocaleString("en-US"))} samples${cpu.intervalMs ? `, about one every ${esc(cpu.intervalMs)} ms` : ""}). It shows JavaScript work by script and function, not the network, and it is not lined up with the waterfall. Self time is time spent in a function itself, not in what it called.</p></header>
<div class="cpu-tiles"><div class="cpu-tile"><h3>JavaScript busy</h3><b>${esc(dur(cpu.busyMs))}</b><p>${share == null ? "" : `${share}% of the profile`}</p></div><div class="cpu-tile"><h3>Garbage collection</h3><b>${esc(dur(cpu.gcMs))}</b><p>Memory clean-up pauses.</p></div><div class="cpu-tile"><h3>Idle</h3><b>${esc(dur(cpu.idleMs))}</b><p>Waiting for work.</p></div><div class="cpu-tile"><h3>Native program</h3><b>${esc(dur(cpu.programMs))}</b><p>Browser work outside JavaScript.</p></div></div>
${cpu.scripts.length ? `<div><h3>Scripts by self time</h3>${cpu.scripts.map(s => `<div class="cpu-row"><span title="${esc(s.url)}"><b>${esc(fileOf(s.url))}</b> <small>${esc(hostOf(s.url))}</small></span><span class="bar"><i style="width:${Math.max(2, s.selfMs / maxScript * 100).toFixed(1)}%"></i></span><span>${esc(dur(s.selfMs))}</span></div>`).join("")}</div>` : `<p class="note">No script time was recorded.</p>`}
${cpu.functions.length ? `<div><h3>Functions by self time (${cpu.functionCount} in total)</h3>${cpu.functions.map(f => `<div class="cpu-row"><span title="${esc(f.url)}"><b>${esc(f.name)}</b> <small>${esc(fileOf(f.url))}${f.line ? `:${f.line}` : ""}</small></span><span class="bar"><i style="width:${Math.max(2, f.selfMs / maxFn * 100).toFixed(1)}%"></i></span><span>${esc(dur(f.selfMs))}</span></div>`).join("")}</div>` : ""}</section>`;
}
