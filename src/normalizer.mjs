/**
 * SocketMap Intermediate Representation (IR) Normalizer
 * Standardizes raw network events and parsed traces into a clean, canonical structure.
 */

export const SEMANTIC_PALETTES = {
  client: "#06b6d4",        // Cyan
  infrastructure: "#8b5cf6",// Purple
  dns: "#8b5cf6",           // Purple
  gateway: "#10b981",       // Emerald
  edge: "#10b981",          // Emerald
  security: "#f43f5e",      // Crimson
  auth: "#f43f5e",          // Crimson
  service: "#f59e0b",       // Amber
  api: "#f59e0b",           // Amber
  database: "#3b82f6",      // Blue
  cache: "#0ea5e9",         // Sky Blue
  worker: "#a855f7",        // Violet
  fallback: "#64748b"       // Slate Gray
};

export const GUIDANCE_CATALOG = {
  dns_tls: {
    categoryTitle: "DNS Resolution & Connection Setup",
    good: "Standard DNS lookup and TLS 1.3 handshake.",
    better: "Use <link rel=\"preconnect\"> or <link rel=\"dns-prefetch\"> in <head> to eliminate connection delay before subresources are requested.",
    best: "Consolidate origins behind an Edge Reverse Proxy using HTTP/3 multiplexing and TLS 1.3 0-RTT session resumption.",
    docsUrl: "https://developer.chrome.com/docs/modern-web-guidance",
    docsLabel: "Chrome Modern Web Guidance"
  },
  render_blocking_asset: {
    categoryTitle: "Render-Blocking Document & Assets",
    good: "Minify CSS/JS and compress payloads with Brotli/Gzip.",
    better: "Add <script defer> or type=\"module\" to stop blocking HTML parsing; use <link rel=\"preload\"> for critical fonts/LCP.",
    best: "Inline critical path CSS into <head>, apply fetchpriority=\"high\" to LCP candidate image, and selectively use modern blocking=\"render\".",
    docsUrl: "https://developer.chrome.com/docs/modern-web-guidance",
    docsLabel: "Chrome Guidance: Resource Prioritization"
  },
  api_endpoint: {
    categoryTitle: "Dynamic API & Data Transactions",
    good: "Sequential client-side HTTP fetch.",
    better: "Execute parallel requests with Promise.all(); utilize HTTP caching (Cache-Control: stale-while-revalidate).",
    best: "Stream server-rendered HTML (Edge SSR) or aggregate dependent microservice calls via Edge BFF / GraphQL to remove client round-trips.",
    docsUrl: "https://developer.chrome.com/docs/modern-web-guidance",
    docsLabel: "Chrome Guidance: Data Fetching"
  },
  database_service: {
    categoryTitle: "Data Layer & Service Persistence",
    good: "Direct indexed database queries or internal microservice RPC.",
    better: "Add an in-memory distributed cache (Redis) with sub-5ms read latency.",
    best: "Connection pooling (PgBouncer), read-replica splitting, and materialized view caching for expensive aggregations.",
    docsUrl: "https://developer.chrome.com/docs/modern-web-guidance",
    docsLabel: "Chrome Guidance: Architecture"
  },
  async_background: {
    categoryTitle: "Asynchronous Telemetry & Background Processing",
    good: "Non-blocking client-side asynchronous dispatch.",
    better: "Decouple via reliable message queue (RabbitMQ / Kafka) with dedicated worker pool.",
    best: "Serverless event-driven consumers with automatic dead-letter queue retry policies and idempotency keys.",
    docsUrl: "https://developer.chrome.com/docs/modern-web-guidance",
    docsLabel: "Chrome Guidance: Background Processing"
  }
};

/**
 * Classifies an interaction to determine whether it is on the critical blocking path
 * and maps it to a prescriptive modern web guidance category.
 */
export function classifyInteraction(msg) {
  const label = (msg.label || "").toLowerCase();
  const detail = (msg.detail || "").toLowerCase();
  const method = (msg.method || "").toUpperCase();
  const kind = (msg.kind || "").toLowerCase();

  // 1. DNS or TLS
  if (method === "DNS" || label.includes("dns") || label.includes("handshake") || label.includes("tls") || label.includes("connect")) {
    return {
      category: "dns_tls",
      isBlocking: msg.phase === 0,
      blockingReason: msg.phase === 0 ? "Initial Connection Setup" : "Subresource Origin Handshake"
    };
  }

  // 2. Async, Telemetry, Worker
  if (kind === "async" || label.includes("telemetry") || label.includes("analytic") || label.includes("worker") || label.includes("emit ")) {
    return {
      category: "async_background",
      isBlocking: false,
      blockingReason: "Non-Blocking Async / Background Job"
    };
  }

  // 3. Database / Storage
  if (label.includes("select ") || label.includes("insert ") || label.includes("commit") || label.includes("database") || label.includes("sql") || label.includes("db")) {
    return {
      category: "database_service",
      isBlocking: msg.phase <= 2 && kind !== "async",
      blockingReason: msg.phase <= 2 ? "Synchronous Data Dependency" : "Deferred Persistence"
    };
  }

  // 4. Render-blocking Assets (HTML, CSS, parser-blocking JS, font)
  if (label.includes("get /") && (label.includes(".css") || label.includes(".js") || label.includes(".html") || label.includes(".woff") || detail.includes("text/html") || detail.includes("text/css") || msg.phase === 0)) {
    const isDeferred = detail.includes("defer") || detail.includes("async");
    return {
      category: "render_blocking_asset",
      isBlocking: !isDeferred,
      blockingReason: isDeferred ? "Deferred Script" : (label.includes(".css") ? "Render-Blocking CSS" : "Critical Document / Asset")
    };
  }

  // 5. Default API / Service Endpoint
  const isApiBlocking = kind === "security" || msg.phase <= 2;
  return {
    category: "api_endpoint",
    isBlocking: isApiBlocking,
    blockingReason: isApiBlocking ? (kind === "security" ? "Authentication Barrier" : "Primary Action Blocking UI") : "Background Data Fetch"
  };
}

/**
 * Detects domain and port from message details, labels, and participants.
 */
export function extractMessageDomainAndPort(msg) {
  const text = `${msg.label || ""} ${msg.detail || ""} ${msg.url || ""}`;
  
  // 1. Check for explicit URL (e.g., https://api.stripe.com/v1/...)
  const urlMatch = text.match(/https?:\/\/([a-zA-Z0-9.-]+)(?::(\d+))?/i);
  if (urlMatch) {
    const domain = urlMatch[1].toLowerCase();
    const port = urlMatch[2] || (urlMatch[0].toLowerCase().startsWith("https") ? "443" : "80");
    return { domain, port };
  }

  // 2. Check for DNS Lookup pattern (e.g., DNS Lookup firestore.googleapis.com)
  const dnsMatch = text.match(/dns lookup\s+([a-zA-Z0-9.-]+)/i);
  if (dnsMatch) {
    return { domain: dnsMatch[1].toLowerCase(), port: "53" };
  }

  // 3. Check for Host header in detail JSON/text
  const hostMatch = text.match(/["']?Host["']?\s*:\s*["']?([a-zA-Z0-9.-]+)(?::(\d+))?["']?/i);
  if (hostMatch) {
    return {
      domain: hostMatch[1].toLowerCase(),
      port: hostMatch[2] || "443"
    };
  }

  // 4. Participant fallback (e.g. from: "api", to: "stripe", to: "db")
  for (const part of [msg.to, msg.from]) {
    if (part) {
      const pLower = part.toLowerCase();
      if (pLower.includes("stripe")) return { domain: "api.stripe.com", port: "443" };
      if (pLower.includes("twilio")) return { domain: "verify.twilio.com", port: "443" };
      if (pLower.includes("waf") || pLower.includes("cloudflare")) return { domain: "edge.cloudflare.com", port: "443" };
      if (pLower.includes("db") || pLower.includes("sql") || pLower.includes("postgres")) {
        return { domain: pLower.includes(".") ? pLower : `${pLower}.cluster.internal`, port: "5432" };
      }
      if (pLower.includes("redis") || pLower.includes("cache")) {
        return { domain: pLower.includes(".") ? pLower : `cache.${pLower}.internal`, port: "6379" };
      }
      if (pLower.includes("worker")) return { domain: "worker.queue.internal", port: "443" };
      if (pLower.includes("recom")) return { domain: "recommendations.api.internal", port: "443" };
      if (pLower.includes("auth")) return { domain: "auth.identity.internal", port: "443" };
      if (pLower.includes("api")) return { domain: pLower.includes(".") ? pLower : `${pLower}.storefront.internal`, port: "443" };
      if (pLower.includes(".")) {
        return { domain: pLower, port: "443" };
      }
    }
  }

  const labelLower = (msg.label || "").toLowerCase();
  if (labelLower.includes("sql") || labelLower.includes("database") || labelLower.includes("select") || labelLower.includes("commit")) {
    return { domain: "db.cluster.internal", port: "5432" };
  }
  if (labelLower.includes("redis") || labelLower.includes("cache")) {
    return { domain: "cache.redis.internal", port: "6379" };
  }

  return { domain: "origin.internal", port: "443" };
}

/**
 * Detects client frameworks, libraries, and infrastructure tools from message metadata.
 */
export function detectMessageTechnologies(msg) {
  const text = `${msg.label || ""} ${msg.detail || ""} ${msg.from || ""} ${msg.to || ""} ${msg.url || ""}`.toLowerCase();
  const libraries = new Set();
  const infrastructure = new Set();

  // Client Frameworks & Libraries
  if (text.includes("react") || text.includes("/_next/static/chunks/react")) libraries.add("React");
  if (text.includes("/_next/") || text.includes("nextjs") || text.includes("next.js")) libraries.add("Next.js");
  if (text.includes("vue") || text.includes("/_nuxt/")) libraries.add("Vue.js");
  if (text.includes("angular") || text.includes("@angular")) libraries.add("Angular");
  if (text.includes("tailwind")) libraries.add("Tailwind CSS");
  if (text.includes("bootstrap")) libraries.add("Bootstrap");
  if (text.includes("stripe") || text.includes("payment_intent")) libraries.add("Stripe.js");
  if (text.includes("firebase") || text.includes("firestore") || text.includes("identitytoolkit")) libraries.add("Firebase Web SDK");
  if (text.includes("googletagmanager") || text.includes("google-analytics") || text.includes("gtag")) libraries.add("Google Analytics / GTM");
  if (text.includes("sentry")) libraries.add("Sentry SDK");
  if (text.includes("datadog") || text.includes("dd-trace")) libraries.add("Datadog RUM");
  if (text.includes("twilio") || text.includes("authy") || text.includes("otp")) libraries.add("Twilio SMS / Verify");
  if (text.includes("graphql") || text.includes("apollo")) libraries.add("GraphQL");
  if (text.includes("websocket") || text.includes("wss://") || text.includes("listenchannel") || text.includes("stream complete")) libraries.add("WebSockets / Streaming");

  // Infrastructure, Cloud & Server Tools
  if (text.includes("cloudflare") || text.includes("cf-ray") || text.includes("cf-cache")) infrastructure.add("Cloudflare WAF / CDN");
  if (text.includes("googleapis.com") || text.includes("gws") || text.includes("google frontend") || text.includes("1e100.net")) infrastructure.add("Google Cloud / GWS");
  if (text.includes("amazonaws.com") || text.includes("cloudfront") || text.includes("x-amz-") || text.includes("s3.")) infrastructure.add("AWS / CloudFront");
  if (text.includes("fastly")) infrastructure.add("Fastly CDN");
  if (text.includes("nginx")) infrastructure.add("Nginx Server");
  if (text.includes("apache")) infrastructure.add("Apache Server");
  if (text.includes("envoy") || text.includes("x-envoy-")) infrastructure.add("Envoy Proxy");
  if (text.includes("redis") || text.includes("cache")) infrastructure.add("Redis Cache");
  if (text.includes("postgres") || text.includes("pg_") || text.includes("5432")) infrastructure.add("PostgreSQL");
  if (text.includes("mysql") || text.includes("3306")) infrastructure.add("MySQL");
  if (text.includes("rabbitmq") || text.includes("kafka") || text.includes("queue") || text.includes("worker")) infrastructure.add("Message Queue / Worker");

  return {
    libraries: Array.from(libraries),
    infrastructure: Array.from(infrastructure)
  };
}

/**
 * Classifies an interaction into a human-readable resource/media type.
 */
export function classifyResourceType(msg) {
  const text = `${msg.label || ""} ${msg.detail || ""}`.toLowerCase();
  const method = (msg.method || "").toUpperCase();

  if (method === "DNS" || text.includes("dns lookup") || text.includes("tls handshake") || text.includes("connect")) {
    return "DNS & Connection";
  }
  if (text.includes(".css") || text.includes("text/css")) return "CSS Stylesheet";
  if (text.includes(".js") || text.includes("javascript")) return "JavaScript Code";
  if (text.includes(".html") || text.includes("text/html") || (msg.phase === 0 && method === "GET")) return "HTML Document";
  if (text.includes(".woff") || text.includes(".ttf") || text.includes("font/")) return "Web Font";
  if (text.includes(".png") || text.includes(".jpg") || text.includes(".jpeg") || text.includes(".svg") || text.includes("image/")) return "Image / Media";
  if (text.includes("firestore listen") || text.includes("websocket") || text.includes("stream complete")) return "Realtime Channel";
  if (text.includes("select ") || text.includes("insert ") || text.includes("commit") || text.includes("sql") || text.includes("database")) return "Database Query";
  if (text.includes("redis") || text.includes("cache")) return "Cache Operation";
  return "API / JSON Data";
}

/**
 * Extracts and aggregates the comprehensive inventory of domains, ports,
 * libraries, infrastructure tools, and resource types from a trace.
 */
export function extractTraceInventory(trace, messages) {
  const domainMap = new Map();
  const portMap = new Map();
  const libMap = new Map();
  const infraMap = new Map();
  const resourceMap = new Map();

  for (const msg of messages) {
    // 1. Domains
    if (msg.domain) {
      const cur = domainMap.get(msg.domain) || { name: msg.domain, count: 0, isExternal: !msg.domain.endsWith(".internal") && !msg.domain.includes("local") };
      cur.count++;
      domainMap.set(msg.domain, cur);
    }

    // 2. Ports
    if (msg.port) {
      const p = String(msg.port);
      let proto = "TCP";
      let desc = "Custom Service Port";
      if (p === "443") { proto = "HTTPS"; desc = "Secure Web Traffic"; }
      else if (p === "80") { proto = "HTTP"; desc = "Standard Web Traffic"; }
      else if (p === "53") { proto = "DNS"; desc = "Domain Name Resolution"; }
      else if (p === "5432") { proto = "PostgreSQL"; desc = "Relational Database Port"; }
      else if (p === "3306") { proto = "MySQL"; desc = "Relational Database Port"; }
      else if (p === "6379") { proto = "Redis"; desc = "In-Memory Cache & KV Store"; }
      else if (p === "8080" || p === "3000" || p === "5000") { proto = "HTTP"; desc = "Development / API Server"; }
      
      const cur = portMap.get(p) || { port: p, protocol: proto, count: 0, description: desc };
      cur.count++;
      portMap.set(p, cur);
    }

    // 3. Technologies
    const detected = detectMessageTechnologies(msg);
    for (const lib of detected.libraries) {
      const cur = libMap.get(lib) || { name: lib, count: 0, category: "Client Framework / SDK" };
      cur.count++;
      libMap.set(lib, cur);
    }
    for (const inf of detected.infrastructure) {
      const cur = infraMap.get(inf) || { name: inf, count: 0, category: "Cloud & Infrastructure Tool" };
      cur.count++;
      infraMap.set(inf, cur);
    }

    // 4. Resource Types
    if (msg.resourceType) {
      const cur = resourceMap.get(msg.resourceType) || { type: msg.resourceType, count: 0 };
      cur.count++;
      resourceMap.set(msg.resourceType, cur);
    }
  }

  // Also check participant metadata for additional infrastructure hints
  for (const p of trace.participants || []) {
    const text = `${p.id || ""} ${p.label || ""} ${p.sublabel || ""}`.toLowerCase();
    if (text.includes("cloudflare") && !infraMap.has("Cloudflare WAF / CDN")) {
      infraMap.set("Cloudflare WAF / CDN", { name: "Cloudflare WAF / CDN", count: 1, category: "Cloud & Infrastructure Tool" });
    }
    if (text.includes("stripe") && !libMap.has("Stripe.js")) {
      libMap.set("Stripe.js", { name: "Stripe.js", count: 1, category: "Client Framework / SDK" });
    }
    if (text.includes("redis") && !infraMap.has("Redis Cache")) {
      infraMap.set("Redis Cache", { name: "Redis Cache", count: 1, category: "Cloud & Infrastructure Tool" });
    }
    if (text.includes("twilio") && !libMap.has("Twilio SMS / Verify")) {
      libMap.set("Twilio SMS / Verify", { name: "Twilio SMS / Verify", count: 1, category: "Client Framework / SDK" });
    }
    if (text.includes("postgres") && !infraMap.has("PostgreSQL")) {
      infraMap.set("PostgreSQL", { name: "PostgreSQL", count: 1, category: "Cloud & Infrastructure Tool" });
    }
  }

  const domains = Array.from(domainMap.values()).sort((a, b) => b.count - a.count);
  const ports = Array.from(portMap.values()).sort((a, b) => b.count - a.count);
  const frameworks_libraries = Array.from(libMap.values()).sort((a, b) => b.count - a.count);
  const infrastructure_tools = Array.from(infraMap.values()).sort((a, b) => b.count - a.count);
  const resource_types = Array.from(resourceMap.values()).sort((a, b) => b.count - a.count);

  return {
    domains,
    ports,
    frameworks_libraries,
    infrastructure_tools,
    resource_types,
    summary: {
      totalDomains: domains.length,
      totalPorts: ports.length,
      totalLibraries: frameworks_libraries.length,
      totalInfrastructure: infrastructure_tools.length,
      totalTechnologies: frameworks_libraries.length + infrastructure_tools.length,
      totalResources: resource_types.length,
      totalInteractions: messages.length
    }
  };
}

const PALETTE_FALLBACKS = [
  "#06b6d4", // Cyan
  "#8b5cf6", // Purple
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#f43f5e", // Crimson
  "#3b82f6", // Blue
  "#a855f7", // Violet
  "#ec4899", // Pink
  "#14b8a6"  // Teal
];

/**
 * Returns a semantic or assigned color for a given role or index.
 */
export function getRoleColor(role = "service", index = 0) {
  const normalizedRole = String(role).toLowerCase();
  if (SEMANTIC_PALETTES[normalizedRole]) {
    return SEMANTIC_PALETTES[normalizedRole];
  }
  return PALETTE_FALLBACKS[index % PALETTE_FALLBACKS.length];
}

/**
 * Redacts sensitive credentials from headers, query strings, and payloads.
 */
export function redactSensitiveData(data) {
  if (!data) return data;

  if (typeof data === "string") {
    return data
      .replace(/(Authorization:\s*(?:Bearer|Basic)?\s*)[^\r\n]+/gi, "$1[REDACTED]")
      .replace(/(Cookie:\s*)[^\r\n]+/gi, "$1[REDACTED]")
      .replace(/(Set-Cookie:\s*)[^\r\n]+/gi, "$1[REDACTED]")
      .replace(/(["']?(?:password|token|secret|apiKey|access_token)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1[REDACTED]");
  }

  if (Array.isArray(data)) {
    return data.map(item => {
      // Handle HAR style { name, value } header objects
      if (item && typeof item === "object" && "name" in item && "value" in item) {
        const nameLower = String(item.name).toLowerCase();
        if (nameLower === "authorization" || nameLower === "cookie" || nameLower === "set-cookie" ||
            nameLower === "proxy-authorization" || nameLower.includes("secret") || nameLower.includes("token")) {
          return { ...item, value: "[REDACTED]" };
        }
      }
      return redactSensitiveData(item);
    });
  }

  if (typeof data === "object") {
    const cleaned = {};
    for (const [key, value] of Object.entries(data)) {
      const lower = key.toLowerCase();
      if (lower === "authorization" || lower === "cookie" || lower === "set-cookie" ||
          lower === "proxy-authorization" || lower.includes("password") ||
          lower.includes("secret") || lower.includes("api_key") || lower.includes("token")) {
        cleaned[key] = "[REDACTED]";
      } else {
        cleaned[key] = redactSensitiveData(value);
      }
    }
    return cleaned;
  }

  return data;
}

/**
 * Format milliseconds into human-readable latency.
 */
export function formatDuration(ms) {
  if (ms == null || isNaN(ms)) return "";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms * 10) / 10}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format bytes into readable format (e.g., 4.2 KB).
 */
export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

/**
 * Validates and normalizes any trace object into canonical IR format.
 */
export function normalizeTrace(trace) {
  if (!trace || typeof trace !== "object") {
    throw new Error("Invalid trace: expected an object");
  }

  const title = trace.title || "Network Execution Trace";
  const rawPhases = Array.isArray(trace.phases) && trace.phases.length > 0
    ? trace.phases
    : ["Execution Flow"];

  // Ensure participants
  const participants = (trace.participants || []).map((p, idx) => {
    const role = p.role || "service";
    return {
      id: String(p.id || `node-${idx}`),
      label: String(p.label || p.id || `Node ${idx + 1}`),
      sublabel: String(p.sublabel || role),
      role,
      color: p.color || getRoleColor(role, idx)
    };
  });

  // Build a participant map for fast lookup
  const participantIds = new Set(participants.map(p => p.id));

  // If participants were missing or empty, infer from messages
  if (participants.length === 0 && Array.isArray(trace.messages)) {
    const discovered = new Map();
    for (const msg of trace.messages) {
      if (msg.from && !discovered.has(msg.from)) {
        discovered.set(msg.from, {
          id: msg.from,
          label: msg.from.charAt(0).toUpperCase() + msg.from.slice(1),
          sublabel: "Participant",
          role: "service",
          color: getRoleColor("service", discovered.size)
        });
      }
      if (msg.to && !discovered.has(msg.to)) {
        discovered.set(msg.to, {
          id: msg.to,
          label: msg.to.charAt(0).toUpperCase() + msg.to.slice(1),
          sublabel: "Participant",
          role: "service",
          color: getRoleColor("service", discovered.size)
        });
      }
    }
    for (const p of discovered.values()) {
      participants.push(p);
      participantIds.add(p.id);
    }
  }

  // Normalize messages
  const messages = (trace.messages || []).map((msg, idx) => {
    const from = String(msg.from || participants[0]?.id || "client");
    const to = String(msg.to || participants[1]?.id || from);
    const isLoop = Boolean(msg.isLoop || from === to);
    let kind = String(msg.kind || (isLoop ? "retry" : "request")).toLowerCase();

    // Map synonymous kinds
    if (kind === "sync") kind = "request";
    if (kind === "reply") kind = "return";

    const phase = typeof msg.phase === "number" && msg.phase >= 0 && msg.phase < rawPhases.length
      ? msg.phase
      : 0;

    const classification = classifyInteraction(msg);
    const isBlocking = msg.isBlocking !== undefined ? Boolean(msg.isBlocking) : classification.isBlocking;
    const blockingReason = msg.blockingReason || classification.blockingReason;
    const category = msg.recommendationCategory || classification.category;
    const guidance = GUIDANCE_CATALOG[category] || GUIDANCE_CATALOG.api_endpoint;

    const domainInfo = extractMessageDomainAndPort(msg);
    const domain = msg.domain || domainInfo.domain;
    const port = msg.port || domainInfo.port;
    const techInfo = detectMessageTechnologies(msg);
    const technologies = Array.isArray(msg.technologies) && msg.technologies.length > 0
      ? msg.technologies
      : [...techInfo.libraries, ...techInfo.infrastructure];
    const resourceType = msg.resourceType || classifyResourceType(msg);

    return {
      id: String(msg.id || `msg-${idx + 1}`),
      from,
      to,
      label: String(msg.label || `${from} → ${to}`),
      detail: typeof msg.detail === "string" ? redactSensitiveData(msg.detail) : msg.detail,
      kind,
      phase,
      latencyMs: typeof msg.latencyMs === "number" ? msg.latencyMs : null,
      status: typeof msg.status === "number" ? msg.status : null,
      method: msg.method ? String(msg.method) : null,
      bytes: typeof msg.bytes === "number" ? msg.bytes : null,
      isLoop,
      isBlocking,
      blockingReason,
      recommendationCategory: category,
      guidance,
      domain,
      port,
      technologies,
      resourceType
    };
  });

  const inventory = extractTraceInventory(trace, messages);

  return {
    title,
    timestamp: trace.timestamp || new Date().toISOString(),
    summary: trace.summary || null,
    phases: rawPhases,
    participants,
    messages,
    inventory
  };
}
