# TESTING.md

How to test this project.

## Run tests
```bash
# All tests
[command]

# Single test file
[command] [path]

# Watch mode
[command]

# Coverage report
[command]
```

## Coverage expectations
| Area | Minimum | Target |
|------|---------|--------|
| Overall | [X]% | [Y]% |
| Critical paths (auth, payments, data writes) | 95% | 100% |
| UI-only code | [X]% | [Y]% |

## Test patterns
| Type | Framework | Location | Naming |
|------|-----------|----------|--------|
| Unit | [e.g., Vitest] | `src/**/*.test.ts` | `*.test.ts` |
| Integration | [framework] | `tests/integration/` | `*.int.test.ts` |
| E2E | [e.g., Playwright] | `tests/e2e/` | `*.e2e.ts` |

## What counts as a passing build
- All tests pass
- Linter clean
- Type check clean (if TypeScript)
- Build produces artifacts without errors
- No `TODO` or `FIXME` comments added without an owner and date

## CI
- Platform: [GitHub Actions, Cloudflare, etc.]
- Triggered on: [push to main, PR, manual]
- Failure policy: [block merge, notify Slack, etc.]

## Writing tests
- One behavior per test. Arrange, Act, Assert.
- Test names describe the behavior, not the implementation.
- Prefer fakes over mocks. Avoid testing internals.
- For bug fixes: write a failing test first, then make it pass.
