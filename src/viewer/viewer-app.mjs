/**
 * Viewer page wiring: drop or choose a NetLog, read it in chunks with progress,
 * show the report, switch pages, save the report. Runs only in the browser;
 * the file is read locally and never sent anywhere.
 */

import { createCaptureReader, buildReport, checkCaptureStart } from "./viewer-core.mjs";

const YIELD_EVERY_BYTES = 8 * 1024 * 1024;

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

async function readCapture(file, onProgress) {
  const head = await file.slice(0, 4096).text();
  const check = checkCaptureStart(head);
  if (!check.ok) throw new Error(check.reason);

  const reader = createCaptureReader();
  const decoder = new TextDecoder();
  const stream = file.stream().getReader();
  let read = 0;
  let sinceYield = 0;
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
  reader.write(decoder.decode());
  return reader.finish();
}

function init() {
  const $ = (id) => document.getElementById(id);
  const start = $("start");
  const drop = $("drop");
  const input = $("file-input");
  const progress = $("progress");
  const bar = $("progress-bar");
  const progressText = $("progress-text");
  const error = $("error");
  const result = $("result");
  const frame = $("report-frame");
  const pageSelect = $("page-select");
  const fileName = $("file-name");
  let model = null;
  let current = null;

  function showError(message) {
    progress.hidden = true;
    error.textContent = message;
    error.hidden = false;
  }

  function show(site) {
    current = buildReport(model, site);
    frame.srcdoc = current.html;
    pageSelect.value = current.analysis.page.site;
  }

  async function open(file) {
    error.hidden = true;
    progress.hidden = false;
    bar.style.width = "0%";
    progressText.textContent = `Reading ${file.name}...`;
    try {
      model = await readCapture(file, (read, total) => {
        bar.style.width = `${Math.min(100, (read / Math.max(1, total)) * 100).toFixed(1)}%`;
        progressText.textContent = `Reading ${file.name}: ${formatMb(read)} of ${formatMb(total)}`;
      });
      progressText.textContent = "Building the report...";
      await new Promise(resolve => setTimeout(resolve, 0));
      pageSelect.innerHTML = "";
      for (const p of model.pages) {
        const option = document.createElement("option");
        option.value = p.site;
        option.textContent = `${p.site} (${p.requestCount} request${p.requestCount === 1 ? "" : "s"})${p.isBackground ? ", browser or extension" : ""}`;
        pageSelect.appendChild(option);
      }
      show(null);
      fileName.textContent = file.name;
      start.hidden = true;
      result.hidden = false;
      progress.hidden = true;
    } catch (err) {
      showError(err.message || String(err));
    }
  }

  input.addEventListener("change", () => { if (input.files[0]) open(input.files[0]); });
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); input.click(); } });
  for (const type of ["dragenter", "dragover"]) {
    document.addEventListener(type, (ev) => { ev.preventDefault(); drop.classList.add("is-over"); });
  }
  for (const type of ["dragleave", "drop"]) {
    document.addEventListener(type, (ev) => { ev.preventDefault(); drop.classList.remove("is-over"); });
  }
  document.addEventListener("drop", (ev) => {
    const file = ev.dataTransfer?.files?.[0];
    if (file) {
      start.hidden = false;
      result.hidden = true;
      open(file);
    }
  });
  pageSelect.addEventListener("change", () => show(pageSelect.value));
  $("save-report").addEventListener("click", () => {
    if (!current) return;
    const host = current.analysis.page.site.replace(/^[a-z-]+:\/\//, "").replace(/[^a-z0-9.-]+/gi, "_");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([current.html], { type: "text/html" }));
    link.download = `socketmap-report-${host}.html`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
  });
  $("open-another").addEventListener("click", () => {
    result.hidden = true;
    start.hidden = false;
    frame.srcdoc = "";
    input.value = "";
    model = null;
    current = null;
  });
}

globalThis.SocketMap = { createCaptureReader, buildReport, checkCaptureStart };
if (typeof document !== "undefined") init();
