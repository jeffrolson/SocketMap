/**
 * "Learn" section of the report: next steps, curated links, and a glossary.
 *
 * Links are ordinary hyperlinks the reader chooses to open; the report itself
 * loads nothing remote. Every URL was checked to resolve when it was added.
 */

export const NEXT_STEPS = [
  "Send this report to the team named in each finding. It is one file and opens offline.",
  "Capture again from a different network (office vs. home, VPN on vs. off). What changes between the two reports points at the cause.",
  "For Microsoft 365, run the Microsoft 365 network connectivity test from the same computer and compare.",
  "If the network looks fine but the page is still slow, record a Performance profile in Chrome DevTools. A NetLog cannot see time spent running the page's code.",
  "Paste the AI summary into your AI assistant and ask what to check next."
];

export const LEARN_GROUPS = [
  {
    title: "Page speed and best practices",
    links: [
      ["Web Vitals", "https://web.dev/articles/vitals", "Google's core measures of how fast and stable a page feels to users."],
      ["Chrome Modern Web Guidance", "https://developer.chrome.com/docs/modern-web-guidance", "Current recommendations for building fast, modern web pages."],
      ["PageSpeed Insights", "https://pagespeed.web.dev/", "Test any public page and get a speed score with suggestions."],
      ["Lighthouse", "https://developer.chrome.com/docs/lighthouse/overview", "The auditing tool built into Chrome that powers PageSpeed Insights."],
      ["WebPageTest", "https://www.webpagetest.org/", "Load a public page from different locations and connection speeds."]
    ]
  },
  {
    title: "Digging deeper in the browser",
    links: [
      ["Chrome DevTools: Network panel", "https://developer.chrome.com/docs/devtools/network/reference", "See every request live, with timing, while you reproduce a problem."],
      ["Chrome DevTools: Performance panel", "https://developer.chrome.com/docs/devtools/performance", "Find slowness caused by the page's own code (CPU), which NetLog cannot show."],
      ["NetLog Viewer", "https://netlog-viewer.appspot.com/", "Chromium's own viewer for the raw capture file. Runs in your browser."],
      ["Capturing network logs (Chromium)", "https://www.chromium.org/for-testers/providing-network-details/", "The official guide to chrome://net-export."]
    ]
  },
  {
    title: "Microsoft 365 networking",
    links: [
      ["Microsoft 365 network connectivity principles", "https://learn.microsoft.com/microsoft-365/enterprise/microsoft-365-network-connectivity-principles", "Microsoft's guidance, including why to bypass proxies and TLS inspection for Microsoft 365."],
      ["Managing Microsoft 365 endpoints", "https://learn.microsoft.com/microsoft-365/enterprise/managing-office-365-endpoints", "How to route Microsoft 365 traffic with PAC files and proxy bypass."],
      ["Microsoft 365 URLs and IP address ranges", "https://learn.microsoft.com/microsoft-365/enterprise/urls-and-ip-address-ranges", "The official list of Microsoft 365 addresses, by service and category."],
      ["Microsoft 365 network connectivity test", "https://connectivity.office.com/", "Run from the affected computer to test its path to Microsoft 365."],
      ["About the connectivity test", "https://learn.microsoft.com/microsoft-365/enterprise/office-365-network-mac-perf-onboarding-tool", "What the connectivity test measures and how to read it."]
    ]
  },
  {
    title: "Network tools for the next level",
    links: [
      ["Wireshark", "https://www.wireshark.org/", "Packet capture and analysis. Shows what happens below the browser."],
      ["Wireshark: TLS", "https://wiki.wireshark.org/TLS", "How to read encrypted traffic in Wireshark, including handshakes and certificates."],
      ["Test-NetConnection (PowerShell)", "https://learn.microsoft.com/powershell/module/nettcpip/test-netconnection", "Built into Windows: test a port and run a traceroute to a host."],
      ["mtr", "https://github.com/traviscross/mtr", "Traceroute and ping combined; shows where along the path delay or loss begins."],
      ["curl timing output", "https://everything.curl.dev/usingcurl/verbose/writeout.html", "Time DNS, connect, TLS, and first byte for one URL from the command line."]
    ]
  },
  {
    title: "The basics, explained simply",
    links: [
      ["What is DNS?", "https://www.cloudflare.com/learning/dns/what-is-dns/", "How names like example.com become addresses."],
      ["What is TLS?", "https://www.cloudflare.com/learning/ssl/transport-layer-security-tls/", "How web traffic is encrypted."],
      ["What is an SSL/TLS certificate?", "https://www.cloudflare.com/learning/ssl/what-is-an-ssl-certificate/", "How a server proves who it is, and why the issuer matters."],
      ["What is HTTP/3?", "https://www.cloudflare.com/learning/performance/what-is-http3/", "The newest web protocol, built on QUIC."],
      ["An overview of HTTP", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview", "How browsers and servers talk."],
      ["HTTP status codes", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status", "What 200, 304, 404, 503 and the rest mean."],
      ["Time to first byte", "https://developer.mozilla.org/en-US/docs/Glossary/Time_to_first_byte", "The \"server wait\" measure in this report."]
    ]
  }
];

export const GLOSSARY = [
  ["Request / response", "The browser asks a server for something (request) and the server sends it back (response). A web page is usually dozens or hundreds of these."],
  ["DNS", "The internet's phone book: turns a name like contoso.sharepoint.com into an address the computer can connect to."],
  ["TCP", "The standard way to open a reliable connection to a server. Takes one round trip across the network."],
  ["TLS", "The encryption that puts the padlock in the address bar. Setting it up adds a round trip and a certificate check."],
  ["QUIC / HTTP/3", "A newer way to connect that does the connection and encryption in one step, over UDP. Some firewalls block it, which forces a slower fallback."],
  ["HTTP/2 and HTTP/1.1", "Versions of the web protocol. HTTP/2 sends many requests over one connection; HTTP/1.1 allows only about six at a time per server."],
  ["Certificate and root", "A certificate is the server's ID card. It is trusted because it chains up to a root authority built into the operating system or browser."],
  ["TLS inspection", "A security device decrypts traffic, inspects it, and re-encrypts it with its own certificate. It shows up here as a certificate from a non-public root, and it adds delay."],
  ["Proxy", "A server that sits between your computer and the internet and forwards traffic, often for filtering or logging."],
  ["PAC file", "A small script that tells the browser which proxy, if any, to use for each address. A slow PAC file delays every request."],
  ["Server wait (time to first byte)", "Time between sending a request and the first byte of the answer. Spent at the server or at anything in front of it."],
  ["Latency", "Delay. In this report, how long a step took, in milliseconds (ms). 1,000 ms is one second."],
  ["localhost / 127.0.0.1", "This computer. A page calling localhost is talking to software installed on the machine, such as a sign-in agent."],
  ["Status code", "A number the server sends back: 2xx worked, 3xx go elsewhere or use your saved copy, 4xx request problem, 5xx server problem."],
  ["NetLog", "Chrome's detailed record of its network activity, saved from chrome://net-export. This report is built from it."]
];

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderLearn() {
  return `
    <section id="learn" class="card">
      <h2>Learn and next steps</h2>
      <h3 class="sub">What to do next</h3>
      <ol class="steps">${NEXT_STEPS.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
      <div class="learn-grid">
        ${LEARN_GROUPS.map(g => `
          <div class="learn-group">
            <h3 class="sub">${esc(g.title)}</h3>
            <ul class="links">${g.links.map(([name, url, why]) =>
              `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(name)}</a><span>${esc(why)}</span></li>`).join("")}</ul>
          </div>`).join("")}
      </div>
      <h3 class="sub">Glossary</h3>
      <dl class="glossary">${GLOSSARY.map(([term, meaning]) => `<dt>${esc(term)}</dt><dd>${esc(meaning)}</dd>`).join("")}</dl>
      <p class="note">Links open outside the report and need internet access. The report itself works offline.</p>
    </section>`;
}
