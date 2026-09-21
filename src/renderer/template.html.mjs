/**
 * SocketMap Standalone HTML Page Generator
 * Emits a 100% self-contained, single-file HTML document with embedded SVG,
 * inline styles, and client-side interactive zoom/pan/inspector engine.
 * ZERO EXTERNAL DEPENDENCIES or remote network calls.
 */

import { buildTraceSvg } from "./svg-builder.mjs";

export function renderStandaloneHtml(trace) {
  const svgMarkup = buildTraceSvg(trace);
  const traceJson = JSON.stringify(trace).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(trace.title || "SocketMap Trace Visualizer")}</title>
  <style>
    /* Reset & Base System Typography */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #070b12;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      user-select: none;
    }

    /* Top Floating Action Bar */
    .app-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      background: rgba(7, 11, 18, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid #1e293b;
      z-index: 100;
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .brand-logo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 800;
      font-size: 15px;
      letter-spacing: -0.02em;
      color: #38bdf8;
    }

    .brand-logo svg {
      width: 20px;
      height: 20px;
    }

    .header-tagline {
      font-size: 12px;
      color: #64748b;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }

    .controls-section {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .search-box {
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-input {
      background: #0f172a;
      border: 1px solid #334155;
      color: #e2e8f0;
      padding: 6px 12px 6px 30px;
      border-radius: 6px;
      font-size: 12px;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      width: 190px;
      outline: none;
      transition: all 0.2s ease;
    }

    .search-input:focus {
      border-color: #38bdf8;
      width: 240px;
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
    }

    .search-icon {
      position: absolute;
      left: 9px;
      width: 14px;
      height: 14px;
      fill: none;
      stroke: #64748b;
      stroke-width: 2;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 30px;
      padding: 0 10px;
      border-radius: 6px;
      background: #0f172a;
      border: 1px solid #334155;
      color: #cbd5e1;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn:hover {
      background: #1e293b;
      border-color: #475569;
      color: #f8fafc;
    }

    .btn:active {
      transform: scale(0.97);
    }

    /* Canvas Viewport */
    .viewport {
      position: absolute;
      top: 52px;
      left: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
      cursor: grab;
      background-color: #070b12;
    }

    .viewport.is-dragging {
      cursor: grabbing;
    }

    .canvas-container {
      transform-origin: 0 0;
      will-change: transform;
    }

    /* SVG Interactive States */
    .socketmap-canvas {
      display: block;
    }

    .route-hitbox {
      cursor: pointer;
    }

    .pulse-dot {
      animation: pulse 2s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.1); }
    }

    .message-route, .activation-bar, .participant-card, .lifeline {
      transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), stroke-width 0.2s ease;
    }

    /* Dimming & Highlighting */
    .canvas-container.has-focus .message-route:not(.is-active) {
      opacity: 0.15;
    }

    .canvas-container.has-focus .activation-bar:not(.is-active) {
      opacity: 0.15;
    }

    .canvas-container.has-focus .lifeline:not(.is-active) {
      opacity: 0.1;
    }

    .canvas-container.has-focus .participant-card:not(.is-active) {
      opacity: 0.3;
    }

    .message-route.is-active .route-line {
      stroke-width: 3.5px !important;
      filter: drop-shadow(0 0 8px currentColor);
    }

    .message-route.is-active .route-label-text {
      font-size: 13px !important;
      fill: #ffffff !important;
      font-weight: 700 !important;
    }

    .activation-bar.is-active {
      opacity: 1 !important;
      stroke-width: 2.5px !important;
      filter: drop-shadow(0 0 12px currentColor) !important;
    }

    .participant-card.is-active rect:first-child {
      stroke-width: 2.5px !important;
      stroke-opacity: 1 !important;
      filter: drop-shadow(0 0 10px currentColor);
    }

    /* Interactive Floating Tooltip */
    .trace-tooltip {
      position: fixed;
      pointer-events: none;
      z-index: 200;
      padding: 12px 16px;
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid #334155;
      border-radius: 8px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      font-size: 12px;
      color: #f1f5f9;
      opacity: 0;
      transform: translate(-50%, -100%) translateY(-12px);
      transition: opacity 0.15s ease, transform 0.15s ease;
      max-width: 340px;
    }

    .trace-tooltip.is-visible {
      opacity: 1;
      transform: translate(-50%, -100%) translateY(-8px);
    }

    .tooltip-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
      border-bottom: 1px solid #334155;
      padding-bottom: 4px;
    }

    .tooltip-route {
      font-weight: 700;
      color: #38bdf8;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 11px;
    }

    .tooltip-latency {
      background: #042f2e;
      color: #2dd4bf;
      border: 1px solid #115e59;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-family: monospace;
      font-size: 11px;
    }

    .tooltip-label {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 4px;
      color: #ffffff;
    }

    .tooltip-detail {
      font-size: 11px;
      color: #94a3b8;
      line-height: 1.4;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      word-break: break-all;
    }

    .tooltip-meta {
      display: flex;
      gap: 8px;
      margin-top: 6px;
      font-family: monospace;
      font-size: 11px;
    }

    .tooltip-chip {
      background: #1e293b;
      padding: 2px 6px;
      border-radius: 4px;
      color: #cbd5e1;
    }

    /* Inspector Drawer */
    .inspector-drawer {
      position: fixed;
      top: 52px;
      right: 0;
      bottom: 0;
      width: 420px;
      background: rgba(11, 17, 32, 0.95);
      border-left: 1px solid #1e293b;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      z-index: 150;
      transform: translateX(100%);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
    }

    .inspector-drawer.is-open {
      transform: translateX(0);
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
    }

    .drawer-header {
      padding: 16px 20px;
      border-bottom: 1px solid #1e293b;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .drawer-title {
      font-size: 14px;
      font-weight: 700;
      color: #f8fafc;
    }

    .drawer-close {
      background: transparent;
      border: none;
      color: #64748b;
      font-size: 20px;
      cursor: pointer;
      line-height: 1;
      padding: 4px;
    }

    .drawer-close:hover {
      color: #f8fafc;
    }

    .drawer-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    }

    .drawer-section {
      margin-bottom: 20px;
    }

    .drawer-section-title {
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 8px;
    }

    .key-value-list {
      display: grid;
      grid-template-columns: 100px 1fr;
      gap: 6px 12px;
      font-size: 12px;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }

    .kv-key {
      color: #64748b;
    }

    .kv-val {
      color: #e2e8f0;
      word-break: break-all;
    }

    .raw-code-box {
      background: #070b12;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 12px;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 11px;
      color: #38bdf8;
      overflow-x: auto;
      white-space: pre-wrap;
    }

    /* Floating Navigation Controls */
    .floating-nav {
      position: fixed;
      bottom: 24px;
      right: 24px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: rgba(15, 23, 42, 0.9);
      padding: 6px;
      border-radius: 8px;
      border: 1px solid #334155;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      z-index: 100;
    }

    .nav-btn {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      background: #0f172a;
      border: 1px solid #1e293b;
      color: #94a3b8;
      font-size: 15px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .nav-btn:hover {
      background: #1e293b;
      color: #f8fafc;
      border-color: #475569;
    }
  </style>
</head>
<body>

  <!-- Top Floating Header Bar -->
  <header class="app-header">
    <div class="brand-section">
      <div class="brand-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 3v18M3 12h18"/>
          <circle cx="12" cy="12" r="3" fill="#38bdf8"/>
        </svg>
        <span>SOCKETMAP</span>
      </div>
      <span class="header-tagline">Signal-Flow Trace Visualizer</span>
    </div>

    <div class="controls-section">
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <input type="text" id="filter-input" class="search-input" placeholder="Filter interactions..." autocomplete="off">
      </div>
      <button id="btn-fit" class="btn" title="Fit to screen">Fit</button>
      <button id="btn-reset" class="btn" title="Reset Zoom">1:1</button>
    </div>
  </header>

  <!-- Interactive Canvas Viewport -->
  <main class="viewport" id="viewport">
    <div class="canvas-container" id="canvas-container">
      ${svgMarkup}
    </div>
  </main>

  <!-- Floating Tooltip -->
  <div class="trace-tooltip" id="tooltip">
    <div class="tooltip-header">
      <span class="tooltip-route" id="tt-route">User → Gateway</span>
      <span class="tooltip-latency" id="tt-latency">24ms</span>
    </div>
    <div class="tooltip-label" id="tt-label">GET /dashboard</div>
    <div class="tooltip-detail" id="tt-detail">Request detail</div>
    <div class="tooltip-meta" id="tt-meta">
      <span class="tooltip-chip" id="tt-method">GET</span>
      <span class="tooltip-chip" id="tt-status">200 OK</span>
      <span class="tooltip-chip" id="tt-bytes">1.4 KB</span>
    </div>
  </div>

  <!-- Inspector Drawer -->
  <aside class="inspector-drawer" id="inspector">
    <div class="drawer-header">
      <span class="drawer-title" id="drawer-title">Interaction Inspector</span>
      <button class="drawer-close" id="drawer-close">&times;</button>
    </div>
    <div class="drawer-body" id="drawer-body">
      <!-- Dynamically Populated -->
    </div>
  </aside>

  <!-- Floating Navigation Controls -->
  <nav class="floating-nav">
    <button class="nav-btn" id="nav-zoom-in" title="Zoom In">+</button>
    <button class="nav-btn" id="nav-zoom-out" title="Zoom Out">&minus;</button>
    <button class="nav-btn" id="nav-fit" title="Fit View">&#x2922;</button>
  </nav>

  <script>
    (function() {
      const traceData = ${traceJson};
      const viewport = document.getElementById("viewport");
      const container = document.getElementById("canvas-container");
      const svg = document.getElementById("socketmap-svg");
      const tooltip = document.getElementById("tooltip");
      const inspector = document.getElementById("inspector");
      const drawerBody = document.getElementById("drawer-body");
      const drawerClose = document.getElementById("drawer-close");
      const filterInput = document.getElementById("filter-input");

      // Zoom & Pan State
      let scale = 1;
      let panX = 40;
      let panY = 30;
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;

      function updateTransform() {
        container.style.transform = "translate(" + panX + "px, " + panY + "px) scale(" + scale + ")";
      }

      // Initial layout fit
      function fitToScreen() {
        if (!svg) return;
        const svgRect = svg.getBoundingClientRect();
        const vpRect = viewport.getBoundingClientRect();

        const svgW = parseFloat(svg.getAttribute("width")) || 1320;
        const svgH = parseFloat(svg.getAttribute("height")) || 800;

        const scaleX = (vpRect.width - 80) / svgW;
        const scaleY = (vpRect.height - 80) / svgH;
        scale = Math.min(1.1, Math.max(0.3, Math.min(scaleX, scaleY)));

        panX = Math.max(20, (vpRect.width - svgW * scale) / 2);
        panY = Math.max(20, (vpRect.height - svgH * scale) / 2);
        updateTransform();
      }

      function resetZoom() {
        scale = 1;
        panX = 40;
        panY = 30;
        updateTransform();
      }

      // Mouse Drag Pan
      viewport.addEventListener("mousedown", function(e) {
        if (e.target.closest(".route-hitbox") || e.target.closest(".activation-bar")) {
          return;
        }
        isDragging = true;
        viewport.classList.add("is-dragging");
        dragStartX = e.clientX - panX;
        dragStartY = e.clientY - panY;
      });

      window.addEventListener("mousemove", function(e) {
        if (!isDragging) return;
        panX = e.clientX - dragStartX;
        panY = e.clientY - dragStartY;
        updateTransform();
      });

      window.addEventListener("mouseup", function() {
        isDragging = false;
        viewport.classList.remove("is-dragging");
      });

      // Wheel Zoom
      viewport.addEventListener("wheel", function(e) {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
        const newScale = Math.min(3.0, Math.max(0.25, scale * zoomFactor));

        const mouseX = e.clientX;
        const mouseY = e.clientY;

        panX = mouseX - (mouseX - panX) * (newScale / scale);
        panY = mouseY - (mouseY - panY) * (newScale / scale);
        scale = newScale;
        updateTransform();
      }, { passive: false });

      // Button Controls
      document.getElementById("btn-fit").addEventListener("click", fitToScreen);
      document.getElementById("btn-reset").addEventListener("click", resetZoom);
      document.getElementById("nav-zoom-in").addEventListener("click", function() {
        scale = Math.min(3.0, scale * 1.2);
        updateTransform();
      });
      document.getElementById("nav-zoom-out").addEventListener("click", function() {
        scale = Math.max(0.25, scale / 1.2);
        updateTransform();
      });
      document.getElementById("nav-fit").addEventListener("click", fitToScreen);

      // Tooltip & Route Hover Highlighting
      const routes = Array.from(document.querySelectorAll(".message-route"));
      const activations = Array.from(document.querySelectorAll(".activation-bar"));
      const participantCards = Array.from(document.querySelectorAll(".participant-card"));
      const lifelines = Array.from(document.querySelectorAll(".lifeline"));

      function clearHighlights() {
        container.classList.remove("has-focus");
        routes.forEach(r => r.classList.remove("is-active"));
        activations.forEach(a => a.classList.remove("is-active"));
        participantCards.forEach(p => p.classList.remove("is-active"));
        lifelines.forEach(l => l.classList.remove("is-active"));
        tooltip.classList.remove("is-visible");
      }

      function highlightRoute(routeEl, e) {
        container.classList.add("has-focus");
        routeEl.classList.add("is-active");

        const from = routeEl.getAttribute("data-from");
        const to = routeEl.getAttribute("data-to");

        // Highlight relevant participants
        participantCards.forEach(p => {
          const id = p.getAttribute("data-id");
          if (id === from || id === to) p.classList.add("is-active");
        });

        // Highlight relevant lifelines
        lifelines.forEach(l => {
          if (l.classList.contains("lifeline-" + from) || l.classList.contains("lifeline-" + to)) {
            l.classList.add("is-active");
          }
        });

        // Highlight activations
        activations.forEach(a => {
          const p = a.getAttribute("data-participant");
          if (p === from || p === to) a.classList.add("is-active");
        });

        // Show Tooltip
        const label = routeEl.getAttribute("data-label");
        const detail = routeEl.getAttribute("data-detail");
        const latency = routeEl.getAttribute("data-latency");
        const method = routeEl.getAttribute("data-method");
        const status = routeEl.getAttribute("data-status");
        const bytes = routeEl.getAttribute("data-bytes");

        document.getElementById("tt-route").textContent = from + " → " + to;
        document.getElementById("tt-label").textContent = label;
        document.getElementById("tt-detail").textContent = detail || "";

        const ttLatency = document.getElementById("tt-latency");
        if (latency) {
          ttLatency.style.display = "inline-block";
          ttLatency.textContent = latency + "ms";
        } else {
          ttLatency.style.display = "none";
        }

        const ttMethod = document.getElementById("tt-method");
        if (method) {
          ttMethod.style.display = "inline-block";
          ttMethod.textContent = method;
        } else {
          ttMethod.style.display = "none";
        }

        const ttStatus = document.getElementById("tt-status");
        if (status) {
          ttStatus.style.display = "inline-block";
          ttStatus.textContent = status;
        } else {
          ttStatus.style.display = "none";
        }

        const ttBytes = document.getElementById("tt-bytes");
        if (bytes) {
          ttBytes.style.display = "inline-block";
          ttBytes.textContent = bytes > 1024 ? (bytes / 1024).toFixed(1) + " KB" : bytes + " B";
        } else {
          ttBytes.style.display = "none";
        }

        tooltip.style.left = e.clientX + "px";
        tooltip.style.top = e.clientY + "px";
        tooltip.classList.add("is-visible");
      }

      routes.forEach(route => {
        route.addEventListener("mouseenter", function(e) {
          highlightRoute(route, e);
        });

        route.addEventListener("mousemove", function(e) {
          tooltip.style.left = e.clientX + "px";
          tooltip.style.top = e.clientY + "px";
        });

        route.addEventListener("mouseleave", function() {
          clearHighlights();
        });

        route.addEventListener("click", function() {
          openInspector(route);
        });
      });

      // Inspector Logic
      function openInspector(routeEl) {
        const id = routeEl.id;
        const msg = (traceData.messages || []).find(m => m.id === id) || {
          id: id,
          label: routeEl.getAttribute("data-label"),
          detail: routeEl.getAttribute("data-detail"),
          from: routeEl.getAttribute("data-from"),
          to: routeEl.getAttribute("data-to"),
          latencyMs: routeEl.getAttribute("data-latency"),
          method: routeEl.getAttribute("data-method"),
          status: routeEl.getAttribute("data-status"),
          bytes: routeEl.getAttribute("data-bytes")
        };

        const phaseTitle = traceData.phases && traceData.phases[msg.phase]
          ? traceData.phases[msg.phase]
          : "Phase " + ((msg.phase || 0) + 1);

        drawerBody.innerHTML = [
          '<div class="drawer-section">',
          '  <div class="drawer-section-title">Step Identification</div>',
          '  <div class="key-value-list">',
          '    <span class="kv-key">Message ID:</span><span class="kv-val">' + msg.id + '</span>',
          '    <span class="kv-key">Source:</span><span class="kv-val">' + msg.from + '</span>',
          '    <span class="kv-key">Target:</span><span class="kv-val">' + msg.to + '</span>',
          '    <span class="kv-key">Phase:</span><span class="kv-val">' + phaseTitle + '</span>',
          '    <span class="kv-key">Interaction:</span><span class="kv-val">' + (msg.kind || "request") + '</span>',
          '  </div>',
          '</div>',
          '<div class="drawer-section">',
          '  <div class="drawer-section-title">Performance Metrics</div>',
          '  <div class="key-value-list">',
          '    <span class="kv-key">Latency:</span><span class="kv-val">' + (msg.latencyMs != null ? msg.latencyMs + ' ms' : 'N/A') + '</span>',
          '    <span class="kv-key">Method:</span><span class="kv-val">' + (msg.method || 'N/A') + '</span>',
          '    <span class="kv-key">HTTP Status:</span><span class="kv-val">' + (msg.status || 'N/A') + '</span>',
          '    <span class="kv-key">Transferred:</span><span class="kv-val">' + (msg.bytes != null ? msg.bytes + ' bytes' : 'N/A') + '</span>',
          '  </div>',
          '</div>',
          '<div class="drawer-section">',
          '  <div class="drawer-section-title">Details &amp; Headers</div>',
          '  <div class="raw-code-box">' + (msg.detail ? escapeHtml(msg.detail) : 'No extra telemetry payload.') + '</div>',
          '</div>'
        ].join("");

        inspector.classList.add("is-open");
      }

      drawerClose.addEventListener("click", function() {
        inspector.classList.remove("is-open");
      });

      // Filter input search
      filterInput.addEventListener("input", function() {
        const query = this.value.trim().toLowerCase();
        if (!query) {
          clearHighlights();
          routes.forEach(r => r.style.opacity = "");
          return;
        }

        routes.forEach(r => {
          const label = (r.getAttribute("data-label") || "").toLowerCase();
          const detail = (r.getAttribute("data-detail") || "").toLowerCase();
          const from = (r.getAttribute("data-from") || "").toLowerCase();
          const to = (r.getAttribute("data-to") || "").toLowerCase();

          if (label.includes(query) || detail.includes(query) || from.includes(query) || to.includes(query)) {
            r.style.opacity = "1";
            r.querySelector(".route-line").style.strokeWidth = "3px";
          } else {
            r.style.opacity = "0.1";
            r.querySelector(".route-line").style.strokeWidth = "";
          }
        });
      });

      function escapeHtml(str) {
        if (!str) return "";
        return String(str)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      // Initial fit on page load
      fitToScreen();
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(unsafe) {
  if (unsafe == null) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
