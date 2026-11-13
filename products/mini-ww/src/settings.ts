import { audit, type Ctx, DomainError, nextId, requirePositiveInt, requireRole, transact } from './core.ts';
import type { Role, Store, TaxRate, User } from './model.ts';

/** Benutzer und Einstellungen – nur der Inhaber. */

export function addUser(store: Store, ctx: Ctx, input: { name: string; role: Role }): { store: Store; result: User } {
  return transact(store, (s) => {
    requireRole(s, ctx, 'OWNER', 'Benutzer anlegen');
    if (!input.name.trim()) throw new DomainError('INVALID_NAME', 'Name fehlt.');
    const u: User = { id: nextId(s, 'usr'), name: input.name.trim(), role: input.role };
    s.users.push(u);
    audit(s, ctx, 'user.created', u.id, { role: u.role });
    return u;
  });
}

export function updateSettings(store: Store, ctx: Ctx, patch: { company?: string; paymentTermDays?: number; dunningDays?: [number, number, number]; taxRates?: TaxRate[] }): { store: Store; result: Store['settings'] } {
  return transact(store, (s) => {
    requireRole(s, ctx, 'OWNER', 'Einstellungen ändern');
    if (patch.company !== undefined) {
      if (!patch.company.trim()) throw new DomainError('INVALID_NAME', 'Firmenname fehlt.');
      s.settings.company = patch.company.trim();
    }
    if (patch.paymentTermDays !== undefined) {
      requirePositiveInt(patch.paymentTermDays, 'Zahlungsziel');
      s.settings.paymentTermDays = patch.paymentTermDays;
    }
    if (patch.dunningDays) {
      const [a, b, c] = patch.dunningDays;
      if (!(a > 0 && b > a && c > b)) throw new DomainError('INVALID_DUNNING', 'Mahnfristen müssen aufsteigend und größer 0 sein.');
      s.settings.dunningDays = [a, b, c];
    }
    if (patch.taxRates) {
      if (!patch.taxRates.length || patch.taxRates.some((t) => !t.id || !Number.isSafeInteger(t.bps) || t.bps < 0 || t.bps > 10000)) throw new DomainError('INVALID_TAX_RATE', 'Steuersätze ungültig.');
      const used = new Set(s.articles.map((a) => a.taxRateId));
      for (const id of used) if (!patch.taxRates.some((t) => t.id === id)) throw new DomainError('TAX_RATE_IN_USE', `Steuersatz ${id} wird von Artikeln verwendet.`);
      s.settings.taxRates = patch.taxRates.map((t) => ({ ...t }));
    }
    audit(s, ctx, 'settings.updated', 'settings', patch as Record<string, unknown>);
    return s.settings;
  });
}
