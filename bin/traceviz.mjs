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
import { readPathFile, attachPath } from "../src/path.mjs";
import { buildCaptureFromHar } from "../src/har-capture.mjs";
import { readLighthouse, attachLighthouse } from "../src/lighthouse.mjs";
import { readCpuProfile, attachCpuProfile } from "../src/cpuprofile.mjs";
import { looksLikeHar } from "../src/viewer/viewer-core.mjs";
import { parseGenericTrace } from "../src/parsers/generic-parser.mjs";
import { normalizeTrace } from "../src/normalizer.mjs";
import { renderStandaloneHtml } from "../src/renderer/template.html.mjs";
import { analyzeCapture } from "../src/analysis.mjs";
import { renderReportHtml } from "../src/renderer/report.html.mjs";
import { parseDesignTokens } from "../src/theme.mjs";

const VERSION = "0.17.3";

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
  --page <site>          NetLog or HAR: analyze this site (e.g. https://contoso.sharepoint.com)
  --theme <DESIGN.md>    NetLog or HAR: style the report with another design.md theme
  --har <file>           NetLog only: also read a HAR exported from DevTools (script, type and cache detail)
  --diagram              HAR only: draw the older sequence diagram instead of the report
  --profile <file>       NetLog or HAR: also read a DevTools Performance profile, .json or .json.gz (page code and paint)
  --lighthouse <file>    NetLog or HAR: also read a Lighthouse JSON report (a separate lab load: scores, metrics, what to fix)
  --cpuprofile <file>    NetLog or HAR: also read a V8 .cpuprofile (JavaScript time by script and function)
  --path <file>          NetLog or HAR: also read the file written by tools/socketmap-path.sh or .ps1 (link, DNS, proxy, route, curl timing)
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

/** True when the first bytes look like a HAR (and not a NetLog). */
function isHarFile(filePath) {
  try {
    const fd = openSync(filePath, "r");
    const buf = Buffer.alloc(4096);
    const bytesRead = readSync(fd, buf, 0, 4096, 0);
    closeSync(fd);
    return looksLikeHar(buf.toString("utf8", 0, bytesRead));
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
  let diagram = false;
  let profilePath = null;
  let pathFile = null;
  let lighthousePath = null;
  let cpuPath = null;
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
    } else if (arg === "--diagram") {
      diagram = true;
    } else if (arg === "--profile") {
      profilePath = args[++i];
    } else if (arg === "--path") {
      pathFile = args[++i];
    } else if (arg === "--lighthouse") {
      lighthousePath = args[++i];
    } else if (arg === "--cpuprofile") {
      cpuPath = args[++i];
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

    const netlogInput = isNetLogFile(resolvedInput);
    const harInput = !netlogInput && !diagram && isHarFile(resolvedInput);
    if (netlogInput || harInput) {
      let model;
      if (netlogInput) {
        console.log("\x1b[35m● [Parser]\x1b[0m Detected Chromium NetLog format. Streaming events...");
        model = await parseNetLog(resolvedInput, { filter });
      } else {
        if (harPath) {
          console.error("\x1b[31m[Error]\x1b[0m --har adds a HAR to a NetLog, and this input is already a HAR. Give the NetLog as the main input, or drop --har.");
          process.exit(1);
        }
        console.log("\x1b[35m● [Parser]\x1b[0m Detected a HAR. Streaming entries (bodies and cookies are never read; response headers are kept with credentials masked)...");
        model = buildCaptureFromHar(await readHarEnrichment(resolvedInput, { keepHeaders: true }), { name: basename(resolvedInput) });
        if (!model) {
          console.error("\x1b[31m[Error]\x1b[0m That file does not look like a HAR. In DevTools, open the Network tab and choose Export HAR (sanitized).");
          process.exit(1);
        }
        console.log(`\x1b[32m● [HAR]\x1b[0m ${model.requests.length} requests. A HAR does not record proxy decisions, certificates or browser diagnostics; the report shows those as not recorded.`);
      }
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
      if (pathFile) {
        const resolvedPath = resolve(pathFile);
        if (!existsSync(resolvedPath)) {
          console.error(`\x1b[31m[Error]\x1b[0m Network path file not found: ${resolvedPath}`);
          process.exit(1);
        }
        let helper = { recognized: false };
        try { helper = readPathFile(JSON.parse(readFileSync(resolvedPath, "utf8"))); } catch { /* reported below */ }
        const attached = helper.recognized ? attachPath(model, helper.data) : null;
        if (!attached) {
          console.error("\x1b[31m[Error]\x1b[0m That file does not look like the output of the SocketMap network path helper (tools/socketmap-path.sh or tools/socketmap-path.ps1).");
          process.exit(1);
        }
        console.log(`\x1b[32m● [Path]\x1b[0m ${attached.compare.length} host${attached.compare.length === 1 ? "" : "s"} measured with curl, ${attached.routes.length} route${attached.routes.length === 1 ? "" : "s"}, recorded ${attached.source.gapMinutes == null ? "at an unknown time relative to the capture" : `${Math.abs(attached.source.gapMinutes)} minutes ${attached.source.gapMinutes >= 0 ? "after" : "before"} the capture started`}.`);
      }
      for (const [flag, file, label, read, attach, hint] of [
        ["--lighthouse", lighthousePath, "Lighthouse report", readLighthouse, attachLighthouse, "Run Lighthouse with --output=json, or in DevTools choose Save as JSON."],
        ["--cpuprofile", cpuPath, "CPU profile", readCpuProfile, attachCpuProfile, "Use the DevTools JavaScript Profiler, or node --cpu-prof."]
      ]) {
        if (!file) continue;
        const resolvedFile = resolve(file);
        if (!existsSync(resolvedFile)) {
          console.error(`\x1b[31m[Error]\x1b[0m ${label} file not found: ${resolvedFile}`);
          process.exit(1);
        }
        let parsed = { recognized: false };
        try { parsed = read(JSON.parse(readFileSync(resolvedFile, "utf8"))); } catch { /* reported below */ }
        const attached = parsed.recognized ? attach(model, parsed.data) : null;
        if (!attached) {
          console.error(`\x1b[31m[Error]\x1b[0m That file does not look like a ${label}. ${hint}`);
          process.exit(1);
        }
        console.log(`\x1b[32m● [${flag.slice(2)}]\x1b[0m ${label} read (${(statSync(resolvedFile).size / 1024).toFixed(0)} KB reduced to a bounded summary).`);
      }
      const analysis = analyzeCapture(model, { site: page });
      const p = analysis.page;
      console.log(`\x1b[32m● [Analysis]\x1b[0m Page ${p.site}: ${p.requestCount} requests, ${p.hostCount} hosts, ${analysis.findings.length} findings (${model.requests.length} requests in capture).`);
      for (const f of analysis.findings) console.log(`  - [${f.severity}] ${f.title}`);
      const theme = themePath ? parseDesignTokens(readFileSync(resolve(themePath), "utf8")) : undefined;
      const source = { name: basename(resolvedInput), bytes: statSync(resolvedInput).size };
      htmlOutput = renderReportHtml(model, analysis, theme ? { theme, source } : { source });
    } else {
      if (harPath || profilePath || pathFile || lighthousePath || cpuPath) {
        console.error(`\x1b[31m[Error]\x1b[0m ${harPath ? "--har" : profilePath ? "--profile" : pathFile ? "--path" : lighthousePath ? "--lighthouse" : "--cpuprofile"} needs a Chromium NetLog (or, for the other options, a HAR) as the main input. This input opens as a diagram, which does not take extra files.`);
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
