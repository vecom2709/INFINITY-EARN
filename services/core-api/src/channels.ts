import { getSource } from '../../acquisition/src/sources.ts';
import type { AppContext } from './context.ts';
import { deliveryChannel } from './outbox.ts';

/**
 * Universal Communication & Delivery Center (Gesamtprompt §3): Status jedes Kommunikationskanals – nur real
 * angebundene Kanäle gelten als verbunden. Nichts wird als funktionsfähig vorgetäuscht.
 */
export type ChannelState = 'CONNECTED' | 'READ_ONLY' | 'NOT_CONNECTED';

export interface Channel { id: string; name: string; direction: string; state: ChannelState; detail: string; needs: string | null }

export function channelStatus(ctx: AppContext): Channel[] {
  const ted = (() => {
    try {
      return getSource(ctx, 'src_ted_eu').status;
    } catch {
      return 'UNKNOWN';
    }
  })();
  const mail = deliveryChannel(ctx);
  return [
    { id: 'website', name: 'Website: Anfrage und Produktberater', direction: 'Eingang', state: 'CONNECTED', detail: 'Eigenes Formular und Berater unter /anfrage und /berater (DE/IT/EN).', needs: null },
    { id: 'portal', name: 'Kundenportal', direction: 'Eingang und Ausgang', state: 'CONNECTED', detail: 'Fragen, Reklamationen, Widerruf, Nachträge, Abnahme; Dokumente und Downloads.', needs: null },
    { id: 'ted', name: 'Öffentliche Ausschreibungen (TED)', direction: 'Eingang', state: ted === 'APPROVED' ? 'READ_ONLY' : 'NOT_CONNECTED', detail: ted === 'APPROVED' ? 'Täglicher Abruf freigegeben. Nur lesend – Antworten reichst du über den offiziellen Kanal der Ausschreibung ein.' : 'Quelle nicht freigegeben.', needs: ted === 'APPROVED' ? null : 'Freigabe der Quelle in den Einstellungen' },
    { id: 'email-out', name: 'E-Mail-Versand', direction: 'Ausgang', state: mail.ready ? 'CONNECTED' : 'NOT_CONNECTED', detail: mail.ready ? 'Versand aktiv.' : 'Nachrichten warten im Postausgang. Es wird nichts gesendet.', needs: mail.ready ? null : 'Versanddienst (Konto durch dich) und Anbieterangaben (LA-02)' },
    { id: 'email-in', name: 'Geschäftliche E-Mail (Eingang)', direction: 'Eingang', state: 'NOT_CONNECTED', detail: 'Kein Postfach angebunden.', needs: 'Postfach mit Weiterleitung oder Schnittstelle, von dir eingerichtet' },
    { id: 'whatsapp', name: 'WhatsApp Business', direction: 'Eingang und Ausgang', state: 'NOT_CONNECTED', detail: 'Nicht angebunden. Keine Nachrichten über WhatsApp.', needs: 'WhatsApp-Business-Konto mit offizieller Schnittstelle (kann kosten)' },
    { id: 'platforms', name: 'Auftragsplattformen', direction: 'Eingang und Ausgang', state: 'NOT_CONNECTED', detail: 'Keine Plattform angebunden. Automatische Bewerbungen nur, wo die Plattform es erlaubt.', needs: 'Konto und Erlaubnis der jeweiligen Plattform' },
    { id: 'phone', name: 'Telefonie', direction: 'Eingang und Ausgang', state: 'NOT_CONNECTED', detail: 'Nicht vorgesehen ohne gesonderte Freigabe.', needs: 'Gesonderte Freigabe und Anbieter (kostenpflichtig)' },
  ];
}
