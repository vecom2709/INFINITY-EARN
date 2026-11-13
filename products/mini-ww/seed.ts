import { handle, initialState, type AppState, type Form } from './ui/actions.ts';
import type { Lang } from './ui/i18n.ts';

/**
 * Beispielbestand für die Abbildungen der Bedienungsanleitung. Er entsteht ausschließlich über dieselben Aktionen wie
 * die Knöpfe des Programms (keine direkt geschriebenen Werte). Firmen und Artikel sind erkennbar Beispiele.
 * Wird NIE in eine Kundenauslieferung eingebettet.
 */
const NAMES: Record<Lang, { company: string; articles: [string, string, string, string, string][]; customers: [string, string][] }> = {
  de: {
    company: 'Musterfirma (Beispiel)',
    articles: [['SCHR-10', 'Schrauben 10 mm (100 Stk.)', 'Pkg', '12,50', '7,00'], ['DUEB-8', 'Dübel 8 mm (50 Stk.)', 'Pkg', '6,90', '3,20'], ['BOHR-SET', 'Bohrer-Set Holz/Metall', 'Stk', '39,00', '21,00'], ['HAND-L', 'Arbeitshandschuhe Gr. L', 'Paar', '8,50', '3,90']],
    customers: [['Beispiel Bau GmbH', 'einkauf@beispiel-bau.example'], ['Muster Schreinerei', 'info@muster-schreinerei.example'], ['Demo Hausverwaltung', 'technik@demo-hv.example']],
  },
  it: {
    company: 'Azienda Esempio (demo)',
    articles: [['VITE-10', 'Viti 10 mm (100 pz.)', 'Conf', '12,50', '7,00'], ['TASS-8', 'Tasselli 8 mm (50 pz.)', 'Conf', '6,90', '3,20'], ['PUNTE-SET', 'Set punte legno/metallo', 'Pz', '39,00', '21,00'], ['GUANTI-L', 'Guanti da lavoro tg. L', 'Paio', '8,50', '3,90']],
    customers: [['Edilizia Esempio Srl', 'acquisti@edilizia-esempio.example'], ['Falegnameria Demo', 'info@falegnameria-demo.example'], ['Condominio Prova', 'tecnico@condominio-prova.example']],
  },
  en: {
    company: 'Example Company (demo)',
    articles: [['SCREW-10', 'Screws 10 mm (pack of 100)', 'Pack', '12,50', '7,00'], ['PLUG-8', 'Wall plugs 8 mm (pack of 50)', 'Pack', '6,90', '3,20'], ['DRILL-SET', 'Drill bit set wood/metal', 'Pc', '39,00', '21,00'], ['GLOVE-L', 'Work gloves size L', 'Pair', '8,50', '3,90']],
    customers: [['Example Builders Ltd', 'purchasing@example-builders.example'], ['Sample Joinery', 'info@sample-joinery.example'], ['Demo Property Services', 'tech@demo-property.example']],
  },
};

export function manualSeed(lang: Lang, now: Date): AppState {
  const n = NAMES[lang];
  let st = initialState(n.company, lang);
  const run = (action: string, form: Form): void => {
    const r = handle(st, action, form, now);
    if (r.flash.kind !== 'ok') throw new Error(`Beispielbestand: ${action} fehlgeschlagen: ${r.flash.text}`);
    st = r.state;
  };
  run('session.mode', { mode: 'pro' });
  for (const [sku, name, unit, price, cost] of n.articles) run('article.add', { sku, name, unit, price, cost, tax: 'std' });
  const art = st.store.articles.map((a) => a.id);
  [120, 80, 15, 40].forEach((q, i) => run('article.receive', { articleId: art[i] ?? '', qty: String(q), ref: 'WE-1' }));
  for (const [name, email] of n.customers) run('customer.add', { name, email });
  const cus = st.store.customers.map((c) => c.id);
  // Angebot 1: festgeschrieben und angenommen → Auftrag; Angebot 2: festgeschrieben, offen; Angebot 3: Entwurf
  run('quote.create', { customerId: cus[0] ?? '', line_article_0: art[0] ?? '', line_qty_0: '10', line_article_1: art[2] ?? '', line_qty_1: '2' });
  run('quote.send', { id: st.store.quotes[0]?.id ?? '' });
  run('quote.accept', { id: st.store.quotes[0]?.id ?? '' });
  run('quote.create', { customerId: cus[1] ?? '', line_article_0: art[1] ?? '', line_qty_0: '20' });
  run('quote.send', { id: st.store.quotes[1]?.id ?? '' });
  run('quote.create', { customerId: cus[2] ?? '', line_article_0: art[3] ?? '', line_qty_0: '12' });
  // Direktauftrag, teilweise geliefert
  run('order.create', { customerId: cus[2] ?? '', line_article_0: art[3] ?? '', line_qty_0: '10', line_article_1: art[1] ?? '', line_qty_1: '5' });
  const o1 = st.store.orders[0]?.id ?? '';
  const o2 = st.store.orders[1]?.id ?? '';
  run('order.deliver', { id: o1, token: 'seed-1', [`qty_${art[0]}`]: '10', [`qty_${art[2]}`]: '2' });
  run('order.deliver', { id: o2, token: 'seed-2', [`qty_${art[3]}`]: '6' });
  run('invoice.draft', { [`del_${st.store.deliveries[0]?.id}`]: '1' });
  run('invoice.finalize', { id: st.store.invoices[0]?.id ?? '' });
  run('invoice.draft', { [`del_${st.store.deliveries[1]?.id}`]: '1' });
  run('invoice.finalize', { id: st.store.invoices[1]?.id ?? '' });
  run('payment.record', { id: st.store.invoices[0]?.id ?? '', amount: '100,00', method: 'bank' });
  run('user.add', { name: lang === 'it' ? 'Luca' : lang === 'en' ? 'Sam' : 'Lena', role: 'STAFF' });
  return st;
}
