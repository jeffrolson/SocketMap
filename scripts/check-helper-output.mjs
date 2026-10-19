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
  const sorted = hops.slice().sort((a, b) => a.n - b.n);
  const want = [[1, "192.0.2.1", 1, 1, 1, 1, 3, 0], [2, null, null, null, null, null, 0, 3], [3, "198.51.100.9", 11, 12, 13, 12, 3, 0], [4, "203.0.113.7", 45, 46, 47, 46, 2, 1]];
  const ok = sorted.length === want.length && sorted.every((h, i) => h.n === want[i][0] && h.ip === want[i][1] && h.minMs === want[i][2] && h.medianMs === want[i][3] && h.maxMs === want[i][4] && h.rttMs === want[i][5] && h.responses === want[i][6] && h.noResponses === want[i][7]) && sorted[0].minUpperBound === true && sorted[0].medianUpperBound === true && sorted[0].maxUpperBound === true;
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
const needHosts = process.argv.includes("--require-hosts") ? Number(process.argv[process.argv.indexOf("--require-hosts") + 1]) : 0;
if (needHosts && data.hosts.length !== needHosts) problems.push(`expected ${needHosts} hosts, got ${data.hosts.length}`);
if (requireProbe) {
  const h = data.hosts[0];
  if (!h) problems.push("no host was measured");
  else if (h.dnsMs == null || h.connectMs == null) problems.push(`host ${h.host} has no curl DNS or connect time${h.error ? ` (${h.error})` : ""}`);
}
for (const route of data.routes) {
  if (!route.method) problems.push(`route ${route.host} has no probe method`);
  if (!route.attempts) problems.push(`route ${route.host} has no bounded probe count`);
  for (const hop of route.hops) {
    if (hop.responses != null && hop.noResponses != null && route.attempts != null && hop.responses + hop.noResponses > route.attempts) problems.push(`route ${route.host} hop ${hop.n} has more replies than attempts`);
    if (hop.medianMs != null && (hop.minMs == null || hop.maxMs == null || hop.minMs > hop.medianMs || hop.medianMs > hop.maxMs)) problems.push(`route ${route.host} hop ${hop.n} has invalid timing summary`);
  }
}
console.log(JSON.stringify({ platform: data.platform, os: data.os, link: data.link.type, wifi: data.link.wifi.rssiDbm != null, dnsServers: data.dns.servers.length, tcpRoute: data.routeCapabilities.tcp, proxyPac: Boolean(data.proxy.autoConfigUrl), hosts: data.hosts.map(h => ({ host: h.host, dnsMs: h.dnsMs, connectMs: h.connectMs, status: h.status })), routes: data.routes.map(r => ({ host: r.host, method: r.method, attempts: r.attempts, hops: r.hops.length, answered: r.hops.filter(x => x.responses > 0 || x.ip).length })), notes: data.notes }, null, 1));
if (problems.length) { console.error(`Problems: ${problems.join("; ")}`); process.exit(1); }
console.log("helper output ok");
