import { KIND_INFO, PROGRAM_KINDS, RIGHTS_TEXT, type RebuildRequestRow } from '../../../services/core-api/src/rebuild-requests.ts';
import { e, page } from '../../shared/layout.ts';
import type { Lang } from './home-i18n.ts';
import { frame } from './i18n-pages.ts';

/**
 * Kundenseiten der Auftragsart „Programm nach Vorlage“. Die Texte liegen bewusst nur auf Deutsch vor (Entwurf):
 * Die Rechte-Erklärung ist rechtlich maßgeblich und wird nicht maschinell übersetzt.
 */
const HONEST = `<div class="card"><h2>So läuft es ab – ehrlich</h2><ul>
<li><strong>Keine automatische Zusage.</strong> Jede Anfrage prüft der Inhaber persönlich. Sie erhalten danach eine Annahme oder eine begründete Ablehnung.</li>
<li><strong>Nicht rund um die Uhr.</strong> Die Untersuchung der Vorlage findet auf einem Arbeitsplatz des Inhabers statt. Ein Liefertermin wird erst mit dem Angebot genannt.</li>
<li><strong>Nur mit Berechtigung.</strong> Wir untersuchen ausschließlich Ihre eigene Software oder Software, deren Lizenz die Analyse erlaubt. Programme anderer Hersteller bauen wir nicht nach.</li>
<li><strong>Keine Datei jetzt.</strong> Bitte laden Sie hier nichts hoch. Die Vorlage übergeben Sie erst nach der Annahme.</li>
<li><strong>Noch kein Preis.</strong> Der Preis steht erst im Angebot nach der Prüfung.</li>
</ul></div>`;

export function renderRebuildForm(errors: string[] = [], values: Record<string, string> = {}, lang: Lang = 'de'): string {
  const val = (k: string): string => e(values[k] ?? '');
  const sel = (k: string, v: string): string => (values[k] === v ? ' selected' : '');
  const chk = (k: string, v: string): string => (values[k] === v ? ' checked' : '');
  return page('Programm nach Vorlage – INFINITY EARN', `<h1>Programm nach Vorlage</h1>
<p class="lead">Sie haben ein vorhandenes Programm und möchten es neu bauen oder ablösen lassen – zum Beispiel, weil der Quelltext fehlt. Wir untersuchen die Vorlage und entwickeln ein neues Programm mit den gewünschten Funktionen.</p>
${HONEST}
${errors.length ? `<div class="card err" role="alert"><strong>Bitte korrigieren – Ihre Eingaben sind erhalten geblieben:</strong><ul>${errors.map((x) => `<li>${e(x)}</li>`).join('')}</ul></div>` : ''}
<form class="card" method="post" action="/programm-nach-vorlage">
<p class="muted">Bitte nur Unternehmensangaben eintragen, keine privaten Daten.</p>
<label for="rb-company">Unternehmen</label><input id="rb-company" type="text" name="company" required maxlength="200" autocomplete="organization" value="${val('company')}">
<label for="rb-email">Geschäftliche E-Mail</label><input id="rb-email" type="email" name="email" required maxlength="200" autocomplete="email" value="${val('email')}">
<label for="rb-program">Name des Programms (Vorlage)</label><input id="rb-program" type="text" name="program_name" required maxlength="200" value="${val('program_name')}">
<label for="rb-kind">Art des Programms</label><select id="rb-kind" name="program_kind" required><option value="">Bitte wählen</option>${PROGRAM_KINDS.map((k) => `<option value="${k}"${sel('program_kind', k)}>${e(KIND_INFO[k].label)}</option>`).join('')}</select>
<label for="rb-desc">Was soll das neue Programm können?</label><textarea id="rb-desc" name="description" required minlength="30" maxlength="4000" rows="6">${val('description')}</textarea>
<fieldset><legend>Worauf beruht Ihre Berechtigung?</legend>
<label><input type="radio" name="rights_basis" value="OWN_SOFTWARE" required${chk('rights_basis', 'OWN_SOFTWARE')}> Es ist unsere eigene Software (selbst entwickelt oder alle Rechte erworben).</label>
<label><input type="radio" name="rights_basis" value="LICENSE_PERMITS"${chk('rights_basis', 'LICENSE_PERMITS')}> Die Lizenz des Herstellers erlaubt die Analyse ausdrücklich.</label>
</fieldset>
<label for="rb-rights">Kurzer Beleg (zum Beispiel „2015 von uns entwickelt“ oder die Stelle in der Lizenz)</label><input id="rb-rights" type="text" name="rights_detail" required minlength="10" maxlength="1000" value="${val('rights_detail')}">
<label><input type="checkbox" name="rights_confirmed" value="1" required> ${e(RIGHTS_TEXT)}</label>
<label><input type="checkbox" name="privacy" value="1" required> Ich habe den Datenschutzhinweis gelesen (Entwurf, Testmodus).</label>
<button class="btn" type="submit">Anfrage zur Prüfung senden</button>
</form>`, { testMode: true, ...frame(lang, 'anfrage') });
}

export function renderRebuildReceived(statusPath: string, lang: Lang = 'de'): string {
  return page('Anfrage erhalten – INFINITY EARN', `<h1>Anfrage erhalten – wartet auf Prüfung</h1>
<div class="card"><p>Ihre Anfrage ist gespeichert. Der Inhaber prüft sie persönlich; es gibt noch keine Zusage und keinen Preis.</p>
<p><strong>Bitte speichern Sie diesen Link.</strong> Nur darüber sehen Sie den Stand – wir zeigen ihn kein zweites Mal an.</p>
<p><a class="btn" href="${e(statusPath)}">Stand der Anfrage ansehen</a></p></div>`, { testMode: true, ...frame(lang, 'anfrage') });
}

const STATE_TEXT: Record<RebuildRequestRow['state'], { title: string; text: string }> = {
  OWNER_APPROVAL_REQUIRED: { title: 'Wartet auf Prüfung durch den Inhaber', text: 'Es gibt noch keine Zusage. Die Prüfung erfolgt persönlich und nicht rund um die Uhr.' },
  ACCEPTED: { title: 'Angenommen – Angebot folgt', text: 'Der Inhaber hat Ihre Anfrage angenommen. Sie erhalten ein Angebot mit Preis und Termin an Ihre E-Mail-Adresse. Erst danach übergeben Sie die Vorlage.' },
  DECLINED: { title: 'Abgelehnt', text: 'Der Inhaber hat die Anfrage abgelehnt.' },
};

export function renderRebuildStatus(row: RebuildRequestRow, lang: Lang = 'de'): string {
  const s = STATE_TEXT[row.state];
  const info = KIND_INFO[row.program_kind];
  return page('Stand Ihrer Anfrage – INFINITY EARN', `<h1>Stand Ihrer Anfrage</h1>
<div class="card" role="status"><h2>${e(s.title)}</h2><p>${e(s.text)}</p>${row.owner_note ? `<p><strong>Hinweis des Inhabers:</strong> ${e(row.owner_note)}</p>` : ''}</div>
<div class="card"><h2>Ihre Angaben</h2><ul>
<li>Programm: ${e(row.program_name)} (${e(info.label)})</li>
<li>Technische Einschätzung: ${e(info.note)}</li>
<li>Eingegangen am ${e(row.created_at.slice(0, 10))}${row.decided_at ? `, entschieden am ${e(row.decided_at.slice(0, 10))}` : ''}</li>
<li>Rechte-Erklärung abgegeben am ${e(row.rights_confirmed_at.slice(0, 10))} (Fassung ${e(row.rights_text_version)})</li>
</ul></div>`, { testMode: true, ...frame(lang, 'anfrage') });
}
