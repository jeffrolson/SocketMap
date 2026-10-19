# Release candidate verification, 2026-10-18

Candidate: **0.18.0-rc.1**. These results cover the local candidate; public release and physical-device acceptance are separate.

## Verified locally

- `npm run verify`: 422 tests passed, no failures or skips; generated theme and embedded helpers current. PowerShell checks used the official portable macOS PowerShell 7.6.7 runtime, verified against the release SHA-256 before extraction. This is script-logic proof, not physical Windows acceptance.
- `npm run test:browser`: file imports, optional enrichments, image exports, helper-command copy/fallback, and profile refusal passed. No uncaught page errors or nonlocal resource requests.
- `npm run test:layout`: both required viewports, all report tabs, light/dark system defaults and theme switching, saved standalone reports, two-file viewer comparisons, and saved comparisons passed. Filter/Controls panels remain within the viewport. After scrolling an expanded Waterfall, the timing key pins at 0px on desktop and 56px below phone navigation, relative to the report frame.
- `npm run audit:redaction -- captures`: eighteen supported local capture files audited, zero leaks reported. Helper/policy readers and serialization canaries have separate tests.
- `npm run check:policy-links`: every catalog link resolved.
- Existing genuine capture/profile pairs: five matching pairs accepted, all twenty cross-pairs rejected. This rechecks stored recordings; it is not a new physical-device capture.
- Visual inspection of desktop/phone start, Overview, Waterfall, Sequence, and comparison screens. A Sequence control overlap found during this inspection was corrected with a compact Controls disclosure.

## First-screen measurements

Coordinates include the viewer toolbar and report iframe. Desktop is 1440×900; phone is 390×844. Header components measure 64px and 56px respectively. Primary data stays within 220px on desktop and 260px on phone.

| View | Desktop first data (px) | Visible items | Phone first data (px) | Visible items |
|---|---:|---:|---:|---:|
| File selection | 124 | 1 | 114 | 1 |
| Overview | 146 | 5 | 186 | 5 |
| Waterfall timeline | 171 | 1 | 211 | 1 |
| Sequence steps | 211 | 9 | 251 | 9 |
| Environment | 201 | 3 | 241 | 2 |
| Policy file selection | 159 | 1 | 199 | 1 |
| Coverage | 146 | 5 | 186 | 5 |
| Diagnostics | 146 | 4 | 186 | 4 |
| Event replay controls | 183 | 1 | 223 | 1 |
| AI summary | 178 | 1 | 218 | 1 |
| Learn | 207 | 5 | 247 | 5 |
| Viewer comparison | 150 | See metric tiles | 132 | See metric tiles |
| Saved report, Overview | 82 | See overview tiles | 130 | See overview tiles |
| Saved comparison | 86 | See metric tiles | 76 | See metric tiles |

The Waterfall's first data is its interactive timeline. Its first request row starts at 483px on desktop and 681px on phone, with five request rows visible at both sizes in this synthetic capture. Counts describe this fixture, not a guarantee for every capture. Sequence contents and the phone section navigation intentionally scroll within their own containers; the page itself has no horizontal overflow.

## Release preparation

`npm run prepare:release` builds the standalone viewer, optional helper files, release notes, device-test checklist, license, asset manifest, and SHA-256 sums under the gitignored `dist/` directory. The candidate is intended for GitHub HTML distribution; no npm package publication is prepared.

Cross-platform CI status is recorded on the candidate pull request. A local pass does not imply CI passed or that a public release was published.

## Still requires the owner's environment

Use [the device checklist](../FIELD-VALIDATION.md): physical Windows PowerShell 5.1, Chrome/Edge on Wi-Fi with corporate proxy/PAC, Linux desktop network tools, managed-policy states, real display scaling/touch/clipboard policy, same-session and unrelated profiles from your workflow, and two colleague collection/comparison/sharing trials. Keep original captures outside the repository.
