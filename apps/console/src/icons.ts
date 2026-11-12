/**
 * Einheitliches Linien-Icon-Set (24er Raster, 1,7 px Strich, runde Enden) – eigene, schlichte Formen,
 * keine externen Bibliotheken, keine KI-/Roboter-/Glitzer-Motive (Design-Abnahme UI-07).
 */
const PATHS = {
  infinity: '<path d="M7.5 8.5c-2 0-3.5 1.5-3.5 3.5s1.5 3.5 3.5 3.5c3 0 6-7 9-7 2 0 3.5 1.5 3.5 3.5s-1.5 3.5-3.5 3.5c-3 0-6-7-9-7Z"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1.5C3 15.5 5.5 13.5 9 13.5s6 2 6 5V20M16 4.8a3.2 3.2 0 0 1 0 6.2M18 14c2.3.6 3 2.3 3 4.2V20"/>',
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/>',
  package: '<path d="m12 2.8 8.5 4.7v9L12 21.2l-8.5-4.7v-9Z"/><path d="m3.6 7.6 8.4 4.7 8.4-4.7M12 12.3v8.9"/>',
  wallet: '<path d="M4.5 6h14A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5V7.5A1.5 1.5 0 0 1 4.5 6Zm0 0 11-2.7a1.5 1.5 0 0 1 1.9 1.4V6"/><path d="M16 13h2.5"/>',
  chart: '<path d="M3.5 3.5v17h17"/><path d="M8 16v-5M12.5 16V7M17 16v-8"/>',
  bank: '<path d="m3 9.5 9-5.5 9 5.5M4 10h16M6 10v8M10 10v8M14 10v8M18 10v8M3 20.5h18"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.3 2.6 2.6 4.8-5.2"/>',
  alert: '<path d="M12 3.5 21 19.5H3Z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  doc: '<path d="M6 3h8l4.5 4.5V21H6Z"/><path d="M14 3v4.5h4.5M9 12.5h6M9 16h5"/>',
  arrow: '<path d="M4.5 12h15m-6-6 6 6-6 6"/>',
  pause: '<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  receipt: '<path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.4Z"/><path d="M9 8h6M9 11.5h6M9 15h4"/>',
  inbox: '<path d="M3.5 13 6 5.5h12l2.5 7.5v5A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z"/><path d="M3.5 13H8l1.5 2.5h5L16 13h4.5"/>',
  send: '<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4Z"/>',
  refresh: '<path d="M19.5 8.5A8 8 0 0 0 5.6 6.4L4 8M4 4v4h4M4.5 15.5a8 8 0 0 0 13.9 2.1L20 16m0 4v-4h-4"/>',
  shield: '<path d="M12 3 19.5 6v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6Z"/><path d="m9 12 2 2 4-4"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  logout: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16.5 5.5 12 10 7.5M5.5 12H16"/>',
  list: '<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01"/>',
  download: '<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M4.5 19.5h15"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, cls = ''): string {
  return `<svg class="ico${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[];
