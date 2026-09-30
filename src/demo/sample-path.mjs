/**
 * A made-up network path helper file for the viewer's sample and for tests. It is shaped like the
 * output of tools/socketmap-path.sh: made-up computer, documentation address ranges (RFC 5737), and
 * hosts taken from the sample capture. Nothing here was measured.
 */

export function buildSamplePath(model) {
  const hosts = [...new Set((model?.requests || []).filter(r => !r.isBackground && r.host && !/^\d+\.\d+\.\d+\.\d+$/.test(r.host)).map(r => r.host))].slice(0, 3);
  const collected = Date.parse(model?.environment?.captureStartedAt);
  const at = new Date((Number.isFinite(collected) ? collected : Date.UTC(2026, 8, 29, 12, 0, 0)) + 4 * 60000).toISOString();
  return {
    kind: "socketmap-path", version: 1, tool: "socketmap-path.sh 1.0 (sample)", collectedAt: at, platform: "macos", os: "macOS (sample)", computer: "sample-laptop",
    link: { interface: "en0", type: "wifi", ipv4: "192.0.2.42", ipv6: null, gateway: "192.0.2.1", wifi: { ssid: "Example-Office", rssiDbm: -72, noiseDbm: -91, channel: "44 (5GHz, 80MHz)", txRateMbps: 286, phyMode: "802.11ac", security: "WPA2 Enterprise" } },
    dns: { servers: ["198.51.100.53", "198.51.100.54"], searchDomains: ["corp.example.com"] },
    proxy: { http: null, https: null, autoConfigUrl: "http://wpad.corp.example.com/proxy.pac", autoConfigEnabled: true, autoDetect: true, bypass: ["*.corp.example.com"] },
    publicIp: "203.0.113.25", publicIpSource: "api.ipify.org",
    hosts: hosts.map((host, i) => ({ host, dnsMs: 18 + i * 6, connectMs: 22 + i * 9, tlsMs: 31 + i * 5, firstByteMs: 64 + i * 40, httpVersion: "2", remoteIp: `203.0.113.${60 + i}`, status: 200, error: null })),
    routes: hosts.slice(0, 2).map((host, i) => ({ host, method: "udp", hops: [
      { n: 1, ip: "192.0.2.1", rttMs: 3.2 }, { n: 2, ip: "198.51.100.1", rttMs: 9.8 }, { n: 3, ip: null, rttMs: null }, { n: 4, ip: "198.51.100.9", rttMs: 14.1 }, { n: 5, ip: "203.0.113.1", rttMs: 96.5 }, { n: 6, ip: `203.0.113.${60 + i}`, rttMs: 98.2 }
    ] })),
    notes: ["This is a made-up sample. Nothing was measured."]
  };
}
