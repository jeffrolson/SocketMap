/**
 * A synthetic HAR shaped like Chrome DevTools' export, built from the sample capture's
 * requests so the two line up. Made up: documentation addresses only, no real site.
 * Used by "Try the sample capture", the CLI demo and tests.
 */

export function buildSampleHar(model) {
  const t0 = Date.parse(model.environment?.captureStartedAt);
  const page = model.requests.filter(r => !r.isBackground);
  const home = page.find(r => r.requestType === "main frame") || page[0];
  const typeOf = (r) => r.requestType === "main frame" ? "document" : /\.js(\?|$)/.test(r.url) ? "script" : /\.css(\?|$)/.test(r.url) ? "stylesheet" : /api\./.test(r.host) ? "xhr" : "other";
  const initiatorOf = (r) => {
    if (r === home) return { type: "other" };
    if (typeOf(r) === "script" || typeOf(r) === "stylesheet") return { type: "parser", url: home.url.split("?")[0], lineNumber: typeOf(r) === "script" ? 41 : 12 };
    return { type: "script", stack: { callFrames: [{ functionName: "loadTeamData", scriptId: "8", url: "https://portal.example.com/_layouts/15/app.js", lineNumber: 2210, columnNumber: 17 }] } };
  };
  const entry = (r, extra = {}) => ({
    _initiator: initiatorOf(r), _priority: { HIGHEST: "VeryHigh", HIGH: "High", MEDIUM: "Medium", LOW: "Low" }[r.priority] || "Medium", _resourceType: typeOf(r), _connectionId: String(r.connectionId || ""),
    cache: {}, connection: String(r.connectionId || ""), serverIPAddress: "198.51.100.20",
    startedDateTime: new Date(t0 + r.start + 1).toISOString(), time: r.durationMs ?? 0,
    request: { method: r.method || "GET", url: r.url, httpVersion: r.protocol || "", headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: 0 },
    response: { status: r.status ?? 0, statusText: "", httpVersion: r.protocol || "", headers: [], cookies: [], content: { size: r.bytesDecoded ?? 0, mimeType: r.contentType || "" }, redirectURL: "", headersSize: -1, bodySize: -1, _transferSize: r.bytesWire ?? 0, _fetchedViaServiceWorker: false },
    timings: { blocked: 1, dns: -1, ssl: -1, connect: -1, send: 0.2, wait: r.timing?.wait ?? 0, receive: r.timing?.download ?? 0, _blocked_queueing: 0.5, _workerStart: -1 },
    ...extra
  });
  const at = (ms) => new Date(t0 + ms).toISOString();
  const started = t0 + home.start;
  const entries = page.map(r => entry(r));
  entries.push(
    { ...entry(home), _initiator: { type: "parser", url: home.url.split("?")[0], lineNumber: 88 }, _resourceType: "image", _fromCache: "memory", startedDateTime: at(home.start + 900), time: 0.4, request: { method: "GET", url: "https://portal.example.com/img/logo.png", httpVersion: "", headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: 0 }, response: { status: 200, statusText: "", httpVersion: "", headers: [], cookies: [], content: { size: 4200, mimeType: "image/png" }, redirectURL: "", headersSize: -1, bodySize: -1, _transferSize: 0, _fetchedViaServiceWorker: false }, timings: { blocked: 0.1, dns: -1, ssl: -1, connect: -1, send: 0, wait: 0.2, receive: 0.1, _workerStart: -1 } },
    { ...entry(home), _initiator: { type: "script", stack: { callFrames: [{ functionName: "prefetch", scriptId: "8", url: "https://portal.example.com/_layouts/15/app.js", lineNumber: 90, columnNumber: 4 }] } }, _resourceType: "fetch", startedDateTime: at(home.start + 1500), time: 5, request: { method: "GET", url: "https://portal.example.com/api/prefs", httpVersion: "", headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: 0 }, response: { status: 200, statusText: "", httpVersion: "h2", headers: [], cookies: [], content: { size: 300, mimeType: "application/json" }, redirectURL: "", headersSize: -1, bodySize: -1, _transferSize: 0, _fetchedViaServiceWorker: true }, timings: { blocked: 0.2, dns: -1, ssl: -1, connect: -1, send: 0, wait: 4, receive: 0.5, _workerStart: 0.3 } },
    { ...entry(home), _initiator: { type: "other" }, startedDateTime: at(home.start - 30), time: 12, request: { method: "GET", url: "https://portal.example.com/sites/team", httpVersion: "h2", headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: 0 }, response: { status: 302, statusText: "", httpVersion: "h2", headers: [], cookies: [], content: { size: 0, mimeType: "x-unknown" }, redirectURL: home.url.split("?")[0], headersSize: -1, bodySize: -1, _transferSize: 320, _fetchedViaServiceWorker: false } }
  );
  return {
    log: {
      version: "1.2", creator: { name: "WebInspector", version: "537.36" },
      pages: [{ startedDateTime: new Date(started).toISOString(), id: "page_1", title: "Sample page", pageTimings: { onContentLoad: 900, onLoad: 1900 } }],
      entries
    }
  };
}
