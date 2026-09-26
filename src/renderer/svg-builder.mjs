/**
 * SocketMap SVG Layout Engine
 * Calculates geometry, lifelines, activation blocks, directed message arrows,
 * phase boundaries, glow filters, and renders semantic SVG elements.
 */

import { formatDuration, formatBytes } from "../normalizer.mjs";

const ROLE_ICONS = {
  client: `
    <rect x="2" y="3" width="16" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M0 17h20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  `,
  dns: `
    <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M2 10h16M10 2a12 12 0 0 1 0 16M10 2a12 12 0 0 0 0 16" fill="none" stroke="currentColor" stroke-width="1.5"/>
  `,
  gateway: `
    <path d="M10 2l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V5l7-3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M7 10l2.5 2.5L13 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  auth: `
    <rect x="3" y="8" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M6 8V5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="10" cy="13" r="1.5" fill="currentColor"/>
  `,
  service: `
    <rect x="2" y="3" width="16" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <rect x="2" y="9" width="16" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <rect x="2" y="15" width="16" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="5" cy="5" r="1" fill="currentColor"/>
    <circle cx="5" cy="11" r="1" fill="currentColor"/>
    <circle cx="5" cy="17" r="1" fill="currentColor"/>
  `,
  database: `
    <ellipse cx="10" cy="4.5" rx="7" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M3 4.5v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-11" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M3 10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  `,
  worker: `
    <circle cx="10" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M10 2v2m0 12v2M2 10h2m12 0h2m-2.6-5.4l-1.4 1.4M6 14l-1.4 1.4m11.4 0l-1.4-1.4M6 6L4.6 4.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  `
};

function getRoleIconSvg(role) {
  const normalized = String(role).toLowerCase();
  for (const [key, svg] of Object.entries(ROLE_ICONS)) {
    if (normalized.includes(key)) return svg;
  }
  return ROLE_ICONS.service;
}

/**
 * Maps message kind to visual stroke style, color, and marker ID.
 */
export function getMessageStyle(kind, customColor = null) {
  const k = String(kind).toLowerCase();
  switch (k) {
    case "return":
    case "reply":
      return {
        color: customColor || "#94a3b8",
        dasharray: "6 4",
        strokeWidth: 1.75,
        markerId: "arrow-gray",
        arrowSymbol: "←"
      };
    case "security":
    case "auth":
      return {
        color: customColor || "#f43f5e",
        dasharray: "none",
        strokeWidth: 2,
        markerId: "arrow-crimson",
        arrowSymbol: "→"
      };
    case "async":
    case "worker":
      return {
        color: customColor || "#a855f7",
        dasharray: "5 4",
        strokeWidth: 1.75,
        markerId: "arrow-purple",
        arrowSymbol: "⇢"
      };
    case "retry":
    case "fallback":
      return {
        color: customColor || "#f59e0b",
        dasharray: "none",
        strokeWidth: 2,
        markerId: "arrow-amber",
        arrowSymbol: "↺"
      };
    case "request":
    case "sync":
    default:
      return {
        color: customColor || "#06b6d4",
        dasharray: "none",
        strokeWidth: 2,
        markerId: "arrow-cyan",
        arrowSymbol: "→"
      };
  }
}

/**
 * Computes layout dimensions, coordinates, and builds the full SVG.
 */
export function buildTraceSvg(trace) {
  const participants = trace.participants || [];
  const messages = trace.messages || [];
  const phases = trace.phases || ["Phase 01: Execution"];

  const participantCount = Math.max(1, participants.length);

  // Horizontal Geometry
  const cardWidth = 164;
  const cardHeight = 64;
  const colWidth = Math.max(200, Math.floor(1300 / participantCount));
  const startX = 120;
  const width = Math.max(1320, startX * 2 + (participantCount - 1) * colWidth);

  // Map participant ID to X coordinate
  const participantMap = new Map();
  participants.forEach((p, idx) => {
    const x = startX + idx * colWidth;
    participantMap.set(p.id, {
      ...p,
      index: idx,
      x
    });
  });

  // Vertical Geometry
  const headerY = 70;
  const cardTopY = headerY;
  const lifelineStartY = cardTopY + cardHeight;

  let currentY = lifelineStartY + 50;
  let currentPhase = -1;

  const phaseRegions = [];
  const renderedMessages = [];
  const activationSpans = new Map(); // participantId -> Array<{ startY, endY }>

  // Helper to register activation span
  const addActivation = (pId, yStart, yEnd) => {
    if (!activationSpans.has(pId)) activationSpans.set(pId, []);
    activationSpans.get(pId).push({ startY: yStart, endY: yEnd });
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const msgPhase = typeof msg.phase === "number" ? msg.phase : 0;

    // Check if entering new phase
    if (msgPhase !== currentPhase) {
      currentPhase = msgPhase;
      const phaseTitle = phases[currentPhase] || `Phase 0${currentPhase + 1}`;
      phaseRegions.push({
        phaseIndex: currentPhase,
        title: phaseTitle,
        y: currentY
      });
      currentY += 55;
    }

    const fromNode = participantMap.get(msg.from) || { x: startX, color: "#06b6d4" };
    const toNode = participantMap.get(msg.to) || fromNode;

    const isSelfLoop = msg.isLoop || msg.from === msg.to;
    const msgY = currentY;

    renderedMessages.push({
      ...msg,
      y: msgY,
      fromX: fromNode.x,
      toX: toNode.x,
      fromNode,
      toNode,
      isSelfLoop
    });

    // Record activation span
    const activationPad = isSelfLoop ? 18 : 14;
    addActivation(msg.from, msgY - activationPad, msgY + activationPad);
    if (!isSelfLoop) {
      addActivation(msg.to, msgY - activationPad, msgY + activationPad);
    }

    currentY += isSelfLoop ? 68 : 56;
  }

  // Merge overlapping activation spans for each participant
  const mergedActivations = [];
  for (const [pId, spans] of activationSpans.entries()) {
    const pNode = participantMap.get(pId);
    if (!pNode || spans.length === 0) continue;

    spans.sort((a, b) => a.startY - b.startY);
    const merged = [spans[0]];

    for (let i = 1; i < spans.length; i++) {
      const last = merged[merged.length - 1];
      const curr = spans[i];
      if (curr.startY <= last.endY + 15) {
        last.endY = Math.max(last.endY, curr.endY);
      } else {
        merged.push(curr);
      }
    }

    for (const span of merged) {
      mergedActivations.push({
        participantId: pId,
        color: pNode.color,
        x: pNode.x,
        y: span.startY,
        height: Math.max(24, span.endY - span.startY)
      });
    }
  }

  const lifelineEndY = currentY + 40;
  const legendY = lifelineEndY + 30;
  const totalHeight = legendY + 140;

  // Render SVG Defs
  const defs = `
    <defs>
      <!-- Subtle Grid Pattern -->
      <pattern id="grid-dots" width="32" height="32" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.2" fill="#1e293b" opacity="0.65"/>
      </pattern>

      <!-- Neon Glow Filters -->
      <filter id="glow-cyan" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="glow-emerald" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="glow-crimson" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="glow-purple" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="glow-amber" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>

      <!-- Crisp Directional Arrow Markers -->
      <marker id="arrow-cyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#06b6d4"/>
      </marker>
      <marker id="arrow-emerald" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981"/>
      </marker>
      <marker id="arrow-crimson" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e"/>
      </marker>
      <marker id="arrow-purple" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#a855f7"/>
      </marker>
      <marker id="arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b"/>
      </marker>
      <marker id="arrow-gray" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8"/>
      </marker>
    </defs>
  `;

  // Status Badge (Top-left)
  const statusBadge = `
    <g class="status-badge" transform="translate(50, 22)">
      <rect x="0" y="0" width="144" height="28" rx="14" fill="#041f18" stroke="#10b981" stroke-width="1.2"/>
      <circle cx="16" cy="14" r="4.5" fill="#10b981" filter="url(#glow-emerald)" class="pulse-dot"/>
      <text x="28" y="18" fill="#10b981" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="11" font-weight="700" letter-spacing="0.08em">LIVE ARTIFACT</text>
    </g>
    <!-- Trace Title -->
    <g class="trace-title-group" transform="translate(210, 22)">
      <text x="0" y="19" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" letter-spacing="-0.01em">${escapeXml(trace.title)}</text>
      ${trace.summary?.totalLatencyMs ? `
        <rect x="${trace.title.length * 9.5 + 15}" y="2" width="70" height="22" rx="4" fill="#1e293b" stroke="#334155"/>
        <text x="${trace.title.length * 9.5 + 24}" y="17" fill="#38bdf8" font-family="monospace" font-size="11" font-weight="600">${trace.summary.totalLatencyMs}ms</text>
      ` : ""}
    </g>
  `;

  // Lifelines (Dashed vertical lines)
  const lifelines = participants.map(p => {
    const node = participantMap.get(p.id);
    return `
      <line class="lifeline lifeline-${p.id}" x1="${node.x}" y1="${lifelineStartY}" x2="${node.x}" y2="${lifelineEndY}"
            stroke="#334155" stroke-dasharray="4 4" stroke-width="1.5" opacity="0.8"/>
    `;
  }).join("\n");

  // Participant Header Cards
  const headerCards = participants.map(p => {
    const node = participantMap.get(p.id);
    const cardX = node.x - cardWidth / 2;
    const iconSvg = getRoleIconSvg(p.role);

    // Fit long labels inside the card: shrink the font, then compress if still too wide.
    const labelRoom = cardWidth - 52;
    const estWidth = (size) => String(p.label).length * size * 0.58;
    const labelSize = estWidth(13) > labelRoom ? Math.max(10.5, labelRoom / (String(p.label).length * 0.58)) : 13;
    const labelFit = estWidth(labelSize) > labelRoom ? ` textLength="${labelRoom}" lengthAdjust="spacingAndGlyphs"` : "";

    return `
      <g class="participant-card participant-${p.id}" data-id="${p.id}" transform="translate(${cardX}, ${cardTopY})">
        <title>${escapeXml(p.label)}${p.sublabel ? ` (${escapeXml(p.sublabel)})` : ""}</title>
        <!-- Card Backdrop -->
        <rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" rx="10"
              fill="#0b1120" stroke="${p.color}" stroke-width="1.5" stroke-opacity="0.85"/>
        <!-- Top Accent Bar -->
        <path d="M 0 10 Q 0 0 10 0 L ${cardWidth - 10} 0 Q ${cardWidth} 0 ${cardWidth} 10"
              fill="none" stroke="${p.color}" stroke-width="3"/>
        <!-- Icon Container -->
        <g transform="translate(14, 16)" color="${p.color}">
          <rect x="-4" y="-4" width="28" height="28" rx="6" fill="${p.color}" fill-opacity="0.12"/>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            ${iconSvg}
          </svg>
        </g>
        <!-- Text Labels -->
        <text x="44" y="27" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
              font-size="${labelSize.toFixed(1)}" font-weight="700" letter-spacing="-0.01em"${labelFit}>${escapeXml(p.label)}</text>
        <text x="44" y="44" fill="#94a3b8" font-family="ui-monospace, 'SF Mono', Menlo, monospace"
              font-size="10.5" font-weight="500">${escapeXml(p.sublabel)}</text>
      </g>
    `;
  }).join("\n");

  // Phase Regions & Dividers
  const phaseDividers = phaseRegions.map(pr => {
    return `
      <g class="phase-divider phase-${pr.phaseIndex}" transform="translate(0, ${pr.y})">
        <line x1="50" y1="0" x2="${width - 50}" y2="0" stroke="#1e293b" stroke-dasharray="6 6" stroke-width="1.5"/>
        <rect x="50" y="-13" width="${pr.title.length * 7.5 + 24}" height="26" rx="6" fill="#0f172a" stroke="#334155" stroke-width="1"/>
        <text x="62" y="4" fill="#94a3b8" font-family="ui-monospace, 'SF Mono', Menlo, monospace"
              font-size="11" font-weight="700" letter-spacing="0.06em">${escapeXml(pr.title.toUpperCase())}</text>
      </g>
    `;
  }).join("\n");

  // Activation Bars
  const activations = mergedActivations.map((act, idx) => {
    return `
      <rect class="activation-bar act-${act.participantId}" data-participant="${act.participantId}"
            x="${act.x - 7}" y="${act.y}" width="14" height="${act.height}" rx="7"
            fill="${act.color}" fill-opacity="0.35" stroke="${act.color}" stroke-width="1.5"
            style="filter: drop-shadow(0 0 6px ${act.color}88);"/>
    `;
  }).join("\n");

  // Directed Message Arrows
  const arrowElements = renderedMessages.map(msg => {
    const style = getMessageStyle(msg.kind);
    const actHalf = 7;

    let pathD = "";
    let labelX = 0;
    let labelY = msg.y - 8;
    let textAnchor = "middle";

    if (msg.isSelfLoop) {
      // Curved bezier self-loop
      const startX = msg.fromX + actHalf;
      const loopWidth = 48;
      const loopHeight = 32;
      pathD = `M ${startX} ${msg.y - 6} C ${startX + loopWidth} ${msg.y - 20}, ${startX + loopWidth} ${msg.y + loopHeight}, ${startX + 3} ${msg.y + 14}`;
      labelX = startX + loopWidth + 10;
      labelY = msg.y + 4;
      textAnchor = "start";
    } else {
      // Horizontal directed arrow
      const isForward = msg.toX > msg.fromX;
      const x1 = isForward ? msg.fromX + actHalf : msg.fromX - actHalf;
      const x2 = isForward ? msg.toX - actHalf : msg.toX + actHalf;
      pathD = `M ${x1} ${msg.y} L ${x2} ${msg.y}`;
      labelX = (x1 + x2) / 2;
    }

    const isBlocking = Boolean(msg.isBlocking);
    const blockingBadge = isBlocking ? "⚡ " : "";
    const latencyText = msg.latencyMs != null ? ` (${formatDuration(msg.latencyMs)})` : "";
    const fullLabel = `${blockingBadge}${msg.label}${latencyText}`;

    return `
      <g class="message-route ${isBlocking ? "is-blocking" : "is-non-blocking"}" id="${msg.id}"
         data-from="${msg.from}" data-to="${msg.to}" data-kind="${msg.kind}"
         data-label="${escapeXml(msg.label)}" data-detail="${escapeXml(msg.detail || "")}"
         data-latency="${msg.latencyMs || ""}" data-status="${msg.status || ""}"
         data-method="${msg.method || ""}" data-bytes="${msg.bytes || ""}"
         data-phase="${msg.phase}"
         data-blocking="${isBlocking}"
         data-blocking-reason="${escapeXml(msg.blockingReason || "")}"
         data-category="${escapeXml(msg.recommendationCategory || "")}"
         data-domain="${escapeXml(msg.domain || "")}"
         data-port="${escapeXml(msg.port || "")}"
         data-tech="${escapeXml((msg.technologies || []).join(","))}"
         data-resource-type="${escapeXml(msg.resourceType || "")}">
        <!-- Invisible thick hover hit target -->
        <path d="${pathD}" fill="none" stroke="transparent" stroke-width="18" class="route-hitbox"/>
        <!-- Visual Arrow Line -->
        <path d="${pathD}" fill="none" stroke="${style.color}" stroke-width="${style.strokeWidth}"
              stroke-dasharray="${style.dasharray}" marker-end="url(#${style.markerId})" class="route-line"/>
        <!-- Label Badge & Text -->
        <g class="route-label-group" transform="translate(${labelX}, ${labelY})">
          <text class="route-label-text" x="0" y="0" text-anchor="${textAnchor}" fill="#e2e8f0"
                font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="11.5" font-weight="600"
                paint-order="stroke" stroke="#070b12" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
            ${escapeXml(fullLabel)}
          </text>
        </g>
      </g>
    `;
  }).join("\n");

  // Bottom Legend
  const legend = `
    <g class="trace-legend" transform="translate(50, ${legendY})">
      <rect x="0" y="0" width="${width - 100}" height="84" rx="10" fill="#0b1120" stroke="#1e293b" stroke-width="1.2"/>
      <text x="24" y="26" fill="#94a3b8" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="11" font-weight="700" letter-spacing="0.08em">INTERACTION LEGEND</text>

      <!-- Legend Items -->
      <g transform="translate(24, 44)">
        <!-- Request -->
        <g transform="translate(0, 0)">
          <line x1="0" y1="10" x2="36" y2="10" stroke="#06b6d4" stroke-width="2" marker-end="url(#arrow-cyan)"/>
          <text x="46" y="14" fill="#cbd5e1" font-family="monospace" font-size="11.5">Request / Sync</text>
        </g>

        <!-- Response -->
        <g transform="translate(180, 0)">
          <line x1="0" y1="10" x2="36" y2="10" stroke="#94a3b8" stroke-width="1.75" stroke-dasharray="6 4" marker-end="url(#arrow-gray)"/>
          <text x="46" y="14" fill="#cbd5e1" font-family="monospace" font-size="11.5">Response / Return</text>
        </g>

        <!-- Security / Auth -->
        <g transform="translate(370, 0)">
          <line x1="0" y1="10" x2="36" y2="10" stroke="#f43f5e" stroke-width="2" marker-end="url(#arrow-crimson)"/>
          <text x="46" y="14" fill="#cbd5e1" font-family="monospace" font-size="11.5">Security / Auth</text>
        </g>

        <!-- Async Trace -->
        <g transform="translate(540, 0)">
          <line x1="0" y1="10" x2="36" y2="10" stroke="#a855f7" stroke-width="1.75" stroke-dasharray="5 4" marker-end="url(#arrow-purple)"/>
          <text x="46" y="14" fill="#cbd5e1" font-family="monospace" font-size="11.5">Async / Queue</text>
        </g>

        <!-- Retry / Fallback -->
        <g transform="translate(710, 0)">
          <path d="M 0 16 C 10 4, 25 4, 32 12" fill="none" stroke="#f59e0b" stroke-width="2" marker-end="url(#arrow-amber)"/>
          <text x="46" y="14" fill="#cbd5e1" font-family="monospace" font-size="11.5">Retry / Cache</text>
        </g>

        <!-- Critical Blocking Path -->
        <g transform="translate(880, 0)">
          <text x="0" y="14" fill="#fbbf24" font-family="ui-monospace, monospace" font-size="14" font-weight="bold">⚡</text>
          <text x="18" y="14" fill="#fbbf24" font-family="monospace" font-size="11.5" font-weight="bold">Critical Path (Blocking)</text>
        </g>
      </g>
    </g>
  `;

  // Assemble full SVG
  return `
    <svg id="socketmap-svg" viewBox="0 0 ${width} ${totalHeight}" width="${width}" height="${totalHeight}"
         xmlns="http://www.w3.org/2000/svg" class="socketmap-canvas">
      ${defs}
      <!-- Dark Navy Canvas Background & Grid -->
      <rect x="0" y="0" width="${width}" height="${totalHeight}" fill="#070b12"/>
      <rect x="0" y="0" width="${width}" height="${totalHeight}" fill="url(#grid-dots)"/>

      <!-- SVG Content Layers -->
      <g id="diagram-content">
        ${statusBadge}
        ${phaseDividers}
        ${lifelines}
        ${activations}
        ${arrowElements}
        ${headerCards}
        ${legend}
      </g>
    </svg>
  `.trim();
}

function escapeXml(unsafe) {
  if (unsafe == null) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
