/**
 * Chromium NetLog parser (Node entry point).
 *
 * Streams a chrome://net-export (or edge://net-export) file from disk through the
 * incremental tokenizer and analyzer. Neither the file nor its event list is ever
 * held in memory, so capture size does not drive memory use.
 */

import { createReadStream } from "node:fs";
import { createNetLogTokenizer } from "./netlog-stream.mjs";
import { createNetLogAnalyzer } from "./netlog-analyzer.mjs";

/**
 * Parses a NetLog file into the capture model.
 * @param {string} filePath
 * @param {{ filter?: string }} options  filter: regex matched against URL or method
 */
export async function parseNetLog(filePath, options = {}) {
  const analyzer = createNetLogAnalyzer({ filter: options.filter });
  const tokenizer = createNetLogTokenizer({
    onTopLevel: analyzer.setTopLevel,
    onEvent: analyzer.addEvent
  });

  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: "utf8", highWaterMark: 1024 * 1024 });
    stream.on("data", chunk => tokenizer.write(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  tokenizer.end();

  return analyzer.finish();
}
