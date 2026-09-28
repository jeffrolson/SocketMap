# OPERATOR.md

Operational notes for whoever releases this project.

## Operational efficiency

| Friction | Fix | Rough effort |
|---|---|---|
| The version number lives in four places (`package.json`, `bin/traceviz.mjs`, `src/renderer/report.html.mjs`, `tests/cli.test.mjs`) and is bumped by hand for each release. | Have `bin/` and the report read `package.json` (or generate a small `version.generated.mjs` the way `theme.generated.mjs` works) and let the CLI test compare against `package.json`. | About 1 hour |
