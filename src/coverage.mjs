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

  const summary = { recorded: 0, partial: 0, missing: 0, never: 0 };
  for (const entry of stages.flatMap(stage => stage.items)) summary[entry.status]++;
  return { stages, summary, next: nextSteps(stages) };
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
