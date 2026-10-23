# OPERATOR.md

Operational notes for whoever releases this project.

## Operational efficiency

| Friction | Fix | Rough effort |
|---|---|---|
| The version number lives in four places (`package.json`, `bin/traceviz.mjs`, `src/renderer/report.html.mjs`, `tests/cli.test.mjs`) and is bumped by hand for each release. | Have `bin/` and the report read `package.json` (or generate a small `version.generated.mjs` the way `theme.generated.mjs` works) and let the CLI test compare against `package.json`. | About 1 hour |

| Optional PowerShell checks are skipped on a Mac without `pwsh`. | Use an official portable macOS runtime in a temporary folder, verify its published SHA-256 before extraction, and set `SOCKETMAP_POWERSHELL` for verification. Windows CI and physical Windows acceptance remain distinct. | A few minutes per clean machine |
| Browser layout was not a release gate, so stacked headers could hide the data. | Run `npm run test:layout` after the viewer build; CI now enforces this at desktop and phone sizes. | Implemented |
| The computer-use browser tool rejects the local `file://` viewer and prohibits alternate-surface workarounds. | Continue user-driven field validation with user-provided screenshots, or use tooling that explicitly authorizes local-file workflows. Record the automation block separately from product results. | Manual test: minutes; tool support depends on the provider |
