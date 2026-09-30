/**
 * Network path enrichment: reads the small JSON file written by the SocketMap helper scripts
 * (tools/socketmap-path.sh and tools/socketmap-path.ps1) and joins it to a NetLog capture model.
 *
 * The helper records what a browser cannot see: this computer's link, DNS servers, proxy and PAC
 * settings, public address, per-host timing measured with curl, and the route to each host. It is
 * a snapshot taken when the helper ran, which may be minutes or hours away from the capture, so
 * the gap is measured and shown. Nothing is guessed: anything the helper could not read is null.
 *
 * The reader is an allowlist: only known fields survive, every string and list is bounded, and
 * proxy and PAC addresses lose any embedded credentials. No Node APIs: runs in the browser too.
 */

import { redactUrl } from "./redact.mjs";

const HOST_RE = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const IP_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F]{0,4}(?::[0-9a-fA-F]{0,4}){2,7})$/;

const text = (value, max = 120) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const ms = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 600000 ? Math.round(value * 10) / 10 : null);
const bool = (value) => (typeof value === "boolean" ? value : null);
const ip = (value) => (typeof value === "string" && IP_RE.test(value.trim()) ? value.trim() : null);
const url = (value) => { const t = text(value, 500); return t ? redactUrl(t) : null; };
const list = (value, map, cap) => (Array.isArray(value) ? value.slice(0, cap).map(map).filter(item => item != null) : []);

export function isPrivateAddress(address) {
  if (typeof address !== "string") return null;
  if (address.includes(":")) return /^(?:fc|fd|fe80)/i.test(address) || address === "::1";
  const p = address.split(".").map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n))) return null;
  return p[0] === 10 || p[0] === 127 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}

/** Returns { recognized, data } for a parsed helper file. Never throws. */
export function readPathFile(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || input.kind !== "socketmap-path") return { recognized: false, data: null };
  const link = input.link || {};
  const wifi = link.wifi || {};
  const proxy = input.proxy || {};
  const collected = typeof input.collectedAt === "string" ? Date.parse(input.collectedAt) : NaN;
  const data = {
    tool: text(input.tool, 60),
    collectedAt: Number.isFinite(collected) ? new Date(collected).toISOString() : null,
    platform: ["macos", "windows", "linux"].includes(input.platform) ? input.platform : null,
    os: text(input.os, 80),
    computer: text(input.computer, 64),
    link: {
      interface: text(link.interface, 40),
      type: ["wifi", "ethernet", "other"].includes(link.type) ? link.type : null,
      ipv4: ip(link.ipv4), ipv6: ip(link.ipv6), gateway: ip(link.gateway),
      wifi: { ssid: text(wifi.ssid, 40), rssiDbm: num(wifi.rssiDbm), noiseDbm: num(wifi.noiseDbm), channel: text(wifi.channel, 40), txRateMbps: num(wifi.txRateMbps), phyMode: text(wifi.phyMode, 30), security: text(wifi.security, 40) }
    },
    dns: { servers: list(input.dns?.servers, ip, 8), searchDomains: list(input.dns?.searchDomains, v => text(v, 80), 8) },
    proxy: { http: url(proxy.http), https: url(proxy.https), autoConfigUrl: url(proxy.autoConfigUrl), autoConfigEnabled: bool(proxy.autoConfigEnabled), autoDetect: bool(proxy.autoDetect), bypass: list(proxy.bypass, v => text(v, 80), 20) },
    publicIp: ip(input.publicIp),
    publicIpSource: text(input.publicIpSource, 40),
    hosts: list(input.hosts, h => {
      const host = typeof h?.host === "string" && HOST_RE.test(h.host) ? h.host : null;
      if (!host) return null;
      return { host, dnsMs: ms(h.dnsMs), connectMs: ms(h.connectMs), tlsMs: ms(h.tlsMs), firstByteMs: ms(h.firstByteMs), httpVersion: text(h.httpVersion, 8), remoteIp: ip(h.remoteIp), status: Number.isInteger(h.status) ? h.status : null, error: text(h.error, 160) };
    }, 12),
    routes: list(input.routes, r => {
      const host = typeof r?.host === "string" && HOST_RE.test(r.host) ? r.host : null;
      if (!host) return null;
      return { host, method: r.method === "icmp" ? "icmp" : r.method === "udp" ? "udp" : null, hops: list(r.hops, h => Number.isInteger(h?.n) && h.n > 0 && h.n < 100 ? { n: h.n, ip: ip(h.ip), rttMs: ms(h.rttMs) } : null, 40) };
    }, 12),
    notes: list(input.notes, v => text(v, 200), 10)
  };
  return { recognized: true, data };
}

const median = (values) => { const v = values.filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const maxOf = (values) => { const v = values.filter(x => x != null && x > 0); return v.length ? Math.max(...v) : null; };

/** What the browser itself recorded for a host: its slowest new-connection setup and its median wait. */
function browserSide(model, host) {
  const requests = (model.requests || []).filter(r => r.host === host && !r.isBackground);
  if (!requests.length) return null;
  return {
    requests: requests.length,
    dnsMs: maxOf(requests.map(r => r.timing?.dns)),
    connectMs: maxOf(requests.map(r => r.timing?.connect)),
    tlsMs: maxOf(requests.map(r => r.timing?.tls)),
    waitMs: median(requests.map(r => r.timing?.wait))
  };
}

const dbm = (value) => (value == null ? "not recorded" : `${value} dBm`);

export function wifiQuality(rssiDbm) {
  if (rssiDbm == null) return null;
  if (rssiDbm >= -67) return "good";
  if (rssiDbm >= -75) return "fair";
  return "weak";
}

/** Joins helper data to the capture. Returns the enrichment, or null when the file was not a helper file. */
export function joinPath(model, data) {
  if (!data) return null;
  const captured = Date.parse(model?.environment?.captureStartedAt);
  const collected = data.collectedAt ? Date.parse(data.collectedAt) : NaN;
  const gapMinutes = Number.isFinite(captured) && Number.isFinite(collected) ? Math.round((collected - captured) / 60000) : null;

  const compare = data.hosts.map(probe => {
    const browser = browserSide(model, probe.host);
    return { host: probe.host, curl: probe, browser };
  });

  const findings = [];
  const q = wifiQuality(data.link.wifi.rssiDbm);
  if (data.link.type === "wifi" && q === "weak") findings.push({ id: "wifi-weak", severity: "medium", title: "The Wi-Fi signal was weak when this was measured", detail: `${dbm(data.link.wifi.rssiDbm)} (noise ${dbm(data.link.wifi.noiseDbm)}). As a rule of thumb, -67 dBm or stronger is good for web and video and weaker than -75 dBm often means drops and retries. Measured when the helper ran, not during the capture.` });
  else if (data.link.type === "wifi" && q === "fair") findings.push({ id: "wifi-fair", severity: "low", title: "The Wi-Fi signal was fair", detail: `${dbm(data.link.wifi.rssiDbm)}. Above -67 dBm is a common target. Measured when the helper ran, not during the capture.` });

  const proxyOn = data.proxy.http || data.proxy.https || data.proxy.autoConfigUrl || data.proxy.autoConfigEnabled;
  if (proxyOn) findings.push({ id: "proxy-configured", severity: "info", title: "This computer is set to use a proxy", detail: `${data.proxy.autoConfigUrl ? `Automatic configuration (PAC): ${data.proxy.autoConfigUrl}. ` : ""}${data.proxy.http ? `Web proxy: ${data.proxy.http}. ` : ""}${data.proxy.https && data.proxy.https !== data.proxy.http ? `Secure web proxy: ${data.proxy.https}. ` : ""}The timings below were measured with curl, which does not use these system settings, so they show the path without the proxy.` });

  const publicResolvers = data.dns.servers.filter(s => isPrivateAddress(s) === false);
  if (publicResolvers.length) findings.push({ id: "dns-public", severity: "info", title: "DNS servers outside private address space", detail: `${publicResolvers.join(", ")}. That can be normal (a public resolver or a provider's). If the network is expected to use internal DNS, this is worth checking.` });

  for (const item of compare) {
    const c = item.curl;
    const b = item.browser;
    if (!b) continue;
    if (b.dnsMs != null && c.dnsMs != null && b.dnsMs >= 100 && b.dnsMs >= 3 * Math.max(c.dnsMs, 1)) findings.push({ id: "dns-browser-slower", severity: "medium", title: `The browser's lookup for ${item.host} was slower than curl's`, detail: `Browser ${Math.round(b.dnsMs)} ms, curl ${Math.round(c.dnsMs)} ms, from this computer. That points at something on the browser's path (a proxy resolving the name, DNS over HTTPS, a cold cache or a different resolver) rather than the network to the DNS server. It is not proof of the cause.` });
    if (b.connectMs != null && c.connectMs != null && b.connectMs >= 100 && b.connectMs >= 3 * Math.max(c.connectMs, 1)) findings.push({ id: "connect-browser-slower", severity: "medium", title: `The browser's connection to ${item.host} was slower than curl's`, detail: `Browser ${Math.round(b.connectMs)} ms, curl ${Math.round(c.connectMs)} ms. Curl connected directly; the browser may have gone through a proxy or VPN, or the network changed between the two.` });
  }
  for (const probe of data.hosts) if (probe.error) findings.push({ id: "probe-failed", severity: "low", title: `Curl could not reach ${probe.host}`, detail: probe.error });

  for (const route of data.routes) {
    const hops = route.hops;
    const answered = hops.filter(h => h.ip);
    const timeouts = hops.length - answered.length;
    if (hops.length >= 6 && timeouts / hops.length >= 0.5) findings.push({ id: "route-silent", severity: "info", title: `Many hops toward ${route.host} did not answer`, detail: `${timeouts} of ${hops.length} hops. Routers often ignore these probes, so silence is common and does not mean loss.` });
    let previous = null;
    for (const hop of hops) {
      if (hop.rttMs == null) continue;
      if (previous != null && hop.rttMs - previous >= 60) { findings.push({ id: "route-jump", severity: "low", title: `Delay jumps at hop ${hop.n} toward ${route.host}`, detail: `From ${Math.round(previous)} ms to ${Math.round(hop.rttMs)} ms. A jump often marks a long link (another city, a VPN exit or a provider boundary). One probe per hop is a hint, not a measurement of loss.` }); break; }
      previous = hop.rttMs;
    }
  }

  return { source: { tool: data.tool, collectedAt: data.collectedAt, gapMinutes, platform: data.platform, os: data.os, computer: data.computer }, link: data.link, dns: data.dns, proxy: data.proxy, publicIp: data.publicIp, publicIpSource: data.publicIpSource, compare, routes: data.routes, notes: data.notes, findings };
}

const gapText = (minutes) => minutes == null ? "at an unknown time relative to the capture" : Math.abs(minutes) < 2 ? "at about the same time as the capture" : minutes > 0 ? `${minutes} minutes after the capture started` : `${-minutes} minutes before the capture started`;

/** A short plain-text section for the AI handoff. */
export function pathEvidenceText(path) {
  if (!path) return "";
  const l = path.link;
  const lines = [`NETWORK PATH (from the SocketMap helper, measured ${gapText(path.source.gapMinutes)}; a snapshot of this computer, not of the capture)`];
  lines.push(`Link: ${l.type || "type not recorded"}${l.interface ? ` (${l.interface})` : ""}${l.type === "wifi" ? `; signal ${dbm(l.wifi.rssiDbm)}, noise ${dbm(l.wifi.noiseDbm)}${l.wifi.channel ? `, channel ${l.wifi.channel}` : ""}${l.wifi.phyMode ? `, ${l.wifi.phyMode}` : ""}` : ""}.`);
  lines.push(`DNS servers: ${path.dns.servers.length ? path.dns.servers.join(", ") : "not recorded"}.`);
  const proxyBits = [path.proxy.autoConfigUrl && `PAC ${path.proxy.autoConfigUrl}`, path.proxy.http && `web proxy ${path.proxy.http}`, path.proxy.https && path.proxy.https !== path.proxy.http && `secure proxy ${path.proxy.https}`].filter(Boolean);
  lines.push(`Proxy settings: ${proxyBits.length ? proxyBits.join("; ") : "none set"}.${path.publicIp ? ` Public address ${path.publicIp}.` : ""}`);
  for (const item of path.compare) {
    const c = item.curl;
    const b = item.browser;
    lines.push(`- ${item.host}: curl DNS ${c.dnsMs ?? "not recorded"} ms, connect ${c.connectMs ?? "not recorded"} ms, TLS ${c.tlsMs ?? "not recorded"} ms, first byte ${c.firstByteMs ?? "not recorded"} ms${b ? `; browser DNS ${b.dnsMs ?? "not recorded"} ms, connect ${b.connectMs ?? "not recorded"} ms, TLS ${b.tlsMs ?? "not recorded"} ms, median wait ${b.waitMs ?? "not recorded"} ms` : "; the browser recorded no page requests to this host"}.`);
  }
  for (const route of path.routes) lines.push(`- route to ${route.host} (${route.method || "method not recorded"}): ${route.hops.length} hops, ${route.hops.filter(h => h.ip).length} answered.`);
  for (const f of path.findings.filter(x => x.severity !== "info").slice(0, 6)) lines.push(`- ${f.title}: ${f.detail}`);
  return lines.join("\n");
}

/** Attaches the helper data to the capture model so every downstream view can read it. */
export function attachPath(model, data) {
  const path = joinPath(model, data);
  if (path) model.path = path;
  return path;
}

/** Hostnames worth measuring: the page's hosts, slowest first, without local or numeric addresses. */
export function hostsToMeasure(analysis, limit = 5) {
  return (analysis?.hosts || []).filter(h => HOST_RE.test(h.host || "") && !/^\d+\.\d+\.\d+\.\d+$/.test(h.host) && !/(^localhost$|\.local$|\.internal$)/i.test(h.host))
    .sort((a, b) => (b.totalMs ?? 0) - (a.totalMs ?? 0)).slice(0, limit).map(h => h.host);
}
