# TECH_STACK.md

Languages, frameworks, versions, and services. One line per justification.

## Runtime
| Component | Version | Justification |
|-----------|---------|---------------|
| Node.js   | LTS     | [why]         |
| [Language] | [version] | [why]      |

## Frameworks and libraries
| Library | Version | Role | Justification |
|---------|---------|------|---------------|
| Hono    | latest  | HTTP routing on Cloudflare Workers | Minimal, Workers-native, fast |
| [lib]   | [ver]   | [role] | [why]       |

## External services
| Service | Purpose | Plan/tier |
|---------|---------|-----------|
| Cloudflare Workers | Edge compute | [plan] |
| [service] | [purpose] | [plan] |

## Data layer
| Store | Use | Justification |
|-------|-----|---------------|
| PostgreSQL | Primary | [why] |
| [store] | [use] | [why] |

## Environment
- Local dev: [requirements, e.g., Docker, Node LTS, pnpm]
- Deployment target: [e.g., Cloudflare Workers via Wrangler]
- Secrets: [managed via .env locally, Wrangler secrets in prod, 1Password for team]

## Version policy
- Pinning strategy: [exact versions, caret ranges, etc.]
- Upgrade cadence: [how often deps are bumped]
- Breaking change handling: [test coverage requirement before major bumps]
