import type { AppState } from './ui/actions.ts';

/** Abbildungen der Bedienungsanleitung: je Arbeitsablauf eine Seite des echten Programms. */
export const SHOT_NAMES = ['uebersicht', 'artikel', 'kunden', 'angebote', 'auftraege', 'rechnungen', 'beleg', 'berichte', 'daten', 'einstellungen'] as const;
export type ShotName = (typeof SHOT_NAMES)[number];

export const SHOT_ROUTES: Record<ShotName, (seed: AppState) => string> = {
  uebersicht: () => '#/',
  artikel: () => '#/artikel',
  kunden: () => '#/kunden',
  angebote: () => '#/angebote',
  auftraege: () => '#/auftraege',
  rechnungen: () => '#/rechnungen',
  beleg: (s) => `#/beleg/${s.store.invoices[0]?.id ?? ''}`,
  berichte: () => '#/berichte',
  daten: () => '#/daten',
  einstellungen: () => '#/einstellungen',
};
