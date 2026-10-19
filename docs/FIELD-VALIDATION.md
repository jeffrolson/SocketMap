# Field-validation checklist

This checklist covers behavior that needs real computers, real browser exports, or colleagues. Automated tests and synthetic fixtures do not substitute for these checks. Keep captures and exports outside the repository; save only a redacted report, notes, and pass/fail evidence in the release record.

## Use the release candidate

Open `socketmap-viewer.html` from the candidate bundle in Chrome or Edge. Use **Copy address** to start a capture, or open **About this page** for the full steps. Keep **Strip private information** selected. Open the saved capture in SocketMap and run the optional helper from the Overview, on the same machine and close to the same time.

The helper reads settings and makes network probes to the selected hosts, plus an optional public-address lookup. It does not change settings or require an administrator. Keep raw captures in your approved local storage. Share only reviewed reports or sanitized evidence.

For each test record: candidate version, OS, browser version, network connection, whether a proxy/PAC is in use, outcome, exact error text, and fields unexpectedly missing. Do not include credentials in notes.

## Physical Windows: Wi-Fi and corporate proxy

Use **Windows PowerShell 5.1** (`powershell.exe`, not just PowerShell 7). Collect one NetLog and one network-path helper file from the same physical Windows computer on Wi-Fi behind the corporate proxy. Test Chrome and Edge. Paste the report's **Copy Windows command** into PowerShell, then add the resulting `socketmap-path.json` using **Files → Add files → Add network path**. Open the NetLog and helper output together.

Pass when:

- the helper command can be copied, pasted, and produces `socketmap-path.json` without administrator changes;
- the helper file shows the available Wi-Fi, DNS, proxy, PAC, and route facts, with credentials absent;
- the report labels route method and probe availability, replies, missing replies, and timing range without calling missing replies packet loss;
- the report states the recorded proxy environment context without assuming it proves which path a host probe used; and
- a saved report opens offline and contains no remote requests.

Record browser, Windows edition, Wi-Fi adapter, proxy/PAC mode, route method/capability, and any omitted operating-system fields. A failed or absent field is evidence to fix, not a reason to fill in a value.

## Linux desktop

Repeat the same collection on a physical Linux desktop using both Ethernet and Wi-Fi when available. Include a host where TCP route probing is available and one where it is unavailable, if the local tools permit that distinction.

Pass when the helper accurately labels its method or unavailability, produces a file the viewer accepts, and the report does not infer a cause from route silence or a curl/browser timing difference.

Record distribution, desktop environment, network manager, shell, traceroute variant, and the observed helper fields.

## Your display, keyboard, and clipboard

At normal desktop scaling and at your usual zoom, open the sample and your own report in both themes. Check that file selection and the first data are immediately visible. Use Tab and Enter to operate the copy button, Files menu, page selection, report sections, comparison, and Save. On a touch device check the horizontally scrolling report sections and charts. If clipboard access is blocked by browser policy, verify that the offered manual selection can be copied. Save a report and comparison, then reopen each with networking unavailable.

Pass when text and focus remain readable, controls can be reached without page-wide horizontal scrolling, the Waterfall color key stays available, and the sequence details panel opens and closes. Browser automation measures geometry; this check covers real display scaling, touch, and managed browser permissions.

## Colleague workflow: collect, compare, share

Ask two colleagues to collect the same page or action independently, then compare the captures and share a saved report.

Pass when each person can:

- find and copy `chrome://net-export` from the viewer;
- capture one focused page load and open it locally;
- select comparable pages on both sides and understand which changes are recorded facts versus pairing heuristics;
- save a self-contained comparison or report; and
- identify the sharing warning about URLs, hosts, addresses, and certificate details.

Capture the time taken, steps that caused confusion, inaccessible controls, wording misunderstandings, and whether the next action was clear. Do not treat agreement with a finding as proof that the finding established a cause.

## Profile alignment rejection

Collect a NetLog and Performance profile from different page-load sessions with overlapping URLs, then add the profile to the NetLog.

Pass when SocketMap leaves the profile unplaced unless its alignment rules are satisfied, clearly explains why, and does not draw timeline or per-request conclusions from the unplaced profile. Repeat with a same-session pair to confirm useful placement remains available.

Record whether the sessions used the same URL, the profile's page URL, the browser and platform, and the exact alignment message.

## Managed-policy exports

Export policy JSON from managed Chrome and managed Edge environments that exercise browser-reported `ignored`, `info`, `future`, and `superseded` states. Use the Policy tab to open each export.

Pass when the browser and policy metadata are recognized; values, source, level, scope, and browser-reported state are rendered without secrets; unknown policies remain unassessed; and cross-checks are labelled as evidence from the capture and export rather than proof of causation.

Before release, run `npm run check:policy-links` from an environment with normal DNS and outbound HTTPS. Record the command result and any vendor redirects or failures; do not claim policy links were checked when name resolution or outbound network access prevented verification.
