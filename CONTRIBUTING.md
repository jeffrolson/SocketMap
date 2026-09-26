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
- Must pass CI before merge
- Squash merge into `main` unless history matters

## Verification and formatting
- Tool: Native Node.js built-in syntax checks and Context File Standard validator (`scripts/check-context-files.mjs`)
- Run before commit: `npm run verify`
- CI rejects commits with test failures or context file non-conformance

## Review checklist
Before marking PR ready:

- [ ] Tests and context checks pass locally (`npm run verify`) and in CI
- [ ] No hardcoded secrets or credentials
- [ ] `ARCHITECTURE.md` updated if architecture changed (`DESIGN.md` for visual tokens)
- [ ] `CHANGELOG.md` updated if user-visible
- [ ] `MEMORY.md` summary appended
- [ ] Zero runtime dependencies preserved (or justified in `TECH_STACK.md`)

## Agent-specific
- Agents follow the planning loop in `AGENTS.md` before executing.
- Agents never overwrite scaffolded doc files without explicit permission.
- Agents must state assumptions and flag ambiguities before coding.
