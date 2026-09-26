#!/usr/bin/env node

/**
 * generate-examples.mjs
 * Generates rich, realistic standalone example HTML diagrams into the `examples/` directory.
 * These files allow non-technical users and developers to immediately preview real-world
 * sequence diagrams without running any trace captures.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseNetLog } from "../src/parsers/netlog-parser.mjs";
import { normalizeTrace } from "../src/normalizer.mjs";
import { renderStandaloneHtml } from "../src/renderer/template.html.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = resolve(__dirname, "../examples");

// Ensure examples directory exists
mkdirSync(EXAMPLES_DIR, { recursive: true });

// ── 1. E-Commerce Checkout Flow ──────────────────────────────────────────
const ECOMMERCE_TRACE = {
  title: "E-Commerce Checkout Flow: POST /api/checkout/complete",
  timestamp: "2026-09-21T14:22:10.000Z",
  summary: {
    totalLatencyMs: 342,
    status: 201,
    transferredBytes: 18940,
    protocol: "h2",
    remoteIp: "104.18.32.10"
  },
  phases: [
    "Phase 01: Cart Validation & Inventory Lock",
    "Phase 02: Payment Authorization (Stripe 3D Secure)",
    "Phase 03: Order Persistence & DB Commit",
    "Phase 04: Async Fulfillment & Confirmation"
  ],
  participants: [
    {
      id: "client",
      label: "User (Browser)",
      sublabel: "Checkout Page",
      role: "client",
      color: "#06b6d4" // Cyan
    },
    {
      id: "waf",
      label: "Cloudflare WAF",
      sublabel: "Edge Security / Bot Mgmt",
      role: "gateway",
      color: "#10b981" // Emerald
    },
    {
      id: "api",
      label: "Storefront API",
      sublabel: "Node.js Gateway",
      role: "service",
      color: "#f59e0b" // Amber
    },
    {
      id: "inventory",
      label: "Inventory Service",
      sublabel: "gRPC Cluster",
      role: "service",
      color: "#0ea5e9" // Sky Blue
    },
    {
      id: "payment",
      label: "Payment Gateway",
      sublabel: "Stripe API v1",
      role: "security",
      color: "#f43f5e" // Crimson
    },
    {
      id: "database",
      label: "Orders Database",
      sublabel: "PostgreSQL Primary",
      role: "database",
      color: "#3b82f6" // Blue
    },
    {
      id: "queue",
      label: "Notification Queue",
      sublabel: "RabbitMQ / Email Worker",
      role: "worker",
      color: "#a855f7" // Violet
    }
  ],
  messages: [
    {
      id: "msg-ec-1",
      from: "client",
      to: "waf",
      label: "POST /api/checkout/complete",
      detail: "Cart: #cart_9281, Amount: $149.99, Currency: USD, Idempotency-Key: idemp_938102",
      kind: "request",
      phase: 0,
      latencyMs: 18,
      method: "POST",
      bytes: 1420
    },
    {
      id: "msg-ec-2",
      from: "waf",
      to: "api",
      label: "WAF Inspected (Bot Score: 99)",
      detail: "TLS 1.3 encrypted, Client IP reputation clean, Rate limit: 4/100 requests",
      kind: "request",
      phase: 0,
      latencyMs: 6,
      method: "POST",
      bytes: 1480
    },
    {
      id: "msg-ec-3",
      from: "api",
      to: "inventory",
      label: "Reserve Inventory: SKU-4091 (2 units)",
      detail: "gRPC call: InventoryService.HoldItems(cart_id='cart_9281', hold_duration='15m')",
      kind: "request",
      phase: 0,
      latencyMs: 24,
      method: "gRPC",
      bytes: 380
    },
    {
      id: "msg-ec-4",
      from: "inventory",
      to: "api",
      label: "Stock Reserved (Hold #hld_8192)",
      detail: "Warehouse: US-East-1, Remaining SKU stock: 48 units",
      kind: "return",
      phase: 0,
      latencyMs: 8,
      status: 200,
      bytes: 240
    },
    {
      id: "msg-ec-5",
      from: "api",
      to: "payment",
      label: "POST /v1/payment_intents/confirm",
      detail: "Amount: $149.99, Card: Visa ending 4242, 3D Secure: frictionless authenticated",
      kind: "security",
      phase: 1,
      latencyMs: 92,
      method: "POST",
      bytes: 1840
    },
    {
      id: "msg-ec-6",
      from: "payment",
      to: "api",
      label: "200 Payment Authorized (ch_938120)",
      detail: "Status: succeeded, Risk Level: normal, Network Auth Code: AUTH_994182",
      kind: "return",
      phase: 1,
      latencyMs: 12,
      status: 200,
      bytes: 2150
    },
    {
      id: "msg-ec-7",
      from: "api",
      to: "database",
      label: "BEGIN TRANSACTION -> INSERT INTO orders",
      detail: "Columns: id='ord_9821', user_id=4812, total=149.99, status='PAID', charge_id='ch_938120'",
      kind: "request",
      phase: 2,
      latencyMs: 22,
      bytes: 620
    },
    {
      id: "msg-ec-8",
      from: "database",
      to: "api",
      label: "COMMIT SUCCESS (ord_9821 created)",
      detail: "Row committed in 4.1ms, WAL sync complete",
      kind: "return",
      phase: 2,
      latencyMs: 5,
      status: 200,
      bytes: 340
    },
    {
      id: "msg-ec-9",
      from: "api",
      to: "queue",
      label: "Publish Event: order.confirmed",
      detail: "RoutingKey: fulfillment.orders, Payload: { order_id: 'ord_9821', email: 'user@example.com' }",
      kind: "async",
      phase: 3,
      latencyMs: 14,
      bytes: 512
    },
    {
      id: "msg-ec-10",
      from: "queue",
      to: "queue",
      label: "Trigger Invoice PDF & Shipping Label",
      detail: "Background worker picked up job 'ord_9821'. Dispatched to printer & warehouse API.",
      kind: "async",
      phase: 3,
      latencyMs: 45,
      isLoop: true
    },
    {
      id: "msg-ec-11",
      from: "api",
      to: "waf",
      label: "201 Created (Order Confirmed)",
      detail: "JSON: { orderId: 'ord_9821', receiptUrl: 'https://shop.example.com/orders/ord_9821' }",
      kind: "return",
      phase: 3,
      latencyMs: 38,
      status: 201,
      bytes: 3850
    },
    {
      id: "msg-ec-12",
      from: "waf",
      to: "client",
      label: "Order Placed Successfully (342ms total)",
      detail: "HTTP/2 stream closed cleanly. Browser renders thank you confirmation page.",
      kind: "return",
      phase: 3,
      latencyMs: 15,
      status: 201,
      bytes: 3980
    }
  ]
};

// ── 2. User Login & Multi-Factor Auth Flow ────────────────────────────────
const LOGIN_2FA_TRACE = {
  title: "User Authentication: POST /auth/login + SMS 2FA Challenge",
  timestamp: "2026-09-21T15:10:00.000Z",
  summary: {
    totalLatencyMs: 485,
    status: 200,
    transferredBytes: 9240,
    protocol: "h2",
    remoteIp: "172.67.189.44"
  },
  phases: [
    "Phase 01: Credential Submission & Password Check",
    "Phase 02: 2FA Challenge Generation & SMS Dispatch",
    "Phase 03: One-Time Code Verification",
    "Phase 04: Session Cookie Issuance & Redirect"
  ],
  participants: [
    {
      id: "client",
      label: "User (Browser)",
      sublabel: "Login Modal",
      role: "client",
      color: "#06b6d4"
    },
    {
      id: "edge",
      label: "Edge Proxy",
      sublabel: "SSL & Anti-Abuse",
      role: "gateway",
      color: "#10b981"
    },
    {
      id: "auth",
      label: "Auth Guard",
      sublabel: "Identity & Tokens",
      role: "security",
      color: "#f43f5e"
    },
    {
      id: "userdb",
      label: "Account DB",
      sublabel: "Users & Password Hashes",
      role: "database",
      color: "#3b82f6"
    },
    {
      id: "sms",
      label: "Twilio SMS",
      sublabel: "Telephony Provider",
      role: "worker",
      color: "#a855f7"
    },
    {
      id: "redis",
      label: "Session Cache",
      sublabel: "Redis In-Memory",
      role: "cache",
      color: "#0ea5e9"
    }
  ],
  messages: [
    {
      id: "msg-auth-1",
      from: "client",
      to: "edge",
      label: "POST /auth/login (Credentials)",
      detail: "User: alex.chen@example.com, Password: [REDACTED], CSRF-Token: [REDACTED]",
      kind: "request",
      phase: 0,
      latencyMs: 14,
      method: "POST",
      bytes: 680
    },
    {
      id: "msg-auth-2",
      from: "edge",
      to: "auth",
      label: "Authenticate User",
      detail: "Verifying origin, TLS fingerprint, and IP geolocation (Portland, US)",
      kind: "security",
      phase: 0,
      latencyMs: 8,
      method: "POST",
      bytes: 720
    },
    {
      id: "msg-auth-3",
      from: "auth",
      to: "userdb",
      label: "SELECT * FROM users WHERE email = 'alex.chen...'",
      detail: "Retrieved argon2id hash, user_id=9814, mfa_enabled=true, phone='+1-503-***-8821'",
      kind: "request",
      phase: 0,
      latencyMs: 32,
      bytes: 280
    },
    {
      id: "msg-auth-4",
      from: "userdb",
      to: "auth",
      label: "Hash Verified: 2FA Required",
      detail: "Password match successful. User policy enforces SMS or Authenticator TOTP.",
      kind: "return",
      phase: 0,
      latencyMs: 6,
      status: 200,
      bytes: 420
    },
    {
      id: "msg-auth-5",
      from: "auth",
      to: "sms",
      label: "POST /Messages (Send 6-digit OTP)",
      detail: "To: +1503***8821, Body: 'Your security verification code is: 849-102 (valid 5 mins)'",
      kind: "async",
      phase: 1,
      latencyMs: 110,
      method: "POST",
      bytes: 520
    },
    {
      id: "msg-auth-6",
      from: "sms",
      to: "auth",
      label: "SMS Queued: Sid=SM839104",
      detail: "Carrier accepted: T-Mobile US, Status: queued_for_delivery",
      kind: "return",
      phase: 1,
      latencyMs: 15,
      status: 200,
      bytes: 310
    },
    {
      id: "msg-auth-7",
      from: "auth",
      to: "client",
      label: "200 Challenge: Enter 6-digit SMS Code",
      detail: "Response: { status: 'MFA_REQUIRED', challenge_id: 'chl_81920', masked_phone: '+1 (503) ***-8821' }",
      kind: "return",
      phase: 1,
      latencyMs: 18,
      status: 200,
      bytes: 840
    },
    {
      id: "msg-auth-8",
      from: "client",
      to: "auth",
      label: "POST /auth/verify-2fa (Code: 849102)",
      detail: "Payload: { challenge_id: 'chl_81920', code: '849102' }",
      kind: "security",
      phase: 2,
      latencyMs: 25,
      method: "POST",
      bytes: 460
    },
    {
      id: "msg-auth-9",
      from: "auth",
      to: "redis",
      label: "GET challenge:chl_81920",
      detail: "Verifying stored OTP code hash against user input with timing-safe comparison",
      kind: "request",
      phase: 2,
      latencyMs: 4,
      bytes: 180
    },
    {
      id: "msg-auth-10",
      from: "redis",
      to: "auth",
      label: "Code Match! Invalidate Challenge Key",
      detail: "Key deleted to prevent replay attacks. Session authorization marked as valid.",
      kind: "return",
      phase: 2,
      latencyMs: 2,
      status: 200,
      bytes: 120
    },
    {
      id: "msg-auth-11",
      from: "auth",
      to: "auth",
      label: "Sign RS256 JWT Token",
      detail: "Claims: { sub: 'usr_9814', role: 'admin', exp: 1789912000 }. Signed with private RSA key.",
      kind: "retry",
      phase: 3,
      latencyMs: 8,
      isLoop: true
    },
    {
      id: "msg-auth-12",
      from: "auth",
      to: "client",
      label: "200 OK: Set-Cookie (Secure, HttpOnly, SameSite=Strict)",
      detail: "Set-Cookie: session_token=[REDACTED]; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400",
      kind: "return",
      phase: 3,
      latencyMs: 12,
      status: 200,
      bytes: 1280
    }
  ]
};

// ── 3. Slow API Troubleshooting & Cache Recovery ────────────────────────
const SLOW_API_TRACE = {
  title: "Incident Triage: Recommendations API 504 Timeout & Cache Fallback",
  timestamp: "2026-09-21T16:45:00.000Z",
  summary: {
    totalLatencyMs: 1240,
    status: 200,
    transferredBytes: 34800,
    protocol: "h2",
    remoteIp: "198.51.100.24"
  },
  phases: [
    "Phase 01: Initial Connection & Static Page Delivery",
    "Phase 02: Dynamic ML API Call & 800ms Upstream Timeout",
    "Phase 03: Circuit Breaker Trip & Redis Cache Fallback Recovery"
  ],
  participants: [
    {
      id: "client",
      label: "User (Browser)",
      sublabel: "Product Catalog",
      role: "client",
      color: "#06b6d4"
    },
    {
      id: "dns",
      label: "DNS Server",
      sublabel: "1.1.1.1 (Cloudflare)",
      role: "infrastructure",
      color: "#8b5cf6"
    },
    {
      id: "nginx",
      label: "Nginx Gateway",
      sublabel: "Reverse Proxy & Circuit Breaker",
      role: "gateway",
      color: "#10b981"
    },
    {
      id: "mlservice",
      label: "Recommendation ML",
      sublabel: "Python / PyTorch Service",
      role: "service",
      color: "#f43f5e" // Red for troubled service
    },
    {
      id: "cache",
      label: "Redis Cache",
      sublabel: "Fallback Pre-computed Recommendations",
      role: "cache",
      color: "#0ea5e9"
    }
  ],
  messages: [
    {
      id: "msg-slow-1",
      from: "client",
      to: "dns",
      label: "DNS Query: store.example.com",
      detail: "Resolving A record via DoH (DNS-over-HTTPS)",
      kind: "request",
      phase: 0,
      latencyMs: 22,
      method: "DNS",
      bytes: 68
    },
    {
      id: "msg-slow-2",
      from: "dns",
      to: "client",
      label: "Resolved: 198.51.100.24 (TTL 300s)",
      detail: "Answer: 198.51.100.24, latency: 14ms",
      kind: "return",
      phase: 0,
      latencyMs: 4,
      status: 200,
      bytes: 112
    },
    {
      id: "msg-slow-3",
      from: "client",
      to: "nginx",
      label: "GET /products/running-shoes",
      detail: "Accept: text/html, Cache-Control: max-age=0",
      kind: "request",
      phase: 0,
      latencyMs: 34,
      method: "GET",
      bytes: 1120
    },
    {
      id: "msg-slow-4",
      from: "nginx",
      to: "client",
      label: "200 OK (HTML & Layout delivered)",
      detail: "Content-Type: text/html; charset=utf-8, Transferred: 24.8KB, gzip compressed",
      kind: "return",
      phase: 0,
      latencyMs: 28,
      status: 200,
      bytes: 25400
    },
    {
      id: "msg-slow-5",
      from: "client",
      to: "nginx",
      label: "AJAX: GET /api/v1/recommendations/personalized",
      detail: "Requested 8 personalized product cards based on user browsing history",
      kind: "request",
      phase: 1,
      latencyMs: 16,
      method: "GET",
      bytes: 840
    },
    {
      id: "msg-slow-6",
      from: "nginx",
      to: "mlservice",
      label: "Forward to ML Upstream (Port 8080)",
      detail: "Proxy pass to backend PyTorch inference container under high CPU load (99.4%)",
      kind: "request",
      phase: 1,
      latencyMs: 12,
      method: "POST",
      bytes: 920
    },
    {
      id: "msg-slow-7",
      from: "mlservice",
      to: "mlservice",
      label: "Worker Hang: CUDA Out of Memory / Queue Saturation",
      detail: "ML thread pool exhausted. Upstream failed to respond within 800ms gateway threshold.",
      kind: "retry",
      phase: 1,
      latencyMs: 820,
      isLoop: true
    },
    {
      id: "msg-slow-8",
      from: "mlservice",
      to: "nginx",
      label: "504 Gateway Timeout (Upstream Hung)",
      detail: "Nginx upstream timeout reached (proxy_read_timeout 800ms exceeded)",
      kind: "return",
      phase: 1,
      latencyMs: 5,
      status: 504,
      bytes: 380
    },
    {
      id: "msg-slow-9",
      from: "nginx",
      to: "nginx",
      label: "Trip Circuit Breaker -> Engage Cache Fallback",
      detail: "Circuit breaker status: OPEN. Routing to standby Redis cache to prevent user error.",
      kind: "retry",
      phase: 2,
      latencyMs: 4,
      isLoop: true
    },
    {
      id: "msg-slow-10",
      from: "nginx",
      to: "cache",
      label: "GET fallback:popular_running_shoes",
      detail: "Fetching pre-computed trending recommendations from Redis key store",
      kind: "request",
      phase: 2,
      latencyMs: 8,
      bytes: 240
    },
    {
      id: "msg-slow-11",
      from: "cache",
      to: "nginx",
      label: "Cache Hit: 8 Popular Items (3.2ms)",
      detail: "JSON payload: 8 items, 4.2KB. Cache age: 18m.",
      kind: "return",
      phase: 2,
      latencyMs: 3,
      status: 200,
      bytes: 4320
    },
    {
      id: "msg-slow-12",
      from: "nginx",
      to: "client",
      label: "200 OK (X-Cache-Fallback: true)",
      detail: "Page loads gracefully with cached trending items. Zero user-facing error message!",
      kind: "return",
      phase: 2,
      latencyMs: 14,
      status: 200,
      bytes: 4620
    }
  ]
};

// ── Build and Render Artifacts ───────────────────────────────────────────
const EXAMPLES = [
  {
    name: "ecommerce-checkout.html",
    trace: ECOMMERCE_TRACE,
    description: "E-Commerce Checkout & Payment Flow"
  },
  {
    name: "user-login-2fa.html",
    trace: LOGIN_2FA_TRACE,
    description: "User Login & Multi-Factor Auth Flow"
  },
  {
    name: "slow-api-troubleshooting.html",
    trace: SLOW_API_TRACE,
    description: "Slow API Timeout & Cache Fallback Troubleshooting"
  }
];

console.log("\x1b[1m\x1b[36mGenerating Interactive Example Diagrams...\x1b[0m\n");

for (const { name, trace, description } of EXAMPLES) {
  const normalized = normalizeTrace(trace);
  const html = renderStandaloneHtml(normalized);
  const outPath = resolve(EXAMPLES_DIR, name);
  writeFileSync(outPath, html, "utf8");
  console.log(`\x1b[32m✔ Created:\x1b[0m ${name} (\x1b[33m${description}\x1b[0m)`);
}

const realWorldNetLog = resolve(EXAMPLES_DIR, "Example_Weekend Game Plan_chrome-net-export-log.json");
if (existsSync(realWorldNetLog)) {
  const rawTrace = await parseNetLog(realWorldNetLog);
  const normalized = normalizeTrace(rawTrace);
  const html = renderStandaloneHtml(normalized);
  const outPath = resolve(EXAMPLES_DIR, "weekend-game-plan.html");
  writeFileSync(outPath, html, "utf8");
  console.log(`\x1b[32m✔ Created:\x1b[0m weekend-game-plan.html (\x1b[33mReal-world Chromium NetLog: Google Firestore & Signaler\x1b[0m)`);
}

console.log(`\n\x1b[1m\x1b[32mSUCCESS:\x1b[0m Example diagrams generated in \x1b[1m${EXAMPLES_DIR}\x1b[0m`);
