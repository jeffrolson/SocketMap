function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

// Controls are trusted renderer markup; capture-derived text must be escaped by its caller.
export function renderPageHeader({ title, subtitle = "", controls = "", status = "", className = "" }) {
  return `<header class="page-header ${escapeText(className)}"><div class="page-heading"><h1 class="page-title">${escapeText(title)}</h1>${subtitle ? `<span class="page-subtitle">${escapeText(subtitle)}</span>` : ""}</div><div class="page-controls">${status ? `<span class="page-status">${escapeText(status)}</span>` : ""}${controls}</div></header>`;
}

export const PAGE_HEADER_CSS = `
  .page-header { box-sizing: border-box; display: flex; align-items: center; gap: 12px; height: 64px; min-height: 64px; padding: 8px 16px; background: var(--surface); border-bottom: 1px solid var(--border); }
  .page-heading { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  .page-header .page-title { margin: 0; padding: 0; font: 600 18px/1.25 var(--font-sans); color: var(--text); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .page-subtitle { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .page-controls { margin-left: auto; display: flex; align-items: center; gap: 8px; min-width: 0; }
  .page-status { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
  @media (max-width: 600px) {
    .page-header { height: 56px; min-height: 56px; padding: 6px 10px; gap: 8px; }
    .page-header .page-title { font-size: 15px; }
    .page-subtitle { display: none; }
    .page-controls { gap: 6px; }
  }
`;
