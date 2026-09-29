/**
 * A synthetic DevTools Performance profile shaped like a real Chrome trace (thread names first,
 * RunTask, script and layout events, paint markers, network requests). Built from the sample
 * capture's requests so the two line up. Made up: documentation addresses only, no real site.
 * Used by "Try the sample capture", the CLI demo and tests.
 */

export function buildSampleTrace(model, { clockBaseUs = 700_000_000_000 } = {}) {
  const page = model.requests.filter(r => !r.isBackground);
  const home = page.find(r => r.requestType === "main frame") || page[0];
  const PID = 4100, TID = 4101, FRAME = "SAMPLEFRAME0000000000000000000000";
  // Renderer sends each request a little before the network stack logs it.
  const us = (netMs) => clockBaseUs + Math.round((netMs - 12) * 1000);
  const navTs = us(home.start - 5);
  const events = [];
  const meta = (name, pid, tid, value) => events.push({ args: { name: value }, cat: "__metadata", name, ph: "M", pid, tid, ts: 0 });
  meta("process_name", PID, 0, "Renderer");
  meta("thread_name", PID, TID, "CrRendererMain");
  meta("thread_name", 4000, 4001, "CrBrowserMain");
  events.push({ args: { data: { documentLoaderURL: home.url.split("?")[0], isLoadingMainFrame: true, isOutermostMainFrame: true, navigationId: "NAV1" }, frame: FRAME }, cat: "blink.user_timing", name: "navigationStart", ph: "R", pid: PID, tid: TID, ts: navTs });
  for (const r of page) {
    const id = `REQ${r.id}`;
    events.push({ args: { data: { frame: FRAME, priority: "High", requestId: id, requestMethod: r.method || "GET", resourceType: r === home ? "Document" : /\.js/.test(r.url) ? "Script" : /\.css/.test(r.url) ? "Stylesheet" : "Other", url: r.url, ...(/\.js/.test(r.url) ? { renderBlocking: "blocking" } : {}), ...(/api\./.test(r.host) ? { stackTrace: [{ functionName: "loadTeamData", lineNumber: 2209, url: "https://portal.example.com/_layouts/15/app.js" }] } : {}) } }, cat: "devtools.timeline", name: "ResourceSendRequest", ph: "I", pid: PID, tid: TID, ts: us(r.start) });
    events.push({ args: { data: { fromCache: false, fromServiceWorker: false, mimeType: r.contentType || "", protocol: r.protocol || "", requestId: id, statusCode: r.status ?? 0 } }, cat: "devtools.timeline", name: "ResourceReceiveResponse", ph: "I", pid: PID, tid: TID, ts: us(r.start + 40) });
  }
  const task = (startMs, durMs) => events.push({ args: {}, cat: "disabled-by-default-devtools.timeline", dur: Math.round(durMs * 1000), name: "RunTask", ph: "X", pid: PID, tid: TID, ts: navTs + Math.round(startMs * 1000) });
  const work = (name, startMs, durMs, data = {}) => events.push({ args: { data: { frame: FRAME, ...data } }, cat: "devtools.timeline", dur: Math.round(durMs * 1000), name, ph: "X", pid: PID, tid: TID, ts: navTs + Math.round(startMs * 1000) });
  // Quiet start, then a long script run that keeps the page busy while a request waits.
  task(10, 12); work("ParseHTML", 10, 10);
  task(60, 8); work("EvaluateScript", 60, 6, { url: "https://portal.example.com/_layouts/15/app.js" });
  task(400, 320); work("v8.compile", 400, 40, { url: "https://portal.example.com/_layouts/15/app.js" }); work("EvaluateScript", 440, 240, { url: "https://portal.example.com/_layouts/15/app.js" }); work("FunctionCall", 460, 200, { url: "https://portal.example.com/_layouts/15/app.js", functionName: "renderWebParts" }); work("Layout", 690, 25);
  task(900, 90); work("EvaluateScript", 900, 80, { url: "https://cdn.example.net/assets/analytics.js" });
  task(1200, 14); work("Paint", 1200, 8);
  const at = (name, ms, args = {}) => events.push({ args: { frame: FRAME, ...args }, cat: "loading", name, ph: "R", pid: PID, tid: TID, ts: navTs + Math.round(ms * 1000) });
  at("firstContentfulPaint", 320, { data: { navigationId: "NAV1" } });
  at("largestContentfulPaint::Candidate", 760, { data: { candidateIndex: 1, isMainFrame: true, size: 90210, type: "image", nodeName: "IMG id='hero'" } });
  at("domContentLoadedEventEnd", 700);
  at("loadEventEnd", 1350);
  events.push({ args: { data: { had_recent_input: false, is_main_frame: true, score: 0.021, weighted_score_delta: 0.021 } }, cat: "loading", name: "LayoutShift", ph: "I", pid: PID, tid: TID, ts: navTs + 800000 });
  return {
    traceEvents: events,
    metadata: { "clock-domain": "SAMPLE", "cpu-num-cores": 8, "cpu-num-efficient-cores": 4, "physical-memory": "16384", "trace-capture-datetime": "2026-9-21 14:13:30", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/153.0.0.0 Safari/537.36", "command_line": "chrome.exe --secret-flag=TOPSECRET", "cpu-running-in-vm": 0 }
  };
}
