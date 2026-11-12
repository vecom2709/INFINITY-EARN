import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderInquiryForm } from '../../apps/customer-portal/src/pages.ts';
import { parseItemsText } from '../../services/core-api/src/http-core.ts';

test('Positionszeilen: Semikolon, Tabulator, Komma-Dezimal und €-Zeichen werden akzeptiert', () => {
  const r = parseItemsText('Montage;10;45.00\nMaterial\t3\t120,50 €\nAnfahrt | 1 | 35', 'EUR');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.items.map((i) => [i.name, i.quantity, i.unit_cost_minor]), [['Montage', 10, 4500], ['Material', 3, 12050], ['Anfahrt', 1, 3500]]);
});

test('Positionszeilen: verständliche Fehler mit der betroffenen Zeile', () => {
  const r = parseItemsText('Montage 10 45\nKabel;zwei;3\nSchrauben;5;abc', 'EUR');
  assert.match(r.errors[0] ?? '', /Zeile 1 \(„Montage 10 45“\): bitte genau drei Angaben/);
  assert.match(r.errors[1] ?? '', /Zeile 2: Menge muss eine ganze Zahl/);
  assert.match(r.errors[2] ?? '', /Zeile 3: Einzelpreis ungültig/);
});

test('Formular behält Eingaben bei Fehlern und escaped sie', () => {
  const html = renderInquiryForm(['Zeile 1: x'], { name: 'Max <b>', items: 'Montage 10 45', title: 'T"itel', marketing: '1' });
  assert.match(html, /value="Max &lt;b&gt;"/);
  assert.match(html, />Montage 10 45<\/textarea>/);
  assert.match(html, /value="T&quot;itel"/);
  assert.match(html, /name="marketing" value="1" checked/);
  assert.match(html, /Ihre Eingaben sind erhalten geblieben/);
});
