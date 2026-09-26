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

    /* Toggle Group & Interactive Buttons */
    .toggle-group {
      display: flex;
      align-items: center;
      gap: 4px;
      background: #0f172a;
      padding: 3px 5px;
      border-radius: 7px;
      border: 1px solid #1e293b;
    }

    .toggle-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 26px;
      padding: 0 8px;
      border-radius: 5px;
      background: transparent;
      border: 1px solid transparent;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
    }

    .toggle-btn:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.06);
    }

    .toggle-btn.active {
      background: #0369a1;
      border-color: #38bdf8;
      color: #ffffff;
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.35);
    }

    .toggle-btn.active-warn {
      background: #b45309;
      border-color: #fbbf24;
      color: #ffffff;
      box-shadow: 0 0 10px rgba(251, 191, 36, 0.35);
    }

    /* Critical Path Filtering States */
    .canvas-container.has-blocking-filter .message-route.is-non-blocking {
      opacity: 0.08 !important;
      pointer-events: none;
    }

    .canvas-container.has-blocking-filter .message-route.is-blocking {
      opacity: 1 !important;
    }

    .canvas-container.has-blocking-filter .message-route.is-blocking .route-line {
      stroke: #fbbf24 !important;
      stroke-width: 3.5px !important;
      filter: drop-shadow(0 0 10px #f59e0b) !important;
    }

    .canvas-container.no-glow * {
      filter: none !important;
    }

    .canvas-container.hide-latency .route-label-text {
      font-size: 11px !important;
    }

    /* Impact & Critical Path Badges in Drawer */
    .impact-badge {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 8px;
      margin-bottom: 16px;
      border: 1px solid transparent;
    }

    .impact-badge.blocking {
      background: rgba(245, 158, 11, 0.12);
      border-color: rgba(245, 158, 11, 0.4);
      color: #fef3c7;
    }

    .impact-badge.non-blocking {
      background: rgba(148, 163, 184, 0.1);
      border-color: rgba(148, 163, 184, 0.25);
      color: #cbd5e1;
    }

    .impact-badge .badge-icon {
      font-size: 20px;
    }

    .impact-sub {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 2px;
      font-family: ui-monospace, "SF Mono", monospace;
    }

    .rating-chip {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 11px;
      font-family: ui-monospace, monospace;
    }

    .rating-fast { background: #064e3b; color: #34d399; border: 1px solid #059669; }
    .rating-moderate { background: #451a03; color: #fbbf24; border: 1px solid #d97706; }
    .rating-slow { background: #4c0519; color: #fb7185; border: 1px solid #e11d48; }

    /* Modern Web Guidance Tiers */
    .guidance-tiers {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .guidance-tier {
      padding: 10px 12px;
      border-radius: 6px;
      background: #0f172a;
      border: 1px solid #1e293b;
    }

    .tier-good { border-left: 3.5px solid #f87171; }
    .tier-better { border-left: 3.5px solid #fbbf24; }
    .tier-best { border-left: 3.5px solid #34d399; }

    .tier-label {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }

    .tier-good .tier-label { color: #f87171; }
    .tier-better .tier-label { color: #fbbf24; }
    .tier-best .tier-label { color: #34d399; }

    .tier-desc {
      font-size: 11.5px;
      color: #cbd5e1;
      line-height: 1.45;
    }

    /* Troubleshoot Links */
    .troubleshoot-links {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .ts-link {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 6px;
      color: #93c5fd;
      text-decoration: none;
      font-size: 11.5px;
      transition: all 0.15s ease;
    }

    .ts-link:hover {
      background: #1e293b;
      border-color: #38bdf8;
      color: #ffffff;
      transform: translateX(2px);
    }

    .ts-icon {
      font-size: 16px;
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

    /* Active Filter Notification Bar */
    .active-filter-bar {
      position: fixed;
      top: 60px;
      left: 24px;
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid #38bdf8;
      box-shadow: 0 4px 16px rgba(56, 189, 248, 0.2);
      padding: 6px 14px;
      border-radius: 8px;
      z-index: 120;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      font-size: 12px;
      animation: fadeInSlide 0.2s ease;
    }

    @keyframes fadeInSlide {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .filter-bar-tag {
      color: #38bdf8;
      font-weight: 700;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }

    .filter-bar-count {
      color: #94a3b8;
      font-size: 11px;
    }

    .filter-clear-btn {
      background: rgba(244, 63, 94, 0.15);
      border: 1px solid rgba(244, 63, 94, 0.4);
      color: #fb7185;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .filter-clear-btn:hover {
      background: rgba(244, 63, 94, 0.3);
      color: #ffffff;
    }

    /* Inventory KPI Grid */
    .inventory-kpi-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-bottom: 20px;
    }

    .inventory-kpi-card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .inventory-kpi-val {
      font-size: 18px;
      font-weight: 800;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }

    .inventory-kpi-label {
      font-size: 10.5px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }

    /* Inventory Category Section & Rows */
    .inv-group {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
    }

    .inv-group-header {
      padding: 8px 12px;
      background: rgba(30, 41, 59, 0.5);
      border-bottom: 1px solid #1e293b;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .inv-item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid rgba(30, 41, 59, 0.5);
      font-size: 12px;
      transition: background 0.15s ease;
    }

    .inv-item-row:last-child {
      border-bottom: none;
    }

    .inv-item-row:hover {
      background: rgba(56, 189, 248, 0.05);
    }

    .inv-item-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
      margin-right: 10px;
    }

    .inv-item-name {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-weight: 600;
      color: #f1f5f9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .inv-item-meta {
      font-size: 10.5px;
      color: #64748b;
    }

    .inv-item-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .inv-count-chip {
      background: #1e293b;
      color: #cbd5e1;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10.5px;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }

    .inv-filter-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #38bdf8;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .inv-filter-btn:hover {
      background: #38bdf8;
      color: #070b12;
      border-color: #38bdf8;
    }

    .inv-filter-btn.active {
      background: #38bdf8;
      color: #070b12;
      border-color: #38bdf8;
    }

    /* Fingerprint Chips in Individual Inspector */
    .fp-chips-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }

    .fp-chip {
      background: #0f172a;
      border: 1px solid #334155;
      color: #cbd5e1;
      font-size: 11px;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      padding: 4px 8px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }

    .fp-chip:hover {
      border-color: #38bdf8;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.08);
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
      <div class="toggle-group">
        <button id="btn-toggle-blocking" class="toggle-btn" title="Toggle Critical Path (Blocking Only)">
          <span>⚡</span> Critical Path
        </button>
        <button id="btn-toggle-glow" class="toggle-btn active" title="Toggle Neon Glow Effects">
          <span>✨</span> Glow
        </button>
        <button id="btn-toggle-latency" class="toggle-btn active" title="Toggle Latency Chips">
          <span>⏱️</span> Latency
        </button>
        <button id="btn-toggle-insights" class="toggle-btn" title="View Trace Insights & Guidance">
          <span>💡</span> Insights
        </button>
        <button id="btn-toggle-inventory" class="toggle-btn" title="View Domains, Ports, Libraries & Tools Inventory">
          <span>📦</span> Inventory <span id="inventory-badge" class="toggle-counter"></span>
        </button>
      </div>

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

  <!-- Active Filter Notification Bar -->
  <div id="active-filter-bar" class="active-filter-bar" style="display: none;">
    <span class="filter-bar-tag" id="active-filter-tag">Filtered</span>
    <span class="filter-bar-count" id="active-filter-count"></span>
    <button id="btn-clear-filter" class="filter-clear-btn" title="Clear filter">&times; Clear</button>
  </div>

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

      // Visual Toggles
      const btnBlocking = document.getElementById("btn-toggle-blocking");
      let blockingOnly = false;
      btnBlocking.addEventListener("click", function() {
        blockingOnly = !blockingOnly;
        btnBlocking.classList.toggle("active-warn", blockingOnly);
        container.classList.toggle("has-blocking-filter", blockingOnly);
      });

      const btnGlow = document.getElementById("btn-toggle-glow");
      let glowEnabled = true;
      btnGlow.addEventListener("click", function() {
        glowEnabled = !glowEnabled;
        btnGlow.classList.toggle("active", glowEnabled);
        container.classList.toggle("no-glow", !glowEnabled);
      });

      const btnLatency = document.getElementById("btn-toggle-latency");
      let latencyEnabled = true;
      btnLatency.addEventListener("click", function() {
        latencyEnabled = !latencyEnabled;
        btnLatency.classList.toggle("active", latencyEnabled);
        container.classList.toggle("hide-latency", !latencyEnabled);
      });

      const btnInsights = document.getElementById("btn-toggle-insights");
      btnInsights.addEventListener("click", function() {
        openTraceInsights();
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
          latencyMs: routeEl.getAttribute("data-latency") ? Number(routeEl.getAttribute("data-latency")) : null,
          method: routeEl.getAttribute("data-method"),
          status: routeEl.getAttribute("data-status") ? Number(routeEl.getAttribute("data-status")) : null,
          bytes: routeEl.getAttribute("data-bytes") ? Number(routeEl.getAttribute("data-bytes")) : null,
          isBlocking: routeEl.getAttribute("data-blocking") === "true",
          blockingReason: routeEl.getAttribute("data-blocking-reason") || "",
          recommendationCategory: routeEl.getAttribute("data-category") || "api_endpoint"
        };

        const isBlocking = Boolean(msg.isBlocking);
        const guidance = msg.guidance || {
          categoryTitle: "Architecture & Performance Guidance",
          good: "Standard synchronous network call.",
          better: "Parallelize requests with Promise.all() and use stale-while-revalidate caching.",
          best: "Stream server-side rendered HTML and consolidate origins to eliminate multi-hop round trips.",
          docsUrl: "https://developer.chrome.com/docs/modern-web-guidance",
          docsLabel: "Chrome Modern Web Guidance"
        };

        // Latency Rating
        let ratingClass = "rating-fast";
        let ratingLabel = "🟢 Fast (<100ms)";
        if (msg.latencyMs != null) {
          if (msg.latencyMs >= 300) {
            ratingClass = "rating-slow";
            ratingLabel = "🔴 High Latency (>300ms)";
          } else if (msg.latencyMs >= 100) {
            ratingClass = "rating-moderate";
            ratingLabel = "🟡 Moderate (100-300ms)";
          }
        }

        const phaseTitle = traceData.phases && traceData.phases[msg.phase]
          ? traceData.phases[msg.phase]
          : "Phase " + ((msg.phase || 0) + 1);

        document.getElementById("drawer-title").textContent = isBlocking
          ? "Critical Path Inspector (⚡ Blocking)"
          : "Interaction Inspector";

        drawerBody.innerHTML = [
          isBlocking
            ? '<div class="impact-badge blocking">' +
              '  <span class="badge-icon">⚡</span>' +
              '  <div>' +
              '    <strong>CRITICAL BLOCKING PATH</strong>' +
              '    <div class="impact-sub">' + escapeHtml(msg.blockingReason || "Direct dependency on critical render path") + '</div>' +
              '  </div>' +
              '</div>'
            : '<div class="impact-badge non-blocking">' +
              '  <span class="badge-icon">✓</span>' +
              '  <div>' +
              '    <strong>NON-BLOCKING / ASYNC</strong>' +
              '    <div class="impact-sub">' + escapeHtml(msg.blockingReason || "Executes asynchronously without blocking initial render") + '</div>' +
              '  </div>' +
              '</div>',

          '<div class="drawer-section">',
          '  <div class="drawer-section-title">Step Identification</div>',
          '  <div class="key-value-list">',
          '    <span class="kv-key">Message ID:</span><span class="kv-val">' + msg.id + '</span>',
          '    <span class="kv-key">Source:</span><span class="kv-val">' + escapeHtml(msg.from) + '</span>',
          '    <span class="kv-key">Target:</span><span class="kv-val">' + escapeHtml(msg.to) + '</span>',
          '    <span class="kv-key">Phase:</span><span class="kv-val">' + escapeHtml(phaseTitle) + '</span>',
          '    <span class="kv-key">Interaction:</span><span class="kv-val">' + escapeHtml(msg.kind || "request") + '</span>',
          '  </div>',
          '</div>',

          '<div class="drawer-section">',
          '  <div class="drawer-section-title">Performance &amp; Diagnostics</div>',
          '  <div class="key-value-list">',
          '    <span class="kv-key">Latency:</span><span class="kv-val">' + (msg.latencyMs != null ? msg.latencyMs + ' ms ' : 'N/A ') + '<span class="rating-chip ' + ratingClass + '">' + ratingLabel + '</span></span>',
          '    <span class="kv-key">Method:</span><span class="kv-val">' + escapeHtml(msg.method || 'N/A') + '</span>',
          '    <span class="kv-key">HTTP Status:</span><span class="kv-val">' + (msg.status || 'N/A') + '</span>',
          '    <span class="kv-key">Transferred:</span><span class="kv-val">' + (msg.bytes != null ? (msg.bytes > 1024 ? (msg.bytes / 1024).toFixed(1) + ' KB' : msg.bytes + ' bytes') : 'N/A') + '</span>',
          '  </div>',
          '</div>',

          '<div class="drawer-section">',
          '  <div class="drawer-section-title">Network &amp; Tech Stack Fingerprint</div>',
          '  <div class="fp-chips-grid">',
          (msg.domain ? '    <button class="fp-chip" title="Click to filter by domain ' + escapeHtml(msg.domain) + '" data-filter-type="domain" data-filter-value="' + escapeHtml(msg.domain) + '">🌐 ' + escapeHtml(msg.domain) + '</button>' : ''),
          (msg.port ? '    <button class="fp-chip" title="Click to filter by port ' + escapeHtml(msg.port) + '" data-filter-type="port" data-filter-value="' + escapeHtml(msg.port) + '">🔌 Port ' + escapeHtml(msg.port) + '</button>' : ''),
          (Array.isArray(msg.technologies) ? msg.technologies.map(t => '    <button class="fp-chip" title="Click to filter by ' + escapeHtml(t) + '" data-filter-type="tech" data-filter-value="' + escapeHtml(t) + '">⚡ ' + escapeHtml(t) + '</button>').join("") : ''),
          (msg.resourceType ? '    <button class="fp-chip" title="Click to filter by ' + escapeHtml(msg.resourceType) + '" data-filter-type="resource" data-filter-value="' + escapeHtml(msg.resourceType) + '">📄 ' + escapeHtml(msg.resourceType) + '</button>' : ''),
          '  </div>',
          '</div>',

          '<div class="drawer-section">',
          '  <div class="drawer-section-title">Modern Web Guidance (' + escapeHtml(guidance.categoryTitle || "Best Practices") + ')</div>',
          '  <div class="guidance-tiers">',
          '    <div class="guidance-tier tier-good">',
          '      <div class="tier-label">Good (Baseline)</div>',
          '      <div class="tier-desc">' + escapeHtml(guidance.good || "Standard implementation") + '</div>',
          '    </div>',
          '    <div class="guidance-tier tier-better">',
          '      <div class="tier-label">Better (Optimized)</div>',
          '      <div class="tier-desc">' + escapeHtml(guidance.better || "Apply caching and parallelization") + '</div>',
          '    </div>',
          '    <div class="guidance-tier tier-best">',
          '      <div class="tier-label">Best (Modern Chrome Guidance)</div>',
          '      <div class="tier-desc">' + escapeHtml(guidance.best || "Modern web architecture") + '</div>',
          '    </div>',
          '  </div>',
          '</div>',

          '<div class="drawer-section">',
          '  <div class="drawer-section-title">Troubleshoot Further</div>',
          '  <div class="troubleshoot-links">',
          '    <a href="' + (guidance.docsUrl || 'https://developer.chrome.com/docs/modern-web-guidance') + '" target="_blank" rel="noopener noreferrer" class="ts-link">',
          '      <span class="ts-icon">🌐</span>',
          '      <span><strong>Chrome Modern Web Guidance</strong>: Explore architectural playbooks</span>',
          '    </a>',
          '    <a href="https://pagespeed.web.dev" target="_blank" rel="noopener noreferrer" class="ts-link">',
          '      <span class="ts-icon">🚀</span>',
          '      <span><strong>Google Lighthouse Audit</strong>: Test Core Web Vitals (LCP, INP, CLS)</span>',
          '    </a>',
          '    <a href="https://developer.chrome.com/docs/devtools/performance" target="_blank" rel="noopener noreferrer" class="ts-link">',
          '      <span class="ts-icon">🛠️</span>',
          '      <span><strong>Chrome DevTools Performance</strong>: Record runtime flame chart</span>',
          '    </a>',
          '  </div>',
          '</div>',

          '<div class="drawer-section">',
          '  <div class="drawer-section-title">Telemetry &amp; Headers</div>',
          '  <div class="raw-code-box">' + (msg.detail ? escapeHtml(msg.detail) : 'No extra telemetry payload.') + '</div>',
          '</div>'
        ].join("");

        inspector.classList.add("is-open");
      }

      function openTraceInsights() {
        const totalMsgs = traceData.messages ? traceData.messages.length : 0;
        const blockingMsgs = (traceData.messages || []).filter(m => m.isBlocking);
        const nonBlockingCount = totalMsgs - blockingMsgs.length;
        const totalBlockingLatency = blockingMsgs.reduce((acc, m) => acc + (m.latencyMs || 0), 0);

        document.getElementById("drawer-title").textContent = "Trace Performance Insights";
        drawerBody.innerHTML = [
          '<div class="impact-badge blocking">',
          '  <span class="badge-icon">📊</span>',
          '  <div>',
          '    <strong>TRACE HEALTH DASHBOARD</strong>',
          '    <div class="impact-sub">Automated critical path and architectural audit</div>',
          '  </div>',
          '</div>',
          '<div class="drawer-section">',
          '  <div class="drawer-section-title">Critical Path Summary</div>',
          '  <div class="key-value-list">',
          '    <span class="kv-key">Total Steps:</span><span class="kv-val">' + totalMsgs + ' interactions</span>',
          '    <span class="kv-key">⚡ Blocking:</span><span class="kv-val" style="color:#fbbf24;font-weight:700;">' + blockingMsgs.length + ' on critical render path</span>',
          '    <span class="kv-key">Deferred:</span><span class="kv-val">' + nonBlockingCount + ' async / background</span>',
          '    <span class="kv-key">Blocking Time:</span><span class="kv-val" style="color:#38bdf8;font-weight:700;">~' + totalBlockingLatency + ' ms</span>',
          '  </div>',
          '</div>',
          '<div class="drawer-section">',
          '  <div class="drawer-section-title">Good / Better / Best Architectural Framework</div>',
          '  <div class="guidance-tiers">',
          '    <div class="guidance-tier tier-good">',
          '      <div class="tier-label">Good (Baseline)</div>',
          '      <div class="tier-desc">Traditional multi-hop request flow with client-side orchestration.</div>',
          '    </div>',
          '    <div class="guidance-tier tier-better">',
          '      <div class="tier-label">Better (Optimized)</div>',
          '      <div class="tier-desc">Early preconnects, non-blocking deferred scripts, and distributed caching.</div>',
          '    </div>',
          '    <div class="guidance-tier tier-best">',
          '      <div class="tier-label">Best (Modern Chrome Guidance)</div>',
          '      <div class="tier-desc">Edge SSR streaming, HTTP/3 multiplexing, LCP priority hints, and zero client-blocking cascades.</div>',
          '    </div>',
          '  </div>',
          '</div>',
          '<div class="drawer-section">',
          '  <div class="drawer-section-title">Recommended Diagnostics</div>',
          '  <div class="troubleshoot-links">',
          '    <a href="https://developer.chrome.com/docs/modern-web-guidance" target="_blank" rel="noopener noreferrer" class="ts-link">',
          '      <span class="ts-icon">🌐</span>',
          '      <span><strong>Chrome Modern Web Guidance</strong>: Explore official Google Chrome guidelines</span>',
          '    </a>',
          '    <a href="https://pagespeed.web.dev" target="_blank" rel="noopener noreferrer" class="ts-link">',
          '      <span class="ts-icon">🚀</span>',
          '      <span><strong>PageSpeed Insights (Lighthouse)</strong>: Audit Core Web Vitals in lab and field</span>',
          '    </a>',
          '    <a href="https://developer.chrome.com/docs/devtools/performance" target="_blank" rel="noopener noreferrer" class="ts-link">',
          '      <span class="ts-icon">🛠️</span>',
          '      <span><strong>DevTools Performance Flame Chart</strong>: Profile main thread activity</span>',
          '    </a>',
          '  </div>',
          '</div>'
        ].join("");

        inspector.classList.add("is-open");
      }

      function openTraceInventory() {
        const inv = traceData.inventory || {};
        const summary = inv.summary || {};
        const domains = inv.domains || [];
        const ports = inv.ports || [];
        const libs = inv.frameworks_libraries || [];
        const tools = inv.infrastructure_tools || [];
        const resources = inv.resource_types || [];

        document.getElementById("drawer-title").textContent = "Trace Inventory & Tech Stack";

        let html = [
          '<div class="impact-badge blocking" style="border-left-color: #38bdf8;">',
          '  <span class="badge-icon">📦</span>',
          '  <div>',
          '    <strong>NETWORK &amp; TECH STACK INVENTORY</strong>',
          '    <div class="impact-sub">Catalog of domains, ports, libraries, frameworks &amp; tools</div>',
          '  </div>',
          '</div>',

          '<div class="inventory-kpi-grid">',
          '  <div class="inventory-kpi-card">',
          '    <span class="inventory-kpi-val" style="color: #38bdf8;">' + (summary.totalDomains || domains.length) + '</span>',
          '    <span class="inventory-kpi-label">🌐 Domains &amp; Hosts</span>',
          '  </div>',
          '  <div class="inventory-kpi-card">',
          '    <span class="inventory-kpi-val" style="color: #a855f7;">' + (summary.totalPorts || ports.length) + '</span>',
          '    <span class="inventory-kpi-label">🔌 Service Ports</span>',
          '  </div>',
          '  <div class="inventory-kpi-card">',
          '    <span class="inventory-kpi-val" style="color: #10b981;">' + (summary.totalLibraries || libs.length) + '</span>',
          '    <span class="inventory-kpi-label">⚛️ Client Libs / SDKs</span>',
          '  </div>',
          '  <div class="inventory-kpi-card">',
          '    <span class="inventory-kpi-val" style="color: #f59e0b;">' + (summary.totalInfrastructure || tools.length) + '</span>',
          '    <span class="inventory-kpi-label">☁️ Cloud &amp; Infra Tools</span>',
          '  </div>',
          '</div>'
        ];

        // 1. Domains Section
        if (domains.length > 0) {
          html.push(
            '<div class="inv-group">',
            '  <div class="inv-group-header">',
            '    <span>🌐 Domains &amp; Endpoints (' + domains.length + ')</span>',
            '    <span style="font-size:10px;color:#64748b;">Click to isolate</span>',
            '  </div>'
          );
          for (const d of domains) {
            const isAct = activeInventoryFilter && activeInventoryFilter.type === 'domain' && activeInventoryFilter.value === d.name;
            html.push(
              '  <div class="inv-item-row">',
              '    <div class="inv-item-info">',
              '      <span class="inv-item-name" title="' + escapeHtml(d.name) + '">' + escapeHtml(d.name) + '</span>',
              '      <span class="inv-item-meta">' + (d.isExternal ? "External Origin" : "Internal Cluster") + '</span>',
              '    </div>',
              '    <div class="inv-item-actions">',
              '      <span class="inv-count-chip">' + d.count + ' req' + (d.count > 1 ? 's' : '') + '</span>',
              '      <button class="inv-filter-btn ' + (isAct ? 'active' : '') + '" data-filter-type="domain" data-filter-value="' + escapeHtml(d.name) + '">' + (isAct ? 'Active' : 'Filter') + '</button>',
              '    </div>',
              '  </div>'
            );
          }
          html.push('</div>');
        }

        // 2. Ports Section
        if (ports.length > 0) {
          html.push(
            '<div class="inv-group">',
            '  <div class="inv-group-header">',
            '    <span>🔌 Ports &amp; Protocols (' + ports.length + ')</span>',
            '    <span style="font-size:10px;color:#64748b;">Traffic protocol</span>',
            '  </div>'
          );
          for (const p of ports) {
            const isAct = activeInventoryFilter && activeInventoryFilter.type === 'port' && activeInventoryFilter.value === p.port;
            html.push(
              '  <div class="inv-item-row">',
              '    <div class="inv-item-info">',
              '      <span class="inv-item-name">Port ' + escapeHtml(p.port) + ' (' + escapeHtml(p.protocol) + ')</span>',
              '      <span class="inv-item-meta">' + escapeHtml(p.description || "Service port") + '</span>',
              '    </div>',
              '    <div class="inv-item-actions">',
              '      <span class="inv-count-chip">' + p.count + ' req' + (p.count > 1 ? 's' : '') + '</span>',
              '      <button class="inv-filter-btn ' + (isAct ? 'active' : '') + '" data-filter-type="port" data-filter-value="' + escapeHtml(p.port) + '">' + (isAct ? 'Active' : 'Filter') + '</button>',
              '    </div>',
              '  </div>'
            );
          }
          html.push('</div>');
        }

        // 3. Frameworks & Libraries Section
        if (libs.length > 0) {
          html.push(
            '<div class="inv-group">',
            '  <div class="inv-group-header">',
            '    <span>⚛️ Frameworks &amp; Client SDKs (' + libs.length + ')</span>',
            '    <span style="font-size:10px;color:#64748b;">Detected SDKs</span>',
            '  </div>'
          );
          for (const l of libs) {
            const isAct = activeInventoryFilter && activeInventoryFilter.type === 'tech' && activeInventoryFilter.value === l.name;
            html.push(
              '  <div class="inv-item-row">',
              '    <div class="inv-item-info">',
              '      <span class="inv-item-name">' + escapeHtml(l.name) + '</span>',
              '      <span class="inv-item-meta">' + escapeHtml(l.category || "Client Library") + '</span>',
              '    </div>',
              '    <div class="inv-item-actions">',
              '      <span class="inv-count-chip">' + l.count + ' req' + (l.count > 1 ? 's' : '') + '</span>',
              '      <button class="inv-filter-btn ' + (isAct ? 'active' : '') + '" data-filter-type="tech" data-filter-value="' + escapeHtml(l.name) + '">' + (isAct ? 'Active' : 'Filter') + '</button>',
              '    </div>',
              '  </div>'
            );
          }
          html.push('</div>');
        }

        // 4. Infrastructure & Server Tools Section
        if (tools.length > 0) {
          html.push(
            '<div class="inv-group">',
            '  <div class="inv-group-header">',
            '    <span>☁️ Infrastructure &amp; Cloud Tools (' + tools.length + ')</span>',
            '    <span style="font-size:10px;color:#64748b;">Services &amp; proxies</span>',
            '  </div>'
          );
          for (const t of tools) {
            const isAct = activeInventoryFilter && activeInventoryFilter.type === 'tech' && activeInventoryFilter.value === t.name;
            html.push(
              '  <div class="inv-item-row">',
              '    <div class="inv-item-info">',
              '      <span class="inv-item-name">' + escapeHtml(t.name) + '</span>',
              '      <span class="inv-item-meta">' + escapeHtml(t.category || "Infrastructure") + '</span>',
              '    </div>',
              '    <div class="inv-item-actions">',
              '      <span class="inv-count-chip">' + t.count + ' req' + (t.count > 1 ? 's' : '') + '</span>',
              '      <button class="inv-filter-btn ' + (isAct ? 'active' : '') + '" data-filter-type="tech" data-filter-value="' + escapeHtml(t.name) + '">' + (isAct ? 'Active' : 'Filter') + '</button>',
              '    </div>',
              '  </div>'
            );
          }
          html.push('</div>');
        }

        // 5. Resource Types Section
        if (resources.length > 0) {
          html.push(
            '<div class="inv-group">',
            '  <div class="inv-group-header">',
            '    <span>📊 Resource &amp; Media Types (' + resources.length + ')</span>',
            '    <span style="font-size:10px;color:#64748b;">Content classification</span>',
            '  </div>'
          );
          for (const r of resources) {
            const isAct = activeInventoryFilter && activeInventoryFilter.type === 'resource' && activeInventoryFilter.value === r.type;
            html.push(
              '  <div class="inv-item-row">',
              '    <div class="inv-item-info">',
              '      <span class="inv-item-name">' + escapeHtml(r.type) + '</span>',
              '      <span class="inv-item-meta">Payload category</span>',
              '    </div>',
              '    <div class="inv-item-actions">',
              '      <span class="inv-count-chip">' + r.count + ' req' + (r.count > 1 ? 's' : '') + '</span>',
              '      <button class="inv-filter-btn ' + (isAct ? 'active' : '') + '" data-filter-type="resource" data-filter-value="' + escapeHtml(r.type) + '">' + (isAct ? 'Active' : 'Filter') + '</button>',
              '    </div>',
              '  </div>'
            );
          }
          html.push('</div>');
        }

        drawerBody.innerHTML = html.join("");
        inspector.classList.add("is-open");
      }

      // Filter state & handlers
      let activeInventoryFilter = null;
      const activeFilterBar = document.getElementById("active-filter-bar");
      const activeFilterTag = document.getElementById("active-filter-tag");
      const activeFilterCount = document.getElementById("active-filter-count");
      const btnClearFilter = document.getElementById("btn-clear-filter");
      const btnToggleInventory = document.getElementById("btn-toggle-inventory");
      const inventoryBadge = document.getElementById("inventory-badge");

      if (traceData.inventory && traceData.inventory.summary) {
        const totalItems = (traceData.inventory.summary.totalTechnologies || 0) + (traceData.inventory.summary.totalDomains || 0);
        if (inventoryBadge && totalItems > 0) {
          inventoryBadge.textContent = "(" + totalItems + ")";
        }
      }

      window.applyInventoryFilter = function(type, value, displayName) {
        if (activeInventoryFilter && activeInventoryFilter.type === type && activeInventoryFilter.value === value) {
          window.clearInventoryFilter();
          return;
        }

        activeInventoryFilter = {
          type: type,
          value: value,
          displayName: displayName || (type === "domain" ? "Domain: " + value : (type === "port" ? "Port " + value : value))
        };

        executeFiltering();
        if (inspector.classList.contains("is-open") && document.getElementById("drawer-title").textContent.includes("Inventory")) {
          openTraceInventory();
        }
      };

      window.clearInventoryFilter = function() {
        activeInventoryFilter = null;
        filterInput.value = "";
        executeFiltering();
        if (inspector.classList.contains("is-open") && document.getElementById("drawer-title").textContent.includes("Inventory")) {
          openTraceInventory();
        }
      };

      if (btnClearFilter) {
        btnClearFilter.addEventListener("click", window.clearInventoryFilter);
      }

      if (btnToggleInventory) {
        btnToggleInventory.addEventListener("click", function() {
          const isOpen = inspector.classList.contains("is-open");
          const isInvOpen = isOpen && document.getElementById("drawer-title").textContent.includes("Inventory");
          if (isInvOpen) {
            inspector.classList.remove("is-open");
            btnToggleInventory.classList.remove("active");
          } else {
            openTraceInventory();
            btnToggleInventory.classList.add("active");
            btnToggleInsights.classList.remove("active");
          }
        });
      }

      drawerClose.addEventListener("click", function() {
        inspector.classList.remove("is-open");
        btnToggleInsights.classList.remove("active");
        if (btnToggleInventory) btnToggleInventory.classList.remove("active");
      });

      drawerBody.addEventListener("click", function(e) {
        const btn = e.target.closest("[data-filter-type]");
        if (btn) {
          const type = btn.getAttribute("data-filter-type");
          const val = btn.getAttribute("data-filter-value");
          if (type && val) {
            window.applyInventoryFilter(type, val);
          }
        }
      });

      function executeFiltering() {
        const query = filterInput.value.trim().toLowerCase();
        const hasFilter = Boolean(query || activeInventoryFilter);

        if (!hasFilter) {
          clearHighlights();
          routes.forEach(r => r.style.opacity = "");
          if (activeFilterBar) activeFilterBar.style.display = "none";
          return;
        }

        let matchCount = 0;
        routes.forEach(r => {
          let matches = true;

          if (activeInventoryFilter) {
            const type = activeInventoryFilter.type;
            const valLower = activeInventoryFilter.value.toLowerCase();
            if (type === "domain") {
              const d = (r.getAttribute("data-domain") || "").toLowerCase();
              matches = d === valLower || d.includes(valLower);
            } else if (type === "port") {
              const p = (r.getAttribute("data-port") || "").toLowerCase();
              matches = p === valLower;
            } else if (type === "tech") {
              const t = (r.getAttribute("data-tech") || "").toLowerCase();
              matches = t.includes(valLower);
            } else if (type === "resource") {
              const rt = (r.getAttribute("data-resource-type") || "").toLowerCase();
              matches = rt.includes(valLower);
            }
          }

          if (matches && query) {
            const label = (r.getAttribute("data-label") || "").toLowerCase();
            const detail = (r.getAttribute("data-detail") || "").toLowerCase();
            const from = (r.getAttribute("data-from") || "").toLowerCase();
            const to = (r.getAttribute("data-to") || "").toLowerCase();
            const domain = (r.getAttribute("data-domain") || "").toLowerCase();
            const tech = (r.getAttribute("data-tech") || "").toLowerCase();
            matches = label.includes(query) || detail.includes(query) || from.includes(query) || to.includes(query) || domain.includes(query) || tech.includes(query);
          }

          if (matches) {
            matchCount++;
            r.style.opacity = "1";
            const line = r.querySelector(".route-line");
            if (line) line.style.strokeWidth = "3px";
          } else {
            r.style.opacity = "0.08";
            const line = r.querySelector(".route-line");
            if (line) line.style.strokeWidth = "";
          }
        });

        if (activeFilterBar) {
          activeFilterBar.style.display = "flex";
          if (activeInventoryFilter) {
            activeFilterTag.textContent = "Filtered: " + activeInventoryFilter.displayName;
          } else {
            activeFilterTag.textContent = "Filtered: '" + query + "'";
          }
          activeFilterCount.textContent = "(" + matchCount + " matching)";
        }
      }

      filterInput.addEventListener("input", executeFiltering);

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
