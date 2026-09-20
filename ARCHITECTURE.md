# ARCHITECTURE.md

How this system works. Components, data flow, infrastructure identifiers, and the
decisions behind them. Imported into agent context by `CLAUDE.md`, so treat it as
always-loaded.

**Ceiling: 400 lines.** Past that, split the deepest subsystem into `docs/ARCH-<name>.md`
and link it from here.

**No counts. No dates.** A number that describes the running system belongs in
`docs/STATE.generated.md`, which is regenerated and therefore cannot go stale. A date in
this file means it has become a snapshot. The one exception is the decision log below,
where the date IS the fact.

Visual design tokens do not live here. Those belong in `DESIGN.md` on UI projects.

## Overview

<!-- High-level description. An ASCII or mermaid diagram usually earns its space. -->

```
[client] -> [edge] -> [service] -> [data]
```

## Components

| Component | Responsibility | Runs on |
|---|---|---|
| | | |

## Data flow

Follow one typical request end to end.

1.
2.
3.

## Infrastructure identifiers

Stable identifiers an agent cannot derive and would otherwise invent. Bindings, hostnames,
resource IDs, account-level constants. Public identifiers can be written here directly;
secrets never can.

| Name | Value | Notes |
|---|---|---|
| | | |

## Non-obvious behavior

The things that cost someone a day to discover. Workarounds, platform quirks, ordering
constraints, code paths that look dead but are not. This section is the highest-value part
of the file, because a stronger model can derive almost everything else and cannot derive
any of this.

-

## Key decisions

Project-local decisions. Portfolio-wide governance decisions live in the numbered ADR
series under `~/Cowork/Claude Config/decisions/`, not here.

### YYYY-MM-DD: [Decision title]
- Status: Accepted | Superseded by [later entry]
- Decision:
- Rationale:
- Alternatives considered:
- Trade-offs accepted:

## External dependencies

| Service | Purpose | Why this one |
|---|---|---|
| | | |

## Known risks

- <!-- Architectural weakness and the mitigation plan -->
