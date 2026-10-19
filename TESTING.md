# TESTING.md

How to test this project.

## Run tests
```bash
# All tests (Node discovers **/*.test.mjs; works on Windows too)
npm test

# Single test file
node --test tests/netlog-parser.test.mjs

# Full verification (tests + theme and embedded-helper freshness)
npm run verify

# Release browser checks (Node.js 22+, Chrome or Edge)
npm run build:viewer
npm run test:browser
npm run test:layout
```

## Test patterns
| Type | Framework | Location | Naming |
|---|---|---|---|
| Unit & Integration | Node.js Test Runner (`node:test`) | `tests/` | `*.test.mjs` |

## What counts as a passing build
- All unit and integration tests pass
- The generated theme matches `DESIGN.md` (`node scripts/generate-theme.mjs --check`)
- CLI generates valid, self-contained HTML without remote dependencies
- The embedded helpers match the scripts in `tools/`
- Browser smoke confirms file imports, interaction, and offline behavior
- Layout acceptance confirms first data within 220px at 1440×900 and 260px at 390×844, visible items, compact headers, and no page-wide horizontal overflow

Set `LAYOUT_SMOKE_OUTPUT` to a local JSON path to retain geometry results; set `LAYOUT_SMOKE_SCREENSHOTS` to a local directory for screenshots. These outputs contain synthetic sample data. The layout check fails if the browser or required Node runtime is unavailable.

On a non-Windows machine, optional PowerShell tests require `SOCKETMAP_POWERSHELL` pointing to a trusted `pwsh` executable. A PowerShell 7 run on macOS verifies script logic; it does not prove Windows PowerShell 5.1 or physical network behavior. Device acceptance is tracked in `docs/FIELD-VALIDATION.md`.

## Writing tests
- Use built-in `node:test` and `node:assert/strict`.
- Place test fixtures under `tests/fixtures/`.
- Build NetLog fixtures with `src/demo/sample-capture.mjs` (also used by the viewer's sample). Use documentation IP ranges only (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24); never commit a real capture.
- Verify zero remote network references in rendered HTML output.
