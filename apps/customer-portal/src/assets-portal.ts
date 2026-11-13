import type { AppContext } from '../../../services/core-api/src/context.ts';
import { requestsForCustomer, UPLOAD_MAX_BYTES, type RequestView } from '../../../services/core-api/src/client-assets.ts';
import { icon } from '../../console/src/icons.ts';
import { e } from '../../shared/layout.ts';
import type { Lang } from './home-i18n.ts';

/** Kundenportal → „Benötigte Dateien und Zugänge“ (Funktion 161). Upload per normalem Formular – kein JavaScript nötig. */

const T = {
  de: {
    h: 'Benötigte Dateien und Zugänge', lead: 'Wir fragen nur an, was wir für Ihren Auftrag wirklich brauchen. Dateien werden geprüft und nur für diesen Auftrag verwendet; Sie können die Freigabe jederzeit widerrufen.',
    file: 'Datei auswählen', allowed: 'Erlaubt', max: 'höchstens', rights: 'Ich habe die Rechte, diese Datei für den Auftrag nutzen zu lassen.', upload: 'Hochladen',
    access: 'Bitte senden Sie uns niemals Passwörter oder Schlüssel. Laden Sie uns stattdessen in Ihr System ein (eigener Benutzer) und beschreiben Sie kurz, wie.', accessNote: 'So wurde der Zugang erteilt', accessBtn: 'Zugang als erteilt melden',
    open: 'offen', usable: 'freigegeben', locked: 'gesperrt – Rechte fehlen', rejected: 'abgelehnt', revoked: 'widerrufen', version: 'Version', confirm: 'Rechte bestätigen', revoke: 'Freigabe widerrufen', download: 'herunterladen',
    blocks: 'Ohne diese Angabe können wir mit der Herstellung nicht beginnen.', purpose: 'Wofür',
    ok: { ACCEPTED: 'Datei geprüft und für Ihren Auftrag freigegeben.', LOCKED_NO_RIGHTS: 'Datei gespeichert, aber gesperrt: Bitte bestätigen Sie die Nutzungsrechte.', DUPLICATE: 'Diese Datei liegt bereits vor – es wurde keine neue Version angelegt.', REJECTED: 'Die Datei wurde abgelehnt und nicht gespeichert.', access: 'Zugang als erteilt gemeldet.', rights: 'Nutzungsrechte bestätigt – Datei freigegeben.', revoked: 'Freigabe widerrufen. Die Datei wird nicht mehr verwendet.' } as Record<string, string>,
    err: { FORBIDDEN: 'Kein Zugriff auf diese Anfrage.', SECRET_DETECTED: 'Bitte keine Passwörter oder Schlüssel senden.', NOTE_REQUIRED: 'Bitte kurz beschreiben, wie der Zugang erteilt wurde.', NO_FILE: 'Bitte eine Datei auswählen.', TOO_LARGE: 'Die Datei ist zu groß.', REQUEST_CANCELLED: 'Diese Anfrage ist nicht mehr aktiv.', BAD_UPLOAD: 'Der Upload war unvollständig. Bitte erneut versuchen.' } as Record<string, string>,
  },
  it: {
    h: 'File e accessi necessari', lead: 'Chiediamo solo ciò che serve davvero per il vostro ordine. I file vengono verificati e usati solo per questo ordine; potete revocare l’autorizzazione in qualsiasi momento.',
    file: 'Scegli file', allowed: 'Consentiti', max: 'al massimo', rights: 'Ho i diritti per far utilizzare questo file per l’ordine.', upload: 'Carica',
    access: 'Non inviateci mai password o chiavi. Invitateci invece nel vostro sistema (utente dedicato) e descrivete brevemente come.', accessNote: 'Come è stato concesso l’accesso', accessBtn: 'Segnala accesso concesso',
    open: 'aperto', usable: 'autorizzato', locked: 'bloccato – mancano i diritti', rejected: 'rifiutato', revoked: 'revocato', version: 'Versione', confirm: 'Conferma diritti', revoke: 'Revoca autorizzazione', download: 'scarica',
    blocks: 'Senza questo dato non possiamo iniziare la produzione.', purpose: 'A cosa serve',
    ok: { ACCEPTED: 'File verificato e autorizzato per il vostro ordine.', LOCKED_NO_RIGHTS: 'File salvato ma bloccato: confermate i diritti d’uso.', DUPLICATE: 'Questo file è già presente – nessuna nuova versione.', REJECTED: 'Il file è stato rifiutato e non è stato salvato.', access: 'Accesso segnalato come concesso.', rights: 'Diritti confermati – file autorizzato.', revoked: 'Autorizzazione revocata. Il file non verrà più usato.' } as Record<string, string>,
    err: { FORBIDDEN: 'Nessun accesso a questa richiesta.', SECRET_DETECTED: 'Non inviate password o chiavi.', NOTE_REQUIRED: 'Descrivete brevemente come è stato concesso l’accesso.', NO_FILE: 'Scegliete un file.', TOO_LARGE: 'Il file è troppo grande.', REQUEST_CANCELLED: 'Questa richiesta non è più attiva.', BAD_UPLOAD: 'Caricamento incompleto. Riprovate.' } as Record<string, string>,
  },
  en: {
    h: 'Files and access we need', lead: 'We only ask for what your order really needs. Files are checked and used only for this order; you can revoke permission at any time.',
    file: 'Choose file', allowed: 'Allowed', max: 'at most', rights: 'I have the rights to let this file be used for the order.', upload: 'Upload',
    access: 'Never send us passwords or keys. Instead, invite us into your system (own user) and briefly describe how.', accessNote: 'How access was granted', accessBtn: 'Report access as granted',
    open: 'open', usable: 'approved', locked: 'locked – rights missing', rejected: 'rejected', revoked: 'revoked', version: 'Version', confirm: 'Confirm rights', revoke: 'Revoke permission', download: 'download',
    blocks: 'We cannot start production without this.', purpose: 'Purpose',
    ok: { ACCEPTED: 'File checked and approved for your order.', LOCKED_NO_RIGHTS: 'File saved but locked: please confirm the usage rights.', DUPLICATE: 'This file is already here – no new version created.', REJECTED: 'The file was rejected and not stored.', access: 'Access reported as granted.', rights: 'Rights confirmed – file approved.', revoked: 'Permission revoked. The file will no longer be used.' } as Record<string, string>,
    err: { FORBIDDEN: 'No access to this request.', SECRET_DETECTED: 'Please do not send passwords or keys.', NOTE_REQUIRED: 'Please briefly describe how access was granted.', NO_FILE: 'Please choose a file.', TOO_LARGE: 'The file is too large.', REQUEST_CANCELLED: 'This request is no longer active.', BAD_UPLOAD: 'The upload was incomplete. Please try again.' } as Record<string, string>,
  },
} as const;

const ACCEPT: Record<string, string> = { logo: '.png,.jpg,.jpeg,.webp,.pdf', document: '.pdf,.docx,.xlsx,.pptx,.csv,.txt', data: '.csv,.xlsx,.json,.txt' };

export interface AssetNotice { ok?: string; err?: string; reason?: string }

function card(v: RequestView, t: (typeof T)[Lang]): string {
  const r = v.req;
  const state = v.usable ? `<span class="tag ok">${e(t.usable)}</span>` : `<span class="tag">${e(t.open)}</span>`;
  const versions = v.assets.map((a) => {
    const s = a.scan_status === 'REJECTED' ? t.rejected : !a.rights_confirmed ? t.locked : a.granted ? t.usable : t.revoked;
    const actions: string[] = [];
    if (a.scan_status === 'ACCEPTED' && a.blob_locator) actions.push(`<a href="/portal/datei/${e(a.asset_id)}">${icon('download', 'sm')}${e(t.download)}</a>`);
    if (a.scan_status === 'ACCEPTED' && !a.rights_confirmed && !a.erased_at) actions.push(`<form method="post" action="/portal/datei/${e(a.asset_id)}/rechte" style="display:inline"><button>${e(t.confirm)}</button></form>`);
    if (a.granted) actions.push(`<form method="post" action="/portal/datei/${e(a.asset_id)}/widerrufen" style="display:inline"><button>${e(t.revoke)}</button></form>`);
    return `<li>${e(t.version)} ${a.version}: ${e(a.filename)} · ${e(s)}${a.scan_status === 'REJECTED' && a.scan_reason ? ` <span class="muted">(${e(a.scan_reason)})</span>` : ''} ${actions.join(' ')}</li>`;
  }).join('');
  const form = r.kind === 'access'
    ? `<p class="muted">${e(t.access)}</p><form method="post" action="/portal/dateien/${e(r.request_id)}/zugang"><label for="n-${e(r.request_id)}">${e(t.accessNote)}</label><input id="n-${e(r.request_id)}" name="note" required minlength="3" maxlength="300" autocomplete="off"><p><button>${e(t.accessBtn)}</button></p></form>`
    : `<form method="post" action="/portal/dateien/${e(r.request_id)}" enctype="multipart/form-data"><label for="f-${e(r.request_id)}">${e(t.file)}</label><input id="f-${e(r.request_id)}" type="file" name="datei" required accept="${ACCEPT[r.kind] ?? ''}">
<p class="muted" style="margin:4px 0">${e(t.allowed)}: ${e((ACCEPT[r.kind] ?? '').replace(/\./g, '').replace(/,/g, ', '))} · ${e(t.max)} ${UPLOAD_MAX_BYTES / 1024 / 1024} MB</p>
${r.rights_required ? `<label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" name="rechte" value="1" style="width:auto;min-height:0;margin-top:4px"> <span>${e(t.rights)}</span></label>` : ''}<p><button>${e(t.upload)}</button></p></form>`;
  return `<div class="card" style="margin:10px 0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${e(r.label)}</h3>${state}</div>
<p class="muted" style="margin:6px 0">${e(t.purpose)}: ${e(r.purpose)}${r.blocks_production && !v.usable ? ` · ${e(t.blocks)}` : ''}</p>${versions ? `<ul>${versions}</ul>` : ''}${form}</div>`;
}

export function renderAssetSection(ctx: AppContext, customerId: string, lang: Lang, notice: AssetNotice = {}): string {
  const views = requestsForCustomer(ctx, customerId);
  if (!views.length && !notice.ok && !notice.err) return '';
  const t = T[lang];
  const msg = notice.ok ? `<div class="card" role="status">${e(t.ok[notice.ok] ?? '')}${notice.reason ? ` <span class="muted">(${e(notice.reason)})</span>` : ''}</div>` : notice.err ? `<div class="card" role="alert">${e(t.err[notice.err] ?? t.err.BAD_UPLOAD ?? '')}</div>` : '';
  return `<section id="dateien" aria-labelledby="dateien-h"><h2 id="dateien-h">${e(t.h)}</h2><p class="muted">${e(t.lead)}</p>${msg}${views.map((v) => card(v, t)).join('')}</section>`;
}
