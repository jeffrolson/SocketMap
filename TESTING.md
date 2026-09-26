# TESTING.md

How to test this project.

## Run tests
```bash
# All tests (Node discovers **/*.test.mjs; works on Windows too)
npm test

# Single test file
node --test tests/netlog-parser.test.mjs

# Full verification (tests + design-token freshness)
npm run verify
```

## Test patterns
| Type | Framework | Location | Naming |
|---|---|---|---|
| Unit & Integration | Node.js Test Runner (`node:test`) | `tests/` | `*.test.mjs` |

## What counts as a passing build
- All unit and integration tests pass
- The generated theme matches `DESIGN.md` (`node scripts/generate-theme.mjs --check`)
- CLI generates valid, self-contained HTML without remote dependencies

## Writing tests
- Use built-in `node:test` and `node:assert/strict`.
- Place test fixtures under `tests/fixtures/`.
- Build NetLog fixtures with `src/demo/sample-capture.mjs` (also used by the viewer's sample). Use documentation IP ranges only (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24); never commit a real capture.
- Verify zero remote network references in rendered HTML output.
