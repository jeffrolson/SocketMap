/**
 * Viewer page wiring: drop or choose a NetLog, read it in chunks with progress,
 * show the report, switch pages, save the report. Runs only in the browser;
 * the file is read locally and never sent anywhere.
 */

import { createCaptureReader, buildReport, buildComparison, checkCaptureStart, looksLikeHar } from "./viewer-core.mjs";
import { createHarReader } from "../parsers/har-stream.mjs";
import { attachHar } from "../enrichment.mjs";
import { buildSampleHar } from "../demo/sample-har.mjs";
import { buildPageLoadNetLog, toNetLogText } from "../demo/sample-capture.mjs";
import { selectPageSite } from "../analysis.mjs";
import { redactCapturedText } from "../redact.mjs";

const SAMPLE_NAME = "sample-capture.json (synthetic example)";
const SAMPLE_HAR_NAME = "sample-network.har (synthetic example)";

const YIELD_EVERY_BYTES = 8 * 1024 * 1024;

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

async function readCapture(file, onProgress, constants = null) {
  const head = await file.slice(0, 4096).text();
  const check = checkCaptureStart(head);
  if (!check.ok) throw new Error(check.reason);

  const reader = createCaptureReader({ constants });
  const decoder = new TextDecoder();
  const stream = file.stream().getReader();
  let read = 0;
  let sinceYield = 0;
  try {
    for (;;) {
      const { done, value } = await stream.read();
      if (done) break;
      read += value.byteLength;
      sinceYield += value.byteLength;
      reader.write(decoder.decode(value, { stream: true }));
      onProgress(read, file.size);
      if (sinceYield >= YIELD_EVERY_BYTES) {
        sinceYield = 0;
        await new Promise(resolve => setTimeout(resolve, 0)); // let the progress bar paint
      }
    }
  } finally {
    await stream.cancel();
    stream.releaseLock();
  }
  reader.write(decoder.decode());
  const model = reader.finish();
  // Unusually ordered files place the decoding dictionary after events. Read
  // those again using the dictionary, instead of buffering their raw events.
  return !constants && model.diagnostics?.constantsLate
    ? readCapture(file, onProgress, model.diagnostics.constants) : model;
}

async function readHar(file, onProgress) {
  const reader = createHarReader();
  const decoder = new TextDecoder();
  const stream = file.stream().getReader();
  let read = 0;
  let sinceYield = 0;
  try {
    for (;;) {
      const { done, value } = await stream.read();
      if (done) break;
      read += value.byteLength;
      sinceYield += value.byteLength;
      reader.write(decoder.decode(value, { stream: true }));
      onProgress(read, file.size);
      if (sinceYield >= YIELD_EVERY_BYTES) {
        sinceYield = 0;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  } finally {
    await stream.cancel();
    stream.releaseLock();
  }
  reader.write(decoder.decode());
  return reader.finish();
}

function init() {
  const $ = (id) => document.getElementById(id);
  const start = $("start");
  const drop = $("drop");
  const input = $("file-input");
  const compareInput = $("compare-input");
  const secondInput = $("second-input");
  const harInput = $("har-input");
  const progress = $("progress");
  const bar = $("progress-bar");
  const progressText = $("progress-text");
  const error = $("error");
  const result = $("result");
  const frame = $("report-frame");
  const pageSelect = $("page-select");
  const pageSelectB = $("page-select-b");
  const pageContext = $("page-context");
  const fileName = $("file-name");
  let captures = [];
  let view = "a";
  let loading = false;
  let current = null;

  function currentTheme() {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }

  function sendThemeToReport() {
    if (frame.contentWindow) frame.contentWindow.postMessage({ type: "socketmap:theme", theme: currentTheme() }, "*");
  }

  function showError(message) {
    $("load-feedback").hidden = false;
    $("dismiss-error").hidden = false;
    progress.hidden = true;
    error.textContent = message;
    error.hidden = false;
  }

  function fillPages(select, capture) {
    select.replaceChildren();
    if (!capture) return;
    for (const [label, pages] of [
      ["Pages and sites", capture.model.pages.filter(p => !p.isBackground)],
      ["Browser and extension activity", capture.model.pages.filter(p => p.isBackground)]
    ]) {
      if (!pages.length) continue;
      const group = document.createElement("optgroup");
      group.label = label;
      for (const page of pages) {
        const option = document.createElement("option");
        option.value = page.site;
        option.textContent = `${page.site} — ${page.requestCount} request${page.requestCount === 1 ? "" : "s"}`;
        group.appendChild(option);
      }
      select.appendChild(group);
    }
    select.value = capture.site;
  }

  // Build before committing: an invalid replacement never discards a working capture.
  function show(next = captures, nextView = view) {
    const [a, b] = next;
    const selected = nextView === "b" ? b : a;
    const report = nextView === "comparison" ? buildComparison(a.model, b.model, {
      siteA: a.site, siteB: b.site, sourceA: a.source, sourceB: b.source, theme: globalThis.SOCKETMAP_THEME
    }) : buildReport(selected.model, selected.site, globalThis.SOCKETMAP_THEME, selected.source);
    captures = next;
    view = nextView;
    current = report;
    fillPages(pageSelect, a);
    fillPages(pageSelectB, b);
    $("comparison-controls").hidden = !b;
    $("page-picker-b").hidden = !b;
    $("comparison-hint").hidden = !b;
    $("page-label").textContent = b ? "A page / site" : "Page / site";
    pageSelect.setAttribute("aria-label", b ? "A page or site to analyze" : "Page or site to analyze");
    $("add-comparison").textContent = b ? "Replace B capture" : "Compare with another capture";
    $("save-report").textContent = nextView === "comparison" ? "Save comparison" : "Save report";
    for (const name of ["comparison", "a", "b"]) $("view-" + name).setAttribute("aria-pressed", String(view === name));
    fileName.textContent = b ? `A: ${a.source.name} · B: ${b.source.name}` : `${a.source.name}${a.har ? ` + HAR ${a.har.name}` : ""}`;
    $("add-har").hidden = nextView === "comparison" || nextView === "b";
    $("add-har").textContent = a.har ? "Replace HAR" : "Add a HAR";
    fileName.title = fileName.textContent;
    const pages = report.comparison ? [report.comparison.a.page, report.comparison.b.page] : [report.analysis.page];
    pageContext.textContent = pages.map((page, i) => `${pages.length > 1 ? (i ? "B" : "A") : "Selected"}: ${page.url}`).join(" · ");
    pageContext.title = pageContext.textContent;
    frame.title = nextView === "comparison" ? "SocketMap capture comparison" : `SocketMap ${b ? nextView.toUpperCase() + " " : ""}report`;
    frame.srcdoc = report.html;
    start.hidden = true;
    result.hidden = false;
  }

  function setLoading(value) {
    loading = value;
    document.body.setAttribute("aria-busy", String(value));
    for (const element of [input, compareInput, secondInput, harInput]) element.disabled = value;
    drop.setAttribute("aria-disabled", String(value));
    drop.classList.remove("is-over");
    for (const id of ["compare-files", "add-comparison", "add-har", "open-another", "save-report", "swap-captures", "page-select", "page-select-b", "view-comparison", "view-a", "view-b"]) $(id).disabled = value;
    pageSelect.disabled = value || !captures[0]?.model.pages.length;
    pageSelectB.disabled = value || !captures[1]?.model.pages.length;
    document.querySelectorAll("[data-open-sample]").forEach(button => { button.disabled = value; });
  }

  // A HAR adds detail to the first capture. It is read here, matched, and never uploaded.
  async function addHar(file) {
    if (!captures.length) throw new Error("A HAR adds detail to a NetLog. Open the NetLog first, then add the HAR.");
    const name = redactCapturedText(file.name);
    bar.style.width = "0%";
    progressText.textContent = `Reading HAR: ${name}...`;
    const har = await readHar(file, (read, total) => {
      bar.style.width = `${Math.min(100, (read / Math.max(1, total)) * 100).toFixed(1)}%`;
      progressText.textContent = `Reading HAR: ${name}, ${formatMb(read)} of ${formatMb(total)}`;
    });
    const model = captures[0].model;
    delete model.enrichment;
    if (!attachHar(model, har)) throw new Error("That file does not look like a HAR. In DevTools, open the Network tab and choose Export HAR (sanitized).");
    const next = captures.map((capture, i) => i === 0 ? { ...capture, har: { name, bytes: file.size }, site: selectPageSite(model) } : capture);
    show(next, view === "comparison" ? "a" : view);
  }

  async function loadFiles(files, { append = false, requireTwo = false } = {}) {
    if (loading || !files.length) return;
    const kinds = await Promise.all(files.map(async file => looksLikeHar(await file.slice(0, 4096).text())));
    const hars = files.filter((_, i) => kinds[i]);
    if (hars.length) {
      if (hars.length > 1) { showError("Add one HAR at a time. Choose the HAR that was recorded with this NetLog."); return; }
      const logs = files.filter((_, i) => !kinds[i]);
      if (logs.length) await loadFiles(logs, { append: false, requireTwo });
      if (!captures.length) {
        if (!logs.length) showError("A HAR adds detail to a NetLog. Open the NetLog first (or drop both files together), then add the HAR.");
        return;
      }
      if (error.hidden === false) return;
      setLoading(true);
      error.hidden = true;
      $("load-feedback").hidden = false;
      progress.hidden = false;
      try {
        await addHar(hars[0]);
        $("load-feedback").hidden = true;
      } catch (err) {
        showError(err.message || String(err));
      } finally {
        setLoading(false);
      }
      return;
    }
    if (files.length > 2 || (requireTwo && files.length !== 2)) {
      showError("Choose exactly two NetLog captures to compare. The first is A (baseline); the second is B (comparison).");
      return;
    }
    setLoading(true);
    error.hidden = true;
    $("dismiss-error").hidden = true;
    $("load-feedback").hidden = false;
    progress.hidden = false;
    try {
      const next = append && captures.length && files.length === 1 ? [captures[0]] : [];
      // Sequential streaming avoids holding two raw capture files in memory.
      for (const file of files) {
        const name = redactCapturedText(file.name);
        bar.style.width = "0%";
        progressText.textContent = `Reading ${next.length ? "B" : "A"}: ${name}...`;
        const model = await readCapture(file, (read, total) => {
          bar.style.width = `${Math.min(100, (read / Math.max(1, total)) * 100).toFixed(1)}%`;
          progressText.textContent = `Reading ${next.length ? "B" : "A"}: ${name}, ${formatMb(read)} of ${formatMb(total)}`;
        });
        const preferred = next[0]?.site;
        const site = preferred && model.pages.some(p => p.site === preferred) ? preferred : selectPageSite(model);
        next.push({ model, source: { name, bytes: file.size }, site, file });
      }
      progressText.textContent = next.length === 2 ? "Building the comparison..." : "Building the report...";
      await new Promise(resolve => setTimeout(resolve, 0));
      show(next, next.length === 2 ? "comparison" : "a");
      $("load-feedback").hidden = true;
      window.scrollTo(0, 0);
    } catch (err) {
      showError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function openSample() {
    const text = toNetLogText(buildPageLoadNetLog());
    await loadFiles([new File([text], SAMPLE_NAME, { type: "application/json" })]);
    if (!captures.length) return;
    // The sample shows the HAR view too, built from the same made-up requests.
    const model = captures[0].model;
    const reader = createHarReader();
    reader.write(JSON.stringify(buildSampleHar(model)));
    if (attachHar(model, reader.finish())) show(captures.map((capture, i) => i === 0 ? { ...capture, har: { name: SAMPLE_HAR_NAME, bytes: 0 }, site: selectPageSite(model) } : capture));
  }

  function selectedFiles(element, options) {
    const files = Array.from(element.files);
    element.value = "";
    loadFiles(files, options);
  }
  input.addEventListener("change", () => selectedFiles(input));
  compareInput.addEventListener("change", () => selectedFiles(compareInput, { requireTwo: true }));
  secondInput.addEventListener("change", () => selectedFiles(secondInput, { append: true }));
  harInput.addEventListener("change", async () => {
    const files = Array.from(harInput.files).slice(0, 1);
    harInput.value = "";
    if (!files.length) return;
    if (!looksLikeHar(await files[0].slice(0, 4096).text())) {
      showError("That file does not look like a HAR. In DevTools, open the Network tab and choose Export HAR (sanitized).");
      return;
    }
    loadFiles(files);
  });
  $("add-har").addEventListener("click", () => harInput.click());
  $("compare-files").addEventListener("click", () => compareInput.click());
  $("add-comparison").addEventListener("click", () => secondInput.click());
  $("dismiss-error").addEventListener("click", () => { $("load-feedback").hidden = true; });
  document.querySelectorAll("[data-open-sample]").forEach(b => b.addEventListener("click", (ev) => { ev.preventDefault(); openSample(); }));
  drop.addEventListener("click", () => { if (!loading) input.click(); });
  drop.addEventListener("keydown", (ev) => { if (!loading && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); input.click(); } });
  for (const type of ["dragenter", "dragover"]) {
    document.addEventListener(type, (ev) => { ev.preventDefault(); if (!loading) drop.classList.add("is-over"); });
  }
  for (const type of ["dragleave", "drop"]) {
    document.addEventListener(type, (ev) => { ev.preventDefault(); drop.classList.remove("is-over"); });
  }
  function handleDrop(ev) {
    ev.preventDefault();
    const files = Array.from(ev.dataTransfer?.files || []);
    loadFiles(files, { append: !result.hidden && files.length === 1 });
  }
  document.addEventListener("drop", handleDrop);
  function choosePage(index, select) {
    const next = captures.map((capture, i) => i === index ? { ...capture, site: select.value } : capture);
    try { show(next); } catch (err) { select.value = captures[index].site; showError(err.message); }
  }
  pageSelect.addEventListener("change", () => choosePage(0, pageSelect));
  pageSelectB.addEventListener("change", () => choosePage(1, pageSelectB));
  for (const name of ["comparison", "a", "b"]) $("view-" + name).addEventListener("click", () => show(captures, name));
  $("swap-captures").addEventListener("click", () => show([captures[1], captures[0]], "comparison"));
  frame.addEventListener("load", () => {
    sendThemeToReport();
    const reportDocument = frame.contentDocument;
    if (reportDocument) {
      reportDocument.addEventListener("dragover", event => event.preventDefault());
      reportDocument.addEventListener("drop", handleDrop);
    }
  });
  window.addEventListener("socketmap:themechange", sendThemeToReport);
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== frame.contentWindow || !data) return;
    if (data.type === "socketmap:request-replay-file") {
      const selected = captures[view === "b" ? 1 : 0];
      if (selected?.file) frame.contentWindow.postMessage({ type: "socketmap:replay-file", file: selected.file, name: selected.source.name }, "*");
      return;
    }
    if (data.type !== "socketmap:theme" || (data.theme !== "light" && data.theme !== "dark")) return;
    globalThis.SocketMapTheme?.set(data.theme);
  });
  $("copy-capture-address").addEventListener("click", async () => {
    const address = $("capture-address").textContent;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
        copied = true;
      }
    } catch (_) {}
    if (!copied) {
      const range = document.createRange();
      range.selectNodeContents($("capture-address"));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      try { copied = document.execCommand("copy"); } catch (_) {}
    }
    $("copy-status").textContent = copied
      ? "Copied. Paste it into Chrome's address bar, then start logging to disk."
      : "Select chrome://net-export above and copy it, then paste it into Chrome's address bar.";
  });
  $("save-report").addEventListener("click", () => {
    if (!current) return;
    const host = (current.analysis?.page.site || current.comparison?.a.page.site || "capture").replace(/^[a-z-]+:\/\//, "").replace(/[^a-z0-9.-]+/gi, "_");
    const link = document.createElement("a");
    const savedHtml = current.html.replace("<html", `<html data-theme="${currentTheme()}"`);
    link.href = URL.createObjectURL(new Blob([savedHtml], { type: "text/html" }));
    link.download = `socketmap-${current.comparison ? "comparison" : "report"}-${host}.html`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
  });
  $("open-another").addEventListener("click", () => {
    result.hidden = true;
    start.hidden = false;
    window.scrollTo(0, 0);
    frame.srcdoc = "";
    input.value = "";
    captures = [];
    view = "a";
    current = null;
    $("load-feedback").hidden = true;
    pageSelect.replaceChildren();
    pageSelectB.replaceChildren();
  });
}

globalThis.SocketMap = { createCaptureReader, buildReport, buildComparison, checkCaptureStart, looksLikeHar, createHarReader, attachHar };
if (typeof document !== "undefined") init();
