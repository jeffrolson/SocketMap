#!/usr/bin/env node

/**
 * generate-theme.mjs
 * Compiles the design tokens in DESIGN.md into src/renderer/theme.generated.mjs,
 * the default theme for reports and the viewer. Run after editing DESIGN.md:
 *   npm run generate:theme
 * With --check, exits non-zero if the generated file is out of date.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDesignTokens } from "../src/theme.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "DESIGN.md");
const TARGET = resolve(ROOT, "src/renderer/theme.generated.mjs");

export function renderThemeModule(tokens) {
  return `/**
 * GENERATED from DESIGN.md by scripts/generate-theme.mjs. Do not edit by hand.
 * Regenerate with: npm run generate:theme
 */

export const DEFAULT_THEME = ${JSON.stringify(tokens, null, 2)};
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const expected = renderThemeModule(parseDesignTokens(readFileSync(SOURCE, "utf8")));
  if (process.argv.includes("--check")) {
    const current = existsSync(TARGET) ? readFileSync(TARGET, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== expected) {
      console.error("theme.generated.mjs is out of date. Run: npm run generate:theme");
      process.exit(1);
    }
    console.log("theme.generated.mjs is up to date.");
  } else {
    writeFileSync(TARGET, expected, "utf8");
    console.log(`\x1b[32m✔ Generated:\x1b[0m ${TARGET}`);
  }
}
