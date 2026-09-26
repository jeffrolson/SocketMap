/**
 * Plain-language explanations for the report.
 *
 * Readers range from network engineers to people who have never heard of TLS.
 * Every explanation leads with what happened in everyday words, then gives the
 * numbers with a one-line meaning each, then the technical details. All values
 * come from the capture model; the wording only interprets them against the
 * thresholds in analysis.mjs.
 */

import { formatDuration, formatBytes } from "./normalizer.mjs";
import { THRESHOLDS, TIMING_LABELS } from "./analysis.mjs";

export const TIMING_MEANINGS = {
  redirect: "Being sent to a different address before the real request (for example during sign-in).",
  queue: "Waiting inside the browser before starting. Browsers limit how many requests run at once.",
  proxy: "Deciding whether to send this through a proxy, often by running a PAC script.",
  dns: "Looking up the server's address. DNS works like a phone book for the internet.",
  connect: "Opening the connection to the server. Mostly reflects distance and network delay.",
  tls: "Setting up encryption and checking the server's certificate.",
  stalled: "Waiting for a free connection to this server.",
  send: "Sending the request.",
  wait: "Waiting for the server to start answering: server work plus anything in between, such as a proxy or CDN.",
  download: "Receiving the answer."
};

const WHERE_TO_LOOK = {
  redirect: "Redirects, often a sign-in or single sign-on hop. Check the redirect chain.",
  queue: "The browser itself: too many requests at once, or a busy connection to this server.",
  proxy: "Proxy settings. A slow PAC script or proxy lookup delays every request.",
  dns: "DNS. The network team can check the DNS servers listed under Environment.",
  connect: "The network path to the server: distance, packet loss, VPN, or a firewall.",
  tls: "Encryption setup. Slow handshakes often come from TLS inspection devices or distant servers.",
  stalled: "Connection limits. Common with HTTP/1.1 or when traffic funnels through a proxy.",
  send: "Uploading the request. Usually only matters for large uploads.",
  wait: "The server, or something in front of it (CDN, proxy, security gateway). Not your computer.",
  download: "The size of the answer or the bandwidth available."
};

const NET_ERRORS = {
  ERR_CONNECTION_REFUSED: "Nothing answered at that address. The service is not running, or something blocked it.",
  ERR_CONNECTION_RESET: "The connection was cut partway. Firewalls and proxies often do this.",
  ERR_CONNECTION_CLOSED: "The server closed the connection without answering.",
  ERR_CONNECTION_TIMED_OUT: "The server never answered the connection attempt.",
  ERR_TIMED_OUT: "The request took too long and was given up.",
  ERR_NAME_NOT_RESOLVED: "DNS could not find this name.",
  ERR_ABORTED: "The browser cancelled this request. Usually normal: the page no longer needed it.",
  ERR_PROXY_CONNECTION_FAILED: "The browser could not reach the proxy.",
  ERR_TUNNEL_CONNECTION_FAILED: "The proxy refused to connect to the destination.",
  ERR_INTERNET_DISCONNECTED: "The computer was offline.",
  ERR_ADDRESS_UNREACHABLE: "The network had no route to that address.",
  ERR_BLOCKED_BY_CLIENT: "Blocked inside the browser, often by an extension such as an ad blocker.",
  ERR_BLOCKED_BY_ADMINISTRATOR: "Blocked by a browser policy set by IT.",
  ERR_CERT_AUTHORITY_INVALID: "The certificate was issued by an authority the browser does not trust.",
  ERR_CERT_COMMON_NAME_INVALID: "The certificate does not match this site's name.",
  ERR_CERT_DATE_INVALID: "The certificate has expired or is not valid yet."
};

function statusMeaning(status) {
  if (status == null) return null;
  if (status === 200) return "OK: the request worked.";
  if (status === 204) return "OK, with nothing to send back (normal for tracking and logging calls).";
  if (status === 206) return "OK: part of a file (normal for video and large downloads).";
  if (status >= 200 && status < 300) return "Success.";
  if (status === 304) return "Not modified: the browser's saved copy is still good, so nothing was downloaded.";
  if ([301, 302, 303, 307, 308].includes(status)) return "Redirect: the server sent the browser somewhere else.";
  if (status === 401) return "Sign-in required.";
  if (status === 403) return "Access denied.";
  if (status === 404) return "Not found: the address does not exist on this server.";
  if (status === 407) return "The proxy wants the browser to sign in first.";
  if (status === 429) return "Too many requests: the server is rate limiting.";
  if (status >= 400 && status < 500) return "The server rejected the request.";
  if (status === 502 || status === 504) return "A gateway or proxy in front of the server could not get an answer from it.";
  if (status === 503) return "The service is unavailable or overloaded.";
  if (status >= 500) return "The server had an error.";
  return null;
}

/** Everyday name for what was requested. */
export function describeResource(r) {
  const type = (r.contentType || "").toLowerCase();
  const path = (() => { try { return new URL(r.url).pathname.toLowerCase(); } catch { return ""; } })();
  if (r.requestType === "main frame") return "the web page itself";
  if (type.includes("html") || /\.html?$/.test(path)) return "a web page";
  if (type.includes("javascript") || /\.m?js$/.test(path)) return "a script (code that makes the page work)";
  if (type.includes("css") || path.endsWith(".css")) return "a style sheet (how the page looks)";
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|ico|avif)$/.test(path)) return "an image";
  if (type.includes("font") || /\.(woff2?|ttf|otf)$/.test(path)) return "a font";
  if (type.startsWith("video/") || /\.(mp4|webm)$/.test(path)) return "a video";
  if (type.includes("json") || type.includes("xml")) return "data";
  if (r.method === "POST") return "a data submission";
  return "a resource";
}

const toneFor = (level) => ({ best: "good", better: "good", good: "warn", poor: "bad" })[level] || "info";

function timingSteps(r, keys) {
  return keys.filter(k => r.timing[k] != null && r.timing[k] > 0).map(k => ({
    label: TIMING_LABELS[k], value: formatDuration(r.timing[k]), meaning: TIMING_MEANINGS[k]
  }));
}

/** The biggest share of a request's time, with where to look. */
export function dominantPhase(r) {
  const entries = Object.entries(r.timing).filter(([, v]) => v != null && v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length || !r.durationMs) return null;
  const [key, value] = entries[0];
  return { key, value, share: value / r.durationMs, label: TIMING_LABELS[key], where: WHERE_TO_LOOK[key] };
}

function connectionFacts(r, conn) {
  if (!conn) return [["Connection", r.fromCache ? "None: served from the browser's saved copy" : "Not recorded"]];
  return [
    ["Server address", `${conn.remoteIp ?? "not recorded"}${conn.remotePort ? `:${conn.remotePort}` : ""}`],
    ["Your address", conn.localAddress ?? "not recorded"],
    ["Connection", `${conn.kind === "quic" ? "QUIC (HTTP/3)" : "TCP"}, ${r.reusedConnection ? "reused" : r.reusedConnection === false ? "newly opened" : "not recorded"}`],
    ["Encryption", [conn.tlsVersion, conn.alpn].filter(Boolean).join(", ") || "not recorded"],
    ["Certificate", conn.cert ? `${conn.cert.subject || "?"}, issued by ${conn.cert.issuer || "?"}, root ${conn.cert.root || "?"} (${conn.cert.knownRoot === false ? "NOT a public root" : conn.cert.knownRoot ? "public root" : "root status not recorded"})` : "not recorded"],
    ["Proxy", r.proxy || "not recorded"]
  ];
}

/** Explanation for a connection-setup arrow. */
export function explainConnection(r, conn) {
  const setup = (conn.connectMs || 0) + (conn.tlsMs || 0);
  const isQuic = conn.kind === "quic";
  const t = THRESHOLDS.connection;
  let tone, verdict;
  if (conn.error) { tone = "bad"; verdict = `The connection failed: ${conn.error}. ${NET_ERRORS[conn.error] || ""}`.trim(); }
  else if (conn.cert?.knownRoot === false) { tone = "bad"; verdict = `The certificate was not issued by a public authority (issuer: ${conn.cert.issuer || "unknown"}). Something between this computer and ${conn.host} is decrypting and re-encrypting the traffic. That is TLS inspection, and it adds delay.`; }
  else if (setup > t.good) { tone = "bad"; verdict = `Slow: ${formatDuration(setup)} to open. Over ${t.good} ms usually means a long network path, packet loss, or an inspection device.`; }
  else if (setup >= t.better) { tone = "warn"; verdict = `Acceptable: ${formatDuration(setup)} to open.`; }
  else { tone = "good"; verdict = `Fast: ${formatDuration(setup)} to open.`; }
  return {
    title: `Opening a secure connection to ${conn.host || r.host}`,
    tone,
    verdict,
    plain: isQuic
      ? `Before the browser can ask ${conn.host || r.host} for anything, it opens a connection. This one uses QUIC (HTTP/3), which sets up the connection and the encryption in a single step. It happens once; later requests to the same server reuse it.`
      : `Before the browser can ask ${conn.host || r.host} for anything, it opens a connection (TCP) and then agrees on encryption (TLS) while checking the server's certificate. It happens once; later requests to the same server reuse it.`,
    steps: [
      conn.dnsMs ? { label: "DNS", value: formatDuration(conn.dnsMs), meaning: TIMING_MEANINGS.dns } : null,
      conn.connectMs != null ? { label: isQuic ? "QUIC handshake" : "TCP connect", value: formatDuration(conn.connectMs), meaning: isQuic ? "Opening the connection and setting up encryption together." : TIMING_MEANINGS.connect } : null,
      conn.tlsMs != null ? { label: "TLS handshake", value: formatDuration(conn.tlsMs), meaning: TIMING_MEANINGS.tls } : null
    ].filter(Boolean),
    facts: connectionFacts(r, conn),
    requestId: r.id
  };
}

/** Explanation for a request arrow (browser to server). */
export function explainRequest(r, conn) {
  const before = ["redirect", "queue", "proxy", "dns", "connect", "tls", "stalled"].reduce((s, k) => s + (r.timing[k] || 0), 0);
  const tone = r.fromCache ? "good" : before > THRESHOLDS.queueing ? "warn" : "good";
  const verdict = r.fromCache
    ? "No network needed: the browser used its saved copy."
    : before > THRESHOLDS.queueing
      ? `The request waited ${formatDuration(before)} before it could be sent. The steps below show why.`
      : `Sent promptly (${formatDuration(before)} of preparation).`;
  return {
    title: `The browser asks ${r.host} for ${describeResource(r)}`,
    tone,
    verdict,
    plain: `This arrow is the browser sending a request (${r.method || "GET"}) to ${r.host}. The rounded bars at each end show the two sides taking part. The number in brackets on the arrow is how long sending took.`,
    steps: timingSteps(r, ["redirect", "queue", "proxy", "dns", "connect", "tls", "stalled", "send"]),
    facts: [
      ["Address", r.url],
      ["Method", r.method || "not recorded"],
      ["Protocol", r.protocol || "not recorded"],
      ...connectionFacts(r, conn)
    ],
    requestId: r.id
  };
}

/** Explanation for a response arrow (server back to browser). */
export function explainResponse(r, conn) {
  const wait = r.timing.wait;
  const t = THRESHOLDS.server;
  let tone;
  let verdict;
  if (r.netError && r.netError !== "ERR_ABORTED") {
    tone = "bad";
    verdict = `No answer: ${r.netError}. ${NET_ERRORS[r.netError] || ""}`.trim();
  } else if (r.netError === "ERR_ABORTED") {
    tone = "info";
    verdict = NET_ERRORS.ERR_ABORTED;
  } else if (r.status >= 400) {
    tone = "bad";
    verdict = `Error ${r.status}: ${statusMeaning(r.status)}`;
  } else if (wait == null) {
    tone = "info";
    verdict = r.fromCache ? "Served from the browser's saved copy." : "The capture did not record the server's answer time.";
  } else if (wait > t.good) {
    tone = "bad"; verdict = `Very slow answer: the server took ${formatDuration(wait)} to start responding.`;
  } else if (wait > t.better) {
    tone = "warn"; verdict = `Slow answer: the server took ${formatDuration(wait)} to start responding.`;
  } else {
    tone = "good"; verdict = `Answered in ${formatDuration(wait)}.`;
  }
  const dom = dominantPhase(r);
  const insight = dom && dom.share >= 0.4
    ? `Most of this request's time (${formatDuration(dom.value)} of ${formatDuration(r.durationMs)}) went to "${dom.label}". Where to look: ${dom.where}`
    : null;
  const statusText = r.status != null ? `${r.status} (${statusMeaning(r.status) || "see status code reference"})` : r.netError || "no answer";
  return {
    title: `${r.host} answers (${r.netError || r.status || "no status"})`,
    tone,
    verdict,
    plain: `This dashed arrow is the answer coming back from ${r.host}. The number in brackets is how long the server took to start answering after the request arrived. Status ${statusText}`,
    insight,
    steps: timingSteps(r, ["wait", "download"]),
    facts: [
      ["Status", statusText],
      ["Size", r.bytesWire != null ? `${formatBytes(r.bytesWire)} over the network${r.bytesDecoded ? `, ${formatBytes(r.bytesDecoded)} after decompressing` : ""}` : "not recorded"],
      ["Content type", r.contentType || "not recorded"],
      ["Total time for this request", formatDuration(r.durationMs)],
      ...connectionFacts(r, conn)
    ],
    requestId: r.id
  };
}

const MEASURE_MEANINGS = {
  protocol: "Which version of the web protocol was used. Newer versions (HTTP/2, HTTP/3) handle many requests at once.",
  tls: "The encryption version. TLS 1.3 is the newest and fastest to set up.",
  connection: "How long it took to open a new connection. Reusing an open one costs nothing.",
  dns: "How long it took to look up the server's address.",
  path: "Whether traffic went straight to the server, through a proxy, or through a device that decrypts it (TLS inspection).",
  server: "How long the server typically took to start answering."
};
const MEASURE_LABELS = { protocol: "Protocol", tls: "Encryption", connection: "Connection setup", dns: "DNS lookup", path: "Network path", server: "Server response" };
export const RATING_WORDS = { best: "Best", better: "Better", good: "Good", poor: "Poor", unknown: "Not recorded" };

/** Explanation for a host column (participant card). */
export function explainHost(host) {
  const poor = Object.entries(host.ratings).filter(([, r]) => r.level === "poor").map(([k]) => MEASURE_LABELS[k].toLowerCase());
  return {
    title: host.host,
    tone: toneFor(host.overall),
    verdict: poor.length ? `Needs attention: ${poor.join(", ")}.` : `Overall rating: ${RATING_WORDS[host.overall] || host.overall}.`,
    stepsTitle: "How this server rated",
    plain: `This column is the server ${host.host}${host.ips.length ? ` at ${host.ips.join(", ")}` : ""}. Every arrow that ends on its line is a request the browser sent to it (${host.requests} in total), and every dashed arrow leaving it is an answer.`,
    steps: Object.entries(host.ratings).map(([k, r]) => ({ label: MEASURE_LABELS[k], value: `${RATING_WORDS[r.level] || r.level}: ${r.value}`, meaning: MEASURE_MEANINGS[k] })),
    facts: [
      ["Certificate issuer", host.cert ? `${host.cert.issuer || "unknown"} (${host.cert.knownRoot === false ? "NOT a public root" : host.cert.knownRoot ? "public root" : "root status not recorded"})` : "not recorded"],
      ["Proxy", host.proxy || "not recorded"],
      ["Data transferred", formatBytes(host.bytesWire) || "0 B"]
    ]
  };
}

export const MEASURE_HELP = Object.fromEntries(Object.keys(MEASURE_LABELS).map(k => [k, { label: MEASURE_LABELS[k], meaning: MEASURE_MEANINGS[k] }]));

/** One-paragraph plain summary of a request, for the waterfall. */
export function plainSummary(r) {
  const what = `The browser asked ${r.host} for ${describeResource(r)}.`;
  if (r.fromCache) return `${what} It used its saved copy, so nothing crossed the network.`;
  if (r.netError && r.netError !== "ERR_ABORTED") return `${what} It failed with ${r.netError}. ${NET_ERRORS[r.netError] || ""}`.trim();
  const result = r.status != null ? `The answer was ${r.status} (${statusMeaning(r.status) || "see status code reference"})` : "No answer was recorded";
  const dom = dominantPhase(r);
  const where = dom && dom.share >= 0.4 ? ` Most of the ${formatDuration(r.durationMs)} went to "${dom.label}". ${dom.where}` : ` It took ${formatDuration(r.durationMs)} in total.`;
  return `${what} ${result}.${where}`;
}

const TONE_RANK = { bad: 3, warn: 2, info: 1, good: 0 };
const ALL_PHASES = ["redirect", "queue", "proxy", "dns", "connect", "tls", "stalled", "send", "wait", "download"];

/** Timing phases with raw values, for the inspector's timing bars. */
export function timingBreakdown(r) {
  return ALL_PHASES.filter(k => r.timing[k] != null && r.timing[k] > 0)
    .map(k => ({ key: k, label: TIMING_LABELS[k], ms: r.timing[k], value: formatDuration(r.timing[k]), meaning: TIMING_MEANINGS[k] }));
}

/** One explanation for a whole request: what was asked, what came back, and where the time went. */
export function explainTransaction(r, conn) {
  const req = explainRequest(r, conn);
  const res = explainResponse(r, conn);
  const lead = TONE_RANK[res.tone] >= TONE_RANK[req.tone] ? res : req;
  const result = r.fromCache ? "used its saved copy" : r.netError ? `got no answer (${r.netError})` : r.status != null ? `got status ${r.status}` : "got no recorded answer";
  return {
    title: req.title,
    tone: lead.tone,
    verdict: lead.verdict,
    plain: `The browser asked ${r.host} for ${describeResource(r)} and ${result}. The whole exchange took ${formatDuration(r.durationMs)}.`,
    insight: res.insight,
    steps: timingSteps(r, ALL_PHASES),
    timing: timingBreakdown(r),
    totalMs: r.durationMs,
    facts: [["Address", r.url], ["Method", r.method || "not recorded"], ["Protocol", r.protocol || "not recorded"], ...res.facts],
    headers: { request: r.requestHeaders, response: r.responseHeaders },
    requestId: r.id
  };
}
