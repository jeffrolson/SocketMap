/**
 * SocketMap Sample Trace Data
 * Provides a presentation-grade, multi-participant, multi-phase sample trace.
 */

export const SAMPLE_TRACE = {
  title: "Network Trace: GET /dashboard",
  timestamp: "2026-09-20T15:00:00.000Z",
  summary: {
    totalLatencyMs: 218,
    status: 200,
    transferredBytes: 15420,
    protocol: "h2",
    remoteIp: "203.0.113.81"
  },
  phases: [
    "Phase 01: DNS & TLS Setup",
    "Phase 02: Authentication & Gateway",
    "Phase 03: Request & Origin Processing",
    "Phase 04: Data Layer & Persistence",
    "Phase 05: Async Telemetry & Response"
  ],
  participants: [
    {
      id: "client",
      label: "User",
      sublabel: "browser session",
      role: "client",
      color: "#06b6d4" // Cyan
    },
    {
      id: "dns",
      label: "DNS Resolver",
      sublabel: "192.0.2.53 (DoH)",
      role: "infrastructure",
      color: "#8b5cf6" // Purple
    },
    {
      id: "gateway",
      label: "Edge Gateway",
      sublabel: "Cloudflare Edge / TLS",
      role: "gateway",
      color: "#10b981" // Emerald
    },
    {
      id: "auth",
      label: "Auth Guard",
      sublabel: "JWT / Session verify",
      role: "security",
      color: "#f43f5e" // Crimson
    },
    {
      id: "api",
      label: "Origin API",
      sublabel: "Node / Express",
      role: "service",
      color: "#f59e0b" // Amber
    },
    {
      id: "database",
      label: "PostgreSQL",
      sublabel: "primary cluster",
      role: "database",
      color: "#3b82f6" // Blue
    },
    {
      id: "worker",
      label: "Worker Queue",
      sublabel: "Kafka consumer",
      role: "worker",
      color: "#a855f7" // Violet
    }
  ],
  messages: [
    {
      id: "msg-1",
      from: "client",
      to: "dns",
      label: "DNS Query (DoH)",
      detail: "Query A / AAAA for api.socketmap.io",
      kind: "request",
      phase: 0,
      latencyMs: 24,
      status: null,
      method: "DNS",
      bytes: 64
    },
    {
      id: "msg-2",
      from: "dns",
      to: "client",
      label: "Resolved: 203.0.113.81",
      detail: "203.0.113.81 (TTL 300s)",
      kind: "return",
      phase: 0,
      latencyMs: 4,
      status: 200,
      bytes: 128
    },
    {
      id: "msg-3",
      from: "client",
      to: "gateway",
      label: "TCP + TLS 1.3 Handshake",
      detail: "Initial handshake with ALPN: h2, cipher: TLS_AES_128_GCM_SHA256",
      kind: "request",
      phase: 0,
      latencyMs: 38,
      status: null,
      bytes: 1240
    },
    {
      id: "msg-4",
      from: "gateway",
      to: "client",
      label: "TLS 1.3 Established (h2)",
      detail: "ServerHello + EncryptedExtensions + Certificate + Finished",
      kind: "return",
      phase: 0,
      latencyMs: 12,
      status: 200,
      bytes: 2840
    },
    {
      id: "msg-5",
      from: "client",
      to: "gateway",
      label: "GET /dashboard",
      detail: "Host: api.socketmap.io, User-Agent: Chrome/124.0, Accept: text/html",
      kind: "request",
      phase: 1,
      latencyMs: 14,
      method: "GET",
      status: 200,
      bytes: 1420
    },
    {
      id: "msg-6",
      from: "gateway",
      to: "auth",
      label: "Verify Session Token",
      detail: "Checking HMAC signature and expiry for user_id session",
      kind: "security",
      phase: 1,
      latencyMs: 11,
      method: "POST",
      bytes: 384
    },
    {
      id: "msg-7",
      from: "auth",
      to: "gateway",
      label: "Auth OK: uid=9812",
      detail: "Permissions: [read:dashboard, metrics:view], TTL: 3600s",
      kind: "return",
      phase: 1,
      latencyMs: 2,
      status: 200,
      bytes: 256
    },
    {
      id: "msg-8",
      from: "gateway",
      to: "api",
      label: "Proxy Pass (Cache Miss)",
      detail: "Upstream stream multiplexed over HTTP/2 connection pool",
      kind: "request",
      phase: 2,
      latencyMs: 16,
      method: "GET",
      bytes: 840
    },
    {
      id: "msg-9",
      from: "api",
      to: "api",
      label: "Local Cache Miss (Fallback to DB)",
      detail: "Key 'user:9812:dash' expired. Engaging direct query fallback.",
      kind: "retry",
      phase: 2,
      latencyMs: 6,
      isLoop: true
    },
    {
      id: "msg-10",
      from: "api",
      to: "database",
      label: "SELECT metrics WHERE uid = 9812",
      detail: "Query execution plan: Index Scan on metrics_user_idx (cost=0.42..8.44)",
      kind: "request",
      phase: 3,
      latencyMs: 28,
      bytes: 320
    },
    {
      id: "msg-11",
      from: "database",
      to: "api",
      label: "Row Set (12 metrics, 4.8KB)",
      detail: "Fetched 12 rows in 2.4ms, serialization 1.1ms",
      kind: "return",
      phase: 3,
      latencyMs: 3,
      status: 200,
      bytes: 4915
    },
    {
      id: "msg-12",
      from: "api",
      to: "worker",
      label: "Emit metric_viewed Event",
      detail: "Topic: analytics.views, Partition: 3, Ack: 1",
      kind: "async",
      phase: 4,
      latencyMs: 8,
      bytes: 412
    },
    {
      id: "msg-13",
      from: "worker",
      to: "worker",
      label: "Async Aggregation Job",
      detail: "Compacting sliding window metrics in memory buffer",
      kind: "async",
      phase: 4,
      latencyMs: 35,
      isLoop: true
    },
    {
      id: "msg-14",
      from: "api",
      to: "gateway",
      label: "200 OK (TTFB 68ms)",
      detail: "Content-Type: application/json; charset=utf-8, ETag: W/\"38a-bc9\"",
      kind: "return",
      phase: 4,
      latencyMs: 68,
      status: 200,
      bytes: 8420
    },
    {
      id: "msg-15",
      from: "gateway",
      to: "client",
      label: "Stream Complete (gzip 8.4KB)",
      detail: "HTTP/2 stream 1 closed. Total transfer time: 218ms",
      kind: "return",
      phase: 4,
      latencyMs: 15,
      status: 200,
      bytes: 8612
    }
  ]
};
