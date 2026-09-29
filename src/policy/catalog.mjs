/**
 * Curated catalog of browser policies that shape the network path and page load.
 *
 * Every entry links to that policy's own page in the Chrome Enterprise policy list or the
 * Microsoft Edge policy documentation. "documented" is paraphrased from those pages;
 * "guidance" is SocketMap's judgment and is always labeled as such in the report.
 * Where a browser is missing from `browsers`, no vendor page was checked for it.
 * `documentedFrom` says whose page the "documented" text was paraphrased from ("chrome",
 * "edge", or "both"); the report says so when it differs from the browser being assessed.
 *
 * Scope is deliberately narrow: proxy and PAC, QUIC, DNS, prediction, certificate
 * revocation, connection limits, caching, background running. Not security hardening.
 *
 * Reviewed against the vendor pages on CATALOG_REVIEWED. Run `npm run check:policy-links`
 * to confirm the links still resolve. No Node APIs: runs in the browser.
 */

export const CATALOG_REVIEWED = "2026-09-29";
export const CHROME_POLICY_LIST = "https://chromeenterprise.google/policies/";
export const EDGE_POLICY_LIST = "https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies";

const chrome = (slug, status = "current", since = null) => ({ url: `${CHROME_POLICY_LIST}${slug}/`, status, since });
const edge = (name, status = "current", since = null) => ({ url: `${EDGE_POLICY_LIST}/${name.toLowerCase()}`, status, since });

// explain rules: the first whose `when` matches the recorded value supplies the plain-words meaning.
// when: { eq } | { lt } | { gte } | { in: [] }, optionally with { path: "Field" } for object values.
export const POLICY_CATALOG = [
  {
    id: "proxy-settings", documentedFrom: "both", name: "ProxySettings", area: "Proxy and PAC",
    browsers: { chrome: chrome("proxy-settings", "current", "18"), edge: edge("ProxySettings", "current", "77") },
    what: "Sets how the browser finds its proxy: direct, system, auto-detect, fixed servers, or a PAC script.",
    matters: "The proxy path decides where every request goes first, so proxy lookup time and PAC behavior show up in each request's timing.",
    documented: "Sets proxy mode and its related fields in one policy and overrides command-line proxy options. Left unset, users choose their own proxy settings.",
    explain: [
      { when: { path: "ProxyMode", eq: "pac_script" }, text: "Uses a PAC script for proxy decisions." },
      { when: { path: "ProxyMode", eq: "auto_detect" }, text: "Detects the proxy automatically (WPAD)." },
      { when: { path: "ProxyMode", eq: "fixed_servers" }, text: "Uses fixed proxy servers." },
      { when: { path: "ProxyMode", eq: "system" }, text: "Uses the operating system's proxy settings." },
      { when: { path: "ProxyMode", eq: "direct" }, text: "Never uses a proxy." }
    ]
  },
  {
    id: "proxy-mode", documentedFrom: "both", name: "ProxyMode", area: "Proxy and PAC",
    browsers: { chrome: chrome("proxy-mode", "deprecated", "10"), edge: edge("ProxyMode", "deprecated", "77") },
    replacement: "ProxySettings",
    what: "The older way to choose the proxy mode.",
    matters: "A retired policy can stop working in a future release, which would change the proxy path without any other change.",
    documented: "Both vendors mark it deprecated and name ProxySettings as the replacement. Chrome's page adds that ProxyMode only takes effect if ProxySettings is not specified.",
    explain: [
      { when: { eq: "pac_script" }, text: "Uses a PAC script." }, { when: { eq: "auto_detect" }, text: "Detects the proxy automatically." },
      { when: { eq: "fixed_servers" }, text: "Uses fixed proxy servers." }, { when: { eq: "system" }, text: "Uses the operating system's proxy settings." },
      { when: { eq: "direct" }, text: "Never uses a proxy." }
    ],
    overriddenBy: { name: "ProxySettings", browsers: ["chrome"], text: "Chrome's documentation says ProxyMode only takes effect if ProxySettings is not specified, so ProxySettings wins here." }
  },
  {
    id: "proxy-pac-url", documentedFrom: "edge", name: "ProxyPacUrl", area: "Proxy and PAC",
    browsers: { edge: edge("ProxyPacUrl", "deprecated") },
    replacement: "ProxySettings",
    what: "The older setting for the PAC script address.",
    matters: "The PAC script decides the proxy for each request, so where it is hosted and how quickly it loads affects request timing.",
    documented: "Microsoft's Edge policy list marks it deprecated. Chrome's ProxySettings page lists ProxyPacUrl as one of its fields.",
    explain: []
  },
  {
    id: "proxy-server", documentedFrom: "edge", name: "ProxyServer", area: "Proxy and PAC",
    browsers: { edge: edge("ProxyServer", "deprecated") },
    replacement: "ProxySettings",
    what: "The older setting for a fixed proxy server address.",
    matters: "A fixed proxy is a single path for every request, so its capacity and distance affect all timings.",
    documented: "Microsoft's Edge policy list marks it deprecated. Chrome's ProxySettings page lists ProxyServer as one of its fields.",
    explain: []
  },
  {
    id: "proxy-bypass-list", documentedFrom: "edge", name: "ProxyBypassList", area: "Proxy and PAC",
    browsers: { edge: edge("ProxyBypassList", "deprecated") },
    replacement: "ProxySettings",
    what: "The older setting for hosts that skip the proxy.",
    matters: "Hosts that bypass the proxy take a different path, so this changes which requests show proxy time.",
    documented: "Microsoft's Edge policy list marks it deprecated. Chrome's ProxySettings page lists ProxyBypassList as one of its fields.",
    explain: []
  },
  {
    id: "wpad-quick-check", documentedFrom: "edge", name: "WPADQuickCheckEnabled", area: "Proxy and PAC",
    browsers: { edge: edge("WPADQuickCheckEnabled", "current", "77") },
    what: "Turns the browser's WPAD (automatic proxy discovery) optimization on or off.",
    matters: "Automatic proxy discovery runs before requests, so a slow discovery shows as proxy lookup time.",
    documented: "The optimization is on by default, and this policy can turn it off.",
    explain: [
      { when: { eq: false }, text: "The WPAD optimization is turned off." },
      { when: { eq: true }, text: "The WPAD optimization is on, which is the default." }
    ],
    suggest: [{
      signal: "slowProxyLookup", unsetOnly: true, browsers: ["edge"],
      why: "This capture shows a slow proxy lookup.",
      guidance: "If proxy discovery is slow, confirm the discovery path first (WPAD or PAC hosting). Changing this optimization is a test to make deliberately, not a default fix."
    }]
  },
  {
    id: "quic-allowed", documentedFrom: "both", name: "QuicAllowed", area: "Protocol",
    browsers: { chrome: chrome("quic-allowed", "current", "43"), edge: edge("QuicAllowed", "current", "77") },
    what: "Allows or blocks the QUIC protocol (used for HTTP/3).",
    matters: "When QUIC is blocked by policy or by the network, requests use HTTP/2 or HTTP/1.1 instead, which changes connection setup time.",
    documented: "Enabled or unset allows QUIC; disabled blocks it.",
    explain: [
      { when: { eq: false }, text: "QUIC is blocked, so HTTP/3 is not used." },
      { when: { eq: true }, text: "QUIC is allowed, which is the default." }
    ],
    contradictedBy: [{
      signal: "quicSeen", when: { eq: false },
      text: "This capture used HTTP/3 (QUIC), but the export says QuicAllowed is off. The export may come from another machine or time, or a different policy source applies."
    }],
    suggest: [{
      signal: "quicFailed", unsetOnly: true,
      why: "This capture shows QUIC failing and falling back.",
      guidance: "Repeated QUIC attempts that fail add a fallback step. Either allow UDP 443 on the network path or set QuicAllowed to false on purpose, then capture again and compare."
    }]
  },
  {
    id: "dns-over-https-mode", documentedFrom: "both", name: "DnsOverHttpsMode", area: "DNS",
    browsers: { chrome: chrome("dns-over-https-mode", "current", "78"), edge: edge("DnsOverHttpsMode", "current", "83") },
    what: "Controls whether the browser resolves names over HTTPS (DNS-over-HTTPS).",
    matters: "It changes where name lookups go, so DNS time and resolver behavior in a capture depend on it.",
    documented: "Values are off, automatic (falls back to plain DNS on error) and secure (no fallback). When unset, DNS-over-HTTPS queries are not sent on managed devices, and the browser may use the system resolver otherwise.",
    explain: [
      { when: { eq: "off" }, text: "DNS-over-HTTPS is off." },
      { when: { eq: "automatic" }, text: "Uses DNS-over-HTTPS when a server is available and falls back to plain DNS on error." },
      { when: { eq: "secure" }, text: "Uses DNS-over-HTTPS only, with no fallback to plain DNS." }
    ]
  },
  {
    id: "builtin-dns-client", documentedFrom: "chrome", name: "BuiltInDnsClientEnabled", area: "DNS",
    browsers: { chrome: chrome("built-in-dns-client-enabled", "current", "25"), edge: edge("BuiltInDnsClientEnabled") },
    what: "Chooses the browser's built-in DNS client or the operating system's.",
    matters: "The two resolvers can behave differently, which shows in DNS timing.",
    documented: "Enabled or unset uses the built-in client. Disabled uses it only when DNS-over-HTTPS is in use. It does not change which DNS servers are used.",
    explain: [
      { when: { eq: false }, text: "Uses the operating system's DNS client except for DNS-over-HTTPS." },
      { when: { eq: true }, text: "Uses the browser's built-in DNS client, which is the default." }
    ],
    suggest: [{
      signal: "slowDns", unsetOnly: true,
      why: "This capture shows slow DNS lookups.",
      guidance: "Compare a capture with the built-in client against one using the operating system's resolver. Which servers are used does not change, so first check the resolver itself."
    }]
  },
  {
    id: "network-prediction", documentedFrom: "both", name: "NetworkPredictionOptions", area: "Prediction",
    browsers: { chrome: chrome("network-prediction-options", "current", "38"), edge: edge("NetworkPredictionOptions", "current", "77") },
    what: "Controls DNS prefetching, early TCP and TLS connections, and prerendering.",
    matters: "Prediction opens connections before they are needed, which can hide setup time or add traffic.",
    documented: "0 predicts, 2 does not predict. Chrome's page notes the older value 1 is deprecated. Unset leaves prediction on but lets the user change it.",
    explain: [
      { when: { eq: 0 }, text: "Network prediction is on and users cannot change it." },
      { when: { eq: 1 }, text: "An older value that Chrome's page marks deprecated." },
      { when: { eq: 2 }, text: "Network prediction is off and users cannot change it." }
    ]
  },
  {
    id: "online-revocation", documentedFrom: "chrome", name: "EnableOnlineRevocationChecks", area: "Certificates and TLS",
    browsers: { chrome: chrome("enable-online-revocation-checks", "current", "19"), edge: edge("EnableOnlineRevocationChecks") },
    what: "Turns online certificate revocation checks (OCSP and CRL) on or off.",
    matters: "When on, checking a certificate can require extra network lookups before a connection completes.",
    documented: "True performs online checks. False or unset does not, in Chrome 19 and later. Chrome's page notes it sees no effective security benefit from these checks.",
    explain: [
      { when: { eq: true }, text: "Performs online OCSP and CRL checks." },
      { when: { eq: false }, text: "Does not perform online OCSP or CRL checks." }
    ],
    suggest: [{
      signal: "slowConnection", setWhen: { eq: true },
      why: "This policy is on and this capture shows slow connection setup.",
      guidance: "Online revocation checks can add lookups while a connection is being set up. Compare a capture with them off before changing anything."
    }]
  },
  {
    id: "max-connections-per-proxy", documentedFrom: "chrome", name: "MaxConnectionsPerProxy", area: "Connections",
    browsers: { chrome: chrome("max-connections-per-proxy", "current", "14"), edge: edge("MaxConnectionsPerProxy") },
    what: "Sets the most simultaneous connections the browser opens to one proxy server.",
    matters: "A low limit can queue requests behind each other, which shows as browser queue time.",
    documented: "Default is 128, accepted range 6 to 256. Chrome's page warns that a value below 128 can cause networking hangs with apps that hold connections open, and notes some proxies cannot handle many connections, which a lower value solves.",
    explain: [
      { when: { lt: 128 }, text: "Lower than the default of 128. Chrome's page warns this can cause hangs with apps that hold connections open." },
      { when: { gte: 128 }, text: "At or above the default of 128." }
    ]
  },
  {
    id: "disk-cache-size", documentedFrom: "chrome", name: "DiskCacheSize", area: "Caching",
    browsers: { chrome: chrome("disk-cache-size", "current", "17"), edge: edge("DiskCacheSize") },
    what: "Sets the disk cache size in bytes.",
    matters: "A larger cache can answer more requests locally, which shows as cache hits instead of network requests.",
    documented: "Used as a hint to the browser's caches, so actual disk use is higher but within the same order of magnitude. Unset uses the default size.",
    explain: []
  },
  {
    id: "background-mode", documentedFrom: "chrome", name: "BackgroundModeEnabled", area: "Background running",
    browsers: { chrome: chrome("background-mode-enabled", "current", "19"), edge: edge("BackgroundModeEnabled") },
    what: "Keeps the browser process running after the last window closes.",
    matters: "A running background process can keep connections and sessions alive, which changes what counts as a new connection.",
    documented: "Enabled starts a browser process at sign-in and keeps it running after the last window closes. Chrome's page says unset means off at first, but users can change it.",
    explain: [
      { when: { eq: true }, text: "The browser keeps running after the last window closes." },
      { when: { eq: false }, text: "The browser stops when the last window closes." }
    ]
  }
];
