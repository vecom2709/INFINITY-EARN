import { backupFile, csvFile, handle, importCsv, initialState, restoreFrom, type AppState, type Form } from './actions.ts';
import type { Setup } from '../src/setup.ts';
import { brandColors, safeLogo, type Brand } from './brand.ts';
import { tr } from './i18n.ts';
import { css } from './styles.ts';
import { renderApp } from './view.ts';

/**
 * Browser-Anbindung des Offline-Programms: Daten im Browser-Speicher, Formulare → Aktionen, Dateien laden/speichern,
 * Drucken. Keine Netzwerkzugriffe – das Programm läuft vollständig offline.
 */
/** setup: Einrichtung aus dem Auftrag (Erststart). seed: nur für Anleitungsbilder und Demo – nie in einer Kundenauslieferung. */
interface Config { brand: Brand; demo: boolean; setup?: Setup; seed?: AppState }

const cfgEl = document.getElementById('mini-ww-config');
const cfg = JSON.parse(cfgEl?.textContent ?? '{}') as Config;
const KEY = `mini-ww:${cfg.brand.company}`;
const root = document.getElementById('app') as HTMLElement;

const style = document.createElement('style');
style.textContent = css(brandColors(cfg.brand.primary));
document.head.appendChild(style);
document.documentElement.lang = cfg.brand.lang;

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* Speicher nicht verfügbar: mit leerem Bestand starten */
  }
  return cfg.seed ?? initialState(cfg.brand.company, cfg.brand.lang, cfg.setup);
}

let state = load();
let flash: { kind: string; text: string } | undefined;
const query: Record<string, string> = {};

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    flash = { kind: 'error', text: 'Speichern im Browser fehlgeschlagen – bitte sofort eine Sicherung herunterladen.' };
  }
}

function token(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function render(focus = false): void {
  root.innerHTML = renderApp(state, location.hash || '#/', query, new Date().toISOString().slice(0, 10), token(), flash);
  const logo = safeLogo(cfg.brand.logoDataUrl);
  const slot = root.querySelector('.logo');
  if (logo && slot) slot.outerHTML = `<img class="logo" src="${logo}" alt="">`;
  if (cfg.demo) root.insertAdjacentHTML('afterbegin', `<div class="flash ok" role="note" style="margin:0;border-radius:0">${tr(state.session.lang, 'Demo – alle Daten bleiben nur in diesem Browser.')}</div>`);
  if (focus) (root.querySelector('main') as HTMLElement | null)?.focus();
  flash = undefined;
}

function formData(f: HTMLFormElement): Form {
  const out: Form = {};
  new FormData(f).forEach((v, k) => {
    if (typeof v === 'string') out[k] = v;
  });
  return out;
}

function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readFile(id: string): Promise<string | null> {
  const input = document.getElementById(id) as HTMLInputElement | null;
  const file = input?.files?.[0];
  return file ? file.text() : null;
}

root.addEventListener('submit', (ev) => {
  const f = ev.target as HTMLFormElement;
  if (f.dataset.clientSearch) {
    ev.preventDefault();
    Object.assign(query, formData(f));
    render();
    return;
  }
  const action = f.dataset.action;
  if (!action) return;
  ev.preventDefault();
  const r = handle(state, action, formData(f), new Date());
  state = r.state;
  flash = r.flash;
  save();
  if (r.route && location.hash !== r.route) location.hash = r.route;
  else render(true);
});

root.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-client]');
  if (!btn) return;
  const kind = btn.dataset.client;
  void (async () => {
    if (kind === 'print') window.print();
    else if (kind === 'backup.download') {
      const b = backupFile(state, new Date());
      download(b.name, b.content, 'application/json');
      state = b.state;
      flash = { kind: 'ok', text: 'OK' };
      save();
      render();
    } else if (kind === 'backup.restore') {
      const text = await readFile('restore');
      if (text === null) return;
      if (!confirm('Alle Daten in diesem Browser ersetzen?')) return;
      const r = restoreFrom(state, text);
      state = r.state;
      flash = r.flash;
      save();
      render(true);
    } else if (kind === 'csv.export') {
      const f = csvFile(state, btn.dataset.kind ?? 'articles');
      download(f.name, f.content, 'text/csv;charset=utf-8');
    } else if (kind === 'csv.import') {
      const text = await readFile('csvfile');
      if (text === null) return;
      const r = importCsv(state, (document.getElementById('csvkind') as HTMLSelectElement | null)?.value ?? 'articles', text, new Date());
      state = r.state;
      flash = r.flash;
      save();
      render(true);
    }
  })();
});

window.addEventListener('hashchange', () => render(true));
render();
