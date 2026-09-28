/**
 * Incremental NetLog tokenizer.
 *
 * Feed it text chunks of any size; it emits each entry of the top-level
 * "events" array as a parsed object the moment it is complete, plus every
 * other top-level value. Only one event is held in memory at a time, so file
 * size does not drive memory use. Works on truncated captures (Chrome killed
 * mid-write): complete events are kept and an incomplete tail is dropped.
 *
 * No Node APIs: the same tokenizer runs in the browser.
 */

export function createNetLogTokenizer({ onEvent, onTopLevel }) {
  // Kept inside the factory so the same tokenizer can be embedded in an offline
  // report's on-demand event reader with Function.toString().
  const QUOTE = 34;
  const BACKSLASH = 92;
  const OPEN_OBJ = 123;
  const CLOSE_OBJ = 125;
  const OPEN_ARR = 91;
  const CLOSE_ARR = 93;
  const COMMA = 44;
  const COLON = 58;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let readingKey = false;
  let keyBuf = "";
  let currentKey = "";
  let keyReady = false;
  let awaitingTopValue = false;
  let inEvents = false;
  let capturing = false;
  let captureKind = null; // "event" | "top" | "scalar"
  let captureKey = "";
  let captureDepth = 0;
  let captureBuf = "";
  let rootStarted = false;
  let rootClosed = false;
  let malformedEntries = 0;

  function isWhitespace(c) {
    return c === 9 || c === 10 || c === 13 || c === 32;
  }

  function finishCapture(text) {
    const kind = captureKind;
    const key = captureKey;
    capturing = false;
    captureKind = null;
    captureKey = "";
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      malformedEntries++;
      return;
    }
    if (kind === "event") onEvent?.(value);
    else onTopLevel?.(key, value);
  }

  function beginCapture(kind, key, captureAtDepth, start) {
    capturing = true;
    captureKind = kind;
    captureKey = key;
    captureDepth = captureAtDepth;
    captureBuf = "";
    return start;
  }

  function clearTopValue() {
    awaitingTopValue = false;
    keyReady = false;
    currentKey = "";
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
            try {
              currentKey = JSON.parse(`"${keyBuf}"`);
              keyReady = true;
            } catch {
              malformedEntries++;
              currentKey = "";
              keyReady = false;
            }
            readingKey = false;
            keyStart = -1;
          }
        }
        continue;
      }

      if (c === QUOTE) {
        inString = true;
        if (!capturing && !inEvents && depth === 1) {
          if (awaitingTopValue) captureStart = beginCapture("scalar", currentKey, depth, i);
          else {
            readingKey = true;
            keyBuf = "";
            keyStart = i + 1;
          }
        }
        continue;
      }

      if (!capturing && !inEvents && depth === 1 && awaitingTopValue &&
          c !== OPEN_OBJ && c !== OPEN_ARR && c !== CLOSE_OBJ && c !== CLOSE_ARR &&
          c !== COMMA && c !== COLON && !isWhitespace(c)) {
        captureStart = beginCapture("scalar", currentKey, depth, i);
        continue;
      }

      if (c === COLON && !capturing && !inEvents && depth === 1 && keyReady) {
        awaitingTopValue = true;
        keyReady = false;
        continue;
      }

      if (c === OPEN_OBJ || c === OPEN_ARR) {
        if (depth === 0) rootStarted = true;
        if (!capturing) {
          if (depth === 1 && !inEvents && awaitingTopValue && c === OPEN_ARR && currentKey === "events") {
            inEvents = true;
            clearTopValue();
          } else if (depth === 1 && !inEvents && awaitingTopValue) {
            captureStart = beginCapture("top", currentKey, depth, i);
          } else if (inEvents && depth === 2 && c === OPEN_OBJ) {
            captureStart = beginCapture("event", "", depth, i);
          }
        }
        depth++;
        continue;
      }

      if (c === COMMA) {
        if (capturing && captureKind === "scalar" && depth === captureDepth) {
          finishCapture(captureBuf + chunk.slice(captureStart, i));
          captureBuf = "";
          captureStart = -1;
          clearTopValue();
        } else if (!capturing && !inEvents && depth === 1) {
          clearTopValue();
        }
        continue;
      }

      if (c === CLOSE_OBJ || c === CLOSE_ARR) {
        if (capturing && captureKind === "scalar" && depth === captureDepth) {
          finishCapture(captureBuf + chunk.slice(captureStart, i));
          captureBuf = "";
          captureStart = -1;
          clearTopValue();
        }
        depth--;
        if (capturing && depth === captureDepth) {
          finishCapture(captureBuf + chunk.slice(captureStart, i + 1));
          captureBuf = "";
          captureStart = -1;
          clearTopValue();
        } else if (inEvents && !capturing && depth === 1) {
          inEvents = false;
        }
        if (rootStarted && depth === 0) rootClosed = true;
      }
    }

    if (capturing && captureStart >= 0) captureBuf += chunk.slice(captureStart);
    if (readingKey && keyStart >= 0) keyBuf += chunk.slice(keyStart);
  }

  function end() {
    const integrity = {
      complete: rootStarted && rootClosed && depth === 0 && !inString && !capturing && !readingKey,
      discardedPartial: capturing || inString || readingKey,
      malformedEntries
    };
    capturing = false;
    captureBuf = "";
    return integrity;
  }

  return { write, end };
}
