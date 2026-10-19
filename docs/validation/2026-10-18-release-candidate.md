# Release candidate verification, 2026-10-18

Candidate: **0.18.0-rc.1**. These results cover the local candidate; public release and physical-device acceptance are separate.

## Verified locally

- `npm run verify`: 422 tests passed, no failures or skips; generated theme and embedded helpers current. PowerShell checks used the official portable macOS PowerShell 7.6.7 runtime, verified against the release SHA-256 before extraction. This is script-logic proof, not physical Windows acceptance.
- `npm run test:browser`: file imports, optional enrichments, image exports, helper-command copy/fallback, and profile refusal passed. No uncaught page errors or nonlocal resource requests.
- `npm run test:layout`: both required viewports, all report tabs, light/dark system defaults and theme switching, saved standalone reports, two-file viewer comparisons, and saved comparisons passed. Filter/Controls panels remain within the viewport. After scrolling an expanded Waterfall, the timing key pins at 0px in the report frame at both sizes, below the viewer toolbar. The combined header, accessible section navigation, and actual saved HTML are checked.
- `npm run audit:redaction -- captures`: eighteen supported local capture files audited, zero leaks reported. Helper/policy readers and serialization canaries have separate tests.
- `npm run check:policy-links`: every catalog link resolved.
- Existing genuine capture/profile pairs: five matching pairs accepted, all twenty cross-pairs rejected. This rechecks stored recordings; it is not a new physical-device capture.
- Visual inspection of desktop/phone start, Overview, Waterfall, Sequence, and comparison screens. A Sequence control overlap found during this inspection was corrected with a compact Controls disclosure.

## First-screen measurements

Coordinates include the viewer toolbar and report iframe. Desktop is 1440×900; phone is 390×844. The combined above-data header measures 64px and 56px respectively, with no second report heading or phone navigation row. Primary data stays within 220px on desktop and 260px on phone.

| View | Desktop first data (px) | Visible items | Phone first data (px) | Visible items |
|---|---:|---:|---:|---:|
| File selection | 124 | 1 | 114 | 1 |
| Overview | 72 | 5 | 64 | 5 |
| Waterfall timeline | 97 | 1 | 89 | 1 |
| Sequence steps | 137 | 9 | 129 | 9 |
| Environment | 127 | 3 | 119 | 3 |
| Policy file selection | 85 | 1 | 77 | 1 |
| Coverage | 72 | 5 | 64 | 5 |
| Diagnostics | 72 | 4 | 64 | 4 |
| Event replay controls | 109 | 1 | 101 | 1 |
| AI summary | 140 | 1 | 132 | 1 |
| Learn | 133 | 5 | 125 | 5 |
| Viewer comparison | 86 | See metric tiles | 76 | See metric tiles |
| Saved report, Overview | 150 | See metric tiles | 142 | See metric tiles |
| Saved comparison | 86 | See metric tiles | 76 | See metric tiles |

The Waterfall's first data is its interactive timeline. Its first request row starts at 441px on desktop and 591px on phone, with 5 request rows visible at both sizes in this synthetic capture. Counts describe this fixture, not a guarantee for every capture. Sequence contents intentionally scroll within their own container; the page itself has no horizontal overflow.

## Release preparation

`npm run prepare:release` builds the standalone viewer, optional helper files, release notes, device-test checklist, license, asset manifest, and SHA-256 sums under the gitignored `dist/` directory. The candidate is intended for GitHub HTML distribution; no npm package publication is prepared.

Cross-platform CI status is recorded on the candidate pull request. A local pass does not imply CI passed or that a public release was published.

## Still requires the owner's environment

Use [the device checklist](../FIELD-VALIDATION.md): physical Windows PowerShell 5.1, Chrome/Edge on Wi-Fi with corporate proxy/PAC, Linux desktop network tools, managed-policy states, real display scaling/touch/clipboard policy, same-session and unrelated profiles from your workflow, and two colleague collection/comparison/sharing trials. Keep original captures outside the repository.
