# Mac field validation, 2026-10-21

Candidate: `0.18.0-rc.1`, standalone `socketmap-viewer.html`.

Last updated: 2026-10-22, America/Phoenix. Installed environment observed on that date: macOS 27.0.1 (26A434), Google Chrome 155.0.8059.85.

This record distinguishes user-reported physical-device results from automated checks. The tested HTML matches the published candidate's SHA-256: `62f0f72302356421cb74fd0dff3d5843ba87490633a9acb7c7a5f8b3e503bc74`.

Environment reported by the user: Mac, Chrome, Wi-Fi, no VPN or proxy. These results do not establish corporate-proxy or other-platform acceptance.

| Check | Result | Evidence |
|---|---|---|
| Test 1: opening, copying, and appearance | Passed, user reported | User confirmed "Test 1 passed": normal-zoom first screen, copy address opens `chrome://net-export`, both themes readable, and Try sample opens Overview. |
| Test 2: Waterfall | Passed, user reported 2026-10-22 | User confirmed "Tests 2 and 3 passed": timing key stays visible while scrolling expanded requests; method/phase explanations appear; filtering and clearing work. |
| Test 3: Sequence | Passed, user reported 2026-10-22 | User confirmed handshake explanations, row details, hiding/restoring the details panel, and a usable diagram export through the grouped test result. |
| Test 4: fresh NetLog capture and import | Passed, user reported 2026-10-22 | User confirmed "Test 4 passed": a real capture opens, the intended site is selectable, and Overview, Waterfall, and Sequence display recorded activity. The tested domain and capture path have not been provided. |
| Test 5: comparison and offline saving | Pending, computer-use access blocked | Compare equivalent pages; save and reopen a report and comparison with networking unavailable. The browser tool rejected observation of the local `file://` viewer, so this phase was not performed or screenshotted. |
| Keyboard and usual display settings | Pending | Reach controls with keyboard navigation; confirm readability at usual scaling and zoom. |
| Optional network-path helper | Pending | Collect close to the NetLog, import the file, and check recorded facts or explicit unavailability. |
| Performance-profile alignment | Pending | Fresh same-session and unrelated-session recordings behave according to their alignment evidence. |

Tests 1 through 4 have user-confirmed physical-device results. Comparison/offline acceptance and the other checks above remain pending. Remaining platform, policy, and colleague checks are listed in [the field-validation checklist](../FIELD-VALIDATION.md).

## Computer-use attempt, 2026-10-22

The user requested automated comparison and offline-reopening checks with screenshots. The browser tool rejected access to the already-open local viewer because its URL policy permits HTTP/HTTPS, not `file://`. It also explicitly prohibited alternate browser surfaces or indirect workarounds for that blocked action. No comparison, offline-reopening result, or SocketMap screenshot was obtained during this attempt.

This is an automation-access limitation, not a demonstrated SocketMap failure. This phase requires manual user interaction or a tool configuration that explicitly supports the local-file workflow. Screenshots and real capture data should remain in local test storage rather than the public repository.
