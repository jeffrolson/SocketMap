/**
 * Incremental NetLog tokenizer.
 *
 * Feed it text chunks of any size; it emits each entry of the top-level
 * "events" array as a parsed object the moment it is complete, plus every other
 * top-level object ("constants", "polledData"). Only one event is held in memory
 * at a time, so file size does not drive memory use. Works on truncated captures
 * (Chrome killed mid-write): complete events are kept, the partial tail is dropped.
 *
 * No Node APIs: the same tokenizer runs in the browser.
 */

const QUOTE = 34;      // "
const BACKSLASH = 92;  // \
const OPEN_OBJ = 123;  // {
const CLOSE_OBJ = 125; // }
const OPEN_ARR = 91;   // [
const CLOSE_ARR = 93;  // ]

export function createNetLogTokenizer({ onEvent, onTopLevel }) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  let readingKey = false;
  let keyBuf = "";
  let currentKey = "";

  let inEvents = false;
  let capturing = false;
  let captureKind = null; // "event" | "top"
  let captureKey = "";
  let captureDepth = 0;
  let captureBuf = "";

  function finishCapture(text) {
    capturing = false;
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      return; // malformed entry: skip it rather than fail the whole capture
    }
    if (captureKind === "event") onEvent?.(value);
    else onTopLevel?.(captureKey, value);
  }

  function write(chunk) {
    let captureStart = capturing ? 0 : -1;
    let keyStart = readingKey ? 0 : -1;

    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);

      if (inString) {
        if (escaped) escaped = false;
        else if (c === BACKSLASH) escaped = true;
        else if (c === QUOTE) {
          inString = false;
          if (readingKey) {
            keyBuf += chunk.slice(keyStart, i);
            currentKey = keyBuf;
            readingKey = false;
            keyStart = -1;
          }
        }
        continue;
      }

      if (c === QUOTE) {
        inString = true;
        if (!capturing && !inEvents && depth === 1) {
          readingKey = true;
          keyBuf = "";
          keyStart = i + 1;
        }
        continue;
      }

      if (c === OPEN_OBJ || c === OPEN_ARR) {
        if (!capturing) {
          if (depth === 1 && !inEvents && c === OPEN_ARR && currentKey === "events") {
            inEvents = true;
          } else if (depth === 1 && !inEvents) {
            capturing = true;
            captureKind = "top";
            captureKey = currentKey;
            captureDepth = depth;
            captureBuf = "";
            captureStart = i;
          } else if (inEvents && depth === 2 && c === OPEN_OBJ) {
            capturing = true;
            captureKind = "event";
            captureDepth = depth;
            captureBuf = "";
            captureStart = i;
          }
        }
        depth++;
        continue;
      }

      if (c === CLOSE_OBJ || c === CLOSE_ARR) {
        depth--;
        if (capturing && depth === captureDepth) {
          finishCapture(captureBuf + chunk.slice(captureStart, i + 1));
          captureBuf = "";
          captureStart = -1;
        } else if (inEvents && !capturing && depth === 1) {
          inEvents = false;
        }
      }
    }

    if (capturing && captureStart >= 0) captureBuf += chunk.slice(captureStart);
    if (readingKey && keyStart >= 0) keyBuf += chunk.slice(keyStart);
  }

  function end() {
    capturing = false;
    captureBuf = "";
  }

  return { write, end };
}
