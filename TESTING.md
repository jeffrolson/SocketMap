# TESTING.md

How to test this project.

## Run tests
```bash
# All tests
npm test

# Single test file
node --test tests/netlog-parser.test.mjs

# Full verification (tests + context files)
npm run verify
```

## Test patterns
| Type | Framework | Location | Naming |
|---|---|---|---|
| Unit & Integration | Node.js Test Runner (`node:test`) | `tests/` | `*.test.mjs` |

## What counts as a passing build
- All unit and integration tests pass
- Context files check passes (`node scripts/check-context-files.mjs`)
- Generated state is up to date (`npm run generate:state -- --check`)
- CLI generates valid, self-contained HTML without remote dependencies

## Writing tests
- Use built-in `node:test` and `node:assert/strict`.
- Place test fixtures under `tests/fixtures/`.
- Verify zero remote network references in rendered HTML output.
