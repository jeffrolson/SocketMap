/**
 * Builds synthetic Chromium NetLog captures for tests.
 *
 * Every address uses the documentation ranges from RFC 5737 (192.0.2.0/24,
 * 198.51.100.0/24, 203.0.113.0/24) plus loopback. Certificates are throwaway
 * test certificates; their private keys were discarded.
 *
 * The event shapes mirror a real Chrome 153 net-export capture: numeric event
 * and source type IDs resolved through `constants`, phases 0/1/2 meaning
 * NONE/BEGIN/END, and `source_dependency` links between sources.
 */

export const TEST_CERTS = {
  portalLeaf: "-----BEGIN CERTIFICATE-----\nMIIBnjCCAUSgAwIBAgIUKlEnm6E7mrAn6GA3vJfDRmIbk3swCgYIKoZIzj0EAwIw\nPTEfMB0GA1UECgwWRXhhbXBsZSBUcnVzdCBTZXJ2aWNlczEaMBgGA1UEAwwRRXhh\nbXBsZSBQdWJsaWMgQ0EwHhcNMjYwOTI2MTU1NzQ1WhcNMjcwOTI2MTU1NzQ1WjAd\nMRswGQYDVQQDDBJwb3J0YWwuZXhhbXBsZS5jb20wWTATBgcqhkjOPQIBBggqhkjO\nPQMBBwNCAARD5rnwtwJkw4THz47U/Z8TBX87B1QkSpMqzkfNVvohTA36KB5zgjrz\n2cZBQk9iG4JANGl/txB8DbV4Kr7tz6+Do0IwQDAdBgNVHQ4EFgQUu39aa5wTYxDw\n8ycQx+BzoTV4vLUwHwYDVR0jBBgwFoAUMwEheEIWMNxzstVTBuCqre75Lw4wCgYI\nKoZIzj0EAwIDSAAwRQIhAOWu55ko+6g3gR4owP7aj6gQMUekejrfFlVCdCqVLC77\nAiB8FF7t70GcRRwf+eBpoIdxxIkxoQmWI8cB514FMviTzQ==\n-----END CERTIFICATE-----\n",
  publicCa: "-----BEGIN CERTIFICATE-----\nMIIB0DCCAXWgAwIBAgIUdquxnGgfMtCBATt/nVXprziXg7gwCgYIKoZIzj0EAwIw\nPTEfMB0GA1UECgwWRXhhbXBsZSBUcnVzdCBTZXJ2aWNlczEaMBgGA1UEAwwRRXhh\nbXBsZSBQdWJsaWMgQ0EwHhcNMjYwOTI2MTU1NzQ0WhcNMzYwOTIzMTU1NzQ0WjA9\nMR8wHQYDVQQKDBZFeGFtcGxlIFRydXN0IFNlcnZpY2VzMRowGAYDVQQDDBFFeGFt\ncGxlIFB1YmxpYyBDQTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABA4coy37rFBf\nCV41XHaigfhiKd2HzA8klRSOO4BnzBI8M4rOKiS5GZDEwZiW9pSbt0t5UKWDuLta\nDNEWC0CA+NWjUzBRMB0GA1UdDgQWBBQzASF4QhYw3HOy1VMG4Kqt7vkvDjAfBgNV\nHSMEGDAWgBQzASF4QhYw3HOy1VMG4Kqt7vkvDjAPBgNVHRMBAf8EBTADAQH/MAoG\nCCqGSM49BAMCA0kAMEYCIQCsKp1jSLjJSh8M7OhxNTyIMC70fbPNRT+B000Deo6o\nxwIhANX/AwHQuR/kMI5tJ57i7zTlUV3NKKhw/ce8UzWtQTU4\n-----END CERTIFICATE-----\n",
  cdnLeaf: "-----BEGIN CERTIFICATE-----\nMIIBnDCCAUGgAwIBAgIUKlEnm6E7mrAn6GA3vJfDRmIbk3owCgYIKoZIzj0EAwIw\nPTEfMB0GA1UECgwWRXhhbXBsZSBUcnVzdCBTZXJ2aWNlczEaMBgGA1UEAwwRRXhh\nbXBsZSBQdWJsaWMgQ0EwHhcNMjYwOTI2MTU1NzQ1WhcNMjcwOTI2MTU1NzQ1WjAa\nMRgwFgYDVQQDDA9jZG4uZXhhbXBsZS5uZXQwWTATBgcqhkjOPQIBBggqhkjOPQMB\nBwNCAAQENH64jTiXDHiaJFl3RRRgnJKzoJGThstrbvjnXFCEdmGZR5UMmxCEGWWG\nrILsdhvAvNM5BeK4lqzzl5dXcwM3o0IwQDAdBgNVHQ4EFgQU6fWFBVw3gC/YXPbF\nXprxIg8+20MwHwYDVR0jBBgwFoAUMwEheEIWMNxzstVTBuCqre75Lw4wCgYIKoZI\nzj0EAwIDSQAwRgIhAPcDe5MbvxfQXV8WypGln0PcwjuONraWxuDSQXFOicRxAiEA\n5aowGnRAVC9+evt3zcqYxG79Q+QCfCZxOHWd3SpOcoM=\n-----END CERTIFICATE-----\n",
  apiLeaf: "-----BEGIN CERTIFICATE-----\nMIIBmjCCAT+gAwIBAgIUDHwq70WnSPCu6/WrCkBlPrN8/YAwCgYIKoZIzj0EAwIw\nOzEZMBcGA1UECgwQQ29udG9zbyBTZWN1cml0eTEeMBwGA1UEAwwVQ29udG9zbyBJ\nbnNwZWN0aW9uIENBMB4XDTI2MDkyNjE1NTc0NFoXDTI3MDkyNjE1NTc0NFowGjEY\nMBYGA1UEAwwPYXBpLmV4YW1wbGUub3JnMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcD\nQgAEh6QJXmhcAQNdfvTrTrOuVoklXneKj+JktDzwOX9N4z3bfULu8QZRNCpe2PF9\n9CBbWCB46r2NKIxmK/WuqFXO7aNCMEAwHQYDVR0OBBYEFJYL/GkVxqvuRwHaFOIp\nJH832lcaMB8GA1UdIwQYMBaAFAAam3g0VroXznVcX6enTjtaXOzWMAoGCCqGSM49\nBAMCA0kAMEYCIQDg9DNLz4BFdlwstE98P5lC6J+y5j+iS6VXAn+98GHmPQIhAIef\npfUwK4OK7JbUF5Y8UKNrivC6Yyi1EfCrNx/slwUu\n-----END CERTIFICATE-----\n",
  inspectionCa: "-----BEGIN CERTIFICATE-----\nMIIByzCCAXGgAwIBAgIUdrAvyZq6Rb1VuK1Ja16si4XhiuMwCgYIKoZIzj0EAwIw\nOzEZMBcGA1UECgwQQ29udG9zbyBTZWN1cml0eTEeMBwGA1UEAwwVQ29udG9zbyBJ\nbnNwZWN0aW9uIENBMB4XDTI2MDkyNjE1NTc0NFoXDTM2MDkyMzE1NTc0NFowOzEZ\nMBcGA1UECgwQQ29udG9zbyBTZWN1cml0eTEeMBwGA1UEAwwVQ29udG9zbyBJbnNw\nZWN0aW9uIENBMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEzQRDr7sEydRdDL6U\nExZtU/a0oqpVCe3SLM77nTkRbn47jnToEnxwKflEONghDkb/HpRGy4A+KEuEc7RQ\n5IG446NTMFEwHQYDVR0OBBYEFAAam3g0VroXznVcX6enTjtaXOzWMB8GA1UdIwQY\nMBaAFAAam3g0VroXznVcX6enTjtaXOzWMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZI\nzj0EAwIDSAAwRQIgHYOi36MKQFVAQttT8qVN3h67mw92XNYf5q4HC0XgFO4CIQDq\nMVo3QtDRE1IOPFhYxFaHtmONF2Meq9W0ty5/XCUeUQ==\n-----END CERTIFICATE-----\n"
};

const EVENT_TYPES = [
  "REQUEST_ALIVE", "URL_REQUEST_START_JOB", "URL_REQUEST_REDIRECTED",
  "HTTP_STREAM_REQUEST", "HTTP_STREAM_JOB_CONTROLLER_BOUND", "HTTP_STREAM_REQUEST_BOUND_TO_JOB",
  "HTTP_STREAM_REQUEST_BOUND_TO_QUIC_SESSION", "HTTP_TRANSACTION_SEND_REQUEST",
  "HTTP_TRANSACTION_SEND_REQUEST_HEADERS", "HTTP_TRANSACTION_HTTP2_SEND_REQUEST_HEADERS",
  "HTTP_TRANSACTION_QUIC_SEND_REQUEST_HEADERS", "HTTP_TRANSACTION_READ_HEADERS",
  "HTTP_TRANSACTION_READ_RESPONSE_HEADERS", "URL_REQUEST_JOB_BYTES_READ",
  "URL_REQUEST_JOB_FILTERED_BYTES_READ", "LOCAL_NETWORK_ACCESS_CHECK",
  "HTTP_STREAM_JOB_CONTROLLER", "PROXY_RESOLUTION_SERVICE", "PROXY_RESOLUTION_SERVICE_RESOLVED_PROXY_LIST",
  "HTTP_STREAM_JOB", "SOCKET_POOL_BOUND_TO_CONNECT_JOB", "SOCKET_POOL_BOUND_TO_SOCKET",
  "HTTP2_SESSION_POOL_IMPORTED_SESSION_FROM_SOCKET", "HTTP2_SESSION_POOL_FOUND_EXISTING_SESSION",
  "BOUND_TO_QUIC_SESSION_POOL_JOB", "HTTP_STREAM_REQUEST_PROTO",
  "CONNECT_JOB", "SOCKET_POOL_CONNECT_JOB_CREATED", "HOST_RESOLVER_MANAGER_REQUEST", "HOST_RESOLVER_MANAGER_CACHE_HIT",
  "CONNECT_JOB_SET_SOCKET", "SOCKET_ALIVE", "TCP_CONNECT", "SSL_CONNECT", "SSL_CERTIFICATES_RECEIVED",
  "CERT_VERIFIER_REQUEST_BOUND_TO_JOB", "CERT_VERIFIER_JOB",
  "HTTP2_SESSION", "HTTP2_SESSION_INITIALIZED",
  "QUIC_SESSION_POOL_JOB", "QUIC_SESSION_POOL_JOB_RESULT", "QUIC_SESSION",
  "QUIC_SESSION_PACKET_RECEIVED", "QUIC_SESSION_CRYPTO_HANDSHAKE_COMPLETE", "QUIC_SESSION_CLOSED",
  "HOST_RESOLVER_MANAGER_JOB", "HOST_RESOLVER_DNS_TASK_EXTRACTION_RESULTS"
];

const SOURCE_TYPES = [
  "NONE", "URL_REQUEST", "HTTP_STREAM_JOB_CONTROLLER", "HTTP_STREAM_JOB", "SSL_CONNECT_JOB",
  "SOCKET", "HTTP2_SESSION", "QUIC_SESSION_POOL_DIRECT_JOB", "QUIC_SESSION",
  "CERT_VERIFIER_JOB", "HOST_RESOLVER_IMPL_JOB"
];

const EV = Object.fromEntries(EVENT_TYPES.map((n, i) => [n, i + 1]));
const SRC = Object.fromEntries(SOURCE_TYPES.map((n, i) => [n, i]));
const BEGIN = 1;
const END = 2;
const NONE = 0;

function createLog() {
  const events = [];
  const add = (sourceId, sourceType, time, type, phase, params) => {
    const ev = { phase, source: { id: sourceId, type: SRC[sourceType] }, time: String(time), type: EV[type] };
    if (params) ev.params = params;
    events.push(ev);
  };
  const dep = (id, type) => ({ id, type: SRC[type] });
  return { events, add, dep };
}

function constants() {
  return {
    clientInfo: {
      name: "Google Chrome",
      version: "153.0.1.0",
      os_type: "Windows NT: 10.0.26100 (x86_64)",
      command_line: "\"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\""
    },
    logCaptureMode: "Default",
    logEventPhase: { PHASE_BEGIN: BEGIN, PHASE_END: END, PHASE_NONE: NONE },
    logEventTypes: EV,
    logSourceType: SRC,
    netError: { ERR_ABORTED: -3, ERR_CONNECTION_REFUSED: -102, ERR_NAME_NOT_RESOLVED: -105 },
    timeTickOffset: "1790000000000"
  };
}

function polledData() {
  return {
    proxySettings: {
      effective: { pac_url: "http://wpad.corp.example.com/proxy.pac" },
      original: { pac_url: "http://wpad.corp.example.com/proxy.pac" }
    },
    badProxies: [],
    hostResolverInfo: {
      dns_config: { nameservers: ["192.0.2.53:53"], search: ["corp.example.com"], secure_dns_mode: 0 }
    }
  };
}

/** Adds one HTTP request with its full transaction timeline. */
function addTransaction(log, o) {
  const { add, dep } = log;
  const id = o.id;
  add(id, "URL_REQUEST", o.start, "REQUEST_ALIVE", BEGIN, { priority: "HIGHEST", url: o.url });
  add(id, "URL_REQUEST", o.start, "URL_REQUEST_START_JOB", BEGIN, {
    initiator: o.initiator ?? "not an origin",
    method: o.method ?? "GET",
    network_isolation_key: o.nik ?? "https://portal.example.com https://portal.example.com",
    request_type: o.requestType ?? "other",
    url: o.url
  });
  if (o.lna) add(id, "URL_REQUEST", o.start, "LOCAL_NETWORK_ACCESS_CHECK", NONE, o.lna);
  if (o.fromCache) {
    add(id, "URL_REQUEST", o.end, "URL_REQUEST_START_JOB", END);
    add(id, "URL_REQUEST", o.end, "REQUEST_ALIVE", END);
    return;
  }
  add(id, "URL_REQUEST", o.streamStart, "HTTP_STREAM_REQUEST", BEGIN);
  if (o.controller) add(id, "URL_REQUEST", o.streamStart, "HTTP_STREAM_JOB_CONTROLLER_BOUND", NONE, { source_dependency: dep(o.controller, "HTTP_STREAM_JOB_CONTROLLER") });
  if (o.job) add(id, "URL_REQUEST", o.streamEnd, "HTTP_STREAM_REQUEST_BOUND_TO_JOB", NONE, { source_dependency: dep(o.job, "HTTP_STREAM_JOB") });
  if (o.boundQuicSession) add(id, "URL_REQUEST", o.streamEnd, "HTTP_STREAM_REQUEST_BOUND_TO_QUIC_SESSION", NONE, { source_dependency: dep(o.boundQuicSession, "QUIC_SESSION") });
  add(id, "URL_REQUEST", o.streamEnd, "HTTP_STREAM_REQUEST", END);
  if (o.netError !== undefined && o.sendStart === undefined) {
    add(id, "URL_REQUEST", o.end, "REQUEST_ALIVE", END, { net_error: o.netError });
    return;
  }
  add(id, "URL_REQUEST", o.sendStart, "HTTP_TRANSACTION_SEND_REQUEST", BEGIN);
  const headerEvent = { "h2": "HTTP_TRANSACTION_HTTP2_SEND_REQUEST_HEADERS", "h3": "HTTP_TRANSACTION_QUIC_SEND_REQUEST_HEADERS" }[o.protocol]
    || "HTTP_TRANSACTION_SEND_REQUEST_HEADERS";
  const headerParams = { headers: o.requestHeaders || [] };
  if (headerEvent === "HTTP_TRANSACTION_SEND_REQUEST_HEADERS") headerParams.line = `${o.method ?? "GET"} ${new URL(o.url).pathname} HTTP/1.1\r\n`;
  add(id, "URL_REQUEST", o.sendStart, headerEvent, NONE, headerParams);
  add(id, "URL_REQUEST", o.sendEnd, "HTTP_TRANSACTION_SEND_REQUEST", END);
  add(id, "URL_REQUEST", o.sendEnd, "HTTP_TRANSACTION_READ_HEADERS", BEGIN);
  add(id, "URL_REQUEST", o.headersAt, "HTTP_TRANSACTION_READ_RESPONSE_HEADERS", NONE, { headers: o.responseHeaders });
  add(id, "URL_REQUEST", o.headersAt, "HTTP_TRANSACTION_READ_HEADERS", END);
  add(id, "URL_REQUEST", o.headersAt, "URL_REQUEST_START_JOB", END);
  add(id, "URL_REQUEST", o.end, "URL_REQUEST_JOB_BYTES_READ", NONE, { byte_count: o.bytes });
  add(id, "URL_REQUEST", o.end, "URL_REQUEST_JOB_FILTERED_BYTES_READ", NONE, { byte_count: o.bytes * 3 });
  add(id, "URL_REQUEST", o.end, "REQUEST_ALIVE", END);
}

function addController(log, id, t0, t1, proxyInfo, requestId) {
  log.add(id, "HTTP_STREAM_JOB_CONTROLLER", t0, "HTTP_STREAM_JOB_CONTROLLER", BEGIN, { url: "" });
  log.add(id, "HTTP_STREAM_JOB_CONTROLLER", t0, "PROXY_RESOLUTION_SERVICE", BEGIN);
  log.add(id, "HTTP_STREAM_JOB_CONTROLLER", t1, "PROXY_RESOLUTION_SERVICE_RESOLVED_PROXY_LIST", NONE, { proxy_info: proxyInfo });
  log.add(id, "HTTP_STREAM_JOB_CONTROLLER", t1, "PROXY_RESOLUTION_SERVICE", END);
}

function addTcpTlsConnection(log, o) {
  const { add, dep } = log;
  add(o.connectJob, "SSL_CONNECT_JOB", o.dnsStart, "CONNECT_JOB", BEGIN);
  add(o.connectJob, "SSL_CONNECT_JOB", o.dnsStart, "SOCKET_POOL_CONNECT_JOB_CREATED", NONE, { group_id: `https://${o.host} <https://${o.host} same_site>` });
  if (o.dnsEnd > o.dnsStart) {
    add(o.connectJob, "SSL_CONNECT_JOB", o.dnsStart, "HOST_RESOLVER_MANAGER_REQUEST", BEGIN, { host: `https://${o.host}` });
    add(o.connectJob, "SSL_CONNECT_JOB", o.dnsEnd, "HOST_RESOLVER_MANAGER_REQUEST", END);
  } else {
    add(o.connectJob, "SSL_CONNECT_JOB", o.dnsStart, "HOST_RESOLVER_MANAGER_CACHE_HIT", NONE, {});
  }
  add(o.connectJob, "SSL_CONNECT_JOB", o.tlsEnd, "CONNECT_JOB_SET_SOCKET", NONE, { source_dependency: dep(o.socket, "SOCKET") });
  add(o.connectJob, "SSL_CONNECT_JOB", o.tlsEnd, "CONNECT_JOB", END);

  add(o.socket, "SOCKET", o.dnsEnd, "SOCKET_ALIVE", BEGIN, { source_dependency: dep(o.connectJob, "SSL_CONNECT_JOB") });
  add(o.socket, "SOCKET", o.dnsEnd, "TCP_CONNECT", BEGIN, { address_list: [o.remote] });
  add(o.socket, "SOCKET", o.tcpEnd, "TCP_CONNECT", END, o.tcpError !== undefined
    ? { net_error: o.tcpError }
    : { local_address: o.local, remote_address: o.remote });
  if (o.tcpError !== undefined) return;
  if (o.tlsVersion) {
    add(o.socket, "SOCKET", o.tcpEnd, "SSL_CONNECT", BEGIN);
    add(o.socket, "SOCKET", o.tlsEnd - 5, "SSL_CERTIFICATES_RECEIVED", NONE, { certificates: o.certs });
    add(o.socket, "SOCKET", o.tlsEnd - 5, "CERT_VERIFIER_REQUEST_BOUND_TO_JOB", NONE, { source_dependency: dep(o.certJob, "CERT_VERIFIER_JOB") });
    add(o.certJob, "CERT_VERIFIER_JOB", o.tlsEnd - 5, "CERT_VERIFIER_JOB", BEGIN, { certificates: o.certs, host: o.host });
    add(o.certJob, "CERT_VERIFIER_JOB", o.tlsEnd - 1, "CERT_VERIFIER_JOB", END, { cert_status: 0, is_issued_by_known_root: o.knownRoot });
    add(o.socket, "SOCKET", o.tlsEnd, "SSL_CONNECT", END, { cipher_suite: 4865, is_resumed: false, next_proto: o.alpn, version: o.tlsVersion });
  }
}

function addDnsJob(log, id, host, t0, t1, address) {
  log.add(id, "HOST_RESOLVER_IMPL_JOB", t0, "HOST_RESOLVER_MANAGER_JOB", BEGIN, { dns_query_types: ["A"], host: `https://${host}` });
  log.add(id, "HOST_RESOLVER_IMPL_JOB", t1, "HOST_RESOLVER_DNS_TASK_EXTRACTION_RESULTS", NONE, {
    results: [{ domain_name: host, endpoints: [{ address, port: 0 }], query_type: "A", type: "data" }]
  });
  log.add(id, "HOST_RESOLVER_IMPL_JOB", t1, "HOST_RESOLVER_MANAGER_JOB", END);
}

/**
 * A slow intranet-style page load:
 * - portal.example.com main document (direct, new h2 connection, slow DNS, secrets in headers and URL)
 * - a second portal request reusing that h2 session with a slow server response
 * - cdn.example.net over a new QUIC session
 * - a localhost probe that is refused (like a sign-in agent's loopback check)
 * - api.example.org through a proxy whose certificate chains to a private inspection root
 * - a browser extension request served from cache (background traffic)
 */
export function buildPageLoadNetLog() {
  const log = createLog();
  const { add, dep } = log;

  // 1. Main document: https://portal.example.com (new TCP+TLS h2 connection)
  addController(log, 2, 1005, 1045, "DIRECT", 1);
  add(3, "HTTP_STREAM_JOB", 1045, "HTTP_STREAM_JOB", BEGIN, { destination: "https://portal.example.com", using_quic: false });
  add(3, "HTTP_STREAM_JOB", 1045, "SOCKET_POOL_BOUND_TO_CONNECT_JOB", NONE, { source_dependency: dep(4, "SSL_CONNECT_JOB") });
  addDnsJob(log, 90, "portal.example.com", 1045, 1125, "198.51.100.20");
  addTcpTlsConnection(log, {
    host: "portal.example.com", connectJob: 4, socket: 5, certJob: 6,
    dnsStart: 1045, dnsEnd: 1125, tcpEnd: 1165, tlsEnd: 1285,
    local: "192.0.2.10:50001", remote: "198.51.100.20:443",
    tlsVersion: "TLS 1.3", alpn: "h2", knownRoot: true,
    certs: [TEST_CERTS.portalLeaf, TEST_CERTS.publicCa]
  });
  add(3, "HTTP_STREAM_JOB", 1285, "SOCKET_POOL_BOUND_TO_SOCKET", NONE, { source_dependency: dep(5, "SOCKET") });
  add(3, "HTTP_STREAM_JOB", 1285, "HTTP_STREAM_REQUEST_PROTO", NONE, { proto: "h2" });
  add(3, "HTTP_STREAM_JOB", 1285, "HTTP2_SESSION_POOL_IMPORTED_SESSION_FROM_SOCKET", NONE, { source_dependency: dep(7, "HTTP2_SESSION") });
  add(3, "HTTP_STREAM_JOB", 1285, "HTTP_STREAM_JOB", END);
  add(7, "HTTP2_SESSION", 1285, "HTTP2_SESSION", BEGIN, { host: "portal.example.com:443", proxy: "[direct://]" });
  add(7, "HTTP2_SESSION", 1285, "HTTP2_SESSION_INITIALIZED", NONE, { protocol: "h2", source_dependency: dep(5, "SOCKET") });
  addTransaction(log, {
    id: 1, url: "https://portal.example.com/sites/team/home.aspx?tempauth=SECRET123&view=1",
    requestType: "main frame", start: 1000, streamStart: 1005, streamEnd: 1290,
    controller: 2, job: 3, protocol: "h2", sendStart: 1290, sendEnd: 1291, headersAt: 1791, end: 1850,
    requestHeaders: [":method: GET", ":path: /sites/team/home.aspx?tempauth=SECRET123&view=1", "cookie: session=SUPERSECRET", "authorization: Bearer abc.def.ghi"],
    responseHeaders: ["HTTP/1.1 200", "content-type: text/html", "set-cookie: FedAuth=SECRETCOOKIE", "server: Microsoft-IIS/10.0"],
    bytes: 40000
  });

  // 2. Script on the same host, reusing the h2 session, slow server wait
  addController(log, 12, 1861, 1862, "DIRECT", 10);
  add(13, "HTTP_STREAM_JOB", 1862, "HTTP_STREAM_JOB", BEGIN, { destination: "https://portal.example.com", using_quic: false });
  add(13, "HTTP_STREAM_JOB", 1863, "HTTP2_SESSION_POOL_FOUND_EXISTING_SESSION", NONE, { source_dependency: dep(7, "HTTP2_SESSION") });
  add(13, "HTTP_STREAM_JOB", 1863, "HTTP_STREAM_JOB", END);
  addTransaction(log, {
    id: 10, url: "https://portal.example.com/_layouts/15/app.js",
    initiator: "https://portal.example.com", start: 1860, streamStart: 1861, streamEnd: 1863,
    controller: 12, job: 13, protocol: "h2", sendStart: 1863, sendEnd: 1864, headersAt: 3064, end: 3100,
    requestHeaders: [":method: GET", ":path: /_layouts/15/app.js", "x-requestdigest: DIGESTSECRET"],
    responseHeaders: ["HTTP/1.1 200", "content-type: application/javascript"],
    bytes: 250000
  });

  // 3. Stylesheet from cdn.example.net over a new QUIC session
  addController(log, 22, 1861, 1861, "DIRECT", 20);
  add(23, "HTTP_STREAM_JOB", 1861, "HTTP_STREAM_JOB", BEGIN, { destination: "https://cdn.example.net", using_quic: true });
  add(23, "HTTP_STREAM_JOB", 1861, "BOUND_TO_QUIC_SESSION_POOL_JOB", NONE, { source_dependency: dep(24, "QUIC_SESSION_POOL_DIRECT_JOB") });
  add(23, "HTTP_STREAM_JOB", 1901, "HTTP_STREAM_REQUEST_PROTO", NONE, { proto: "h3" });
  add(23, "HTTP_STREAM_JOB", 1901, "HTTP_STREAM_JOB", END);
  add(24, "QUIC_SESSION_POOL_DIRECT_JOB", 1861, "QUIC_SESSION_POOL_JOB", BEGIN, { host: "cdn.example.net", port: 443 });
  add(24, "QUIC_SESSION_POOL_DIRECT_JOB", 1861, "HOST_RESOLVER_MANAGER_REQUEST", BEGIN, { host: "https://cdn.example.net" });
  add(24, "QUIC_SESSION_POOL_DIRECT_JOB", 1866, "HOST_RESOLVER_MANAGER_REQUEST", END);
  add(24, "QUIC_SESSION_POOL_DIRECT_JOB", 1867, "QUIC_SESSION_POOL_JOB_RESULT", NONE, { source_dependency: dep(25, "QUIC_SESSION") });
  add(24, "QUIC_SESSION_POOL_DIRECT_JOB", 1900, "QUIC_SESSION_POOL_JOB", END);
  addDnsJob(log, 91, "cdn.example.net", 1861, 1866, "203.0.113.5");
  add(25, "QUIC_SESSION", 1867, "QUIC_SESSION", BEGIN, { host: "cdn.example.net", port: 443 });
  add(25, "QUIC_SESSION", 1880, "QUIC_SESSION_PACKET_RECEIVED", NONE, { peer_address: "203.0.113.5:443", self_address: "192.0.2.10:60000", size: 1200 });
  add(25, "QUIC_SESSION", 1890, "CERT_VERIFIER_REQUEST_BOUND_TO_JOB", NONE, { source_dependency: dep(26, "CERT_VERIFIER_JOB") });
  add(26, "CERT_VERIFIER_JOB", 1890, "CERT_VERIFIER_JOB", BEGIN, { certificates: [TEST_CERTS.cdnLeaf, TEST_CERTS.publicCa], host: "cdn.example.net" });
  add(26, "CERT_VERIFIER_JOB", 1894, "CERT_VERIFIER_JOB", END, { cert_status: 0, is_issued_by_known_root: true });
  add(25, "QUIC_SESSION", 1897, "QUIC_SESSION_CRYPTO_HANDSHAKE_COMPLETE", NONE, {});
  addTransaction(log, {
    id: 20, url: "https://cdn.example.net/assets/site.css",
    initiator: "https://portal.example.com", start: 1860, streamStart: 1861, streamEnd: 1901,
    controller: 22, job: 23, protocol: "h3", sendStart: 1901, sendEnd: 1902, headersAt: 1950, end: 1960,
    responseHeaders: ["HTTP/1.1 200", "content-type: text/css"], bytes: 12000
  });

  // 4. Localhost probe, refused (sign-in agent loopback check)
  addController(log, 32, 1865, 1865, "DIRECT", 30);
  add(33, "HTTP_STREAM_JOB", 1865, "HTTP_STREAM_JOB", BEGIN, { destination: "http://127.0.0.1:8769", using_quic: false });
  add(33, "HTTP_STREAM_JOB", 1865, "SOCKET_POOL_BOUND_TO_CONNECT_JOB", NONE, { source_dependency: dep(34, "SSL_CONNECT_JOB") });
  addTcpTlsConnection(log, {
    host: "127.0.0.1", connectJob: 34, socket: 35, dnsStart: 1865, dnsEnd: 1865, tcpEnd: 1868, tlsEnd: 1868,
    remote: "127.0.0.1:8769", tcpError: -102
  });
  add(33, "HTTP_STREAM_JOB", 1868, "HTTP_STREAM_JOB", END, { net_error: -102 });
  addTransaction(log, {
    id: 30, url: "http://127.0.0.1:8769/probe",
    initiator: "https://portal.example.com", start: 1864, streamStart: 1865, streamEnd: 1868,
    controller: 32, job: 33, end: 1869, netError: -102,
    lna: { client_address_space: "public", resource_address_space: "loopback", result: "allowed" }
  });

  // 5. API call through a proxy that re-signs TLS with a private inspection root
  addController(log, 42, 1905, 1985, "PROXY proxy.corp.example.com:8080", 40);
  add(43, "HTTP_STREAM_JOB", 1985, "HTTP_STREAM_JOB", BEGIN, { destination: "https://api.example.org", using_quic: false });
  add(43, "HTTP_STREAM_JOB", 1985, "SOCKET_POOL_BOUND_TO_CONNECT_JOB", NONE, { source_dependency: dep(44, "SSL_CONNECT_JOB") });
  addTcpTlsConnection(log, {
    host: "api.example.org", connectJob: 44, socket: 45, certJob: 46,
    dnsStart: 1985, dnsEnd: 1985, tcpEnd: 2005, tlsEnd: 2405,
    local: "192.0.2.10:50002", remote: "198.51.100.99:8080",
    tlsVersion: "TLS 1.2", alpn: "http/1.1", knownRoot: false,
    certs: [TEST_CERTS.apiLeaf, TEST_CERTS.inspectionCa]
  });
  add(43, "HTTP_STREAM_JOB", 2405, "SOCKET_POOL_BOUND_TO_SOCKET", NONE, { source_dependency: dep(45, "SOCKET") });
  add(43, "HTTP_STREAM_JOB", 2405, "HTTP_STREAM_JOB", END);
  addTransaction(log, {
    id: 40, url: "https://api.example.org/v1/data?access_token=TOKENSECRET&page=2",
    initiator: "https://portal.example.com", start: 1904, streamStart: 1905, streamEnd: 2405,
    controller: 42, job: 43, protocol: "http/1.1", method: "POST", sendStart: 2405, sendEnd: 2406, headersAt: 2606, end: 2620,
    requestHeaders: ["Host: api.example.org", "Proxy-Authorization: Negotiate PROXYSECRET", "X-Api-Key: APIKEYSECRET"],
    responseHeaders: ["HTTP/1.1 200 OK", "content-type: application/json", "via: 1.1 proxy.corp.example.com"], bytes: 900
  });

  // 6. Extension background request served from cache
  addTransaction(log, {
    id: 50, url: "https://ext.example.com/ping", fromCache: true,
    initiator: "chrome-extension://abcdefghijklmnop",
    nik: "chrome-extension://abcdefghijklmnop chrome-extension://abcdefghijklmnop",
    start: 1500, end: 1502
  });

  log.events.sort((a, b) => Number(a.time) - Number(b.time));
  return { constants: constants(), events: log.events, polledData: polledData() };
}

/** A page with `count` subresource requests reusing one h2 session, for the no-cap test. */
export function buildManyRequestsNetLog(count) {
  const base = buildPageLoadNetLog();
  const extra = createLog();
  for (let i = 0; i < count; i++) {
    const id = 1000 + i * 3;
    const t = 4000 + i * 10;
    addController(extra, id + 1, t + 1, t + 1, "DIRECT", id);
    extra.add(id + 2, "HTTP_STREAM_JOB", t + 1, "HTTP_STREAM_JOB", BEGIN, { destination: "https://portal.example.com" });
    extra.add(id + 2, "HTTP_STREAM_JOB", t + 2, "HTTP2_SESSION_POOL_FOUND_EXISTING_SESSION", NONE, { source_dependency: extra.dep(7, "HTTP2_SESSION") });
    extra.add(id + 2, "HTTP_STREAM_JOB", t + 2, "HTTP_STREAM_JOB", END);
    addTransaction(extra, {
      id, url: `https://portal.example.com/img/${i}.png`, initiator: "https://portal.example.com",
      start: t, streamStart: t + 1, streamEnd: t + 2, controller: id + 1, job: id + 2, protocol: "h2",
      sendStart: t + 2, sendEnd: t + 3, headersAt: t + 8, end: t + 9,
      responseHeaders: ["HTTP/1.1 200", "content-type: image/png"], bytes: 100
    });
  }
  const events = [...base.events, ...extra.events].sort((a, b) => Number(a.time) - Number(b.time));
  return { constants: base.constants, events, polledData: base.polledData };
}

/** Serializes the way Chrome writes net-export files: constants, then one event per line. */
export function toNetLogText(netlog, { truncate = false } = {}) {
  const lines = netlog.events.map(e => JSON.stringify(e));
  let text = `{"constants":${JSON.stringify(netlog.constants)},\n"events": [\n${lines.join(",\n")}`;
  if (truncate) return text + ",\n";
  return text + `\n],\n"polledData":${JSON.stringify(netlog.polledData)}\n}\n`;
}
