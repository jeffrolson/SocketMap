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
      isLoop
    };
  });

  return {
    title,
    timestamp: trace.timestamp || new Date().toISOString(),
    summary: trace.summary || null,
    phases: rawPhases,
    participants,
    messages
  };
}
