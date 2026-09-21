# TECH_STACK.md

Languages, frameworks, versions, and services. One line per justification.

## Runtime
| Component | Version | Justification |
|-----------|---------|---------------|
| Node.js   | >= 18.0.0 (LTS) | Native ESM, built-in test runner, standard stream API |

## Frameworks and libraries
| Library | Version | Role | Justification |
|---------|---------|------|---------------|
| Pure Node.js Built-ins | standard | File I/O, streaming, subprocess execution | Zero runtime dependencies, runs offline with zero install |

## External services
| Service | Purpose | Plan/tier |
|---------|---------|-----------|
| None | Self-contained local tool | Fully offline execution |

## Data layer
| Store | Use | Justification |
|-------|-----|---------------|
| In-Memory Canonical IR | Intermediate Representation | Ephemeral in-memory mapping of trace events |

## Environment
- Local dev: Node.js >= 18.0.0, npm
- Deployment target: Standalone Node CLI or single executable script
- Secrets: None required (all sensitive auth headers and cookies redacted automatically)

## Version policy
- Pinning strategy: Zero third-party dependencies to pin
- Upgrade cadence: Track Node.js LTS releases
