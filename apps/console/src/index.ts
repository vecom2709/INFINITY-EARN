import type { AppContext } from '../../../services/core-api/src/context.ts';
import { renderCustomers } from './pages/customers.ts';
import { renderFinance } from './pages/finance.ts';
import { renderOrderDetail, renderOrders } from './pages/orders.ts';
import { renderOverview } from './pages/overview.ts';
import { renderProducts } from './pages/products.ts';
import { renderPreviewDetail, renderPreviewGallery } from './pages/preview.ts';
import { renderReports } from './pages/reports.ts';
import { renderActivities, renderSettings } from './pages/settings.ts';
import { modeFrom, type PageCtx } from './pages/types.ts';

export { statusReport } from './status-report.ts';

/**
 * Business-Konsole (Eigentümer). Liefert HTML für /dashboard/* oder null (→ 404).
 * Zugriffsschutz (Owner-Session) und CSRF prüft der aufrufende Router.
 */
export function renderConsole(ctx: AppContext, path: string, query: URLSearchParams, csrf: string, flash?: string): string | null {
  const pc: PageCtx = { ctx, csrf, mode: modeFrom(query), path, flash };
  const sub = path.replace(/^\/dashboard\/?/, '');
  if (sub === '') return renderOverview(pc);
  if (sub === 'kunden') return renderCustomers(pc);
  if (sub === 'auftraege') return renderOrders(pc, query.get('phase'));
  const order = /^auftraege\/(ord_[a-f0-9]+)$/.exec(sub);
  if (order?.[1]) return renderOrderDetail(pc, order[1]);
  if (sub === 'produkte') return renderProducts(pc);
  if (sub === 'produkte/vorschau') return renderPreviewGallery(pc, query.get('q') ?? '');
  const art = /^produkte\/vorschau\/(art_[a-f0-9]+)$/.exec(sub);
  if (art?.[1]) return renderPreviewDetail(pc, art[1]);
  if (sub === 'finanzen') return renderFinance(pc);
  if (sub === 'berichte') return renderReports(pc, query.get('stand'));
  if (sub === 'einstellungen') return renderSettings(pc);
  if (sub === 'aktivitaeten') return renderActivities(pc);
  return null;
}

/** Sichere Rücksprungadresse nach Owner-Aktionen: nur interne Konsolen-Pfade. */
export function safeBack(raw: string | null | undefined): string {
  if (!raw) return '/dashboard';
  if (!/^\/dashboard(\/[a-z0-9_/-]*)?(\?[a-z0-9=&_-]*)?(#[a-z0-9-]*)?$/i.test(raw) || raw.includes('//')) return '/dashboard';
  return raw;
}

/** Hängt eine Meldung an eine (bereits geprüfte) Rücksprungadresse – Anker bleibt am Ende. */
export function withFlash(back: string, msg: string): string {
  const [base = '/dashboard', hash] = back.split('#');
  return `${base}${base.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}${hash ? `#${hash}` : ''}`;
}
