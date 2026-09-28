/** Synthetic capture shaped like Chromium's browser-wide diagnostic snapshots. */

import { buildPageLoadNetLog } from "./sample-capture.mjs";

export const SNAPSHOT_KEYS = [
  "proxySettings", "badProxies", "hostResolverInfo", "socketPoolInfo",
  "httpStreamPoolInfo", "altSvcMappings", "spdySessionInfo", "spdyStatus",
  "quicInfo", "reportingInfo", "httpCacheInfo", "serviceProviders",
  "extensionInfo", "prerenderInfo", "activeFieldTrialGroups", "dohProvidersDisabledDueToFeature"
];

/**
 * A documentation-only NetLog fixture covering browser-wide diagnostics.
 * All hosts use example domains and all addresses use RFC 5737 ranges.
 */
export function buildDiagnosticNetLog({ noHttp = false, lateConstants = false } = {}) {
  const base = buildPageLoadNetLog();
  const { constants } = base;
  constants.clientInfo.numericDate = Number(constants.timeTickOffset) + 4000;
  // The deployed NetLog Viewer validates this version before it opens tabs.
  // Keep the required maps from the base fixture and add the format marker.
  constants.logFormatVersion = 1;
  constants.loadFlag = { NORMAL: 0 };
  constants.addressFamily = { ADDRESS_FAMILY_UNSPECIFIED: 0, ADDRESS_FAMILY_IPV4: 1, ADDRESS_FAMILY_IPV6: 2 };
  const events = base.events.map(event => ({ ...event, source: { ...event.source }, params: event.params ? structuredClone(event.params) : undefined }));
  const type = constants.logEventTypes;
  const source = constants.logSourceType;
  const addType = name => type[name] ?? (type[name] = Math.max(...Object.values(type)) + 1);
  const addSource = name => source[name] ?? (source[name] = Math.max(...Object.values(source)) + 1);
  const unknownSource = addSource("UNRECOGNIZED_DIAGNOSTIC_SOURCE");
  const diskSource = addSource("DISK_CACHE_ENTRY");
  const custom = addType("DIAGNOSTIC_CUSTOM_EVENT");
  const dns = addType("HOST_RESOLVER_DNS_TASK_EXTRACTION_RESULTS");
  const socketSent = addType("SOCKET_BYTES_SENT");
  const socketReceived = addType("SOCKET_BYTES_RECEIVED");
  const diskRead = addType("ENTRY_READ_DATA");
  const diskWrite = addType("ENTRY_WRITE_DATA");
  const event = (time, id, sourceType, eventType, params = {}, phase = 0) => ({
    time: String(time), type: eventType, phase, source: { id, type: sourceType }, params
  });
  events.push(
    event(2000, 901, unknownSource, custom, {
      label: "Synthetic unknown diagnostic source", net_error: -105,
      source_dependency: { id: 902, type: unknownSource, nested: { source_dependency: { id: 903, type: unknownSource } } },
      url: "https://unknown.example.test/path?access_token=EVENT_CANARY"
    }),
    event(2001, 902, unknownSource, custom, { failure: true }),
    event(2002, 903, unknownSource, custom, { label: "nested dependency target" }),
    event(2003, 904, unknownSource, dns, { results: [{ domain_name: "resolver.example.test", endpoints: [{ address: "203.0.113.53", port: 443 }] }] }),
    event(2004, 905, source.SOCKET, socketSent, { byte_count: 31 }),
    event(2005, 905, source.SOCKET, socketReceived, { byte_count: 47 }),
    event(2006, 906, diskSource, diskRead, { bytes_copied: 13 }, 2),
    event(2007, 906, diskSource, diskWrite, { bytes_copied: 17 }, 2)
  );

  const polledData = {
    proxySettings: { effective: { pac_url: "https://pac.example.test/proxy.pac?token=PAC_CANARY" }, original: { auto_detect: true } },
    badProxies: [{ proxy_chain_uri: "https://proxy.example.test:8443?token=BAD_PROXY_CANARY", bad_until: "7000" }],
    hostResolverInfo: { dns_config: { can_use_insecure_dns_transactions: true, can_use_secure_dns_transactions: false, nameservers: ["192.0.2.53:53"], search: ["example.test"], doh_config: { servers: [{ server_template: "https://doh.example.test/query?token=DOH_CANARY" }] } }, cache: { capacity: 100, network_changes: 3, entries: [{ hostname: "portal.example.test", address_family: 1, addresses: ["198.51.100.20"], ttl: 60, expiration: "7000", network_changes: 2, network_anonymization_key: "https://portal.example.test same_site" }] } },
    socketPoolInfo: [],
    httpStreamPoolInfo: { connecting_socket_count: 1, handed_out_socket_count: 2, idle_socket_count: 3, max_socket_count: 99, max_sockets_per_group: 6, groups: {}, job_controllers: [] },
    altSvcMappings: [{ server: "https://portal.example.test", alternative_service: "h3 alt.example.test:443" }],
    spdySessionInfo: [{ host_port_pair: "portal.example.test:443", aliases: [], proxy: "DIRECT", source_id: base.events.find(item => item.source.type === source.HTTP2_SESSION)?.source.id, negotiated_protocol: "h2", active_streams: 1, unclaimed_pushed_streams: 0, max_concurrent_streams: 100, streams_initiated_count: 2, streams_pushed_count: 0, streams_pushed_and_claimed_count: 0, streams_abandoned_count: 0, frames_received: 10, is_secure: true, sent_settings: {}, received_settings: {}, send_window_size: 65535, recv_window_size: 65535, unacked_recv_window_bytes: 0, error: 0 }],
    spdyStatus: { enable_http2: true, alpn_protos: "h2,http/1.1" },
    quicInfo: { quic_enabled: true, sessions: [{ aliases: ["cdn.example.net"], version: "h3", peer_address: "198.51.100.44:443", connection_id: "synthetic-connection", open_streams: 1, active_streams: 1, total_streams: 1, packets_sent: 3, packets_lost: 0, packets_received: 3, connected: true }] },
    reportingInfo: { reportingEnabled: false, clients: [{ origin: "https://portal.example.test", endpoint: "https://report.example.test/upload?token=REPORT_CANARY" }] },
    httpCacheInfo: { stats: { current_size: 1024, entries: 4 } },
    serviceProviders: { service_providers: [{ name: "Synthetic provider", version: 1, chain_length: 1, socket_type: 1, socket_protocol: 6, endpoint: "https://service.example.test/?token=SERVICE_CANARY" }], namespace_providers: [] },
    extensionInfo: [{ id: "abcdefghijklmnop", name: "Synthetic extension", isApp: false, enabled: true, version: "1.0", description: "Synthetic diagnostic fixture", authorization: "Bearer EXT_CANARY" }],
    prerenderInfo: { enabled: true, enabled_note: "Synthetic example", omnibox_enabled: false, active: [{ url: "https://portal.example.test/prerender", duration: 12, is_loaded: false }], history: [] },
    activeFieldTrialGroups: ["SyntheticExperiment/Enabled"],
    dohProvidersDisabledDueToFeature: ["SyntheticDoHProvider"]
  };
  events.sort((a, b) => Number(a.time) - Number(b.time));
  const ordered = {
    userComments: "Synthetic documentation capture https://comments.example.test/?token=COMMENT_CANARY",
    constants,
    events: noHttp ? events.filter(item => item.source.type !== source.URL_REQUEST) : events,
    polledData
  };
  if (!lateConstants) return ordered;
  return { userComments: ordered.userComments, events: ordered.events, constants: ordered.constants, polledData: ordered.polledData };
}

