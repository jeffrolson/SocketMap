/**
 * Policy tab: an optional upload area for a chrome://policy or edge://policy export.
 * The export is read in this page only, matched to the embedded catalog, and shown.
 * It is never uploaded and never saved into the report.
 */

import { createPolicyEngine } from "../policy/engine.mjs";
import { createEvidenceSanitizer } from "../redact.mjs";
import { POLICY_CATALOG, CATALOG_REVIEWED, CHROME_POLICY_LIST, EDGE_POLICY_LIST } from "../policy/catalog.mjs";
import { buildSamplePolicyExport } from "../demo/sample-policy.mjs";

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function policyCss() {
  return `.pol{display:grid;gap:16px}.pol h2,.pol h3,.pol h4{margin:0}.pol .note,.pol-note{margin:6px 0 0;color:var(--text-muted);font-size:12px;line-height:1.5}
.pol-how{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0;padding:0;list-style:none;counter-reset:step}.pol-how li{counter-increment:step;padding:12px 12px 12px 42px;position:relative;border:1px solid var(--border);border-radius:var(--radius);background:var(--canvas);font-size:12.5px;line-height:1.45}.pol-how li::before{content:counter(step);position:absolute;left:12px;top:11px;width:20px;height:20px;border-radius:50%;background:var(--secondary);color:var(--canvas);font:700 12px/20px var(--font-mono);text-align:center}
.pol-drop{position:relative;display:grid;place-items:center;gap:6px;padding:26px 16px;border:2px dashed var(--border-strong,var(--border));border-radius:var(--radius);background:linear-gradient(160deg,color-mix(in srgb,var(--secondary) 8%,var(--surface)),var(--surface));text-align:center;cursor:pointer}.pol-drop:hover,.pol-drop:focus-visible,.pol-drop.is-over{border-color:var(--secondary);background:color-mix(in srgb,var(--secondary) 13%,var(--surface))}.pol-drop strong{font-size:14px}.pol-drop span{color:var(--text-muted);font-size:12px}.pol-drop input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.pol-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.pol-actions button{padding:6px 12px;border:1px solid var(--secondary);border-radius:var(--radius-sm);background:transparent;color:var(--secondary);font-size:12px;font-weight:600;cursor:pointer;position:relative;z-index:1}.pol-actions button:hover{background:color-mix(in srgb,var(--secondary) 14%,transparent)}
.pol-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.pol-tile{padding:14px;border:1px solid var(--border);border-radius:var(--radius);background:linear-gradient(160deg,color-mix(in srgb,var(--secondary) 8%,var(--surface)),var(--surface) 65%)}.pol-tile.is-warn{border-color:var(--warning)}.pol-tile h4{font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em}.pol-tile b{display:block;margin-top:6px;font:700 30px/1 var(--font-mono);color:var(--text)}.pol-tile b.pol-small{font:600 13px/1.4 var(--font-sans);overflow-wrap:anywhere}.pol-tile p{margin:6px 0 0;color:var(--text-muted);font-size:11.5px;line-height:1.4}
.pol-callout{margin:0;padding:12px 14px;border:1px solid var(--border);border-left:3px solid var(--secondary);border-radius:var(--radius);background:var(--canvas);font-size:12.5px;line-height:1.5}.pol-callout.is-warn{border-left-color:var(--warning)}.pol-callout p{margin:6px 0 0;color:var(--text-muted);font-size:12px}.pol-callout a{color:var(--secondary)}
.pol-tag{display:inline-block;margin-right:4px;padding:1px 8px;border:1px solid var(--st,var(--border));border-radius:99px;color:var(--st,var(--text-muted));font-size:10.5px;font-weight:700;letter-spacing:.03em;white-space:nowrap}.pol-doc{--st:var(--success)}.pol-guide{--st:var(--secondary)}.pol-cross{--st:var(--primary)}.pol-warn{--st:var(--warning)}
.pol-section h3{margin-bottom:8px}.pol-table{width:100%;border-collapse:collapse;font-size:12px}.pol-table th,.pol-table td{padding:8px;text-align:left;vertical-align:top;border-bottom:1px solid var(--border);overflow-wrap:anywhere;text-transform:none;letter-spacing:0;white-space:normal;font-family:var(--font-sans)}.pol-table thead th{color:var(--text-muted);font-weight:600}.pol-table tbody th{font-weight:700;width:24%}.pol-table small{display:block;margin-top:3px;color:var(--text-muted);font-weight:400;line-height:1.45}.pol-table code,.pol-names code{font:11.5px var(--font-mono);padding:1px 6px;border-radius:var(--radius-sm);background:var(--canvas)}.pol-table a{color:var(--secondary)}
.pol-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.pol-card{padding:14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--canvas)}.pol-card h4{font-size:13px}.pol-card h4 small{color:var(--text-muted);font-weight:400;margin-left:6px}.pol-card p{margin:8px 0 0;font-size:12px;line-height:1.5}.pol-why{color:var(--text)}.pol-links a{color:var(--secondary)}
.pol-details{border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;background:var(--surface)}.pol-details summary{cursor:pointer;font-size:12.5px;font-weight:600}.pol-details[open] summary{margin-bottom:10px}.pol-names{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0}
.pol-checks{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0}.pol-checks span{padding:2px 9px;border:1px solid var(--border);border-radius:99px;font:11.5px var(--font-mono);color:var(--text-muted)}
@media(max-width:1000px){.pol-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.pol-how{grid-template-columns:1fr}}@media(max-width:600px){.pol-tiles{grid-template-columns:1fr}}`;
}

/** The tab's shell: how to export, the upload area, and a preview of what is checked. */
export function renderPolicyView() {
  const areas = [...new Set(POLICY_CATALOG.map(policy => policy.area))];
  return `<section class="card pol" id="policy"><header><h2>Browser policy</h2>
<p class="note">Optional. Load a policy export from the browser to see which policies shape the network path, which ones the vendor has retired, and what is worth considering given this capture. Guidance covers network and page-load behavior only, not security hardening.</p></header>
<ol class="pol-how"><li>In Chrome open <code>chrome://policy</code>, or in Edge <code>edge://policy</code>.</li><li>Choose <b>Export to JSON</b> and save the file.</li><li>Drop it below, or choose it. It is read here and nowhere else.</li></ol>
<div class="pol-drop" id="policy-drop"><input type="file" id="policy-file" accept=".json,application/json" aria-label="Choose a policy export file"><strong>Drop a policy export here</strong><span>or click to choose the file</span></div>
<div class="pol-actions"><button type="button" id="policy-sample">Try a sample export</button><span class="pol-note">The sample is made up. Nothing is uploaded, and the file is not saved into this report. Reload the page to clear it.</span></div>
<div id="policy-results" aria-live="polite"><div class="pol-callout">Nothing loaded yet. After you add an export you will see the policies set, any the vendor has deprecated, cross-checks against this capture, and evidence-backed suggestions, each labeled <b>Documented</b> (from the vendor's page) or <b>SocketMap guidance</b> (our judgment).</div>
<p class="pol-note">Policies SocketMap checks, by area:</p>${areas.map(area => `<div class="pol-checks" aria-label="${esc(area)}"><b class="pol-note">${esc(area)}</b>${POLICY_CATALOG.filter(policy => policy.area === area).map(policy => `<span>${esc(policy.name)}</span>`).join("")}</div>`).join("")}
<p class="pol-note">Catalog reviewed ${esc(CATALOG_REVIEWED)} against the <a href="${esc(CHROME_POLICY_LIST)}" target="_blank" rel="noopener noreferrer">Chrome Enterprise policy list</a> and the <a href="${esc(EDGE_POLICY_LIST)}" target="_blank" rel="noopener noreferrer">Microsoft Edge policy documentation</a>.</p></div>
<noscript><p class="pol-note">This tab needs script to read a file. The report's other views work without it.</p></noscript></section>`;
}

const json = (value) => JSON.stringify(value)
  .replace(/</g, "\\u003c")
  .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
  .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");

/** Embeds the same engine the tests run, plus the catalog, so the report works offline. */
export function policyScript(evidence) {
  return `<script id="policy-script">
(function () {
  var sanitize = (${createEvidenceSanitizer.toString()})();
  var engine = (${createPolicyEngine.toString()})(sanitize);
  var catalog = ${json(POLICY_CATALOG)};
  var reviewed = ${json(CATALOG_REVIEWED)};
  var evidence = ${json(evidence || {})};
  var sample = ${json(buildSamplePolicyExport())};
  var out = document.getElementById("policy-results");
  var input = document.getElementById("policy-file");
  var drop = document.getElementById("policy-drop");
  var sampleButton = document.getElementById("policy-sample");
  if (!out || !input) return;
  function esc(text) { return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function fail(message) { out.innerHTML = '<div class="pol-callout is-warn">' + esc(message) + "</div>"; }
  function load(text) {
    var data;
    try { data = JSON.parse(text); } catch (error) { fail("That file is not valid JSON. Use Export to JSON on chrome://policy or edge://policy."); return; }
    var norm = engine.normalize(data);
    if (!norm.ok) { fail(norm.reason); return; }
    out.innerHTML = engine.render(engine.evaluate(norm, evidence, catalog, reviewed));
  }
  function read(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { fail("That file is larger than 5 MB, far bigger than a policy export."); return; }
    file.text().then(load, function () { fail("The file could not be read."); });
  }
  input.addEventListener("change", function (event) { read(event.target.files && event.target.files[0]); });
  if (drop) {
    ["dragenter", "dragover"].forEach(function (name) { drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList && drop.classList.add("is-over"); }); });
    drop.addEventListener("dragleave", function () { drop.classList && drop.classList.remove("is-over"); });
    drop.addEventListener("drop", function (event) { event.preventDefault(); drop.classList && drop.classList.remove("is-over"); read(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]); });
  }
  if (sampleButton) sampleButton.addEventListener("click", function () { load(JSON.stringify(sample)); });
})();
</script>`;
}
