const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const ICONS = {
  droplets:'<path d="M7 3S3 7.5 3 10a4 4 0 0 0 8 0C11 7.5 7 3 7 3Z M17 8s-4 4.5-4 7a4 4 0 0 0 8 0c0-2.5-4-7-4-7Z"/><path d="M7 18a3 3 0 0 0 3 3"/>',
  droplet:'<path d="M12 2S5 10 5 14a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/><path d="M9 14a3 3 0 0 0 3 3"/>',
  energy:'<path d="M13.5 2 5 13h6l-.5 9L19 10h-6l.5-8Z"/>',
  waves:'<path d="M2 6c3-4 5 4 9 0s6 4 11 0 M2 12c3-4 5 4 9 0s6 4 11 0 M2 18c3-4 5 4 9 0s6 4 11 0"/>',
  leaf:'<path d="M20 3C9 2 3 8 5 15c2 6 13 5 15-12Z M4 21l11-12 M9 15l-1-4 M12 12l5 1"/>',
  plant:'<path d="M3 21V9l6 3V5l6 5V2h4v19 M1 21h22 M6 15v2 M11 15v2 M16 15v2"/>',
  pump:'<rect x="2" y="8" width="9" height="10" rx="2"/><circle cx="16" cy="13" r="5"/><path d="M14 8V4h4v4 M21 12h2v3h-2 M4 11v4 M7 11v4 M2 21h20 M5 18v3 M16 18v3"/>',
  pool:'<path d="M3 6h18v14H3Z M3 14c3-3 5 3 9 0s6 3 9 0 M7 3v7 M11 3v7 M7 5h4 M7 8h4"/>',
  filter:'<path d="M3 4h18l-7 9v7l-4-2v-5L3 4Z M7 7h10"/>',
  flask:'<path d="M8 3h8 M10 3v7l-6 9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2l-6-9V3 M7 15h10 M10 18h1"/>',
  activity:'<path d="M2 12h4l3-8 5 16 3-8h5"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z M10 21h4 M12 2v1"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  arrow:'<path d="M3 12h17 M14 6l6 6-6 6"/>',
  inflow:'<path d="M8 3h8v9h4l-8 9-8-9h4V3Z"/>',
  outflow:'<path d="M8 21h8v-9h4l-8-9-8 9h4v9Z"/>',
  gauge:'<circle cx="12" cy="11" r="8"/><path d="m12 11 4-4 M9 22h6 M12 19v3 M5 11h1 M18 11h1 M12 4v1"/><circle cx="12" cy="11" r="1"/>',
  tag:'<path d="M3 3h8l10 10-8 8L3 11V3Z"/><circle cx="7" cy="7" r="1"/>',
  plus:'<path d="M12 4v16 M4 12h16"/>',minus:'<path d="M4 12h16"/>',
  reset:'<path d="M4 9a8 8 0 1 1 0 7 M4 3v6h6"/>',
  expand:'<path d="M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5"/>',
  cube:'<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z M3 7l9 5 9-5 M12 12v10 M7 4.8l10 5.6"/>',
  plan:'<path d="M3 3h18v18H3Z M3 10h7V3 M10 10v11 M10 15h11 M14 7h3 M17 5v4"/>',
  network:'<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5 M5 17v-5h14v5"/>',
  file:'<path d="M5 2h9l5 5v15H5V2Z M14 2v6h5 M8 12h8 M8 16h8 M8 19h4"/>',
  sliders:'<path d="M5 3v6 M5 13v8 M12 3v11 M12 18v3 M19 3v3 M19 10v11 M2 9h6v4H2Z M9 14h6v4H9Z M16 6h6v4h-6Z"/>',
  pause:'<path d="M8 5v14 M16 5v14" stroke-width="3"/>',
  play:'<path d="m8 4 12 8-12 8V4Z"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5 M12 17v.1"/>',
  close:'<path d="m6 6 12 12 M6 18 18 6"/>'
};

export function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.cube}</svg>`; }

export function fillIcons(root = document) { $$('[data-icon]', root).forEach(el => {el.innerHTML = icon(el.dataset.icon);}); }
