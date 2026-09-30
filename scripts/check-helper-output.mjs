/**
 * Checks a file written by the network path helper (tools/socketmap-path.sh or .ps1) with the same
 * reader the viewer uses. Prints a short summary without addresses.
 * Usage: node scripts/check-helper-output.mjs <file> [--require-probe]
 * With --require-probe, the first host must have curl DNS and connect times (for CI with network).
 */
import fs from "node:fs";
import { readPathFile } from "../src/path.mjs";

if (process.argv[2] === "--tracert-selftest") {
  // Checks the PowerShell tracert parser (run with -SelfTestTracert on Windows) against the expected hops.
  const raw = fs.readFileSync(process.argv[3], "utf8").replace(/^\uFEFF/, "");
  const hops = [].concat(JSON.parse(raw));
  const expected = [[1, "192.0.2.1", 1], [3, "198.51.100.9", 12], [4, "203.0.113.7", 45], [2, null, null]];
  const sorted = hops.slice().sort((a, b) => a.n - b.n);
  const want = [[1, "192.0.2.1", 1], [2, null, null], [3, "198.51.100.9", 12], [4, "203.0.113.7", 45]];
  const ok = sorted.length === want.length && sorted.every((h, i) => h.n === want[i][0] && h.ip === want[i][1] && h.rttMs === want[i][2]);
  console.log(JSON.stringify(sorted));
  if (!ok) { console.error("tracert parser output differs from the expected hops"); process.exit(1); }
  console.log("tracert parser ok");
  process.exit(0);
}
const file = process.argv[2];
const requireProbe = process.argv.includes("--require-probe");
if (!file) { console.error("Usage: node scripts/check-helper-output.mjs <file> [--require-probe]"); process.exit(2); }

let parsed;
try { parsed = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); } catch (error) { console.error(`Not valid JSON: ${error.message}`); process.exit(1); }
const { recognized, data } = readPathFile(parsed);
if (!recognized) { console.error("Not recognized as helper output."); process.exit(1); }

const problems = [];
if (!data.platform) problems.push("platform missing");
if (!data.collectedAt) problems.push("collectedAt missing");
if (!data.link.type && !data.notes.length) problems.push("no link type and no note explaining why");
if (requireProbe) {
  const h = data.hosts[0];
  if (!h) problems.push("no host was measured");
  else if (h.dnsMs == null || h.connectMs == null) problems.push(`host ${h.host} has no curl DNS or connect time${h.error ? ` (${h.error})` : ""}`);
}
console.log(JSON.stringify({ platform: data.platform, os: data.os, link: data.link.type, wifi: data.link.wifi.rssiDbm != null, dnsServers: data.dns.servers.length, proxyPac: Boolean(data.proxy.autoConfigUrl), hosts: data.hosts.map(h => ({ host: h.host, dnsMs: h.dnsMs, connectMs: h.connectMs, status: h.status })), routes: data.routes.map(r => ({ host: r.host, method: r.method, hops: r.hops.length, answered: r.hops.filter(x => x.ip).length })), notes: data.notes }, null, 1));
if (problems.length) { console.error(`Problems: ${problems.join("; ")}`); process.exit(1); }
console.log("helper output ok");
