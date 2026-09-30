/** Views for the network path helper: the Overview panel with the data, and the card that explains how to collect it. HTML and CSS only. */

import { HELPER_SH, HELPER_PS1 } from "./helper-scripts.generated.mjs";
import { isPrivateAddress, wifiQuality } from "../path.mjs";

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const dur = (value) => value == null ? "not recorded" : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
const gap = (minutes) => minutes == null ? "at an unknown time relative to the capture" : Math.abs(minutes) < 2 ? "at about the same time as the capture" : Math.abs(minutes) < 120 ? `${Math.abs(minutes)} minutes ${minutes > 0 ? "after" : "before"} the capture started` : `${Math.round(Math.abs(minutes) / 60)} hours ${minutes > 0 ? "after" : "before"} the capture started`;

export function pathCss() {
  return `.pth{display:grid;gap:18px}.pth h2{margin:0}.pth h3{margin:0;font-size:13px}.pth .note{margin:4px 0 0}
.pth-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.pth-tile{min-width:0;overflow-wrap:anywhere;display:grid;gap:8px;align-content:start;padding:16px;border:1px solid var(--border);border-radius:var(--radius);background:linear-gradient(160deg,color-mix(in srgb,var(--primary) 8%,var(--surface)),var(--surface) 62%)}
.pth-big{font:700 26px/1.1 var(--font-mono);color:var(--text)}.pth-big small{font-size:12px;color:var(--text-muted);font-weight:500}.pth-tile p{margin:0;font-size:12px;line-height:1.45;color:var(--text-muted)}
.pth-sig{display:flex;gap:3px;align-items:flex-end;height:26px}.pth-sig i{display:block;width:8px;border-radius:2px;background:var(--canvas);border:1px solid var(--border)}.pth-sig i.on{background:var(--success);border-color:var(--success)}.pth-sig.is-fair i.on{background:var(--warning);border-color:var(--warning)}.pth-sig.is-weak i.on{background:var(--danger);border-color:var(--danger)}
.pth-list li{display:flex;flex-wrap:wrap;align-items:center;gap:4px}.pth-list{display:grid;gap:3px;margin:0;padding:0;list-style:none;font:12px var(--font-mono);color:var(--text)}.pth-tag{display:inline-block;margin-left:6px;padding:0 6px;border:1px solid var(--border);border-radius:99px;font:10.5px var(--font-sans,inherit);color:var(--text-muted)}
.pth-table{width:100%;border-collapse:collapse;font-size:12px}.pth-table th,.pth-table td{padding:7px 10px;border-bottom:1px solid var(--border);text-align:right}.pth-table th:first-child,.pth-table td:first-child{text-align:left}.pth-table th{font-weight:600;color:var(--text-muted)}.pth-table td.is-slow{color:var(--danger);font-weight:600}.pth-table .sub{text-transform:none;letter-spacing:0;display:block;font-size:10.5px;color:var(--text-muted);font-weight:400}
.pth-route{display:grid;gap:2px;font:11.5px var(--font-mono)}.pth-hop{display:grid;grid-template-columns:26px 138px minmax(0,1fr) 64px;gap:8px;align-items:center;color:var(--text-muted)}.pth-hop .bar{display:block;height:8px;border-radius:99px;background:var(--canvas);overflow:hidden}.pth-hop .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--primary),var(--secondary))}.pth-hop.is-silent{opacity:.55}
.pth-find{padding:10px 12px;margin:6px 0;border:1px solid var(--border);border-left:3px solid var(--unknown);border-radius:var(--radius);background:var(--canvas);font-size:12.5px}.pth-find.is-medium{border-left-color:var(--warning)}.pth-find.is-low{border-left-color:var(--primary)}.pth-find b{display:block}.pth-find p{margin:3px 0 0;color:var(--text-muted);line-height:1.5}
.pth-card{display:grid;gap:12px;padding:16px;border:1px dashed var(--border);border-radius:var(--radius);background:var(--surface)}.pth-card h3{font-size:14px}.pth-card p{margin:0;font-size:12.5px;line-height:1.5;color:var(--text-muted)}
.pth-cmd{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;font-size:12px}.pth-cmd code{display:block;overflow:auto;white-space:nowrap;padding:8px 10px;border-radius:var(--radius-sm);background:var(--canvas);border:1px solid var(--border);font:12px var(--font-mono);color:var(--text)}.pth-cmd button,.pth-dl a{padding:6px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);font:600 12px inherit;cursor:pointer;text-decoration:none}
.pth-dl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;color:var(--text-muted)}
@media(max-width:1000px){.pth-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.pth-hop{grid-template-columns:24px 110px minmax(0,1fr) 56px}}`;
}

function signalBars(rssi) {
  const q = wifiQuality(rssi);
  const on = rssi == null ? 0 : rssi >= -55 ? 4 : rssi >= -67 ? 3 : rssi >= -75 ? 2 : 1;
  return `<div class="pth-sig is-${q || "none"}" role="img" aria-label="Wi-Fi signal ${q || "not recorded"}">${[1, 2, 3, 4].map(n => `<i class="${n <= on ? "on" : ""}" style="height:${6 + n * 5}px"></i>`).join("")}</div>`;
}

function linkTile(path) {
  const l = path.link;
  const wifi = l.type === "wifi";
  const q = wifiQuality(l.wifi.rssiDbm);
  const head = wifi ? (l.wifi.rssiDbm == null ? "Wi-Fi" : `${l.wifi.rssiDbm}<small> dBm</small>`) : l.type === "ethernet" ? "Wired" : "Link";
  const detail = wifi
    ? [q ? `Signal ${q}` : "Signal not recorded", l.wifi.channel && `channel ${l.wifi.channel}`, l.wifi.phyMode, l.wifi.txRateMbps != null && `${l.wifi.txRateMbps} Mbps link rate`, l.wifi.ssid && `network ${l.wifi.ssid}`].filter(Boolean).join(" · ")
    : [l.interface && `Interface ${l.interface}`, l.ipv4 && `address ${l.ipv4}`].filter(Boolean).join(" · ") || "No link details were recorded.";
  return `<div class="pth-tile"><h3>This computer's link</h3>${wifi ? signalBars(l.wifi.rssiDbm) : ""}<div class="pth-big">${head}</div><p>${esc(detail)}</p></div>`;
}

function dnsTile(path) {
  const servers = path.dns.servers;
  return `<div class="pth-tile"><h3>DNS servers</h3>${servers.length ? `<ul class="pth-list">${servers.map(s => `<li>${esc(s)}<span class="pth-tag">${isPrivateAddress(s) ? "private" : "public"}</span></li>`).join("")}</ul>` : `<div class="pth-big">-</div>`}<p>${servers.length ? "Which server answers name lookups on this network." : "No DNS servers were recorded."}${path.dns.searchDomains.length ? ` Search domains: ${esc(path.dns.searchDomains.join(", "))}.` : ""}</p></div>`;
}

function proxyTile(path) {
  const p = path.proxy;
  const parts = [p.autoConfigUrl && `PAC: ${p.autoConfigUrl}`, p.http && `Web: ${p.http}`, p.https && p.https !== p.http && `Secure web: ${p.https}`].filter(Boolean);
  const on = parts.length || p.autoConfigEnabled;
  return `<div class="pth-tile"><h3>Proxy settings</h3><div class="pth-big">${on ? "Set" : "None"}</div><p>${on ? esc(parts.join(" · ")) : "No system proxy or PAC file is configured on this computer."}${p.autoDetect ? " Automatic proxy detection (WPAD) is on." : ""}</p></div>`;
}

function addressTile(path) {
  return `<div class="pth-tile"><h3>Public address</h3><div class="pth-big" style="font-size:${path.publicIp && path.publicIp.length > 16 ? 15 : 22}px">${esc(path.publicIp || "not recorded")}</div><p>${path.publicIp ? `Looked up from ${esc(path.publicIpSource || "an outside service")}. It is the address servers see.` : "The helper was told not to look it up, or the lookup failed."}</p></div>`;
}

function compareTable(path) {
  if (!path.compare.length) return "";
  const cell = (browser, curl, slowAt = 100) => {
    const b = browser == null ? "-" : dur(browser);
    const c = curl == null ? "-" : dur(curl);
    const slow = browser != null && curl != null && browser >= slowAt && browser >= 3 * Math.max(curl, 1);
    return `<td class="${slow ? "is-slow" : ""}">${esc(b)}<span class="sub">curl ${esc(c)}</span></td>`;
  };
  const rows = path.compare.map(item => {
    const b = item.browser;
    const c = item.curl;
    return `<tr><td>${esc(item.host)}${c.error ? `<span class="sub">curl: ${esc(c.error)}</span>` : c.httpVersion ? `<span class="sub">HTTP ${esc(c.httpVersion)}${c.status ? `, status ${esc(c.status)}` : ""}</span>` : ""}</td>${cell(b?.dnsMs, c.dnsMs)}${cell(b?.connectMs, c.connectMs)}${cell(b?.tlsMs, c.tlsMs)}<td>${b?.waitMs == null ? "-" : esc(dur(b.waitMs))}<span class="sub">curl ${esc(c.firstByteMs == null ? "-" : dur(c.firstByteMs))}</span></td></tr>`;
  }).join("");
  return `<section><h3>The browser's timings next to curl's</h3><p class="note">The big number is the browser's slowest new connection in this capture; the small one is curl, run directly from this computer without a proxy. A large gap points at something on the browser's own path. Hosts the browser never contacted show only curl.</p><div style="overflow:auto"><table class="pth-table"><thead><tr><th>Host</th><th>DNS lookup</th><th>TCP connect</th><th>TLS</th><th>Server wait (median / first byte)</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function routes(path) {
  if (!path.routes.length) return "";
  return `<section><h3>Route from this computer</h3><p class="note">One probe per hop. Routers often ignore probes, so a silent hop is common and does not mean loss. Delay is measured to each router, not to the server.</p>${path.routes.map(route => {
    const max = Math.max(1, ...route.hops.map(h => h.rttMs || 0));
    return `<details class="pth-route-wrap"><summary>${esc(route.host)} · ${route.hops.length} hops, ${route.hops.filter(h => h.ip).length} answered${route.method ? ` · ${route.method === "icmp" ? "ICMP" : "UDP"} probes` : ""}</summary><div class="pth-route">${route.hops.map(h => `<div class="pth-hop${h.ip ? "" : " is-silent"}"><span>${h.n}</span><span>${esc(h.ip || "no answer")}</span><span class="bar"><i style="width:${h.rttMs == null ? 0 : Math.max(2, (h.rttMs / max) * 100).toFixed(1)}%"></i></span><span>${h.rttMs == null ? "-" : esc(dur(h.rttMs))}</span></div>`).join("")}</div></details>`;
  }).join("")}</section>`;
}

function findings(path) {
  const items = path.findings.filter(f => f.severity !== "info");
  const info = path.findings.filter(f => f.severity === "info");
  const render = (f) => `<div class="pth-find is-${f.severity === "medium" ? "medium" : f.severity === "low" ? "low" : "info"}"><b>${esc(f.title)}</b><p>${esc(f.detail)}</p></div>`;
  return items.length || info.length ? `<section><h3>What stands out</h3>${[...items, ...info].map(render).join("")}</section>` : "";
}

/** The Overview panel shown when a helper file is loaded. */
export function renderPathPanel(path) {
  if (!path) return "";
  const far = path.source.gapMinutes != null && Math.abs(path.source.gapMinutes) > 60;
  return `<section class="card pth" id="path"><header><h2>The path from this computer</h2><p class="note">Recorded by the SocketMap helper ${esc(gap(path.source.gapMinutes))}${path.source.os ? `, on ${esc(path.source.os)}` : ""}. It is a snapshot of this computer's network, which a browser capture cannot see.${far ? " It was taken well apart from the capture, so the network may have changed in between." : ""}</p></header>
<div class="pth-tiles">${linkTile(path)}${dnsTile(path)}${proxyTile(path)}${addressTile(path)}</div>
${findings(path)}${compareTable(path)}${routes(path)}
${path.notes.length ? `<p class="note">The helper noted: ${esc(path.notes.join(" "))}</p>` : ""}</section>`;
}

const dataLink = (name, text) => `<a download="${name}" href="data:text/plain;charset=utf-8,${encodeURIComponent(text)}">${esc(name)}</a>`;

/** The card shown when no helper file is loaded: what it adds, the command to run, and the scripts to save. */
export function renderPathPrompt(hosts) {
  const list = (hosts || []).slice(0, 5).join(" ");
  const sh = `./socketmap-path.sh ${list}`.trim();
  const ps = `.\\socketmap-path.ps1 ${list}`.trim();
  return `<section class="card pth" id="path-prompt"><div class="pth-card"><h3>Add the path from this computer (optional)</h3>
<p>A browser capture cannot see the Wi-Fi signal, this computer's DNS servers and proxy settings, or the route to the server. A small helper script records them in one file and also times each host with curl, so you can compare the browser's numbers with a direct connection. Run it on the computer that made the capture, close to the time you captured. It only reads settings, and it does not upload anything.</p>
<div class="pth-cmd"><b>Mac or Linux</b><code>${esc(sh)}</code><button type="button" data-copy="${esc(sh)}">Copy</button></div>
<div class="pth-cmd"><b>Windows PowerShell</b><code>${esc(ps)}</code><button type="button" data-copy="${esc(ps)}">Copy</button></div>
<div class="pth-dl"><span>Save the scripts:</span>${dataLink("socketmap-path.sh", HELPER_SH)}${dataLink("socketmap-path.ps1", HELPER_PS1)}<span>Then use <b>Add network path</b> at the top of this page and choose the <code>socketmap-path.json</code> file it writes. The hosts above are this capture's slowest.</span></div></div></section>`;
}
