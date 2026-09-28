/**
 * Bounded, on-demand inspection of the original NetLog event stream.
 *
 * The generated report never embeds raw events. This module re-reads a locally
 * attached capture and retains only the current page of sanitized matches.
 */

import { createNetLogTokenizer } from "../parsers/netlog-stream.mjs";
import { createEvidenceSanitizer } from "../redact.mjs";

/**
 * Incremental event matcher. Call setConstants() before addEvent() when the
 * capture has constants, feed every event once, then call finish().
 */
export function createEventQuery(options = {}) {
  const defaultLimit = 200;
  const maxOpenBegins = 10_000;
  const reverseMap = values => {
    const result = {};
    for (const [name, value] of Object.entries(values || {})) result[String(value)] = String(sanitize(name));
    return result;
  };
  const nameFor = (map, value) => map[String(value)] || (value == null ? "Not recorded" : String(value));
  const hasError = value => {
    if (!value || typeof value !== "object") return false;
    for (const [key, child] of Object.entries(value)) {
      if (/(?:^|_)(?:net_)?error/i.test(key) && child !== 0 && child !== "0" && child !== "" && child != null && child !== false) return true;
      if (/(?:^|_)(?:failed|failure)/i.test(key) && (child === true || (typeof child === "number" && child !== 0) || (typeof child === "string" && child !== "" && child !== "0" && child.toLowerCase() !== "false"))) return true;
      if (child && typeof child === "object" && hasError(child)) return true;
    }
    return false;
  };
  const source = options.source == null || options.source === "" ? null : new Set(String(options.source).split(/[\s,]+/).filter(Boolean));
  const type = options.type == null || options.type === "" ? null : String(options.type).toLowerCase();
  const text = String(options.text || "").trim().toLowerCase();
  const errorsOnly = Boolean(options.errorsOnly);
  const offset = Math.max(0, Number.isFinite(Number(options.offset)) ? Math.floor(Number(options.offset)) : 0);
  const limit = Math.max(1, Math.min(1000, Number.isFinite(Number(options.limit)) ? Math.floor(Number(options.limit)) : defaultLimit));
  const sanitize = typeof options.sanitizeFn === "function" ? options.sanitizeFn : value => value;
  let eventTypes = {};
  let sourceTypes = {};
  let phases = {};
  let dictionaries = {};
  let firstTime = null;
  let matched = 0;
  const rows = [];
  const begins = new Map();
  let openBegins = 0;
  let durationTrackingLimited = false;

  function finiteTime(value) {
    if (value == null || value === "" || typeof value === "boolean") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function valueFor(params, keys) {
    for (const key of keys) if (Object.prototype.hasOwnProperty.call(params, key)) return params[key];
    return undefined;
  }

  function enumNote(label, value, values) {
    if (value == null || value === "" || Object.keys(values || {}).length === 0) return null;
    const decoded = values?.[String(value)];
    return `${label}: ${decoded || `${String(value)} (unrecognized recorded value)`}`;
  }

  function bitmaskNote(label, value, values) {
    if (value == null || value === "" || typeof value === "boolean" || Object.keys(values || {}).length === 0) return null;
    const mask = Number(value);
    if (!Number.isFinite(mask) || mask === 0) return null;
    let knownBits = 0;
    const names = [];
    for (const [raw, name] of Object.entries(values || {})) {
      const bit = Number(raw);
      if (!Number.isFinite(bit) || bit === 0) continue;
      knownBits |= bit;
      if ((mask & bit) === bit) names.push(name);
    }
    const unknown = mask & ~knownBits;
    if (unknown) names.push(`${unknown} (unrecognized recorded bits)`);
    return names.length ? `${label}: ${names.join(", ")}` : `${label}: ${String(value)} (unrecognized recorded bits)`;
  }

  function decodedParams(params) {
    const notes = [];
    const addEnum = (label, keys, map) => {
      const note = enumNote(label, valueFor(params, keys), map);
      if (note) notes.push(note);
    };
    const addBits = (label, keys, map) => {
      const note = bitmaskNote(label, valueFor(params, keys), map);
      if (note) notes.push(note);
    };
    addEnum("Network error", ["net_error", "netError"], dictionaries.netError);
    addEnum("QUIC error", ["quic_error", "quicError"], dictionaries.quicError);
    addEnum("QUIC reset-stream error", ["quic_rst_stream_error", "quicRstStreamError"], dictionaries.quicRstStreamError);
    addBits("Load flags", ["load_flags", "loadFlag"], dictionaries.loadFlag);
    addEnum("Load state", ["load_state", "loadState"], dictionaries.loadState);
    addBits("Certificate status", ["cert_status", "certStatusFlag"], dictionaries.certStatusFlag);
    addBits("Certificate verifier flags", ["verifier_flags", "certVerifierFlags"], dictionaries.certVerifierFlags);
    addBits("Certificate verify flags", ["verify_flags", "certVerifyFlags"], dictionaries.certVerifyFlags);
    addEnum("Certificate path digest policy", ["digest_policy", "certPathBuilderDigestPolicy"], dictionaries.certPathBuilderDigestPolicy);
    return notes;
  }

  function dependencyIds(value, found = new Set(), seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return found;
    seen.add(value);
    if (value.source_dependency && typeof value.source_dependency === "object" && value.source_dependency.id != null) found.add(String(value.source_dependency.id));
    for (const child of Object.values(value)) dependencyIds(child, found, seen);
    return found;
  }

  function setConstants(constants) {
    eventTypes = reverseMap(constants?.logEventTypes);
    sourceTypes = reverseMap(constants?.logSourceType);
    phases = reverseMap(constants?.logEventPhase);
    dictionaries = {
      netError: reverseMap(constants?.netError),
      quicError: reverseMap(constants?.quicErrorCode || constants?.quicError || constants?.quicErrors),
      quicRstStreamError: reverseMap(constants?.quicRstStreamError || constants?.quicRstStreamErrors),
      loadFlag: reverseMap(constants?.loadFlag || constants?.loadFlags),
      loadState: reverseMap(constants?.loadState),
      certStatusFlag: reverseMap(constants?.certStatusFlag),
      certVerifierFlags: reverseMap(constants?.certVerifierFlags),
      certVerifyFlags: reverseMap(constants?.certVerifyFlags),
      certPathBuilderDigestPolicy: reverseMap(constants?.certPathBuilderDigestPolicy)
    };
  }

  function addEvent(event) {
    if (!event || typeof event !== "object") return;
    const numericTime = finiteTime(event.time);
    if (numericTime != null && firstTime == null) firstTime = numericTime;
    const sourceId = event.source?.id == null ? "Not recorded" : String(event.source.id);
    const sourceType = nameFor(sourceTypes, event.source?.type);
    const eventType = nameFor(eventTypes, event.type);
    const phase = nameFor(phases, event.phase);
    const beginKey = `${sourceId}|${event.type}`;
    let durationMs = null;
    if (!durationTrackingLimited && /BEGIN$/i.test(phase) && numericTime != null) {
      if (openBegins >= maxOpenBegins) {
        // Once a begin was omitted, matching subsequent ends could produce a
        // false duration for an older nested operation. Stop pairing entirely.
        durationTrackingLimited = true;
        begins.clear();
        openBegins = 0;
      }
      else {
        const stack = begins.get(beginKey) || [];
        stack.push(numericTime);
        begins.set(beginKey, stack);
        openBegins++;
      }
    }
    if (!durationTrackingLimited && /END$/i.test(phase) && numericTime != null) {
      const stack = begins.get(beginKey);
      if (stack?.length) {
        const begin = stack.pop();
        openBegins--;
        if (stack.length === 0) begins.delete(beginKey);
        const elapsed = numericTime - begin;
        durationMs = elapsed >= 0 ? elapsed : null;
      }
    }
    const safeParams = sanitize(event.params || {});
    const searchable = `${sourceId} ${sourceType} ${eventType} ${phase} ${JSON.stringify(safeParams)}`.toLowerCase();
    if ((source && !source.has(sourceId)) || (type && !eventType.toLowerCase().includes(type) && !sourceType.toLowerCase().includes(type)) || (text && !searchable.includes(text)) || (errorsOnly && !hasError(safeParams))) return;
    const index = matched++;
    if (index < offset || rows.length >= limit) return;
    const dependencies = [...dependencyIds(safeParams)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    rows.push({
      index,
      sourceId,
      sourceType,
      eventType,
      phase,
      timeMs: numericTime != null && firstTime != null ? numericTime - firstTime : null,
      durationMs,
      params: safeParams,
      dependency: dependencies[0] ?? null,
      dependencies,
      decodedParams: decodedParams(safeParams)
    });
  }

  function finish() { return { total: matched, offset, limit, rows, firstTime, durationTrackingLimited }; }
  return { setConstants, addEvent, finish };
}

export function eventReplayMarkup() {
  return `<section id="event-replay" class="event-replay"><h2>Event replay</h2><p class="note">Attach the original NetLog to inspect its recorded events. SocketMap streams it locally and keeps only this page of redacted matches.</p><div class="event-replay-tools"><input id="replay-file" type="file" accept=".json,application/json" hidden><button type="button" id="replay-pick">Choose NetLog</button><span id="replay-file-name" class="note" aria-live="polite">Original NetLog: none selected</span><label>Source IDs <input id="replay-source" inputmode="numeric" placeholder="Any; comma-separated"></label><label>Event or source type <input id="replay-type" placeholder="for example SOCKET"></label><label>Text <input id="replay-text" type="search" placeholder="Search redacted event fields"></label><label><input id="replay-errors" type="checkbox"> Errors only</label><button type="button" id="replay-search">Search events</button></div><p id="replay-status" class="note" role="status">Original NetLog not attached. Choose the capture used to create this report.</p><div id="replay-results" class="event-replay-results"></div><div class="event-replay-pages"><button type="button" id="replay-prev" disabled>Previous</button><button type="button" id="replay-next" disabled>Next</button></div></section>`;
}

/** Self-contained runtime for a generated report. */
export function eventReplayScript() {
  return `<script>(function () {
  var createNetLogTokenizer = ${createNetLogTokenizer.toString()};
  var createEvidenceSanitizer = ${createEvidenceSanitizer.toString()};
  var createEventQuery = ${createEventQuery.toString()};
  var LIMIT = 200, file = null, offset = 0, generation = 0;
  var sanitize = createEvidenceSanitizer();
  var byId = function (id) { return document.getElementById(id); };
  var status = byId("replay-status"), results = byId("replay-results");
  if (!status || !results) return;
  function esc(value) { return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;"); }
  function formatMs(value) { return value == null ? "Not recorded" : (value < 0 ? "−" : "+") + Math.abs(value).toFixed(1) + " ms"; }
  function options() { return { source: byId("replay-source").value, type: byId("replay-type").value, text: byId("replay-text").value, errorsOnly: byId("replay-errors").checked, offset: offset, limit: LIMIT, sanitizeFn: sanitize }; }
  function render(result) {
    var shown = result.rows.length;
    status.textContent = "Showing " + (shown ? result.offset + 1 : 0) + "–" + (result.offset + shown) + " of " + result.total + " matching events. Values are redacted.";
    if (result.durationTrackingLimited) status.textContent += " Some matching durations are unavailable because too many operations remained open.";
    byId("replay-prev").disabled = result.offset === 0;
    byId("replay-next").disabled = result.offset + shown >= result.total;
    results.innerHTML = result.rows.map(function (row) {
      var dependencies = (row.dependencies || []).map(function (id) { return ' <button type="button" data-replay-source="' + esc(id) + '">Source ' + esc(id) + "</button>"; }).join("");
      var decoded = row.decodedParams && row.decodedParams.length ? "<dt>Decoded recorded values</dt><dd>" + row.decodedParams.map(esc).join("<br>") + "</dd>" : "";
      return '<details class="event-replay-row"><summary><strong>#' + (row.index + 1) + "</strong> " + esc(row.sourceId) + " · " + esc(row.sourceType) + " · " + esc(row.eventType) + " · " + esc(row.phase) + " · " + esc(formatMs(row.timeMs)) + (row.durationMs == null ? "" : " · " + esc(row.durationMs.toFixed(1) + " ms")) + "</summary><dl><dt>Source</dt><dd>" + esc(row.sourceId) + " (" + esc(row.sourceType) + ")</dd><dt>Event</dt><dd>" + esc(row.eventType) + " · " + esc(row.phase) + "</dd><dt>Relative time</dt><dd>" + esc(formatMs(row.timeMs)) + "</dd>" + decoded + "</dl>" + dependencies + '<pre>' + esc(JSON.stringify(row.params, null, 2)) + "</pre></details>";
    }).join("") || "<p class=\\\"note\\\">No matching events were recorded.</p>";
  }
  async function scan(seedConstants) {
    if (!(file instanceof File)) { status.textContent = "Original NetLog not attached. Choose the capture used to create this report."; return; }
    var token = ++generation, query = createEventQuery(options());
    if (seedConstants) query.setConstants(seedConstants);
    status.textContent = "Streaming " + (file.name || "original NetLog") + " locally…";
    results.replaceChildren();
    try {
      var reader = file.stream().getReader(), decoder = new TextDecoder();
      var sawEvent = false, constantsLate = false, recordedConstants = seedConstants || null;
      var tokenizer = createNetLogTokenizer({ onTopLevel: function (key, value) { if (key === "constants") { constantsLate = constantsLate || sawEvent; recordedConstants = value; query.setConstants(value); } }, onEvent: function (event) { sawEvent = true; query.addEvent(event); } });
      for (;;) {
        if (token !== generation) { try { await reader.cancel(); } catch (_) {} return; }
        var step = await reader.read();
        if (step.done) break;
        tokenizer.write(decoder.decode(step.value, { stream: true }));
        await new Promise(function (resolve) { setTimeout(resolve, 0); });
      }
      tokenizer.write(decoder.decode()); var integrity = tokenizer.end();
      if (token === generation) {
        if (constantsLate && !seedConstants && recordedConstants) {
          status.textContent = "Constants appeared after events; rescanning locally to decode them.";
          try { reader.releaseLock(); } catch (_) {}
          return scan(recordedConstants);
        }
        if (!sawEvent && !recordedConstants) {
          status.textContent = "This file does not contain NetLog events or constants. Choose the original NetLog capture.";
          try { reader.releaseLock(); } catch (_) {}
          return;
        }
        render(query.finish());
        if (sawEvent && !recordedConstants) status.textContent += " Event names remain numeric because this capture did not record constants.";
        if (integrity && integrity.complete === false) status.textContent += " The capture ended early; only complete events were searched.";
      }
      try { reader.releaseLock(); } catch (_) {}
    } catch (error) {
      if (token === generation) status.textContent = "Could not read this NetLog: " + (error && error.message ? error.message : "read error") + ". The attached file was not uploaded.";
    }
  }
  function attach(candidate, name) {
    if (!(candidate instanceof File)) return;
    generation++; file = candidate; offset = 0;
    byId("replay-file-name").textContent = "Original NetLog: " + (name || candidate.name || "file");
    status.textContent = "Original NetLog attached: " + (name || candidate.name || "file") + ".";
    if (byId("view-events")?.classList.contains("is-active")) scan();
  }
  byId("replay-file").addEventListener("change", function () { attach(this.files && this.files[0]); this.value = ""; });
  byId("replay-pick").addEventListener("click", function () { byId("replay-file").click(); });
  byId("replay-search").addEventListener("click", function () { offset = 0; scan(); });
  byId("replay-prev").addEventListener("click", function () { offset = Math.max(0, offset - LIMIT); scan(); });
  byId("replay-next").addEventListener("click", function () { offset += LIMIT; scan(); });
  document.addEventListener("click", function (event) { var button = event.target.closest && event.target.closest("[data-replay-source]"); if (!button) return; window.dispatchEvent(new CustomEvent("socketmap:open-events", { detail: { source: button.getAttribute("data-replay-source") || "" } })); });
  window.addEventListener("socketmap:open-events", function (event) { var source = event.detail && event.detail.source; if (source != null) { byId("replay-source").value = String(source); byId("replay-type").value = ""; byId("replay-text").value = ""; byId("replay-errors").checked = false; offset = 0; } scan(); });
  window.addEventListener("message", function (event) { var data = event && event.data; if (event.source !== window.parent || !data || data.type !== "socketmap:replay-file" || !(data.file instanceof File)) return; attach(data.file, data.name); });
  if (window.parent !== window) window.parent.postMessage({ type: "socketmap:request-replay-file" }, "*");
})();</script>`;
}
