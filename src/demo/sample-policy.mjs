/**
 * A synthetic policy export shaped like Chrome's Export to JSON, for the Policy tab's
 * "Try a sample export" button and for tests. Made up: no real machine, account or address.
 */

export function buildSamplePolicyExport() {
  const set = (value, extra = {}) => ({ level: "mandatory", scope: "machine", source: "platform", value, ...extra });
  return {
    chromeMetadata: {
      OS: "Windows NT: 10.0.26100 (x86_64)",
      application: "Google Chrome",
      revision: "0000000000000000000000000000000000000000-example",
      version: "153.0.0.0 (Official Build) (64-bit)"
    },
    policyExportTime: "2026-09-29T12:00:00.000Z",
    policyValues: {
      chrome: {
        name: "Chrome Policies",
        policies: {
          ProxyMode: set("pac_script"),
          ProxyPacUrl: set("http://wpad.corp.example.com/proxy.pac"),
          MaxConnectionsPerProxy: set(32),
          DnsOverHttpsMode: set("automatic"),
          NetworkPredictionOptions: set(2),
          HomepageLocation: set("https://intranet.corp.example.com/"),
          ShowHomeButton: set(true)
        }
      },
      extensionInstall: { name: "Extension Install Policies", policies: {} },
      extensions: {},
      precedence: { name: "Policy Precedence", policies: {}, precedenceOrder: ["Platform machine", "Cloud machine", "Platform user", "Cloud user"] },
      updater: { name: "Google Update Policies", policies: { AutoUpdateCheckPeriodMinutes: set("1440") } }
    },
    status: { updater: { policyDescriptionKey: "statusUpdater", timeSinceLastRefresh: "5 hours ago", version: "1.0.0.0" }, user: {} }
  };
}
