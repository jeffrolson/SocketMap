#!/usr/bin/env node

/**
 * SocketMap CLI Entrypoint (traceviz)
 * Transforms Chromium NetLogs, HAR files, and JSON traces into an interactive,
 * zero-dependency standalone HTML sequence diagram.
 */

import { existsSync, writeFileSync, readFileSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";

import { SAMPLE_TRACE } from "../src/sample-data.mjs";
import { parseNetLog } from "../src/parsers/netlog-parser.mjs";
import { readHarEnrichment, readTraceProfile } from "../src/parsers/generic-parser.mjs";
import { attachHar } from "../src/enrichment.mjs";
import { attachProfile } from "../src/profile.mjs";
import { parseGenericTrace } from "../src/parsers/generic-parser.mjs";
import { normalizeTrace } from "../src/normalizer.mjs";
import { renderStandaloneHtml } from "../src/renderer/template.html.mjs";
import { analyzeCapture } from "../src/analysis.mjs";
import { renderReportHtml } from "../src/renderer/report.html.mjs";
import { parseDesignTokens } from "../src/theme.mjs";

const VERSION = "0.13.0";

function printHelp() {
  console.log(`
\x1b[1m\x1b[36mSocketMap Trace Visualizer\x1b[0m (v${VERSION})
Transform network traces into interactive, self-contained sequence diagrams.

\x1b[1mUSAGE:\x1b[0m
  node bin/traceviz.mjs <input-trace.json> [options]
  socketmap <input-trace.json> [options]

\x1b[1mOPTIONS:\x1b[0m
  -o, --output <file>    Target output HTML file path (default: ./trace-diagram.html)
  --filter <regex>       Filter requests by URL or method pattern
  --page <site>          NetLog only: analyze this site (e.g. https://contoso.sharepoint.com)
  --theme <DESIGN.md>    NetLog only: style the report with another design.md theme
  --har <file>           NetLog only: also read a HAR exported from DevTools (script, type and cache detail)
  --profile <file>       NetLog only: also read a DevTools Performance profile, .json or .json.gz (page code and paint)
  --sample               Generate an interactive demo diagram using rich synthetic data
  --open                 Automatically open the generated visual in your default browser
  -h, --help             Show this help message and exit
  -v, --version          Show version and exit

\x1b[1mEXAMPLES:\x1b[0m
  node bin/traceviz.mjs --sample -o sample.html --open
  node bin/traceviz.mjs chrome-net-export-log.json -o report.html --open
  node bin/traceviz.mjs netlog.json --page https://contoso.sharepoint.com
  node bin/traceviz.mjs netlog.json --har network.har -o report.html
  node bin/traceviz.mjs netlog.json --har network.har --profile trace.json.gz -o report.html
  node bin/traceviz.mjs network.har --open
`);
}

function openInBrowser(filePath) {
  const absPath = resolve(filePath);
  let cmd = "";
  switch (process.platform) {
    case "darwin":
      cmd = `open "${absPath}"`;
      break;
    case "win32":
      cmd = `start "" "${absPath}"`;
      break;
    default:
      cmd = `xdg-open "${absPath}"`;
      break;
  }

  exec(cmd, (err) => {
    if (err) {
      console.warn(`\x1b[33m[Warning]\x1b[0m Could not automatically open browser: ${err.message}`);
    }
  });
}

/**
 * Reads the first 2KB of a file to check for Chromium NetLog markers without loading the file.
 */
function isNetLogFile(filePath) {
  try {
    const fd = openSync(filePath, "r");
    const buf = Buffer.alloc(2048);
    const bytesRead = readSync(fd, buf, 0, 2048, 0);
    closeSync(fd);
    const header = buf.toString("utf8", 0, bytesRead);
    return header.includes('"constants":') || header.includes('"events":');
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("-v") || args.includes("--version")) {
    console.log(`SocketMap v${VERSION}`);
    process.exit(0);
  }

  let inputFile = null;
  let outputFile = "./trace-diagram.html";
  let filter = null;
  let page = null;
  let themePath = null;
  let harPath = null;
  let profilePath = null;
  let openAfter = false;
  let useSample = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--sample") {
      useSample = true;
    } else if (arg === "--open") {
      openAfter = true;
    } else if (arg === "-o" || arg === "--output") {
      outputFile = args[++i];
    } else if (arg === "--filter") {
      filter = args[++i];
    } else if (arg === "--page") {
      page = args[++i];
    } else if (arg === "--theme") {
      themePath = args[++i];
    } else if (arg === "--har") {
      harPath = args[++i];
    } else if (arg === "--profile") {
      profilePath = args[++i];
    } else if (!arg.startsWith("-")) {
      inputFile = arg;
    }
  }

  if (!useSample && !inputFile) {
    console.error("\x1b[31m[Error]\x1b[0m No input file provided. Use --sample to generate a demo diagram or provide a path to a NetLog/HAR/trace file.");
    printHelp();
    process.exit(1);
  }

  let trace = null;
  let htmlOutput = null;

  if (useSample) {
    console.log("\x1b[36m● [SocketMap]\x1b[0m Loading synthetic multi-phase sample trace...");
    trace = normalizeTrace(SAMPLE_TRACE);
  } else {
    const resolvedInput = resolve(inputFile);
    if (!existsSync(resolvedInput)) {
      console.error(`\x1b[31m[Error]\x1b[0m Input file not found: ${resolvedInput}`);
      process.exit(1);
    }

    console.log(`\x1b[36m● [SocketMap]\x1b[0m Ingesting trace: ${resolvedInput}...`);

    if (isNetLogFile(resolvedInput)) {
      console.log("\x1b[35m● [Parser]\x1b[0m Detected Chromium NetLog format. Streaming events...");
      const model = await parseNetLog(resolvedInput, { filter });
      if (harPath) {
        const resolvedHar = resolve(harPath);
        if (!existsSync(resolvedHar)) {
          console.error(`\x1b[31m[Error]\x1b[0m HAR file not found: ${resolvedHar}`);
          process.exit(1);
        }
        console.log("\x1b[35m● [Parser]\x1b[0m Streaming the HAR (bodies, headers and cookies are never read)...");
        const enrichment = attachHar(model, await readHarEnrichment(resolvedHar));
        if (!enrichment) {
          console.error("\x1b[31m[Error]\x1b[0m That file does not look like a HAR. In DevTools, open the Network tab and choose Export HAR (sanitized).");
          process.exit(1);
        }
        console.log(`\x1b[32m● [HAR]\x1b[0m Matched ${enrichment.alignment.matched} of ${enrichment.source.entryCount} HAR entries to NetLog requests${enrichment.alignment.method === "clock" ? "" : " (by order: the capture recorded no wall clock)"}.`);
      }
      if (profilePath) {
        const resolvedProfile = resolve(profilePath);
        if (!existsSync(resolvedProfile)) {
          console.error(`\x1b[31m[Error]\x1b[0m Profile file not found: ${resolvedProfile}`);
          process.exit(1);
        }
        console.log("\x1b[35m● [Parser]\x1b[0m Streaming the Performance profile (screenshots, source text and command lines are never kept)...");
        const profile = attachProfile(model, await readTraceProfile(resolvedProfile));
        if (!profile) {
          console.error("\x1b[31m[Error]\x1b[0m That file does not look like a DevTools Performance profile for a page load. In DevTools, open the Performance tab, record while reloading the page, then choose Save profile.");
          process.exit(1);
        }
        console.log(`\x1b[32m● [Profile]\x1b[0m ${profile.alignment.aligned ? `Placed on the network timeline using ${profile.alignment.matched} shared requests.` : "No request appears in both files, so the profile is shown but not placed on the timeline."}`);
      }
      const analysis = analyzeCapture(model, { site: page });
      const p = analysis.page;
      console.log(`\x1b[32m● [Analysis]\x1b[0m Page ${p.site}: ${p.requestCount} requests, ${p.hostCount} hosts, ${analysis.findings.length} findings (${model.requests.length} requests in capture).`);
      for (const f of analysis.findings) console.log(`  - [${f.severity}] ${f.title}`);
      const theme = themePath ? parseDesignTokens(readFileSync(resolve(themePath), "utf8")) : undefined;
      const source = { name: basename(resolvedInput), bytes: statSync(resolvedInput).size };
      htmlOutput = renderReportHtml(model, analysis, theme ? { theme, source } : { source });
    } else {
      if (harPath || profilePath) {
        console.error(`\x1b[31m[Error]\x1b[0m ${harPath ? "--har" : "--profile"} needs a Chromium NetLog as the main input. A HAR on its own opens as a diagram without it.`);
        process.exit(1);
      }
      console.log("\x1b[35m● [Parser]\x1b[0m Ingesting generic/HAR/trace JSON...");
      trace = parseGenericTrace(resolvedInput, { filter });
    }
  }

  if (!htmlOutput) {
    console.log(`\x1b[32m● [Normalizer]\x1b[0m Trace mapped: ${trace.participants.length} participants, ${trace.messages.length} messages across ${trace.phases.length} phases.`);
    console.log("\x1b[34m● [Renderer]\x1b[0m Building self-contained presentation HTML...");
    htmlOutput = renderStandaloneHtml(trace);
  }

  const resolvedOutput = resolve(outputFile);
  writeFileSync(resolvedOutput, htmlOutput, "utf8");

  console.log(`\x1b[1m\x1b[32m✔ SUCCESS:\x1b[0m Generated standalone visual artifact at \x1b[1m${resolvedOutput}\x1b[0m`);

  if (openAfter) {
    console.log(`\x1b[36m● [Browser]\x1b[0m Launching visual in default browser...`);
    openInBrowser(resolvedOutput);
  }
}

main().catch((err) => {
  console.error(`\x1b[31m[Fatal Error]\x1b[0m ${err.message}`);
  if (process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
