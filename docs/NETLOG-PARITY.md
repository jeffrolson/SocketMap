# NetLog Viewer coverage

SocketMap uses the deployed [Chromium NetLog Viewer](https://netlog-viewer.appspot.com/) as its browser-diagnostic coverage baseline. All captured fields remain inspectable after credential redaction, including unknown source types and snapshot fields. Missing fields are shown as **Not recorded**.

This is an evidence-coverage matrix, not a claim that every interaction, formatter or historical Chrome schema is identical to the reference.

## Reference map

| Reference area | SocketMap presentation | Evidence and behavior |
|---|---|---|
| Import | Environment and Other captured data | Browser/capture provenance, command line, constants, field trials and user comments |
| Events | Source table and Events | Search and sort sources; filter multiple source IDs, type, text and errors; paginated full-event inspection; nested dependency links; recorded enum and bitmask decoding |
| Timeline | Diagnostics timeline | Event/error volume, observed socket/request/DNS activity, network bytes and disk-cache bytes; byte-rate toggle, time-range controls and exact bucket values |
| DNS | DNS snapshots and cache validity | Resolver configuration, DoH availability, endpoint/cache fields, TTL and expiry; expiry derived only when comparison values were recorded |
| Proxy | Proxy snapshots and next checks | Original/effective settings and bad-proxy records |
| Sockets | Socket snapshots and source windows | Pool/group counters, socket events, source relationships and observed activity windows |
| StreamPool | StreamPool snapshots | Counts, groups, job controllers and attempt state |
| Alt-Svc | Alt-Svc snapshots | Alternative service mappings and any recorded status |
| HTTP/2 | HTTP/2 snapshots | Sessions, settings, enablement and ALPN; recorded source IDs link to events |
| QUIC | QUIC snapshots and Events | Configuration, session/packet/stream counters and recorded event details |
| Reporting | Reporting snapshots | Enabled state, queued reports, clients, endpoints and NEL policies |
| Cache | Cache snapshots and timeline | HTTP-cache statistics and recorded disk-cache read/write activity |
| Modules | Modules snapshots | Extensions, service/namespace providers and field trials |
| Prerender | Prerender snapshots | Configuration, active loads and history |

The deployed reference reads these `polledData` keys. SocketMap preserves each under its original namespace, without flattening it into constants or unrelated metadata:

`activeFieldTrialGroups`, `altSvcMappings`, `badProxies`, `dohProvidersDisabledDueToFeature`, `extensionInfo`, `hostResolverInfo`, `httpCacheInfo`, `httpStreamPoolInfo`, `prerenderInfo`, `proxySettings`, `quicInfo`, `reportingInfo`, `serviceProviders`, `socketPoolInfo`, `spdySessionInfo`, `spdyStatus`.

Comparison adds independent source-family counts/errors and before/after snapshot values. It does not match source IDs between files or interpret a changed snapshot as a proven cause. The AI handoff includes the same diagnostic observations, coverage and next checks.

## Deliberate boundaries

- Inputs are NetLog JSON files. The reader streams chunks and never retains a raw event archive. Constants appearing after events trigger a second bounded pass.
- Saved HTML includes diagnostic summaries and sanitized snapshots. Inspecting every individual event requires attaching the original local NetLog; the viewer supplies its already-open file automatically. This is still entirely offline.
- Timelines aggregate into bounded buckets. Byte rates are bucket averages; active counts are the last observed transition in a bucket. Exact event timestamps remain available in Events. Source bars show the observed window, not an inferred complete lifetime.
- Raw payload byte/body fields and credential values are omitted. IP addresses, hosts and paths remain available. Generic field tables retain unfamiliar schema fields instead of guessing their meaning.
- Unsupported event formats remain inspectable as recorded fields. No claim of exhaustive compatibility across every Chromium version is made.
- Browser network logging does not establish page CPU/render time, wire retransmissions or server-side processing. Complementary performance traces, packet/transport telemetry and server traces are suggested where relevant.

## Verification evidence

The reference deployed bundle was inspected on 2026-09-28. The compressed response SHA-256 was `cac387762920a312e25c663ea53d5081474ac1f5f33c99f89515e62c72ccae95`. A local offline copy loaded the synthetic diagnostic fixture with all reference tabs visible and no load errors. Both tools counted 180 events across 36 sources; the reference and SocketMap identified the same synthetic DNS cache entry as expired after a network change. These numbers describe that fixture, not product benchmarks.

- `tests/netlog-coverage.test.mjs` checks snapshot preservation/redaction, unknown sources, captures without page requests, constants-late rereads and full replay coverage.
- `tests/netlog-evidence.test.mjs` checks aggregation, timeline totals, unknown times/bytes, dependencies and integrity.
- `tests/event-replay.test.mjs` checks bounded queries/duration tracking, enum decoding, multi-source filters, dependencies and redaction.
- Diagnostic, comparison and report tests check rendered evidence, safe escaping, standalone scripts and comparison semantics.
- Browser checks exercised `file://` viewer/report loading, original-file handoff, standalone attachment, pagination, source filtering, DNS validity, responsive layout and A/B diagnostics. No remote resource requests were observed.

The capture model follows [Chromium's NetLog design](https://www.chromium.org/developers/design-documents/network-stack/netlog/). The [Catapult viewer README](https://chromium.googlesource.com/catapult/+/HEAD/netlog_viewer/README.md) identifies the deployed reference. The older source index is not used as the sole parity baseline because deployed tabs have evolved.
