/**
 * Coverage: what a capture recorded, what it could have recorded but did not,
 * and what a NetLog never records. Statuses come from the parsed capture; the
 * "never" rows are facts about the NetLog format, not measurements.
 *
 * Status: "recorded" | "partial" | "missing" (NetLog can record it, this file has
 * none) | "never" (needs another tool). Nothing is "recorded" without evidence.
 *
 * No Node APIs: runs in the browser viewer as well.
 */

export const STATUS_LABELS = {
  recorded: "Recorded",
  partial: "Partial",
  missing: "Not in this file",
  never: "Never in a NetLog"
};

const ID_HEADERS = /^(?:request-id|client-request-id|x-request-id|x-correlation-?id|sprequestguid|x-ms-request-id):/i;

// Each link already appears, verified, in the Learn tab.
const LINKS = {
  netlog: "https://www.chromium.org/for-testers/providing-network-details/",
  performance: "https://developer.chrome.com/docs/devtools/performance",
  lighthouse: "https://developer.chrome.com/docs/lighthouse/overview",
  network: "https://developer.chrome.com/docs/devtools/network/reference",
  wireshark: "https://www.wireshark.org/",
  mtr: "https://github.com/traviscross/mtr"
};

function tri(known, total) {
  if (!total || !known) return "missing";
  return known >= total ? "recorded" : "partial";
}

function share(known, total, noun) {
  return `${known} of ${total} ${noun}`;
}

function item(id, label, status, detail, extra = {}) {
  return { id, label, status, detail, ...extra };
}

function never(id, label, detail) {
  return item(id, label, "never", detail);
}

function captureMode(environment) {
  const mode = String(environment?.captureMode ?? "").toLowerCase();
  if (!mode) return { mode: null, rawBytes: null };
  return { mode: environment.captureMode, rawBytes: mode.includes("everything") };
}

export function buildCoverage(model) {
  // Ratios describe the page requests; browser background traffic is not held against the page.
  const requests = (Array.isArray(model?.requests) ? model.requests : []).filter(r => !r.isBackground);
  const connections = Array.isArray(model?.connections) ? model.connections : [];
  const dnsLookups = Array.isArray(model?.dnsLookups) ? model.dnsLookups : [];
  const environment = model?.environment || {};
  const diagnostics = model?.diagnostics || {};
  const integrity = diagnostics.integrity;
  const count = (list, test) => list.filter(test).length;
  const total = requests.length;

  const ended = count(requests, r => r.endRecorded === true);
  const cacheKnown = count(requests, r => typeof r.fromCache === "boolean");
  const protocolKnown = count(requests, r => r.protocol != null);
  const timed = count(requests, r => r.timing && r.timing.wait != null);
  const proxied = count(requests, r => r.proxy != null);
  const linked = count(requests, r => r.connectionId != null);
  const withId = count(requests, r => Array.isArray(r.responseHeaders) && r.responseHeaders.some(line => ID_HEADERS.test(line)));
  const tlsCandidates = connections.filter(c => c.tlsMs != null || c.tlsVersion != null || c.cert != null);
  const tlsKnown = count(tlsCandidates, c => c.tlsVersion != null && c.cert != null);
  const withCert = count(connections, c => c.cert != null);
  const { mode, rawBytes } = captureMode(environment);

  const integrityItem = !integrity
    ? item("integrity", "Whole capture window", "missing", "The file's integrity was not recorded, so completeness is unknown.")
    : integrity.complete === true && !integrity.discardedPartial && !integrity.malformedEntries
      ? item("integrity", "Whole capture window", "recorded", "The file is complete: Chrome finished writing it.")
      : item("integrity", "Whole capture window", "partial", `The file ended early or had damaged entries (partial event dropped: ${integrity.discardedPartial ? "yes" : "no"}; malformed entries: ${integrity.malformedEntries ?? 0}). Everything before that point was kept.`);

  const stages = [
    {
      id: "page",
      title: "Page code",
      blurb: "What the page's own scripts and rendering were doing.",
      items: [
        never("javascript", "JavaScript execution and long tasks", "A NetLog records network events, not what the page's code was doing while it waited or ran."),
        never("script-initiator", "Which script started a request", "A request records the origin that started it, not the script or line."),
        never("rendering", "Rendering and page-experience timings", "Layout, paint, and measures like LCP, CLS, and INP are outside the network stack.")
      ]
    },
    {
      id: "browser",
      title: "Browser",
      blurb: "The browser's own view of the load.",
      items: [
        item("requests", "Page requests", total ? (ended === total ? "recorded" : "partial") : "missing",
          total ? `Requests are recorded. ${ended === total ? `All ${total} have a recorded end.` : `Only ${share(ended, total, "requests")} have a recorded end; the rest are shown as unfinished.`}` : "No page requests are in this file."),
        item("cache", "Cache result", tri(cacheKnown, total), total ? `Whether the cache answered is known for ${share(cacheKnown, total, "requests")}. Unknown is never shown as a miss.` : "No requests to check."),
        item("snapshot", "Browser settings snapshot (DNS, proxy, socket pools)", environment.polledDataPresent ? "recorded" : "missing",
          environment.polledDataPresent ? "Chrome's end-of-capture snapshot is present." : "The end-of-capture snapshot (polledData) is absent, so browser DNS and proxy configuration was not recorded. Stop logging cleanly to include it."),
        integrityItem,
        item("payloads", "Bytes transferred on sockets (payloads)", rawBytes === true ? "recorded" : "missing",
          rawBytes === true ? `Capture mode ${mode} includes bytes on the wire. SocketMap does not display them.` : mode ? `Capture mode ${mode} records metadata about requests only. Payloads are rarely needed for speed problems and can hold secrets.` : "The capture mode was not recorded."),
        never("extensions", "Browser extension logic", "An extension's own requests appear, but what its code does or blocks does not."),
        never("machine", "Machine load and other apps' traffic", "CPU, memory, disk, power, and other programs' network use are not part of one browser's log.")
      ]
    },
    {
      id: "network",
      title: "Network stack",
      blurb: "How the browser reached the server.",
      items: [
        item("dns", "DNS lookups", dnsLookups.length ? "recorded" : "missing", dnsLookups.length ? `${dnsLookups.length} lookups are recorded with their results.` : "No lookups are recorded. The names may have been cached, or the connections opened before the capture began."),
        item("proxy", "Proxy decision", tri(proxied, total), total ? `The proxy decision is known for ${share(proxied, total, "requests")}.` : "No requests to check."),
        item("connections", "Connection used by each request", tri(linked, total), total ? `${share(linked, total, "requests")} link to a recorded connection. The rest may use connections opened before the capture began.` : "No requests to check."),
        item("tls", "TLS version and certificate", tlsCandidates.length ? tri(tlsKnown, tlsCandidates.length) : "missing", tlsCandidates.length ? `Both are recorded for ${share(tlsKnown, tlsCandidates.length, "secure connections")}.` : "No TLS handshakes are recorded."),
        item("protocol", "Protocol (HTTP/1.1, HTTP/2, HTTP/3)", tri(protocolKnown, total), total ? `The protocol is known for ${share(protocolKnown, total, "requests")}.` : "No requests to check."),
        item("timing", "Timing phases (queue, DNS, connect, TLS, send, wait, download)", tri(timed, total), total ? `Waiting time is recorded for ${share(timed, total, "requests")}.` : "No requests to check.")
      ]
    },
    {
      id: "path",
      title: "Network path",
      blurb: "Everything between this computer and the server.",
      items: [
        never("packets", "Packet loss and retransmissions", "Socket timing does not show whether packets were lost or resent on the wire."),
        never("hops", "Per-hop delay, VPN, and proxy internals", "The browser sees the proxy's answer, not the route or what happens inside the tunnel."),
        never("local-link", "Wi-Fi, network card, and operating system quality", "Local link problems show up only as slower timings, without a cause."),
        item("security-agent", "Security software and TLS inspection", withCert ? "partial" : "never",
          withCert ? `Inference only: the certificate issuer is recorded for ${share(withCert, connections.length, "connections")}. What a security agent does is not.` : "Nothing in this file identifies certificate issuers, and a security agent's own activity is never recorded.")
      ]
    },
    {
      id: "server",
      title: "Server",
      blurb: "What happened after the request arrived.",
      items: [
        item("server-ids", "Request or correlation IDs in responses", tri(withId, total), total ? `${share(withId, total, "responses")} carry a request or correlation ID. A server team can look one up in its logs.` : "No responses to check."),
        never("server-work", "Server processing and backend time", "Waiting time is what the browser saw. It does not split server work from network delay.")
      ]
    }
  ];

  const some = (known, of, noun) => of ? `${known} of ${of} ${noun}` : null;
  const shorts = {
    requests: some(ended, total, "ended"),
    cache: some(cacheKnown, total, "known"),
    dns: dnsLookups.length ? `${dnsLookups.length} lookups` : null,
    proxy: some(proxied, total, "known"),
    connections: some(linked, total, "linked"),
    tls: some(tlsKnown, tlsCandidates.length, "complete"),
    protocol: some(protocolKnown, total, "known"),
    timing: some(timed, total, "timed"),
    "server-ids": some(withId, total, "have one")
  };
  const summary = { recorded: 0, partial: 0, missing: 0, never: 0 };
  for (const entry of stages.flatMap(stage => stage.items)) {
    summary[entry.status]++;
    if (shorts[entry.id]) entry.short = shorts[entry.id];
  }
  return { stages, summary, next: nextSteps(stages), comparison: buildComparison(stages) };
}


// Tool comparison. Level: 2 sees it well, 1 sees part of it, 0 does not show it.
// Cells are hedged to what each tool's documentation supports. Order matches TOOLS.
const TOOLS = [
  { id: "netlog", name: "NetLog", how: "chrome://net-export or edge://net-export", link: LINKS.netlog },
  { id: "har", name: "HAR export", how: "DevTools, Network tab, Export HAR (sanitized)", link: LINKS.network },
  { id: "profile", name: "Performance profile", how: "DevTools, Performance tab, Record and reload, Save profile", link: LINKS.performance },
  { id: "lighthouse", name: "Lighthouse", how: "DevTools Lighthouse panel, PageSpeed Insights, or command line", link: LINKS.lighthouse },
  { id: "packets", name: "Packet capture", how: "Wireshark on the computer or a network tap", link: LINKS.wireshark },
  { id: "route", name: "Route trace", how: "tracert, pathping, traceroute, or mtr", link: LINKS.mtr },
  { id: "server", name: "Server logs", how: "Web or application logs, searched by request ID", link: null }
];

// [item id, plain-words question, then one [level, note] per tool in TOOLS order]
const N = [0, ""];
const ROWS = {
  page: [
    ["javascript", "JavaScript running time and long tasks", [0, "Network events only"], N, [2, "Every task, by script"], [1, "Summary by script (lab run)"], N, N, N],
    ["script-initiator", "Which script started a request", [0, "Origin only"], [2, "Script and line"], [1, "Call stacks on some events"], [1, "Critical request chains only"], N, N, N],
    ["rendering", "Paint, LCP and layout shift", N, [1, "DOMContentLoaded and load only"], [2, "Paint and layout events"], [2, "FCP, LCP, CLS, TBT (lab run)"], N, N, N]
  ],
  browser: [
    ["requests", "List of requests (URL, status, size)", [2, "Everything the network stack did"], [2, "Everything the page asked for"], [1, "Some network events"], [2, "Network requests audit"], [1, "URLs only when unencrypted"], N, [1, "Only requests that reached it"]],
    ["cache", "Answered from cache or a service worker", [1, "Only what reached the network stack"], [2, "Memory, disk and service worker flags"], [1, "Flags on some responses"], [1, "Cache lifetime advice only"], N, N, N],
    ["machine", "Computer load (CPU, memory, other apps)", N, N, [1, "The browser's own CPU only"], N, N, N, N]
  ],
  network: [
    ["dns", "DNS lookups and resolver settings", [2, "Lookups, answers, resolver config"], [1, "DNS time and server IP"], [1, "Limited"], N, [2, "Every query, unless encrypted DNS"], N, N],
    ["proxy", "Proxy and PAC decisions", [2, "Decision per request"], N, N, N, [1, "Connection to the proxy address"], N, N],
    ["connections", "Connection reuse and socket errors", [2, "Pools, sockets, errors"], [1, "Connection ID only"], N, N, [2, "TCP-level view"], N, N],
    ["tls", "TLS version and certificate", [2, "Version, chain, known-root check"], [1, "Handshake time"], N, [1, "Uses HTTPS check only"], [1, "Certificate visible in TLS 1.2 only"], N, N],
    ["protocol", "HTTP/1.1, HTTP/2 or HTTP/3", [2, "Per request, plus fallback"], [2, "Per request"], [1, "Limited"], [1, "Per request, HTTP/2 audit"], [1, "Negotiation visible; QUIC encrypted"], N, [1, "What the server accepted"]],
    ["timing", "Timing per step (DNS, connect, TLS, wait)", [2, "Every phase per request"], [2, "Standard timing phases"], [1, "Some per-request timing"], [1, "Start and end per request"], [1, "Handshakes and gaps, not per URL"], N, [1, "Server-side time only"]]
  ],
  path: [
    ["packets", "Packet loss and retransmissions", N, N, N, N, [2, "Every packet"], [1, "Probe loss per hop, not your traffic"], N],
    ["hops", "Route and delay per hop", N, N, N, N, [1, "Delay to the far end only"], [2, "Each hop"], N],
    ["local-link", "Wi-Fi, network card and OS quality", N, N, N, N, [1, "Retransmits hint at it"], N, N]
  ],
  server: [
    ["server-work", "Server processing time, apart from network delay", [0, "Total wait only"], [0, "Total wait only"], [0, "Total wait only"], [0, "Main page response time only"], [1, "Gap minus round trip estimates it"], N, [2, "The real answer"]],
    ["server-ids", "Request or correlation ID", [2, "Response headers, if sent"], [2, "Headers, if sent"], N, N, [1, "Only when unencrypted"], N, [2, "What you search by"]]
  ]
};

const ABOUT = [
  ["best", "Best when", ["The problem may be DNS, proxy, TLS, connection setup or the path", "You need to know which script asked for what, or what came from cache", "The network looks fine but the page still feels slow", "You want a quick scored review of page weight, scripts and render blockers", "You suspect loss, resets, or something on the wire changing traffic", "You need to know where along the path delay starts", "Waiting time on the server looks long"]],
  ["setup", "Setup", ["Built into Chrome and Edge", "Built into DevTools", "Built into DevTools", "Built into DevTools; also a web tool", "Install a program; usually needs admin rights", "tracert and pathping ship with Windows; mtr is an install", "Needs the server team"]],
  ["secrets", "Sensitive content", ["Default strips cookies; SocketMap also removes secrets and keeps IPs and URLs", "Choose Export HAR (sanitized); other options include cookies and page content", "Script URLs and timings; leave Screenshots off", "Page URL and script names", "Raw traffic; capture only with permission and treat as sensitive", "Hop IP addresses only", "Their own logs; share a request ID rather than logs"]],
  ["reads", "SocketMap reads it", ["Yes: this report", "Not combined with a NetLog", "No, use alongside", "No, use alongside", "No, use alongside", "No, use alongside", "No, use alongside"]]
];

const SYMPTOMS = [
  { see: "Requests are fast but the page still feels slow", add: ["profile", "lighthouse"], why: "The delay is probably the computer working, not the network. A profile shows what the page's code was doing." },
  { see: "A few requests wait a long time for the server", add: ["server"], why: "Only the server can say where the time went. Take a request ID from the row above and give it to the server team." },
  { see: "Slow or repeated connection setup, resets, failed connects", add: ["packets", "route"], why: "Packet loss and path delay are invisible to the browser log. A packet capture and a route trace show them." },
  { see: "Requests in the DevTools list are missing from the NetLog", add: ["har"], why: "Responses served from the memory cache or a service worker never reach the network stack. A HAR flags them." },
  { see: "Fast at home, slow at the office", add: ["repeat"], why: "One capture is one sample. Capture again in the other place and use Compare two captures in SocketMap." }
];

function buildComparison(stages) {
  const byId = new Map(stages.flatMap(stage => stage.items).map(entry => [entry.id, entry]));
  const groups = stages.map(stage => ({
    id: stage.id,
    title: stage.title,
    rows: (ROWS[stage.id] || []).map(([id, label, ...cells]) => {
      const live = byId.get(id);
      return { id, label, live: { status: live.status, detail: live.detail, short: live.short || null }, cells: cells.map(([level, note]) => ({ level, note })) };
    })
  }));
  return {
    tools: TOOLS.map(tool => ({ ...tool })),
    groups,
    about: ABOUT.map(([key, label, values]) => ({ key, label, values })),
    symptoms: SYMPTOMS.map(entry => ({ ...entry }))
  };
}

const STEPS = [
  { id: "performance-trace", title: "Record a Chrome Performance profile while reloading the page", covers: ["javascript", "rendering", "machine"], why: "Shows what the page's code, layout, and paint were doing, so a slow load can be split into waiting on the network and working on the computer.", link: LINKS.performance },
  { id: "request-ids", title: "Give the server team a request ID from a slow response", covers: ["server-ids", "server-work"], why: "The server team can find that exact request in its own logs and tell you where the time went.", link: null },
  { id: "har-initiator", title: "Export a HAR from Chrome DevTools to see which script started each request", covers: ["script-initiator"], why: "DevTools can record the script that asked for each request, which a NetLog does not.", link: LINKS.network },
  { id: "lighthouse", title: "Run Lighthouse for the same page", covers: ["javascript", "rendering"], why: "Lists scripts by time spent running, which points at heavy code without a full profile.", link: LINKS.lighthouse },
  { id: "packet-capture", title: "Capture packets for the same time window", covers: ["packets", "local-link"], why: "A packet capture (or transport telemetry) shows retransmissions and resets on the wire, which the browser log does not.", link: LINKS.wireshark },
  { id: "route-check", title: "Trace the route to the slowest host", covers: ["hops"], why: "Shows where along the path delay begins, which the browser cannot see.", link: LINKS.mtr },
  { id: "repeat-compare", title: "Capture again with one thing changed, then compare the two", covers: ["security-agent", "extensions", "machine"], why: "A single capture is one sample. Comparing a run with and without the suspect (a security agent, an extension, a network) is the fair way to test it.", link: null }
];

function nextSteps(stages) {
  const byId = new Map(stages.flatMap(stage => stage.items).map(entry => [entry.id, entry]));
  return STEPS.filter(step => step.covers.some(id => byId.get(id).status !== "recorded"))
    .map(step => ({ ...step, covers: step.covers.filter(id => byId.get(id).status !== "recorded") }));
}

/** A short plain-text section for the AI handoff. */
export function coverageText(coverage) {
  const lines = ["WHAT THIS CAPTURE COULD AND COULD NOT SEE"];
  const list = (status) => coverage.stages.flatMap(stage => stage.items.filter(entry => entry.status === status).map(entry => `${stage.title}: ${entry.label}`));
  const groups = [
    ["recorded", "Recorded"],
    ["partial", "Partly recorded"],
    ["missing", "Not in this file"],
    ["never", "Not recorded by NetLog"]
  ];
  for (const [status, heading] of groups) {
    const rows = list(status);
    if (rows.length) lines.push(`${heading}: ${rows.join("; ")}.`);
  }
  lines.push("Do not draw conclusions about anything outside the recorded evidence. Suggested extra data: " + coverage.next.map(step => step.title).join("; ") + ".");
  return lines.join("\n");
}
