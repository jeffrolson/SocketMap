/**
 * Browser layout acceptance check for the standalone SocketMap viewer.
 *
 * It measures the first usable data element in the start screen and in every
 * report tab at desktop and phone viewports. Coordinates are relative to the
 * outer browser viewport, so the report iframe and viewer toolbar count.
 *
 * Usage: npm run build:viewer && node scripts/layout-smoke.mjs
 * Set LAYOUT_SMOKE_OUTPUT=/tmp/layout.json to retain the measurements.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildPageLoadNetLog, toNetLogText } from "../src/demo/sample-capture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viewer = process.env.VIEWER_PATH ? path.resolve(process.env.VIEWER_PATH) : path.join(root, "socketmap-viewer.html");
const output = process.env.LAYOUT_SMOKE_OUTPUT;
const screenshotDir = process.env.LAYOUT_SMOKE_SCREENSHOTS;
const viewports = [
  { name: "desktop", width: 1440, height: 900, dataLimit: 220, headerLimit: 64, mobile: false },
  { name: "phone", width: 390, height: 844, dataLimit: 260, headerLimit: 56, mobile: true }
];

const selectors = {
  overview: [".kpis .kpi", "#findings .finding", ".page-card"],
  waterfall: ["#timeline", ".wf-row", ".wf-axis"],
  sequence: [".seq-row", ".seq-grid"],
  environment: ["#environment .kv", "#environment dl", "#environment table", "#environment"],
  policy: ["#policy .pol-drop", "#policy .pol-tile", "#policy"],
  coverage: ["#coverage .cov-tile", "#coverage .cov-item", "#coverage"],
  diagnostics: ["#diagnostics .diag-card", "#diagnostics .diag-insight", "#diagnostics"],
  "event-replay": ["#event-replay .event-replay-tools", "#event-replay"],
  "ai-summary": ["#summary-text", "#ai-summary textarea", "#ai-summary"],
  learn: ["#learn .steps li", ".glossary-entry", ".glossary", "#learn"]
};

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ];
  return candidates.find(candidate => candidate && fs.existsSync(candidate)) || null;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  if (typeof WebSocket === "undefined") {
    console.error("layout smoke needs Node 22 or newer (global WebSocket)");
    process.exitCode = 2;
    return;
  }
  if (!fs.existsSync(viewer)) throw new Error("socketmap-viewer.html is missing. Run npm run build:viewer first.");
  const browserPath = findBrowser();
  if (!browserPath) {
    console.error("layout smoke needs Chrome, Chromium or Edge (set BROWSER_PATH)");
    process.exitCode = 2;
    return;
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "socketmap-layout-"));
  const comparisonFiles = [path.join(work, "comparison-a.json"), path.join(work, "comparison-b.json")];
  const comparisonText = toNetLogText(buildPageLoadNetLog());
  fs.writeFileSync(comparisonFiles[0], comparisonText);
  fs.writeFileSync(comparisonFiles[1], comparisonText);
  const port = 9800 + Math.floor(Math.random() * 100);
  const child = spawn(browserPath, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(work, "profile")}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "about:blank"], { stdio: "ignore" });
  let ws;
  try {
    let target;
    for (let attempt = 0; attempt < 100 && !target; attempt++) {
      await sleep(200);
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(item => item.type === "page"); } catch {}
    }
    if (!target) throw new Error("the browser did not start");
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      const resolver = pending.get(message.id);
      if (!resolver) return;
      pending.delete(message.id);
      message.error ? resolver.reject(new Error(message.error.message)) : resolver.resolve(message.result);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      ws.send(JSON.stringify({ id: requestId, method, params }));
    });
    const evaluate = async expression => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async (expression, label) => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        if (await evaluate(expression).catch(() => false)) return;
        await sleep(100);
      }
      throw new Error(`timed out waiting for ${label}`);
    };
    const frame = expression => `(() => { const frame = document.querySelector('#report-frame, iframe'); const doc = frame && frame.contentDocument; return doc ? (${expression})(doc, frame) : null; })()`;
    const setViewport = async viewport => {
      await send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile,
        screenWidth: viewport.width, screenHeight: viewport.height
      });
      await sleep(150);
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("DOM.enable");
    await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 20, g: 20, b: 20, a: 1 } });
    const measurements = { viewer, generatedAt: new Date().toISOString(), viewports: {} };
    if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshot = async name => {
      if (!screenshotDir) return;
      const image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      fs.writeFileSync(path.join(screenshotDir, `${name}.png`), Buffer.from(image.data, "base64"));
    };
    for (const viewport of viewports) {
      await setViewport(viewport);
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
      await send("Page.navigate", { url: pathToFileURL(viewer).href });
      await waitFor("document.readyState === 'complete'", "viewer to load");
      await evaluate("localStorage.removeItem('socketmap-theme'); window.__layoutReloadPending = true; location.reload()");
      await waitFor("!window.__layoutReloadPending && document.readyState === 'complete'", "dark-preference viewer to reload");
      const startsDark = await evaluate("document.documentElement.dataset.theme === 'dark'");
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
      await evaluate("localStorage.removeItem('socketmap-theme'); window.__layoutReloadPending = true; location.reload()");
      await waitFor("!window.__layoutReloadPending && document.readyState === 'complete'", "light-preference viewer to reload");
      const startsLight = await evaluate("document.documentElement.dataset.theme === 'light'");
      await evaluate("document.querySelector('[data-theme-toggle]').click()");
      await evaluate("window.scrollTo(0, 0)");
      const start = await evaluate(`(() => {
        const box = selector => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) }; };
        const nav = box('.page-header.start-header') || box('.nav');
        const data = box('.drop') || box('.capture-shortcut') || box('[data-open-sample]');
        return { header: nav, primary: data, horizontalOverflow: document.documentElement.scrollWidth > innerWidth, visibleItems: data && data.top < innerHeight ? 1 : 0 };
      })()`);
      await screenshot(`${viewport.name}-start`);
      await evaluate("document.querySelector('[data-theme-toggle]').click()");
      await screenshot(`${viewport.name}-start-light`);
      await evaluate("document.querySelector('[data-theme-toggle]').click()");

      await evaluate("document.querySelector('[data-open-sample]').click()");
      await waitFor("document.querySelectorAll('#section-select option').length >= 5", "report section picker");
      await waitFor(frame("doc => doc.querySelector('.view.is-active')"), "sample report");
      const themeStates = await evaluate("(() => { const button = document.querySelector('[data-theme-toggle]'); const states = []; button?.click(); states.push(document.documentElement.dataset.theme); button?.click(); states.push(document.documentElement.dataset.theme); return states; })()");
      const lightTheme = themeStates.includes("light");
      const darkTheme = themeStates.includes("dark");
      const tabs = await evaluate("[...document.querySelectorAll('#section-select option')].map(item => item.value).filter(value => value && value !== 'comparison')");
      const reports = {};
      for (const tab of tabs) {
        await evaluate(`(() => { const select = document.getElementById('section-select'); select.value = ${JSON.stringify(tab)}; select.dispatchEvent(new Event('change', { bubbles: true })); return select.value; })()`);
        await waitFor(frame(`doc => doc.querySelector('.view.is-active')?.dataset.view === ${JSON.stringify(tab)}`), `${tab} view`);
        const targets = selectors[tab] || [`#view-${tab}`, `[data-view=${JSON.stringify(tab)}]`];
        const serialized = JSON.stringify(targets);
        reports[tab] = await evaluate(frame(`(doc, frame) => {
          const pick = ${serialized};
          const isVisible = el => { const style = doc.defaultView.getComputedStyle(el); const r = el.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && r.height > 0; };
          const selected = doc.querySelector('.view.is-active');
          if (!selected || selected.dataset.view !== ${JSON.stringify(tab)}) return { error: 'section picker did not select this view' };
          doc.defaultView.scrollTo(0, 0);
          let element = null, selector = null;
          for (const candidate of pick) { const found = [...doc.querySelectorAll(candidate)].find(isVisible); if (found) { element = found; selector = candidate; break; } }
          const topbar = doc.querySelector('.topbar');
          const iframeRect = frame.getBoundingClientRect();
          const elementRect = element && element.getBoundingClientRect();
          const visible = element ? [...doc.querySelectorAll(selector)].filter(node => { const r = node.getBoundingClientRect(); return isVisible(node) && r.top >= 0 && r.top < doc.defaultView.innerHeight; }).length : 0;
          const shellToolbar = document.querySelector('#result > .toolbar');
          const shellHeight = shellToolbar ? Math.round(shellToolbar.getBoundingClientRect().height) : Math.max(0, Math.round(iframeRect.top));
          const reportHeaderHeight = topbar ? Math.round(topbar.getBoundingClientRect().height) : 0;
          const pageHeader = selected && selected.querySelector('.page-header');
          const pageHeaderHeight = pageHeader ? Math.round(pageHeader.getBoundingClientRect().height) : 0;
          const reportNav = doc.querySelector('.sidebar');
          const reportNavRect = reportNav && reportNav.getBoundingClientRect();
          const reportNavHeight = reportNavRect && reportNavRect.width >= doc.defaultView.innerWidth * 0.8 ? Math.round(reportNavRect.height) : 0;
          const requestRow = ${JSON.stringify(tab)} === 'waterfall' ? [...doc.querySelectorAll('.wf-row')].find(isVisible) : null;
          const requestRect = requestRow && requestRow.getBoundingClientRect();
          const offenders = [...doc.querySelectorAll('*')].filter(node => {
            const r = node.getBoundingClientRect();
            return isVisible(node) && r.right > doc.defaultView.innerWidth + 1 && !node.closest('[data-layout-scroll-ok]');
          }).slice(0, 12).map(node => ({ tag: node.tagName, id: node.id || null, className: String(node.className || '').slice(0, 120), right: Math.round(node.getBoundingClientRect().right) }));
          return {
            selector,
            header: topbar ? { shellHeight, reportHeight: reportHeaderHeight, pageHeight: pageHeaderHeight, reportNavHeight, combinedHeight: Math.round(iframeRect.top) + reportHeaderHeight + pageHeaderHeight + reportNavHeight, top: 0 } : null,
            primary: elementRect ? { top: Math.round(iframeRect.top + elementRect.top), bottom: Math.round(iframeRect.top + elementRect.bottom), height: Math.round(elementRect.height) } : null,
            visibleItems: visible,
            firstRequestRow: requestRect ? { top: Math.round(iframeRect.top + requestRect.top), height: Math.round(requestRect.height), visibleRows: [...doc.querySelectorAll('.wf-row')].filter(node => { const r = node.getBoundingClientRect(); return isVisible(node) && r.top >= 0 && r.top < doc.defaultView.innerHeight; }).length } : null,
            horizontalOverflow: doc.documentElement.scrollWidth > doc.defaultView.innerWidth || frame.scrollWidth > frame.clientWidth,
            overflowOffenders: offenders,
            active: selected && selected.getAttribute('data-view')
          };
        }`));
        if (["waterfall", "sequence"].includes(tab)) {
          reports[tab].controls = await evaluate(frame(`doc => {
            const details = doc.getElementById(${JSON.stringify(`${tab}-controls`)});
            const summary = details && details.querySelector('summary');
            if (!details || !summary) return { error: 'controls disclosure missing' };
            summary.click();
            const panel = details.querySelector('.page-action-panel');
            const r = panel && panel.getBoundingClientRect();
            const trigger = summary.getBoundingClientRect();
            const visible = selector => [...doc.querySelectorAll(selector)].some(node => node.getClientRects().length > 0);
            const overlapsTrigger = r && trigger.left < r.right && trigger.right > r.left && trigger.top < r.bottom && trigger.bottom > r.top;
            return { open: details.open, bounds: r && { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), viewportWidth: doc.defaultView.innerWidth, viewportHeight: doc.defaultView.innerHeight }, triggerVisible: trigger.width > 0 && trigger.height > 0, triggerOutsidePanel: !overlapsTrigger, controlsVisible: ${JSON.stringify(tab)} === 'waterfall' ? visible('.page-action-panel .search input') && visible('.page-action-panel .filter-chips button') : visible('#seq-save-png') && visible('#seq-save-svg') && visible('#toggle-details') };
          }`));
          if (tab === "sequence") await screenshot(`${viewport.name}-sequence-controls`);
          reports[tab].controls.closed = await evaluate(frame(`doc => {
            const details = doc.getElementById(${JSON.stringify(`${tab}-controls`)});
            details?.querySelector('summary')?.click();
            return !details?.open;
          }`));
        }
        if (tab === "waterfall") {
          reports[tab].stickyLegend = await evaluate(frame(`async doc => {
            const controls = doc.getElementById('waterfall-controls');
            if (controls) controls.open = false;
            doc.querySelectorAll('.wf-row').forEach(row => { row.open = true; });
            const maxScroll = Math.max(0, doc.documentElement.scrollHeight - doc.defaultView.innerHeight);
            doc.defaultView.scrollTo(0, maxScroll);
            await new Promise(resolve => doc.defaultView.requestAnimationFrame(resolve));
            const key = doc.querySelector('.wf-key')?.getBoundingClientRect();
            const nav = doc.querySelector('.sidebar')?.getBoundingClientRect();
            doc.querySelectorAll('.wf-row').forEach(row => { row.open = false; });
            doc.defaultView.scrollTo(0, 0);
            return { maxScroll: Math.round(maxScroll), keyTop: key && Math.round(key.top), keyBottom: key && Math.round(key.bottom), navBottom: nav && Math.round(nav.bottom) };
          }`));
        }
        if (tab === "waterfall") await screenshot(`${viewport.name}-${tab}`);
      }
      const reportNavigationChanged = await evaluate(frame(`doc => {
        const link = doc.querySelector('[data-nav="environment"]');
        if (!link) return false;
        link.click();
        return true;
      }`));
      if (reportNavigationChanged) await waitFor("document.getElementById('section-select')?.value === 'environment'", "viewer section picker to sync with report navigation");
      await evaluate("(() => { const select = document.getElementById('section-select'); select.value = 'overview'; select.dispatchEvent(new Event('change', { bubbles: true })); return select.value; })()");
      await waitFor(frame("doc => doc.querySelector('.view.is-active')?.dataset.view === 'overview'"), "overview view");
      await sleep(100);
      await screenshot(`${viewport.name}-overview`);
      const savedReport = await evaluate("new Promise(resolve => { const original = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download && this.href) { fetch(this.href).then(response => response.text()).then(text => { HTMLAnchorElement.prototype.click = original; resolve(text); }); return; } return original.call(this); }; document.getElementById('save-report').click(); })");
      const savedPath = path.join(work, `${viewport.name}-saved-report.html`);
      fs.writeFileSync(savedPath, savedReport);
      await send("Page.navigate", { url: pathToFileURL(savedPath).href });
      await waitFor("document.readyState === 'complete' && !!document.querySelector('.kpis .kpi')", "saved standalone report");
      const savedOverview = await evaluate(`(() => {
        const active = document.querySelector('.view.is-active');
        const primary = active?.querySelector('.kpis .kpi');
        const header = active?.querySelector('.page-header');
        return {
          primaryTop: Math.round(primary?.getBoundingClientRect().top || 0),
          headerHeight: Math.round(header?.getBoundingClientRect().height || 0),
          overflow: document.documentElement.scrollWidth > innerWidth
        };
      })()`);
      await screenshot(`${viewport.name}-saved-report-overview`);
      const saved = await evaluate(`(() => {
        const isPhone = innerWidth <= 600;
        const measurements = [];
        const routes = isPhone
          ? [...document.querySelectorAll('.view.is-active [data-section-select] option')].map(option => option.value).filter(Boolean)
          : [...document.querySelectorAll('.sidebar [data-nav]')].map(link => link.dataset.nav).filter(Boolean);
        const route = value => {
          window.scrollTo(0, 0);
          if (isPhone) {
            const picker = document.querySelector('.view.is-active [data-section-select]');
            if (!picker) return { selected: false, usable: false };
            const box = picker.getBoundingClientRect();
            const usable = box.width > 0 && box.height > 0 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
            picker.value = value;
            picker.dispatchEvent(new Event('change', { bubbles: true }));
            return { selected: true, usable };
          }
          const link = document.querySelector('.sidebar [data-nav="' + value + '"]');
          if (!link) return { selected: false, usable: false };
          link.click();
          return { selected: true, usable: true };
        };
        const allSectionsWork = routes.length >= 5 && routes.every(value => {
          const control = route(value);
          window.scrollTo(0, 0);
          const active = document.querySelector('.view.is-active');
          const header = active?.querySelector('.page-header');
          const primary = active?.querySelector('.kpis .kpi, #timeline, .seq-row, #environment .kv, #policy .pol-drop, #coverage .cov-tile, #diagnostics .diag-card, #event-replay .event-replay-tools, #summary-text, #learn .steps li');
          measurements.push({
            view: value,
            active: active?.dataset.view === value,
            controlVisible: control.usable,
            headerHeight: Math.round(header?.getBoundingClientRect().height || 0),
            primaryTop: Math.round(primary?.getBoundingClientRect().top || 0),
            overflow: document.documentElement.scrollWidth > innerWidth
          });
          return control.selected && active?.dataset.view === value;
        });
        route('sequence');
        return {
          routes,
          allSectionsWork,
          navigation: document.querySelector('.view.is-active')?.dataset.view === 'sequence',
          maxHeaderHeight: Math.max(0, ...measurements.map(item => item.headerHeight)),
          maxPrimaryTop: Math.max(0, ...measurements.map(item => item.primaryTop)),
          overflow: measurements.some(item => item.overflow),
          menuInBounds: !isPhone || measurements.every(item => item.controlVisible),
          views: measurements
        };
      })()`);
      saved.overview = savedOverview;
      saved.primaryTop = saved.maxPrimaryTop;
      saved.headerHeight = saved.maxHeaderHeight;
      await screenshot(`${viewport.name}-saved-report-sequence`);
      await send("Page.navigate", { url: pathToFileURL(viewer).href });
      await waitFor("document.readyState === 'complete'", "viewer to reload for comparison");
      const { root: documentRoot } = await send("DOM.getDocument", { depth: 1 });
      const { nodeId } = await send("DOM.querySelector", { nodeId: documentRoot.nodeId, selector: "#compare-input" });
      await send("DOM.setFileInputFiles", { files: comparisonFiles, nodeId });
      await waitFor(frame("doc => doc.querySelector('.metrics .metric')"), "viewer comparison");
      const comparison = await evaluate(frame("(doc, frame) => { const el = doc.querySelector('.metrics .metric'), r = el.getBoundingClientRect(), h = doc.querySelector('.page-header'), frameRect = frame.getBoundingClientRect(); return { primaryTop: Math.round(frameRect.top + r.top), headerHeight: Math.round(frameRect.top + (h?.getBoundingClientRect().height || 0)), overflow: doc.documentElement.scrollWidth > doc.defaultView.innerWidth }; }"));
      await screenshot(`${viewport.name}-comparison`);
      const savedComparisonHtml = await evaluate("new Promise(resolve => { const original = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download && this.href) { fetch(this.href).then(response => response.text()).then(text => { HTMLAnchorElement.prototype.click = original; resolve(text); }); return; } return original.call(this); }; document.getElementById('save-report').click(); })");
      const savedComparisonPath = path.join(work, `${viewport.name}-saved-comparison.html`);
      fs.writeFileSync(savedComparisonPath, savedComparisonHtml);
      await send("Page.navigate", { url: pathToFileURL(savedComparisonPath).href });
      await waitFor("document.readyState === 'complete' && !!document.querySelector('.metrics .metric')", "saved standalone comparison");
      const savedComparison = await evaluate("(() => { const el = document.querySelector('.metrics .metric'), r = el.getBoundingClientRect(), h = document.querySelector('.page-header'); return { primaryTop: Math.round(r.top), headerHeight: Math.round(h?.getBoundingClientRect().height || 0), overflow: document.documentElement.scrollWidth > innerWidth }; })()");
      await screenshot(`${viewport.name}-saved-comparison`);
      measurements.viewports[viewport.name] = { limits: { dataTop: viewport.dataLimit, headerHeight: viewport.headerLimit }, themes: { startsDark, startsLight, lightTheme, darkTheme }, start, reports, reportNavigationChanged, savedReport: saved, comparison, savedComparison };
    }

    const failures = [];
    for (const viewport of viewports) {
      const result = measurements.viewports[viewport.name];
      for (const [name, item] of [["start", result.start], ...Object.entries(result.reports)]) {
        if (!item.primary) failures.push(`${viewport.name} ${name}: primary data selector missing`);
        else if (item.primary.top > result.limits.dataTop) failures.push(`${viewport.name} ${name}: primary data starts at ${item.primary.top}px (limit ${result.limits.dataTop}px)`);
        else if (item.visibleItems < 1) failures.push(`${viewport.name} ${name}: no primary data item is visible in the first screen`);
        if (!item.header) failures.push(`${viewport.name} ${name}: header missing`);
        else if (name === "start" && item.header.height > result.limits.headerHeight) failures.push(`${viewport.name} start: header is ${item.header.height}px (limit ${result.limits.headerHeight}px)`);
        else if (name !== "start") for (const [part, height] of Object.entries(item.header).filter(([part]) => /Height$/.test(part))) if (height > result.limits.headerHeight) failures.push(`${viewport.name} ${name}: ${part} is ${height}px (limit ${result.limits.headerHeight}px)`);
        if (item.horizontalOverflow) failures.push(`${viewport.name} ${name}: horizontal overflow`);
        if (item.controls) {
          const bounds = item.controls.bounds;
          if (!item.controls.open || !item.controls.controlsVisible) failures.push(`${viewport.name} ${name}: controls panel did not expose its actions`);
          if (!item.controls.triggerVisible || !item.controls.triggerOutsidePanel || !item.controls.closed) failures.push(`${viewport.name} ${name}: controls trigger is obscured or cannot close its panel`);
          if (!bounds || bounds.left < 0 || bounds.top < 0 || bounds.right > bounds.viewportWidth || bounds.bottom > bounds.viewportHeight) failures.push(`${viewport.name} ${name}: controls panel escapes the viewport`);
        }
        if (item.stickyLegend) {
          const sticky = item.stickyLegend;
          const minimumTop = 0;
          if (!sticky.maxScroll || sticky.keyTop < minimumTop || sticky.keyTop > minimumTop + 2 || sticky.keyBottom <= minimumTop) failures.push(`${viewport.name} waterfall: timing key is not pinned at the top while scrolling`);
        }
      }
      if (!result.themes.startsDark || !result.themes.startsLight || !result.themes.lightTheme || !result.themes.darkTheme) failures.push(`${viewport.name}: light and dark theme defaults and switches must both work`);
      if (!result.reportNavigationChanged) failures.push(`${viewport.name}: report navigation did not synchronize the viewer section picker`);
      for (const [name, item] of Object.entries({ savedReport: result.savedReport, comparison: result.comparison, savedComparison: result.savedComparison })) {
        if (item.primaryTop > result.limits.dataTop) failures.push(`${viewport.name} ${name}: primary data starts at ${item.primaryTop}px (limit ${result.limits.dataTop}px)`);
        if (item.headerHeight > result.limits.headerHeight) failures.push(`${viewport.name} ${name}: header is ${item.headerHeight}px (limit ${result.limits.headerHeight}px)`);
        if (item.overflow) failures.push(`${viewport.name} ${name}: horizontal overflow`);
      }
      if (viewport.mobile && (!result.savedReport.routes.includes('waterfall') || !result.savedReport.routes.includes('sequence') || !result.savedReport.allSectionsWork || !result.savedReport.menuInBounds || !result.savedReport.navigation)) failures.push(`${viewport.name} saved report: standalone Sections menu is not usable for every report view`);
    }
    measurements.failures = failures;
    const rendered = JSON.stringify(measurements, null, 2);
    if (output) fs.writeFileSync(output, rendered + "\n");
    console.log(rendered);
    if (failures.length) process.exitCode = 1;
  } finally {
    try { ws?.close(); } catch {}
    try { child.kill(); } catch {}
    await sleep(200);
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
