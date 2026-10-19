#!/usr/bin/env node

// Builds local release assets. Verification and publication are separate steps.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildViewerHtml } from "./build-viewer.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const output = join(root, "dist", `socketmap-${version}`);
const notes = join(root, "docs", "releases", `${version}.md`);
readFileSync(notes); // Fail before writing an incomplete bundle when release notes are absent.
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "socketmap-viewer.html"), buildViewerHtml());
for (const [source, target] of [
  ["tools/socketmap-path.sh", "socketmap-path.sh"],
  ["tools/socketmap-path.ps1", "socketmap-path.ps1"],
  [`docs/releases/${version}.md`, "RELEASE-NOTES.md"],
  ["docs/FIELD-VALIDATION.md", "DEVICE-TESTS.md"],
  ["LICENSE", "LICENSE"]
]) copyFileSync(join(root, source), join(output, target));
const files = ["socketmap-viewer.html", "socketmap-path.sh", "socketmap-path.ps1", "RELEASE-NOTES.md", "DEVICE-TESTS.md", "LICENSE"];
const manifest = files.map(file => {
  const bytes = readFileSync(join(output, file));
  return { file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
});
writeFileSync(join(output, "SHA256SUMS"), manifest.map(file => `${file.sha256}  ${file.file}\n`).join(""));
writeFileSync(join(output, "manifest.json"), JSON.stringify({ version, files: manifest }, null, 2) + "\n");
console.log(`Prepared ${output}`);
console.log("Release candidate only. This command does not publish a release.");
