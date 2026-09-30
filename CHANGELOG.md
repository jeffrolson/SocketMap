# CHANGELOG.md

All notable changes to this project. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.17.4] - 2026-09-30
### Validated
- **An actual exported Edge policy file.** Edge's Export to JSON opens a native save dialog that headless mode cannot complete, so the `record-real-data` workflow now has a job that opens a visible Edge on a disposable Windows runner with managed policies set in the registry, clicks Export through the debugging protocol, and completes the dialog with keystrokes. The file it produced has the top-level keys `chromeMetadata`, `policyValues` and `status`, `application` "Microsoft Edge", and the same per-policy fields as Chrome (`level`, `scope`, `source`, `value`, `deprecated`). The Policy tab reads it as Edge with no changes; a test now covers it.

## [0.17.3] - 2026-09-30
### Fixed
- **Network path helper 1.1** (found by running the scripts on real Windows and Linux CI runners):
  - **A proxy credential could be left in the file.** The scripts masked `scheme://user:pass@host` but not the bare `user:pass@host` form Windows uses in proxy settings, so a Windows proxy setting with a password wrote it into `socketmap-path.json`. Both scripts now mask both forms, and the viewer's reader masks both forms whatever the file says. If you shared a helper file from 1.0 on a computer with a credentialed proxy, treat that credential as exposed.
  - **With two or more hosts, the PowerShell script did nothing useful** after a parameter was added in development; only `-Hosts` is positional now, and CI measures two hosts on every operating system.
  - **A failed curl probe** now records a clear reason ("curl exit code 28", "Could not resolve proxy") and no timings, instead of raw curl output.
  - The report no longer says curl never uses a proxy: on Mac and Linux curl honors proxy environment variables, so the file records whether it did (`probeUsesProxy`) and the panel says so.
- The PowerShell route parser is now tested in CI on Windows against sample `tracert` lines, since the runners drop route probes and no hop answers there.

### Validated
- On a real Windows runner, the helper read genuine registry proxy settings: web and secure proxy, the PAC address, the bypass list and the auto-detect flag. Chrome's export of a cloud-only policy set at machine level shows `Ignored because the policy is not set by a cloud source.`, which the Policy tab reports.

## [0.17.2] - 2026-09-30
### Validated
- **Real Windows and Linux recordings.** A manual workflow (`record-real-data`) records genuine data on disposable GitHub runners, so nothing touches a personal machine: NetLog and Performance trace pairs from real Windows Chrome, Windows Edge and Linux Chrome. Each aligned by shared requests (34 of 37 matched, 32 to 33 within 50 ms) and agrees with the shared browser clock to within 1.2 ms (clock domains `WIN_QPC` and `LINUX_CLOCK_MONOTONIC`), so the shared-clock assumption holds on Windows and Linux, not only on macOS. Profile alignment is now confirmed on macOS Chrome, macOS Edge, Windows Chrome, Windows Edge and Linux Chrome.
- **Real managed policy exports.** On the same runners, Chrome with genuine managed policies (Linux policy files; Windows registry, including the same policies at user level) was exported through its own "Copy as JSON" button. It confirms the per-policy fields the reader looks for: `error` ("Expected integer value.", "Unknown policy."), `deprecated`, `warning`, `conflicts` (each entry with its level, scope, source and value), `level` recommended or mandatory, `scope`, `source`. Both top-level layouts occur in real exports (`policyValues` in Chrome 153, `policyGroups` in 154 and 134); the reader accepts either. All of it runs through the redaction audit, which found nothing to fix.

### Changed
- A policy that overrides another source's value now says which one: "overrides a mandatory user-level value from platform (off)", instead of a generic conflict count. The same for superseded values.

## [0.17.1] - 2026-09-30
### Validated
- **Microsoft Edge, on real recordings.** Edge 154 (run from Microsoft's signed package in a temporary folder, then removed) recorded a NetLog and a Performance trace of one page load: 34 of 37 trace requests matched NetLog requests, 33 within 50 ms, and the request-based offset agrees with the shared browser clock to within 1 ms. The NetLog identifies the browser as "Microsoft Edge 154", so profile alignment now has a real macOS Chrome pair and a real macOS Edge pair. Windows is still only CI-verified.
- **Edge's policy export keys.** Edge 154's own binary contains `chromeMetadata`, `policyGroups` and `policyIds`, and contains neither `policyValues` nor `edgeMetadata`, so Edge writes the same layout as Chrome 134 and earlier. The reader already accepts it; a test now covers that shape. (Edge's `edge://policy` export goes through a native save dialog, so an actual exported file was not captured here.)
- **A/B comparison on real captures.** The same page loaded twice with Chrome's own NetLog, the second with an emulated slow network: the comparison showed the observed span rising from 532 ms to 4.08 s and median request duration from 15 to 408 ms while median server wait stayed flat (14 vs 12 ms), which is what a network slowdown should look like.

### Fixed
- The comparison labelled a 2 ms change in a timing "faster" in green. Differences under 10 ms are now shown as "about the same".

## [0.17.0] - 2026-09-30
### Added
- **Timeline in the Waterfall.** A strip marks each failed or slow request on the page load's timeline (click a marker to jump to its row) and, with a Performance profile, the main thread's long tasks. Two handles set a time window that narrows the waterfall to the requests overlapping it; "Show everything" restores it.
- **Save the sequence as an image.** PNG and SVG downloads of the sequence diagram, built inside the page from its own styles, with the same redacted content as the report. A real-browser test checks both files are produced.

### Changed
- **The viewer's toolbar is one row.** The page picker sits in the main row, and the five "Add ..." buttons (HAR, profile, network path, Lighthouse, CPU profile) are folded into one "Add files" menu. The comparison controls appear only for comparisons. The report keeps its own header.

## [0.16.0] - 2026-09-30
### Added
- **Lighthouse report as an optional file.** Run Lighthouse with `--output=json` (or DevTools, Save as JSON) and drop it with the capture, click **Add Lighthouse**, or use `--lighthouse`. The Overview shows its performance score, the six core metrics coloured by Lighthouse's own score bands, what it says to look at with the addresses and sizes it names (unused JavaScript, cache lifetimes, render-blocking requests and so on), main-thread time by kind, and scripts by execution time. Requests it names that are also in the capture are marked in the waterfall's request details.
- It is always labelled as a separate lab load. Lighthouse's default throttling is simulated, so its numbers are estimates from another load; they are shown as what a clean run would flag and are never set against the capture's own timings. The gap between the two runs is shown.
- Works with Lighthouse 12 and 13's insight audits as well as the classic ones. A real 554 KB report reduces to about 6 KB; screenshots, page snippets and audit prose are dropped and credentials in URLs are masked.
- **V8 CPU profile as an optional file.** A `.cpuprofile` (DevTools JavaScript Profiler, `node --cpu-prof`) adds a panel with JavaScript busy, garbage collection, idle and native time, and scripts and functions by self time. It is summarized and not placed on the timeline.
- Coverage: with either file, "JavaScript execution" becomes partial, and Lighthouse makes "Rendering and page-experience timings" partial, worded as lab results. The AI summary gains labelled sections; the redaction audit covers both formats.
- The viewer's sample now includes a made-up Lighthouse report.

## [0.15.0] - 2026-09-30
### Added
- **A HAR on its own opens in the full report.** Drop a HAR (DevTools, Network tab, Export HAR) in the viewer or run `node bin/traceviz.mjs file.har`. The report is built from what the HAR recorded: waterfall with queue, DNS, connect, TLS, wait and download per request, hosts and ratings, findings, server timing and CDN headers from response headers, Coverage and the AI summary. Everything a HAR does not record (proxy decisions, certificates, TLS versions, browser settings, browser diagnostics) is null and shown as not recorded, and the Diagnostics and Events tabs, which have nothing to show, are hidden.
- A HAR's `connect` time includes TLS, so SocketMap separates them; `blocked` is kept as queue time; an unrecorded phase stays empty instead of becoming zero. Entries that belong to no page are background traffic when the HAR names its pages.
- A profile or the network path file can be added to a HAR-based report. `--diagram` keeps the older sequence diagram for a HAR.
- Response headers are kept for a HAR opened on its own, with credentials masked (cookies, authorization, tokens and now authentication challenges); request headers, bodies and cookies are still never read. The redaction audit checks this path too, and found nothing to fix on real HARs including a login flow.

### Fixed
- `WWW-Authenticate`, `Proxy-Authenticate` and `Authentication-Info` header values are now masked; they can carry nonces and session data.

### Changed
- The older HAR diagram no longer applies to a plain HAR, which retires its invented upstream hop and default values for that input. It remains for generic JSON traces and `--diagram`.

## [0.14.0] - 2026-09-30
### Added
- **Network path helper.** Two small scripts, `tools/socketmap-path.sh` (Mac and Linux) and `tools/socketmap-path.ps1` (Windows PowerShell), record what a browser capture cannot see: this computer's link and Wi-Fi signal, its DNS servers, proxy and PAC settings, its public address, curl timing (DNS, connect, TLS, first byte) for each host you list, and the route to each host. They write one small JSON file. They only read settings, need no admin rights, and make two kinds of request: an optional public-address lookup and a plain `GET /` to each listed host.
- **Add it to the report.** Drop the file with the NetLog, click **Add network path** in the viewer, or use `--path` on the command line. The Overview gains "The path from this computer": link and signal, DNS servers marked private or public, proxy and PAC, public address, observations with their limits stated, the browser's timings next to curl's for each host, and the route with the delay at each hop. Without the file, the Overview shows the exact command for this capture (its slowest hosts) and offers both scripts as offline downloads.
- The helper's file is a snapshot from when it ran, so the report shows how far apart it and the capture were and warns when it is more than an hour. Curl does not use the system proxy, so a gap between it and the browser is worded as pointing at the browser's own path, not as a cause. Route probes are one per hop, and silent hops are common, so route findings are hints.
- Coverage: "Per-hop delay", "Wi-Fi, network card and operating system quality" and a new "Timing measured outside the browser (curl)" move from "never in a NetLog" to partial. The AI summary gains a labeled section. The viewer's sample includes a made-up helper file.
- The reader is an allowlist: only known fields survive, everything is bounded, hostnames and addresses are validated, and credentials are removed from proxy and PAC addresses. `npm run check:helper -- <file>` checks a file with the same reader.
- CI runs the Mac and Linux script on macOS and Linux runners and the PowerShell script on a Windows runner, and fails if the output does not read back. `npm run generate:tools` embeds the scripts in the report; `verify` fails if that copy is stale.

### Notes
- Verified on a real Mac (Wi-Fi, curl timings and routes for two hosts). The Windows script's first real run is in CI; it has not been tried on a physical Windows machine with Wi-Fi or a corporate proxy. On Windows the Wi-Fi signal is converted from the percentage Windows reports, so it is an estimate.

## [0.13.0] - 2026-09-30
### Added
- **Profile placement by the shared clock.** When a Performance profile and a NetLog share no request, the profile is now placed on the timeline anyway if it was recorded in the same browser session: its navigation must fall inside the capture's time span and its site must appear in the capture. Both files use Chrome's monotonic clock, which a real pair confirmed to within 5 ms. Per-request script details still need matching requests. A profile from a different run is refused, as before.
- **Redaction audit** (`npm run audit:redaction -- <file or folder>`): reads real NetLog, HAR and Performance trace files, harvests the actual secret values in them (authorization and cookie headers, secret-named parameters, token shapes), builds the report, and fails if any value survives into it. Values are never printed. Request and correlation IDs are kept on purpose and not counted.
- **Real-browser smoke test** (`npm run test:browser`): drives headless Chrome or Edge over the DevTools protocol against the built viewer. It loads the sample, the policy sample, and a NetLog with a HAR and a profile through the real file input, and fails on any page error or any request outside the local file. Skips when no browser is installed.
- **CI** (`.github/workflows/ci.yml`): tests, the viewer build, the browser smoke test and a no-remote-loads check on Windows, macOS and Linux with Node 22 and 24.

### Fixed
- **A credential could survive under an unexpected parameter name.** The audit found a Google API key in a real capture under `sugkey=`, which the name rules did not cover. Well-known token shapes (JSON web tokens, Google API keys, AWS access keys, GitHub tokens, Slack tokens, payment keys) are now masked wherever they appear: in URLs, header lines and captured evidence. The audit is clean on every real NetLog, HAR and trace tested here.

- **The viewer could keep showing the previous report.** When a HAR or profile was added right after a capture opened (the sample does this), assigning the report iframe's document a second time before the first had loaded could leave the old one in place. This showed up on a macOS CI runner. The viewer now applies one report at a time.

### Verified
- CI is green on Windows, macOS and Linux with Node 22 and 24, including the real-browser smoke test. This is the first time the test suite and viewer have run on Windows.

### Changed
- **Smaller Diagnostics on large captures.** Event samples (first and last parameters per event type) are kept for the 100 most eventful sources and every source with an error; other sources keep their event types, counts and times, and the viewer can still replay any source from the capture file. A real 5 MB capture's report went from 8.2 MB to 6.2 MB.

## [0.12.1] - 2026-09-29
### Fixed
- **Policy tab rejected exports from Chrome 134 and earlier** with "does not look like a browser policy export". Those versions write the policy list under `policyGroups`; newer Chrome writes `policyValues`. Both are read now, with the same structure.
- When a file is not recognized, the message now lists the file's top-level section names (never values), so the cause is visible.
- Confirmed from a real cloud-managed Chrome 134 export on macOS: per-policy `level`, `scope`, `source`, `value`, and `error` fields, and an enrollment token value that is redacted (policy names containing "token" are treated as secrets).

## [0.12.0] - 2026-09-29
### Added
- **Policy tab reads what a managed browser adds to each policy.** Chrome and Edge exports from a managed machine carry per-policy flags an unmanaged export lacks. The tab now reports, in the browser's own words and labeled "Browser reported": a policy that is **ignored** (set but not in effect), one the browser flags as **deprecated** or as a **future** policy, an **info** message, a value that **overrides** or is **superseded by** other sources, and a **restart needed** notice. A deprecation the catalog already explains is not repeated.

### Validated
- The managed export shape was checked against Chromium's own export code (`policy_conversions_client.cc`, `json_generation.cc`), not guessed: `policyValues`, `chromeMetadata` (application, version, OS, revision) and `status`; per policy `value`, `scope`, `level`, `source`, and the optional flags above; extension policies under their extension ids. Tests use that shape.
- Edge: Microsoft documents the Export to JSON button on `edge://policy` but not the file's schema. Edge shares Chromium's exporter and the tab identifies it by the product name the browser writes ("Microsoft Edge"), so it should read the same way; that is an inference until a real Edge export is seen.
- All policy links in the catalog resolve.

## [0.11.1] - 2026-09-29
### Fixed
- **A Performance profile now finds the page when other tabs navigate after it.** A profile recorded from a session that later touched blank tabs, `chrome://` pages or extension pages picked one of those as "the page", so the profile showed nothing and was not placed on the timeline. The page is now the last navigation to a web (`http` or `https`) document.

### Validated
- **Profile alignment on a genuine pair.** A NetLog and a Performance trace recorded together from one Chrome session (a Wikipedia article): 34 of 37 trace requests matched NetLog requests, 33 of them within 50 ms of the median offset, and the offset was found to within a few milliseconds. The offset from requests also agrees with the shared browser clock (trace time minus the NetLog's first tick) to within 5 ms, which confirms both files use Chrome's monotonic clock when recorded in the same session. The pair loads in the viewer (with the trace gzipped), the main-thread band and the milestone lines land where the profile says.
- **Policy tab with a real Chrome export** (unmanaged, no policies set) through the in-page uploader: version and operating system read, "no policies set" explained, evidence-backed suggestion shown. A managed Chrome export and an Edge export are still unconfirmed.

## [0.11.0] - 2026-09-29
### Added
- **Optional Performance profile.** Record a DevTools Performance profile while reloading the page, alongside the NetLog, and add it in the viewer (drop it with the NetLog, or **Add a profile** once the report opens) or with `--profile` on the command line. `.json` and `.json.gz` both work. The report shows what the page's code and rendering were doing, which a NetLog cannot.
- **What the page's code was doing:** an Overview panel with how busy the main thread was until load, the long tasks (over 50 ms) and time beyond that threshold, first and largest contentful paint, DOMContentLoaded, load and layout shift, where main-thread time went (scripting, layout, paint, parsing), scripts ranked by main-thread time (nested calls counted once), and the longest tasks with the scripts inside them and how many requests were in flight.
- **Waterfall:** a "Main thread (profile)" band shows how busy the page was across the timeline, with long tasks outlined, plus dashed lines for first and largest contentful paint, DOMContentLoaded and load.
- A finding, **The page's own code kept the main thread busy**, when long tasks add up to 200 ms or more beyond the 50 ms threshold. It is worded as consistent with the delay being work on the computer, not proof of which script is at fault.
- Coverage: "JavaScript execution and long tasks" is measured, "Rendering" and "Machine" become partial (paint, LCP and layout shift, and core count and memory; INP and machine load stay unrecorded), and the profile's request initiator stacks feed "Which script started a request". The AI summary gains a labeled section.
- The profile is read as a stream, keeping only the page's main thread. Screenshots, source text, command lines and DOM node names are never kept, and URLs are redacted. A 60 MB profile with 175,000 events reduces to about 63 KB in under half a second.
- A profile's clock is not the NetLog's, so the two are aligned from the requests both recorded. If no request appears in both files, the profile is still shown but is not placed on the timeline, and the report says so.
- Validated against two genuinely recorded Chrome traces (a Wikipedia article and CNN): the reader reproduces DevTools' own largest contentful paint exactly (485 ms and 267 ms), and the busy-until-load figure was recomputed independently from the raw events. Alignment with a real NetLog was tested on synthetic pairs at this point; see 0.11.1.

## [0.10.0] - 2026-09-29
### Added
- **Optional HAR alongside the NetLog.** Record a HAR at the same time (DevTools, Network tab, Export HAR sanitized) and add it in the viewer (drop it with the NetLog, or use **Add a HAR** once the report opens) or on the command line with `--har`. Requests match by method and URL, pairing repeated URLs by the nearest start time on the shared wall clock. On a real pair, 29 of 30 entries matched and starts agreed to a median of 1 ms.
- **What the page is made of:** an Overview panel with the join quality, resource types sized by bytes, the scripts and the HTML parser that requested the most, and the answers that never reached the network log (memory cache, disk cache, service worker). A request's detail says what requested it and how it was answered; the waterfall shows each request's type and dashed lines for DOMContentLoaded and load.
- Coverage: with a HAR, "Which script started a request", "Cache result" and a new "Type of each request" row are measured, and load milestones make "Rendering" partial. The tool comparison says SocketMap reads a HAR as an optional second file.
- The HAR is read as a stream, one entry at a time. Response bodies, headers, cookies and page titles are never read or kept; URLs are redacted. A 4.6 MB HAR with bodies reduces to about 33 KB.
- With a HAR loaded, the default page is the one the HAR describes. The AI summary gains a labeled HAR section. "Try the sample capture" includes a made-up HAR.

### Fixed
- URL parameter redaction now matches by name pattern instead of an exact list, so `session_id`, `sessionToken`, `csrf_token`, `auth_token` and similar variants are masked everywhere they appeared, including the Diagnostics tables and search text. Ordinary parameters are untouched.

## [0.9.0] - 2026-09-29
### Added
- **Policy tab:** an optional upload area for a `chrome://policy` or `edge://policy` JSON export. It lists the policies that shape the network path (proxy and PAC, QUIC, DNS, prediction, certificate revocation, connection limits, caching, background running) with each value in plain words, flags policies the vendor has deprecated with their replacement, notes a documented override (Chrome: `ProxyMode` is ignored when `ProxySettings` is set), cross-checks a policy against the capture (for example QUIC blocked by policy while the capture used HTTP/3), and suggests policies worth considering only when this capture provides evidence. The export is read in the page only, secrets are removed, and nothing is uploaded or saved into the report. Every entry links to its Chrome Enterprise or Microsoft Edge documentation page and is labeled **Documented** (paraphrased from the vendor) or **SocketMap guidance** (our judgment), with a note when the paraphrase came from the other browser's page. Policies outside the catalog are counted, not judged. The catalog carries a review date. `npm run check:policy-links` confirms every vendor link still resolves. Policies that report an error or warning in the export are surfaced as "Browser reported". Validated so far against unmanaged Chrome exports and synthetic data; managed-device and Edge exports are expected to work but are not yet confirmed.

## [0.8.0] - 2026-09-29
### Added
- **What the servers said:** an Overview panel and a per-request block built from response headers already in the NetLog. It shows how many responses reported their own `Server-Timing`, the largest reported phase against the wait it belongs to, a ranked list of reported phases as nested bars, cache and CDN answers (hit, miss, mixed), the CDN a response looks like it came through (a hint from header names), other timing-like headers shown raw, and request IDs with copy buttons. The waterfall draws a thin line under the wait bar as wide as the largest reported phase. Everything is labeled as reported by the server; phases are never added together; an absent header is "not recorded", never zero. When a server sends nothing, the panel says so and what to ask the platform team.
- The slow-server finding and the AI summary include the server's own figures, labeled as reported.
- Coverage: "Server processing time" now reflects what servers report (Recorded, Partial, or Not in this file), and a new "CDN and cache answers" row and comparison-table row.
- The sample capture carries synthetic Server-Timing, cache and request-ID headers so the sample report demonstrates the panel.
- Coverage tab: **Which tool sees what**, a side-by-side table of NetLog, HAR, Performance profile, Lighthouse, packet capture, route trace and server logs across 17 page-load questions. The first column is measured from your capture; the others describe each tool in general. Includes how to get each tool, when it is best, setup, sensitive content, whether SocketMap reads it, a "show only what this capture is missing" filter, and an "if you see this, add that" guide.

## [0.7.0] - 2026-09-28
### Added
- Coverage tab: a map of the request path showing what the capture recorded at each stage (Recorded, Partial, Not in this file, Never in a NetLog), what a NetLog cannot see, and other data worth collecting separately. The same summary is in the AI handoff.
- Capture-wide Diagnostics for the reference NetLog viewer's browser snapshots, source families, errors and timeline series, including background-only captures and unknown event types.
- Local streaming event inspection with source/type/text/error filters, pagination, dependency navigation and recorded enum decoding; saved reports can attach the original NetLog for deeper inspection.
- Actionable diagnostic evidence cards, capture integrity notices, browser-state and source-family A/B comparisons, and diagnostic context in the AI handoff.
- A reference coverage matrix in `docs/NETLOG-PARITY.md` and a synthetic browser-wide diagnostic fixture.
- Compare two NetLog captures inside the standalone viewer: independent page selection, A/B swapping, timing differences, paired request bars, environment changes, and a portable comparison report and text summary.
- Light and dark themes for the viewer and NetLog reports, with a remembered preference and the selected appearance included in saved reports.
- A prominent copy button for `chrome://net-export` and a short capture checklist on the viewer's start page.
- A pinned waterfall timing key, explanations for HTTP methods and sequence labels, and a hide-details control inside the sequence inspector.
- A searchable glossary, additional recorded browser/DNS/proxy details, and a detailed AI handoff that can be copied or saved as text.

### Changed
- Describe SocketMap as providing data-driven insights into a page load across the viewer, AI summary, and capture documentation.
- The page selector groups websites separately from browser and extension activity and shows the selected page URL.
- At narrower widths, sequence details sit below the diagram instead of covering it.

### Fixed
- Missing request ends, TLS versions and cache evidence remain unknown; absence of a send event no longer claims a cache hit.
- Constants appearing after events trigger a bounded second pass, and scalar capture metadata is retained.
- Recursive sanitization covers diagnostic snapshots, event parameters and numeric credential values while preserving protocol session data and enum dictionaries.
- Comparison timings distinguish completed requests from requests whose end event was not captured; unknown values are not treated as zero.
- Redact credential-bearing command-line switches and environment URLs before including them in reports and AI summaries.
- Clipboard fallback reports when manual copying is needed instead of claiming success.
- Diagnostics snapshots no longer render the same recorded data two or three times: tables are capped at 100 rows with the cap stated, and nested cells no longer repeat their JSON. A real capture's report drops from 11.6 MB to 8.1 MB.

## [0.6.0] - 2026-09-26
### Added
- The viewer's start page explains what SocketMap does, how it works, what it shows, and what it cannot see, with a **Try the sample capture** button that opens a report from the built-in synthetic capture.
- `npm run demo` builds `demo-report.html` from the synthetic capture.
- User guide (`docs/USER-GUIDE.md`) covering capture, the viewer, every report tab, each finding, protocols, sharing, and troubleshooting; screenshots in `docs/images/`.
- Windows quick start in the README (winget, PowerShell commands, Download ZIP route).
- Prebuilt `socketmap-viewer.html` published on the GitHub Releases page, so the viewer needs no Node.js.
- MIT `LICENSE` file (copyright JR Generations).

### Changed
- README rewritten around the troubleshooting report; the older HAR/JSON diagram documentation moved to `docs/HAR-DIAGRAM.md`.
- The synthetic capture builder moved from the tests to `src/demo/sample-capture.mjs`, shared by the viewer, the demo, and the tests.

### Fixed
- Windows: `.gitattributes` keeps LF line endings on checkout, the theme freshness check ignores CRLF, and `npm test` uses Node's built-in test discovery instead of a shell glob that Windows does not expand.

## [0.5.0] - 2026-09-26
### Added
- Telemetry Trace Dark design system: DESIGN.md tokens drive the report and viewer colors, fonts, and rounding (`npm run generate:theme`). `--theme <DESIGN.md>` applies a company theme to CLI reports and viewer builds.
- Report layout with sidebar views (Overview, Waterfall, Sequence, Environment, AI summary, Learn), a top bar showing the capture file, size, load time, and findings, and a status bar.
- Shared filter for the waterfall and sequence: search by host, address, status, or protocol, plus Problems, Slow, TLS inspection, and Local calls chips with counts.
- Sequence view rebuilt as rows under a sticky host header: time offsets, protocol/status/wait/size tags, red rows for failures and inspection, amber rows for slow steps, and a docked inspector with Explained, Timing, Connection, and Headers tabs.

- Hover explanations for protocol (H3, H2, HTTP/1.1), result, wait, size, TLS, and rating labels, plus a collapsible "What do H3, H2, and HTTP/1.1 mean?" comparison with this page's counts in the Waterfall and Sequence views.
- "Hide details panel" button in the Sequence view (remembered per browser); selecting a row brings the panel back. "How to read this view" is collapsible.

### Changed
- Viewer start page tagline now describes what the tool shows.
- One sequence row per request (request and answer together) plus one per new connection, sorted by time. The display limit rose to 1,000 requests.

### Fixed
- Links inside a report opened in the viewer no longer load the viewer page into the report frame.

## [0.4.0] - 2026-09-26
### Added
- Drag-and-drop viewer (`socketmap-viewer.html`, built with `npm run build:viewer`): drop a NetLog capture in Chrome or Edge and get the report with no install. Reads the file locally with a progress bar, lets you pick the page, and saves the standalone report.
- Dependency-free viewer bundler that fails the build on unsupported module syntax or Node APIs.

## [0.3.0] - 2026-09-26
### Added
- Troubleshooting report for Chrome/Edge NetLog captures: findings with evidence and the team to involve, host table with Good / Better / Best / Poor ratings, request waterfall with per-phase timing, sequence diagram, environment card, and a copyable AI summary.
- Findings for TLS inspection (certificate from a private root), proxies and slow proxy lookups, calls to services on this computer, failed requests, slow servers, slow connections, slow DNS, QUIC failures, browser queueing, and HTTP/1.1 hosts.
- Environment details from the capture: browser, OS, local IP, DNS servers and search domains, secure DNS, proxy setup.
- `--page <site>` option to analyze a specific site in a capture.
- Sequence diagram in the report keeps the host cards pinned at the top while scrolling, aligned with their lifelines.
- Long participant names shrink to fit their card, with the full name and IP shown on hover.
- Click any arrow, activity bar, or column heading in the sequence diagram for a plain-language explanation: what happened, a verdict, each timing step with its meaning, where to look, and technical details, with a link to the matching waterfall row.
- "How to read this diagram" guide above the sequence diagram, a plain-language summary in every waterfall row, and explanations of each host rating.
- Learn tab: next troubleshooting steps, verified links (Web Vitals, Chrome Modern Web Guidance, DevTools, NetLog Viewer, Microsoft 365 networking, Wireshark, and more), and a glossary.
- Capture guide for `chrome://net-export` / `edge://net-export` in the README.

### Changed
- NetLog parsing now streams one event at a time and never holds the event list in memory.
- Requests are linked to the connection, DNS lookup, and certificate check Chrome actually used, instead of the first one in the file.
- Every request in the capture is kept; the 20-request cap is gone.
- Redaction now also removes secrets in URLs (tokens, OAuth codes, SAML, signed-URL signatures) and more credential headers.
- Example and fixture data use documentation IP ranges; real captures are gitignored.

### Fixed
- NetLog event phases were read backwards (begin as end), which produced wrong timings.
- The NetLog diagram invented a "Route Handler" hop, default TLS/protocol values, latencies, and sizes. Values not in the capture are now shown as not recorded.
- All hosts were drawn on one lifeline named after the first request's host.

### Removed
- The old NetLog sample fixture, which did not match Chrome's real format.

## [0.2.0] - 2026-09-26
### Added
- Prescriptive Guidance Engine mapping network interactions to Chrome Modern Web Guidance with Good / Better / Best optimization playbooks.
- Trace Inventory & Tech Stack Catalog automatically extracting counts and breakdowns for domains, ports, client libraries, infrastructure tools, and resource types.
- Interactive header toggle `[📦 Inventory]` and dedicated drawer view with KPI metrics and 1-click component filtering.
- Network & Tech Stack Fingerprint section in inspector drawer with clickable filter chips (`🌐 Domain`, `🔌 Port`, `⚡ Technology`, `📄 Resource Type`).
- Critical path and render-blocking detection (`⚡ BLOCKING`) flagging resources that halt browser page rendering.
- Interactive header toggles for `[⚡ Critical Path]` isolation, `[✨ Glow FX]` ambient lighting, and `[⏱️ Latency Badges]` chips.
- Trace Health & Architecture Dashboard drawer (`[💡 Insights]`) displaying blocking ratios, latency percentiles, and actionable guidance summaries.
- One-click Google PageSpeed Insights / Lighthouse deep-links and Chrome DevTools profiling workflows in the inspector drawer.
- Product vision, architectural philosophy, and Good/Better/Best guidance tables added to README.

### Fixed
- Replaced inline `onclick` string interpolation in HTML template with centralized DOM data-attribute event delegation, resolving syntax errors and restoring full interactivity to drawer controls and inventory filtering.

## [0.1.0] - 2026-09-20
### Added
- Zero-dependency Node.js CLI tool transforming network traces into interactive sequence diagrams.
- Resilient streaming chunked parser for Chromium NetLog files (`chrome://net-export/`).
- Ingestion support for HAR archives and generic execution span traces.
- Canonical Intermediate Representation (IR) normalizer with automatic credential redaction.
- Signal-flow SVG layout engine featuring dark obsidian theme, glowing activation lifelines, and semantic arrows.
- Standalone, 100% self-contained HTML generation with zero external CDN or font dependencies.
- Interactive client-side canvas engine with pan/zoom, route hover highlighting, floating tooltips, and inspector drawer.
- CLI command `traceviz` / `socketmap` supporting `--sample`, `--filter`, `-o/--output`, and `--open`.
- Comprehensive step-by-step guide in README for non-technical users covering prerequisites, HAR/NetLog capture, terminal drag & drop, and diagram navigation.
- Standalone interactive example gallery (`examples/`) showcasing e-commerce checkout, login/2FA, and slow API timeout troubleshooting with a dedicated generation script (`npm run generate:examples`) and visual showcase in README.
- Ingested real-world 5.46 MB Chromium NetLog trace (`Example_Weekend Game Plan_chrome-net-export-log.json`) and added standalone visualization artifact (`examples/weekend-game-plan.html`).
