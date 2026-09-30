#!/usr/bin/env node

/**
 * generate-tools.mjs
 * Copies the text of the network path helper scripts (tools/) into
 * src/renderer/helper-scripts.generated.mjs so the report can offer them as offline downloads.
 * Run after editing anything in tools/:  npm run generate:tools
 * With --check, exits non-zero if the generated file is out of date.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = resolve(ROOT, "src/renderer/helper-scripts.generated.mjs");
const read = (name) => readFileSync(resolve(ROOT, "tools", name), "utf8").replace(/\r\n/g, "\n");

export function renderToolsModule() {
  return `/**
 * GENERATED from tools/ by scripts/generate-tools.mjs. Do not edit by hand.
 * Regenerate with: npm run generate:tools
 */

export const HELPER_SH = ${JSON.stringify(read("socketmap-path.sh"))};
export const HELPER_PS1 = ${JSON.stringify(read("socketmap-path.ps1"))};
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const expected = renderToolsModule();
  if (process.argv.includes("--check")) {
    const current = existsSync(TARGET) ? readFileSync(TARGET, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== expected) {
      console.error("helper-scripts.generated.mjs is out of date. Run: npm run generate:tools");
      process.exit(1);
    }
    console.log("helper-scripts.generated.mjs is up to date.");
  } else {
    writeFileSync(TARGET, expected, "utf8");
    console.log("Wrote src/renderer/helper-scripts.generated.mjs");
  }
}
