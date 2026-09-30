/**
 * Redaction audit: proves secrets in a real capture (NetLog, HAR or Performance trace) do not reach the generated report.
 *
 * It reads the raw capture file, harvests actual secret values (authorization and cookie
 * headers, secret-named parameters, and well-known token shapes), builds the report the same
 * way the CLI does, and looks for each harvested value in the output. A value found in the
 * output is a leak. Values are never printed, only a masked marker and the kind.
 *
 * Usage: node scripts/audit-redaction.mjs <capture.json> [more files or folders...]
 * Exit code 1 when any leak is found. Real captures stay local; nothing here is uploaded.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCaptureReader, buildReport } from "../src/viewer/viewer-core.mjs";
import { createHarReader } from "../src/parsers/har-stream.mjs";
import { createTraceReader } from "../src/parsers/trace-stream.mjs";
import { attachHar } from "../src/enrichment.mjs";
import { attachProfile } from "../src/profile.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";

const MIN_LENGTH = 8;
const HEADER_NAMES = "authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|x-csrf-token|x-xsrf-token";
const PARAM_NAME = /token|secret|passw(?:or)?d|pwd|session|csrf|xsrf|signature|assertion|credential|api[-_]?key|^(?:tempauth|code|sig|key|auth|samlrequest|samlresponse)$|(?:^|[_-])auth(?:$|[_-])/i;

// Independent of the redactor's own rules: shapes that are secrets wherever they appear.
const SHAPES = [
  ["JSON web token", /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g],
  ["bearer token", /Bearer\s+([A-Za-z0-9._~+/=-]{16,})/g],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["payment key", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g]
];

// Request and correlation IDs are kept on purpose (they match a request to server logs), so a value that is also
// recorded as one is not treated as a leaked secret.
const ID_HEADER = "x-request-id|x-ms-request-id|request-id|client-request-id|correlationid|x-correlation-id|traceparent|x-amzn-trace-id|x-cloud-trace-context|x-b3-traceid";

const unescapeJson = (text) => { try { return JSON.parse(`"${text}"`); } catch { return text; } };
const mask = (value) => `${value.slice(0, 3)}...(${value.length} chars)`;

/** Harvests secret values from raw capture text. Returns [{ kind, value }] without duplicates. */
export function harvestSecrets(raw) {
  const found = new Map();
  const add = (kind, value) => {
    const v = String(value || "").trim();
    if (v.length >= MIN_LENGTH && !found.has(v)) found.set(v, kind);
  };
  // NetLog header lines: "authorization: Bearer abc"
  for (const m of raw.matchAll(new RegExp(`"(${HEADER_NAMES})\\s*:\\s*((?:\\\\.|[^"\\\\])+)"`, "gi"))) addHeader(m[1], unescapeJson(m[2]), add);
  // HAR header and cookie objects, either key order
  for (const m of raw.matchAll(new RegExp(`"name"\\s*:\\s*"(${HEADER_NAMES})"\\s*,\\s*"value"\\s*:\\s*"((?:\\\\.|[^"\\\\])+)"`, "gi"))) addHeader(m[1], unescapeJson(m[2]), add);
  for (const m of raw.matchAll(new RegExp(`"value"\\s*:\\s*"((?:\\\\.|[^"\\\\])+)"\\s*,\\s*"name"\\s*:\\s*"(${HEADER_NAMES})"`, "gi"))) addHeader(m[2], unescapeJson(m[1]), add);
  // HAR cookies list: {"name":"sid","value":"..."} inside "cookies": [...]
  for (const block of raw.matchAll(/"cookies"\s*:\s*\[([^\]]*)\]/g)) {
    for (const c of block[1].matchAll(/"name"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"value"\s*:\s*"((?:\\.|[^"\\])+)"/g)) add("cookie value", unescapeJson(c[2]));
  }
  // Secret-named parameters in URLs and bodies
  for (const m of raw.matchAll(/([?&#;])([^=&#;\s"'\\]+)=([^&#\s"'\\]*)/g)) if (PARAM_NAME.test(m[2])) add(`parameter ${m[2].toLowerCase()}`, decodeSafe(m[3]));
  for (const [kind, re] of SHAPES) for (const m of raw.matchAll(re)) add(kind, m[1] || m[0]);
  for (const m of raw.matchAll(new RegExp(`"(?:${ID_HEADER})\\s*:\\s*((?:\\\\.|[^"\\\\])+)"`, "gi"))) found.delete(unescapeJson(m[1]).trim());
  return [...found].map(([value, kind]) => ({ kind, value }));
}

function decodeSafe(value) { try { return decodeURIComponent(value); } catch { return value; } }

function addHeader(name, value, add) {
  const lower = name.toLowerCase();
  if (lower === "cookie") {
    for (const pair of value.split(/;\s*/)) { const i = pair.indexOf("="); if (i > 0) add("cookie value", pair.slice(i + 1)); }
  } else if (lower === "set-cookie") {
    const first = value.split(";")[0]; const i = first.indexOf("=");
    if (i > 0) add("set-cookie value", first.slice(i + 1));
  } else {
    const token = value.replace(/^(?:Bearer|Basic|Negotiate|NTLM|Digest|Token)\s+/i, "");
    add(`${lower} header`, token);
  }
}

/** Looks for each harvested value in the output. Returns leaks as [{ kind, marker }]. */
export function findLeaks(secrets, output) {
  const escaped = output.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const leaks = [];
  for (const { kind, value } of secrets) {
    if (output.includes(value) || escaped.includes(value) || output.includes(JSON.stringify(value).slice(1, -1))) leaks.push({ kind, marker: mask(value) });
  }
  return leaks;
}

function sampleModel() {
  const reader = createCaptureReader();
  reader.write(toNetLogText(buildPageLoadNetLog()));
  return reader.finish();
}

/** Audits one capture file (NetLog, HAR or Performance trace): builds the report and checks it. */
export function auditFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  const kind = detectKind(raw.slice(0, 4096));
  if (!kind) return null;
  const secrets = harvestSecrets(raw);
  const reader = kind === "netlog" ? createCaptureReader() : null;
  let model;
  if (kind === "netlog") { reader.write(raw); model = reader.finish(); }
  else {
    // A HAR or trace only enriches a NetLog; the built-in sample capture stands in so its output is rendered.
    model = sampleModel();
    const r = kind === "har" ? createHarReader() : createTraceReader();
    r.write(raw);
    (kind === "har" ? attachHar : attachProfile)(model, r.finish());
  }
  const { html } = buildReport(model, null, null, { name: path.basename(file), bytes: raw.length });
  return { file, kind, bytes: raw.length, harvested: secrets.length, kinds: countBy(secrets.map(s => s.kind)), leaks: findLeaks(secrets, html) };
}

export function detectKind(head) {
  if (/"constants"|"events"\s*:\s*\[/.test(head) && !/"traceEvents"/.test(head)) return "netlog";
  if (/"log"\s*:\s*\{/.test(head) && /"(?:version|creator|entries|pages)"/.test(head)) return "har";
  if (/"traceEvents"/.test(head) || /^\s*\[\s*\{[^}]*"ph"/.test(head)) return "trace";
  return null;
}

const countBy = (items) => items.reduce((sum, item) => (sum[item] = (sum[item] || 0) + 1, sum), {});

function expand(args) {
  const files = [];
  for (const arg of args) {
    if (fs.statSync(arg).isDirectory()) files.push(...fs.readdirSync(arg).filter(name => /\.(json|har)$/i.test(name)).map(name => path.join(arg, name)));
    else files.push(arg);
  }
  return files;
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error("Usage: node scripts/audit-redaction.mjs <capture.json | folder> [...]"); process.exit(2); }
  let leaked = 0;
  let audited = 0;
  for (const file of expand(args)) {
    let result;
    try { result = auditFile(file); } catch (error) { console.log(`skip  ${path.basename(file)} (${error.message.slice(0, 60)})`); continue; }
    if (!result) { console.log(`skip  ${path.basename(file)} (not a capture)`); continue; }
    audited++;
    const summary = Object.entries(result.kinds).map(([k, n]) => `${k} ${n}`).join(", ") || "none found";
    console.log(`${result.leaks.length ? "LEAK " : "ok   "} ${path.basename(file)}  ${result.kind}  ${(result.bytes / 1048576).toFixed(1)} MB  secrets checked ${result.harvested} (${summary})`);
    for (const leak of result.leaks.slice(0, 20)) console.log(`      ${leak.kind}: ${leak.marker}`);
    leaked += result.leaks.length;
  }
  console.log(`${audited} capture(s) audited, ${leaked} leak(s)`);
  process.exit(leaked ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
