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

## Linting and formatting
- Tool: [e.g., ESLint + Prettier, Biome, Ruff]
- Run before commit: `[command]`
- CI rejects commits with lint errors

## Review checklist
Before marking PR ready:

- [ ] Tests pass locally and in CI
- [ ] No hardcoded secrets or credentials
- [ ] `DESIGN.md` updated if architecture changed
- [ ] `CHANGELOG.md` updated if user-visible
- [ ] `MEMORY.md` summary appended
- [ ] New dependencies justified in `TECH_STACK.md`

## Agent-specific
- Agents follow the planning loop in `AGENTS.md` before executing.
- Agents never overwrite scaffolded doc files without explicit permission.
- Agents must state assumptions and flag ambiguities before coding.
