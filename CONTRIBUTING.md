# CONTRIBUTING.md

Standard operating procedure for this project. Applies to humans and AI agents.

## Branching
| Branch | Purpose |
|--------|---------|
| `main` | Production. Protected. |
| `feat/[short-name]` | New features |
| `fix/[short-name]` | Bug fixes |
| `chore/[short-name]` | Tooling, deps, docs |
| `refactor/[short-name]` | Non-behavior code changes |

## Commits
Format: `type(scope): subject`

- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`
- Scope: area of the code (e.g., `auth`, `api`, `ui`), optional
- Subject: imperative mood, lowercase, no trailing period, under 72 chars

Examples:
- `feat(auth): add OAuth callback route`
- `fix(api): handle null response from upstream`
- `chore: bump hono to 4.5.0`

One logical change per commit. Do not bundle unrelated edits.

## Pull requests
- Title matches commit format
- Description must include:
  - What changed
  - Why
  - How to validate (commands to run, things to check)
  - Link to issue or `ROADMAP.md` entry
- `npm run verify` must pass before merge
- Squash merge into `main` unless history matters

## Verification and formatting
- Run before commit: `npm run verify` (all tests plus the design-token freshness check). It runs the same on Windows, macOS, and Linux.

## Review checklist
Before marking PR ready:

- [ ] `npm run verify` passes
- [ ] No hardcoded secrets or credentials
- [ ] `ARCHITECTURE.md` updated if architecture changed (`DESIGN.md` for visual tokens)
- [ ] `CHANGELOG.md` updated if user-visible
- [ ] Zero runtime dependencies preserved (or justified in `TECH_STACK.md`)
- [ ] No real captures, and only documentation IP ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24) in tests and examples
