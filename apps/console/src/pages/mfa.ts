import { listPasskeys, mfaStatus } from '../../../../services/core-api/src/mfa.ts';
import { e, explain, panel, shell, table, tag } from '../ui.ts';
import type { PageCtx } from './types.ts';

/** Admin → Einstellungen → Sicherheit: zweiter Faktor per Passkey (Windows Hello, Handy, Sicherheitsschlüssel). */
export function renderMfa(pc: PageCtx): string {
  const st = mfaStatus(pc.ctx);
  const keys = listPasskeys(pc.ctx);
  const back = '/dashboard/sicherheit';
  const date = (iso: string | null): string => (iso ? iso.slice(0, 16).replace('T', ' ') : '—');
  const removeForm = (credId: string, last: boolean): string => `<form method="post" action="/admin/mfa/passkey/entfernen" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
<input type="hidden" name="_csrf" value="${e(pc.csrf)}"><input type="hidden" name="_back" value="${e(back)}"><input type="hidden" name="cred" value="${e(credId)}">
${last ? '<input name="code" placeholder="Wiederherstellungscode" aria-label="Wiederherstellungscode" required maxlength="12" style="max-width:190px">' : ''}
<button class="btn ghost" type="submit">${last ? 'Entfernen und zweiten Faktor abschalten' : 'Entfernen'}</button></form>`;
  const body = `${panel({ id: 'status', title: 'Zweiter Faktor', sub: 'Schützt die Verwaltung, auch wenn jemand dein Passwort kennt', body: `<p style="margin:4px 0 8px">${tag(st.enabled ? 'Aktiv' : 'Aus', st.enabled ? 'ok' : 'pending')} ${st.enabled ? `<span class="muted">${st.passkeys} Gerät(e) · ${st.recoveryLeft} Wiederherstellungscode(s) übrig</span>` : '<span class="muted">Nur Passwort – vor dem Echtbetrieb einschalten</span>'}</p>
${explain('Nach dem Passwort bestätigst du die Anmeldung mit deinem Gerät: am PC mit Windows Hello (PIN, Fingerabdruck, Gesicht), am Handy mit der Bildschirmsperre oder mit einem Sicherheitsschlüssel. Es ist keine zusätzliche App nötig. Gespeichert wird nur der öffentliche Schlüssel deines Geräts.')}` })}
${panel({ id: 'hinzufuegen', title: 'Gerät hinzufügen', sub: 'Am besten zwei Geräte, z. B. PC und Handy', body: `<p><label for="pk-label">Bezeichnung</label><br><input id="pk-label" maxlength="40" placeholder="z. B. Büro-PC" style="max-width:280px"></p>
<p><button class="btn" type="button" id="pk-register" data-csrf="${e(pc.csrf)}">Passkey hinzufügen</button></p>
<p id="pk-msg" role="status" aria-live="polite"></p>
<div id="pk-codes" hidden><h3 style="margin:12px 0 4px">Deine Wiederherstellungscodes</h3><p class="muted" style="margin:0 0 6px">Jeder Code funktioniert einmal, falls kein Gerät zur Hand ist. Ausdrucken oder sicher speichern – sie werden nur jetzt angezeigt.</p><ol style="font:16px/1.7 ui-monospace,Consolas,monospace"></ol></div>
<script src="/assets/passkey.js" defer></script>` })}
${panel({ id: 'geraete', title: 'Registrierte Geräte', flush: true, body: table([{ label: 'Gerät' }, { label: 'Hinzugefügt' }, { label: 'Zuletzt verwendet' }, { label: 'Aktion', full: true }], keys.map((k) => [`<strong>${e(k.label)}</strong>`, e(date(k.created_at)), e(date(k.last_used_at)), removeForm(k.cred_id, keys.length === 1)]), 'Noch kein Gerät', 'Registrierte Geräte') })}`;
  return shell({ title: 'Sicherheit', eyebrow: 'Einstellungen', heading: 'Anmeldung absichern', lead: 'Zweiter Faktor per Passkey – ohne Authenticator-App.', active: 'einstellungen', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, body, systemTestMode: pc.ctx.config.testMode });
}
