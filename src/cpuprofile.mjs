/**
 * V8 CPU profile enrichment (.cpuprofile: DevTools JavaScript Profiler, node --cpu-prof, or
 * Chrome's own export). It answers "where did JavaScript CPU time go", by script and by function.
 * It is summarized and never placed on the network timeline: a bare CPU profile has no requests to
 * line up with. Only the summary is kept: source text and arguments are not in the format, and
 * script URLs are redacted.
 *
 * Self time follows the format's own convention: each sample lasts until the next sample, so a
 * sample's time is the following time delta. No Node APIs: runs in the browser viewer as well.
 */

import { redactUrl } from "./redact.mjs";

const SPECIAL = new Set(["(root)", "(program)", "(idle)", "(garbage collector)"]);
const round = (value) => Math.round(value * 10) / 10;

/** Returns { recognized, data } for a parsed .cpuprofile. Never throws. */
export function readCpuProfile(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !Array.isArray(input.nodes) || !Array.isArray(input.samples) || !Array.isArray(input.timeDeltas) || input.samples.length !== input.timeDeltas.length) return { recognized: false, data: null };
  const byId = new Map();
  for (const node of input.nodes) if (node && Number.isInteger(node.id)) byId.set(node.id, node);
  if (!byId.size) return { recognized: false, data: null };

  const self = new Map();
  const samples = input.samples;
  const deltas = input.timeDeltas;
  let total = 0;
  for (let i = 0; i < samples.length; i++) {
    const dt = i + 1 < deltas.length ? deltas[i + 1] : (i > 0 ? deltas[i] : 0);
    if (!(dt >= 0) || dt > 5e6) continue;
    self.set(samples[i], (self.get(samples[i]) || 0) + dt);
    total += dt;
  }

  let idle = 0, program = 0, gc = 0;
  const functions = new Map();
  const scripts = new Map();
  for (const [id, micros] of self) {
    const node = byId.get(id);
    if (!node) continue;
    const frame = node.callFrame || {};
    const name = typeof frame.functionName === "string" ? frame.functionName : "";
    const ms = micros / 1000;
    if (name === "(idle)") { idle += ms; continue; }
    if (name === "(program)") { program += ms; continue; }
    if (name === "(garbage collector)") { gc += ms; continue; }
    if (name === "(root)") continue;
    const url = typeof frame.url === "string" && /^https?:/i.test(frame.url) ? redactUrl(frame.url.split("#")[0]).slice(0, 500) : (frame.url ? "(not a web address)" : "(native or inline)");
    const line = Number.isInteger(frame.lineNumber) && frame.lineNumber >= 0 ? frame.lineNumber + 1 : null;
    const key = `${name}|${url}|${line}`;
    const entry = functions.get(key) || { name: name || "(anonymous)", url, line, selfMs: 0 };
    entry.selfMs += ms;
    functions.set(key, entry);
    scripts.set(url, (scripts.get(url) || 0) + ms);
  }
  const busy = [...functions.values()].reduce((sum, f) => sum + f.selfMs, 0) + gc;
  const start = Number.isFinite(input.startTime) ? input.startTime : null;
  const end = Number.isFinite(input.endTime) ? input.endTime : null;
  return {
    recognized: true,
    data: {
      durationMs: start != null && end != null && end >= start ? round((end - start) / 1000) : round(total / 1000),
      sampleCount: samples.length,
      intervalMs: samples.length > 1 ? round(total / 1000 / (samples.length - 1)) : null,
      busyMs: round(busy), idleMs: round(idle), programMs: round(program), gcMs: round(gc),
      scripts: [...scripts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([url, ms]) => ({ url, selfMs: round(ms) })),
      functions: [...functions.values()].sort((a, b) => b.selfMs - a.selfMs).slice(0, 10).map(f => ({ ...f, selfMs: round(f.selfMs) })),
      functionCount: functions.size
    }
  };
}

const ms = (value) => (value == null ? "not recorded" : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`);

/** A short plain-text section for the AI handoff. */
export function cpuProfileEvidenceText(cpu) {
  if (!cpu) return "";
  const lines = [`CPU PROFILE (V8 JavaScript sampling, ${ms(cpu.durationMs)} long, ${cpu.sampleCount} samples; a summary of where JavaScript time went, not placed on the network timeline)`];
  lines.push(`JavaScript busy ${ms(cpu.busyMs)} (garbage collection ${ms(cpu.gcMs)}), idle ${ms(cpu.idleMs)}, native program time ${ms(cpu.programMs)}.`);
  if (cpu.scripts.length) lines.push(`Scripts by self time: ${cpu.scripts.slice(0, 5).map(s => `${s.url.split("?")[0].split("/").filter(Boolean).slice(-1)[0] || s.url} ${ms(s.selfMs)}`).join("; ")}.`);
  for (const f of cpu.functions.slice(0, 5)) lines.push(`- ${f.name}${f.line ? `:${f.line}` : ""} in ${f.url.split("?")[0].split("/").filter(Boolean).slice(-1)[0] || f.url}: ${ms(f.selfMs)} self time.`);
  return lines.join("\n");
}

/** Attaches the CPU profile summary to the capture model. */
export function attachCpuProfile(model, data) {
  if (!data) return null;
  model.cpuProfile = data;
  return data;
}
