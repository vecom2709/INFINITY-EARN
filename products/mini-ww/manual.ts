import { PdfDoc, type Rgb } from '../../packages/shared/src/pdf-doc.ts';
import { SHOTS_JPEG_BASE64 } from './generated/shots.ts';
import type { ShotName } from './manual-shots.ts';
import type { Setup } from './src/setup.ts';
import { brandColors, safeLogo, type Brand } from './ui/brand.ts';
import { tr, type Lang } from './ui/i18n.ts';

/**
 * Bebilderte Bedienungsanleitung (PDF) zu jeder Auslieferung der Mini-Warenwirtschaft – DE/IT/EN.
 * Ein Kapitel je Arbeitsablauf, jeweils mit einem echten Screenshot des gebauten Programms.
 * Bezeichnungen von Knöpfen und Feldern werden aus den Texten des Programms übernommen ([[Schlüssel]]),
 * damit Anleitung und Oberfläche immer dieselben Wörter verwenden.
 */
interface Chapter { id: string; title: string; intro: string; steps?: string[]; bullets?: string[]; tip?: string; shot?: ShotName; caption?: string; shot2?: ShotName; caption2?: string }
interface Texts {
  doc: string; product: string; forCompany: string; version: string; contents: string; page: (p: number, t: number) => string;
  figuresNote: string; setupTitle: string; setupIntro: string; taxRates: string; numbers: string; paymentTerm: (d: number) => string; seq: Record<string, string>;
  tipLabel: string; chapters: Chapter[];
}

const Q: Record<Lang, [string, string]> = { de: ['„', '“'], it: ['«', '»'], en: ['“', '”'] };

const DE: Texts = {
  doc: 'Bedienungsanleitung', product: 'Warenwirtschaft', forCompany: 'Ausgeliefert für', version: 'Programmfassung', contents: 'Inhalt',
  page: (p, t) => `Bedienungsanleitung Warenwirtschaft · Seite ${p} von ${t}`,
  figuresNote: 'Die Abbildungen zeigen das echte Programm mit Beispieldaten im Standarddesign. Farben und Logo Ihrer Fassung können abweichen; Knöpfe, Felder und Abläufe sind identisch.',
  setupTitle: 'Ihre Einrichtung', setupIntro: 'Diese Werte wurden aus Ihrem Auftrag übernommen und gelten ab dem ersten Start:',
  taxRates: 'Steuersätze', numbers: 'Nummernkreise', paymentTerm: (d) => `Zahlungsziel: ${d} Tage`,
  seq: { quote: 'Angebote', order: 'Aufträge', delivery: 'Lieferscheine', invoice: 'Rechnungen', credit: 'Gutschriften' },
  tipLabel: 'Tipp:',
  chapters: [
    { id: 'start', title: 'Erste Schritte', intro: 'Die Warenwirtschaft ist eine einzelne Datei, die in Ihrem Browser läuft (Microsoft Edge, Google Chrome, Firefox oder Safari). Sie braucht keine Installation und kein Internet; Ihre Daten verlassen den Computer nicht.',
      steps: ['Speichern Sie die Datei warenwirtschaft.html an einem festen Ort, z. B. in „Dokumente“.', 'Öffnen Sie die Datei per Doppelklick. Es erscheint die [[Übersicht]].', 'Unter [[Einstellungen]] wählen Sie die [[Ansicht]] – [[Einsteiger]] zeigt nur das Nötigste, [[Profi]] alle Funktionen – und die [[Sprache]] (DE, IT, EN).', 'Die [[Übersicht]] zeigt Umsatz, [[Offene Posten]], Lagerwert und unter [[Zu tun]] die nächsten Schritte.'],
      tip: 'Ihre Daten liegen nur im Browser dieses Computers. Laden Sie regelmäßig eine Sicherung herunter (Kapitel 8).', shot: 'uebersicht', caption: 'Abb. 1 – Übersicht mit Kennzahlen und Aufgabenliste' },
    { id: 'artikel', title: 'Artikel und Lager', intro: 'Unter [[Artikel]] pflegen Sie Ihr Sortiment und buchen Warenbewegungen. Der Bestand ergibt sich immer aus den gebuchten Bewegungen.',
      steps: ['Unter [[Neuer Artikel]] [[Artikelnummer]], [[Bezeichnung]], [[Einheit]], [[Verkaufspreis]], [[Einkaufspreis]] und [[Steuersatz]] eintragen und [[Anlegen]] klicken.', 'Gelieferte Ware mit [[Wareneingang]] buchen: Artikel wählen, [[Menge]] eintragen, bestätigen.', 'Inventurdifferenzen bucht der Inhaber mit [[Korrektur (+/−)]] und einem [[Grund]].', 'Die Liste zeigt [[Bestand]], [[Reserviert]] (für Aufträge zurückgelegt) und [[Verfügbar]]. Über [[Suche]] finden Sie Artikel schnell.'],
      tip: 'Beträge mit Komma eingeben, z. B. 12,50.', shot: 'artikel', caption: 'Abb. 2 – Artikelliste mit Bestand, Reservierung und Wareneingang' },
    { id: 'kunden', title: 'Kunden', intro: 'Unter [[Kunden]] legen Sie Ihre Kunden an. Jeder Kunde erhält automatisch eine Kundennummer.',
      steps: ['Unter [[Neuer Kunde]] [[Name]] und bei Bedarf [[E-Mail]], [[Adresse]] und [[USt-IdNr.]] eintragen.', 'Mit [[Anlegen]] speichern. Der Kunde steht danach in Angeboten, Aufträgen und Rechnungen zur Auswahl.'],
      shot: 'kunden', caption: 'Abb. 3 – Kundenliste' },
    { id: 'angebote', title: 'Angebote', intro: 'Ein Angebot wird zuerst als Entwurf gespeichert, dann festgeschrieben (es erhält eine Nummer und ist danach unveränderbar) und schließlich angenommen oder abgelehnt.',
      steps: ['Unter [[Neues Angebot]] [[Kunde]] wählen und je [[Position]] Artikel und [[Menge]] eintragen; [[Gültig (Tage)]] festlegen.', '[[Als Entwurf speichern]] – der Entwurf kann noch geprüft werden.', '[[Festschreiben]] vergibt die Angebotsnummer. Jetzt können Sie das Angebot über [[Drucken]] als PDF speichern oder ausdrucken.', 'Sagt der Kunde zu, klicken Sie [[Annehmen]]: Es entsteht automatisch ein Auftrag und die Ware wird reserviert. Sonst [[Ablehnen]].'],
      shot: 'angebote', caption: 'Abb. 4 – Angebote: Entwurf, festgeschrieben, angenommen' },
    { id: 'auftraege', title: 'Aufträge und Lieferungen', intro: 'Aufträge entstehen aus angenommenen Angeboten oder direkt über [[Neuer Auftrag (ohne Angebot)]]. Die bestellte Ware ist ab dann reserviert.',
      steps: ['Beim Auftrag die gelieferte [[Menge]] je Artikel eintragen und [[Liefern]] klicken. Teillieferungen sind möglich; der Rest bleibt offen.', 'Jede Lieferung bucht den Lagerabgang und erzeugt einen Lieferschein mit Nummer.', 'Wird ein Rest nicht mehr geliefert, mit [[Rest stornieren]] und [[Grund]] abschließen – die Reservierung wird freigegeben.'],
      tip: 'Ein versehentlicher Doppelklick auf [[Liefern]] wird erkannt und nicht doppelt gebucht.', shot: 'auftraege', caption: 'Abb. 5 – Aufträge mit Liefermengen' },
    { id: 'rechnungen', title: 'Rechnungen, Zahlungen und Gutschriften', intro: 'Rechnungen werden aus Lieferungen erstellt. So wird nichts doppelt oder gar nicht berechnet.',
      steps: ['Unter [[Lieferungen abrechnen]] die Lieferungen wählen und [[Rechnungsentwurf erstellen]] klicken.', 'Entwurf prüfen, dann [[Festschreiben]] (vergibt die Rechnungsnummer, danach unveränderbar) oder [[Verwerfen]].', 'Zahlungseingänge mit [[Betrag]] und [[Zahlung erfassen]] buchen. Teilzahlungen sind möglich; [[Offen]] zeigt den Rest.', 'Fehler oder Rücksendungen: [[Gutschrift erstellen]], Mengen und [[Grund]] angeben, bei Bedarf [[Ware zurück ins Lager]] wählen, dann festschreiben.', 'Überfällige Rechnungen erhalten automatisch eine [[Mahnstufe]] (1–3) nach den eingestellten Fristen.'],
      shot: 'rechnungen', caption: 'Abb. 6 – Rechnungsliste mit Status, Fälligkeit und Zahlungserfassung',
      shot2: 'beleg', caption2: 'Abb. 7 – Druckansicht einer Rechnung – über den Knopf Drucken als PDF speichern oder ausdrucken' },
    { id: 'berichte', title: 'Berichte', intro: 'Unter [[Berichte]] wählen Sie einen Zeitraum ([[Von]], [[Bis]]) und klicken [[Anzeigen]].',
      bullets: ['[[Umsatz]] netto und Steuer im Zeitraum', '[[Lagerliste]] mit Bestand, Reservierung und Wert', '[[Offene Posten]] mit Fälligkeit und Mahnstufe'],
      shot: 'berichte', caption: 'Abb. 8 – Berichte: Umsatz, Lagerliste, offene Posten' },
    { id: 'daten', title: 'Datensicherung und Datenaustausch', intro: 'Weil die Daten nur in diesem Browser gespeichert sind, ist die Sicherung Ihre wichtigste Aufgabe.',
      steps: ['[[Sicherung herunterladen]] speichert alle Daten als Datei (sicherung-JJJJ-MM-TT.json). Bewahren Sie Kopien z. B. auf einem USB-Stick auf.', '[[Sicherung wiederherstellen]] lädt eine Sicherung zurück – etwa auf einem neuen Computer. Achtung: Die Daten im Browser werden dabei ersetzt.', '[[CSV-Import]] übernimmt Artikel oder Kunden aus einer Tabelle; [[CSV-Export]] gibt Artikel, Kunden und Rechnungen für Excel oder die Buchhaltung aus.', 'Die [[Integritätsprüfung]] kontrolliert bei jedem Aufruf, ob Bestände und Belege zusammenpassen.'],
      tip: 'Wenn Sie den Browserverlauf oder „Websitedaten“ löschen, werden auch die Daten der Warenwirtschaft gelöscht. Sichern Sie vorher.', shot: 'daten', caption: 'Abb. 9 – Sicherung, Wiederherstellung und CSV' },
    { id: 'einstellungen', title: 'Einstellungen und Benutzer', intro: 'Unter [[Einstellungen]] ändert der Inhaber [[Firma]] und [[Zahlungsziel (Tage)]] und legt Benutzer an.',
      steps: ['Werte ändern und [[Speichern]] klicken.', 'Unter [[Neuer Benutzer]] [[Name]] und [[Rolle]] wählen: [[Inhaber]] darf alles, [[Mitarbeiter]] keine Rechnungen festschreiben, keine Gutschriften und keine Bestandskorrekturen.', 'Mit [[Wechseln]] wählen Sie, wer gerade arbeitet.'],
      tip: 'Rollen sind Ablaufregeln auf diesem Gerät, kein Zugriffsschutz.', shot: 'einstellungen', caption: 'Abb. 10 – Einstellungen, Benutzer und Sprache' },
    { id: 'hilfe', title: 'Hilfe bei Problemen', intro: 'Das Programm prüft jede Eingabe. Ist etwas nicht möglich, erscheint oben eine verständliche Meldung und es wird nichts verändert.',
      bullets: ['Meldung z. B. „… offen 4, geliefert werden sollen 6“: Es kann nicht mehr geliefert werden als im Auftrag offen ist.', 'Meldung z. B. „… verfügbar 2, benötigt 5“: Erst einen [[Wareneingang]] buchen.', 'Daten weg? Letzte Sicherung über [[Sicherung wiederherstellen]] laden.', 'Andere Arbeitsplätze: Die Daten werden nicht automatisch geteilt. Übertragen Sie sie per Sicherung.', 'Rechnungen und Steuersätze vor der Verwendung von Ihrer Steuerberatung prüfen lassen.', 'Fragen: über Ihr Kundenportal bei INFINITY EARN.'] },
  ],
};

const IT: Texts = {
  doc: 'Manuale d’uso', product: 'Gestione magazzino', forCompany: 'Consegnato a', version: 'Versione del programma', contents: 'Indice',
  page: (p, t) => `Manuale d’uso Gestione magazzino · Pagina ${p} di ${t}`,
  figuresNote: 'Le immagini mostrano il programma reale con dati di esempio nel design standard. Colori e logo della vostra versione possono differire; pulsanti, campi e procedure sono identici.',
  setupTitle: 'La vostra configurazione', setupIntro: 'Questi valori sono stati ripresi dal vostro ordine e valgono dal primo avvio:',
  taxRates: 'Aliquote IVA', numbers: 'Numerazioni', paymentTerm: (d) => `Termine di pagamento: ${d} giorni`,
  seq: { quote: 'Offerte', order: 'Ordini', delivery: 'Documenti di trasporto', invoice: 'Fatture', credit: 'Note di credito' },
  tipLabel: 'Consiglio:',
  chapters: [
    { id: 'start', title: 'Primi passi', intro: 'La gestione magazzino è un unico file che funziona nel browser (Microsoft Edge, Google Chrome, Firefox o Safari). Non richiede installazione né Internet; i dati non lasciano il computer.',
      steps: ['Salvate il file warenwirtschaft.html in una posizione fissa, ad es. in «Documenti».', 'Aprite il file con un doppio clic. Appare la [[Übersicht]].', 'In [[Einstellungen]] scegliete la [[Ansicht]] – [[Einsteiger]] mostra l’essenziale, [[Profi]] tutte le funzioni – e la [[Sprache]] (DE, IT, EN).', 'La [[Übersicht]] mostra fatturato, [[Offene Posten]], valore di magazzino e in [[Zu tun]] i prossimi passi.'],
      tip: 'I dati sono solo nel browser di questo computer. Scaricate regolarmente un backup (capitolo 8).', shot: 'uebersicht', caption: 'Fig. 1 – Panoramica con indicatori ed elenco attività' },
    { id: 'artikel', title: 'Articoli e magazzino', intro: 'In [[Artikel]] gestite l’assortimento e registrate i movimenti. La giacenza risulta sempre dai movimenti registrati.',
      steps: ['In [[Neuer Artikel]] inserite [[Artikelnummer]], [[Bezeichnung]], [[Einheit]], [[Verkaufspreis]], [[Einkaufspreis]] e [[Steuersatz]], poi [[Anlegen]].', 'Registrate la merce ricevuta con [[Wareneingang]]: scegliete l’articolo, inserite la [[Menge]], confermate.', 'Le differenze inventariali le registra il titolare con [[Korrektur (+/−)]] e un [[Grund]].', 'L’elenco mostra [[Bestand]], [[Reserviert]] (accantonato per ordini) e [[Verfügbar]]. Con [[Suche]] trovate subito un articolo.'],
      tip: 'Importi con la virgola, ad es. 12,50.', shot: 'artikel', caption: 'Fig. 2 – Articoli con giacenza, riserve e carico merce' },
    { id: 'kunden', title: 'Clienti', intro: 'In [[Kunden]] registrate i clienti. Ogni cliente riceve automaticamente un numero.',
      steps: ['In [[Neuer Kunde]] inserite [[Name]] e se serve [[E-Mail]], [[Adresse]] e [[USt-IdNr.]].', 'Salvate con [[Anlegen]]. Il cliente è poi disponibile in offerte, ordini e fatture.'],
      shot: 'kunden', caption: 'Fig. 3 – Elenco clienti' },
    { id: 'angebote', title: 'Offerte', intro: 'Un’offerta viene salvata prima come bozza, poi emessa (riceve un numero e non è più modificabile) e infine accettata o rifiutata.',
      steps: ['In [[Neues Angebot]] scegliete il [[Kunde]] e per ogni [[Position]] articolo e [[Menge]]; impostate [[Gültig (Tage)]].', '[[Als Entwurf speichern]] – la bozza si può ancora controllare.', '[[Festschreiben]] assegna il numero. Con [[Drucken]] potete salvare l’offerta come PDF o stamparla.', 'Se il cliente conferma, cliccate [[Annehmen]]: si crea automaticamente un ordine e la merce viene riservata. Altrimenti [[Ablehnen]].'],
      shot: 'angebote', caption: 'Fig. 4 – Offerte: bozza, emessa, accettata' },
    { id: 'auftraege', title: 'Ordini e consegne', intro: 'Gli ordini nascono da offerte accettate o direttamente con [[Neuer Auftrag (ohne Angebot)]]. Da quel momento la merce è riservata.',
      steps: ['Nell’ordine inserite la [[Menge]] consegnata per articolo e cliccate [[Liefern]]. Sono possibili consegne parziali; il resto rimane aperto.', 'Ogni consegna scarica il magazzino e crea un documento di trasporto numerato.', 'Se un residuo non verrà consegnato, chiudetelo con [[Rest stornieren]] e un [[Grund]]: la riserva viene liberata.'],
      tip: 'Un doppio clic involontario su [[Liefern]] viene riconosciuto e non registrato due volte.', shot: 'auftraege', caption: 'Fig. 5 – Ordini con quantità consegnate' },
    { id: 'rechnungen', title: 'Fatture, pagamenti e note di credito', intro: 'Le fatture si creano dalle consegne. Così nulla viene fatturato due volte o dimenticato.',
      steps: ['In [[Lieferungen abrechnen]] scegliete le consegne e cliccate [[Rechnungsentwurf erstellen]].', 'Controllate la bozza, poi [[Festschreiben]] (assegna il numero di fattura, poi non modificabile) oppure [[Verwerfen]].', 'Registrate gli incassi con [[Betrag]] e [[Zahlung erfassen]]. Sono possibili pagamenti parziali; [[Offen]] mostra il residuo.', 'Errori o resi: [[Gutschrift erstellen]], indicate quantità e [[Grund]], se serve [[Ware zurück ins Lager]], poi emettete.', 'Le fatture scadute ricevono automaticamente un [[Mahnstufe]] (1–3) secondo i termini impostati.'],
      shot: 'rechnungen', caption: 'Fig. 6 – Fatture con stato, scadenza e registrazione pagamenti',
      shot2: 'beleg', caption2: 'Fig. 7 – Anteprima di stampa di una fattura – salvare come PDF o stampare con il pulsante Stampa' },
    { id: 'berichte', title: 'Report', intro: 'In [[Berichte]] scegliete un periodo ([[Von]], [[Bis]]) e cliccate [[Anzeigen]].',
      bullets: ['[[Umsatz]] netto e IVA nel periodo', '[[Lagerliste]] con giacenza, riserve e valore', '[[Offene Posten]] con scadenza e livello di sollecito'],
      shot: 'berichte', caption: 'Fig. 8 – Report: fatturato, magazzino, partite aperte' },
    { id: 'daten', title: 'Backup e scambio dati', intro: 'Poiché i dati sono salvati solo in questo browser, il backup è il compito più importante.',
      steps: ['[[Sicherung herunterladen]] salva tutti i dati in un file (sicherung-AAAA-MM-GG.json). Conservate copie ad es. su una chiavetta USB.', '[[Sicherung wiederherstellen]] ricarica un backup, ad es. su un nuovo computer. Attenzione: i dati nel browser vengono sostituiti.', '[[CSV-Import]] riprende articoli o clienti da una tabella; [[CSV-Export]] esporta articoli, clienti e fatture per Excel o la contabilità.', 'Il [[Integritätsprüfung]] verifica a ogni apertura che giacenze e documenti siano coerenti.'],
      tip: 'Cancellando la cronologia o i «dati dei siti» del browser si cancellano anche i dati del programma. Fate prima un backup.', shot: 'daten', caption: 'Fig. 9 – Backup, ripristino e CSV' },
    { id: 'einstellungen', title: 'Impostazioni e utenti', intro: 'In [[Einstellungen]] il titolare modifica [[Firma]] e [[Zahlungsziel (Tage)]] e crea gli utenti.',
      steps: ['Modificate i valori e cliccate [[Speichern]].', 'In [[Neuer Benutzer]] scegliete [[Name]] e [[Rolle]]: il [[Inhaber]] può tutto, il [[Mitarbeiter]] non emette fatture, note di credito né rettifiche di giacenza.', 'Con [[Wechseln]] scegliete chi sta lavorando.'],
      tip: 'I ruoli sono regole operative su questo dispositivo, non una protezione d’accesso.', shot: 'einstellungen', caption: 'Fig. 10 – Impostazioni, utenti e lingua' },
    { id: 'hilfe', title: 'Risoluzione dei problemi', intro: 'Il programma controlla ogni inserimento. Se qualcosa non è possibile, appare in alto un messaggio chiaro e nulla viene modificato.',
      bullets: ['«Quantità superiore al residuo dell’ordine.»: non si può consegnare più di quanto è aperto nell’ordine.', '«Giacenza disponibile insufficiente.»: registrate prima un [[Wareneingang]].', 'Dati persi? Caricate l’ultimo backup con [[Sicherung wiederherstellen]].', 'Altre postazioni: i dati non vengono condivisi automaticamente. Trasferiteli con un backup.', 'Fate verificare fatture e aliquote dal vostro commercialista prima dell’uso.', 'Domande: tramite il vostro portale clienti INFINITY EARN.'] },
  ],
};

const EN: Texts = {
  doc: 'User manual', product: 'Inventory management', forCompany: 'Delivered to', version: 'Program version', contents: 'Contents',
  page: (p, t) => `User manual Inventory management · Page ${p} of ${t}`,
  figuresNote: 'The figures show the real program with sample data in the standard design. Colours and logo of your version may differ; buttons, fields and workflows are identical.',
  setupTitle: 'Your setup', setupIntro: 'These values were taken from your order and apply from the first start:',
  taxRates: 'Tax rates', numbers: 'Number ranges', paymentTerm: (d) => `Payment term: ${d} days`,
  seq: { quote: 'Quotes', order: 'Orders', delivery: 'Delivery notes', invoice: 'Invoices', credit: 'Credit notes' },
  tipLabel: 'Tip:',
  chapters: [
    { id: 'start', title: 'Getting started', intro: 'The inventory management is a single file that runs in your browser (Microsoft Edge, Google Chrome, Firefox or Safari). It needs no installation and no internet; your data never leaves the computer.',
      steps: ['Save the file warenwirtschaft.html in a fixed place, e.g. in “Documents”.', 'Open the file by double-clicking. The [[Übersicht]] appears.', 'Under [[Einstellungen]] choose the [[Ansicht]] – [[Einsteiger]] shows the essentials, [[Profi]] all functions – and the [[Sprache]] (DE, IT, EN).', 'The [[Übersicht]] shows revenue, [[Offene Posten]], stock value and, under [[Zu tun]], the next steps.'],
      tip: 'Your data lives only in this computer’s browser. Download a backup regularly (chapter 8).', shot: 'uebersicht', caption: 'Fig. 1 – Overview with key figures and to-do list' },
    { id: 'artikel', title: 'Items and stock', intro: 'Under [[Artikel]] you maintain your range and book stock movements. Stock always results from the booked movements.',
      steps: ['Under [[Neuer Artikel]] enter [[Artikelnummer]], [[Bezeichnung]], [[Einheit]], [[Verkaufspreis]], [[Einkaufspreis]] and [[Steuersatz]], then click [[Anlegen]].', 'Book delivered goods with [[Wareneingang]]: choose the item, enter the [[Menge]], confirm.', 'The owner books stock-take differences with [[Korrektur (+/−)]] and a [[Grund]].', 'The list shows [[Bestand]], [[Reserviert]] (set aside for orders) and [[Verfügbar]]. Use [[Suche]] to find items quickly.'],
      tip: 'Enter amounts with a decimal comma, e.g. 12,50.', shot: 'artikel', caption: 'Fig. 2 – Items with stock, reservations and goods receipt' },
    { id: 'kunden', title: 'Customers', intro: 'Under [[Kunden]] you create your customers. Each customer automatically gets a customer number.',
      steps: ['Under [[Neuer Kunde]] enter [[Name]] and, if needed, [[E-Mail]], [[Adresse]] and [[USt-IdNr.]].', 'Save with [[Anlegen]]. The customer is then available in quotes, orders and invoices.'],
      shot: 'kunden', caption: 'Fig. 3 – Customer list' },
    { id: 'angebote', title: 'Quotes', intro: 'A quote is first saved as a draft, then finalised (it gets a number and can no longer be changed) and finally accepted or rejected.',
      steps: ['Under [[Neues Angebot]] choose the [[Kunde]] and for each [[Position]] item and [[Menge]]; set [[Gültig (Tage)]].', '[[Als Entwurf speichern]] – the draft can still be checked.', '[[Festschreiben]] assigns the quote number. Use [[Drucken]] to save the quote as PDF or print it.', 'If the customer agrees, click [[Annehmen]]: an order is created automatically and the goods are reserved. Otherwise [[Ablehnen]].'],
      shot: 'angebote', caption: 'Fig. 4 – Quotes: draft, finalised, accepted' },
    { id: 'auftraege', title: 'Orders and deliveries', intro: 'Orders come from accepted quotes or directly via [[Neuer Auftrag (ohne Angebot)]]. From then on the goods are reserved.',
      steps: ['In the order, enter the delivered [[Menge]] per item and click [[Liefern]]. Partial deliveries are possible; the rest stays open.', 'Each delivery books the stock issue and creates a numbered delivery note.', 'If a remainder will not be delivered, close it with [[Rest stornieren]] and a [[Grund]] – the reservation is released.'],
      tip: 'An accidental double click on [[Liefern]] is detected and not booked twice.', shot: 'auftraege', caption: 'Fig. 5 – Orders with delivered quantities' },
    { id: 'rechnungen', title: 'Invoices, payments and credit notes', intro: 'Invoices are created from deliveries. Nothing is billed twice or forgotten.',
      steps: ['Under [[Lieferungen abrechnen]] choose the deliveries and click [[Rechnungsentwurf erstellen]].', 'Check the draft, then [[Festschreiben]] (assigns the invoice number, unchangeable afterwards) or [[Verwerfen]].', 'Book incoming payments with [[Betrag]] and [[Zahlung erfassen]]. Partial payments are possible; [[Offen]] shows the rest.', 'Errors or returns: [[Gutschrift erstellen]], enter quantities and [[Grund]], tick [[Ware zurück ins Lager]] if needed, then finalise.', 'Overdue invoices automatically get a [[Mahnstufe]] (1–3) according to the configured periods.'],
      shot: 'rechnungen', caption: 'Fig. 6 – Invoices with status, due date and payment entry',
      shot2: 'beleg', caption2: 'Fig. 7 – Print view of an invoice – save as PDF or print with the Print button' },
    { id: 'berichte', title: 'Reports', intro: 'Under [[Berichte]] choose a period ([[Von]], [[Bis]]) and click [[Anzeigen]].',
      bullets: ['[[Umsatz]] net and tax in the period', '[[Lagerliste]] with stock, reservations and value', '[[Offene Posten]] with due date and dunning level'],
      shot: 'berichte', caption: 'Fig. 8 – Reports: revenue, stock list, open items' },
    { id: 'daten', title: 'Backup and data exchange', intro: 'Because the data is stored only in this browser, backing up is your most important task.',
      steps: ['[[Sicherung herunterladen]] saves all data as a file (sicherung-YYYY-MM-DD.json). Keep copies, e.g. on a USB stick.', '[[Sicherung wiederherstellen]] loads a backup, e.g. on a new computer. Note: the data in the browser is replaced.', '[[CSV-Import]] takes items or customers from a spreadsheet; [[CSV-Export]] outputs items, customers and invoices for Excel or accounting.', 'The [[Integritätsprüfung]] checks on every visit that stock and documents match.'],
      tip: 'Clearing the browser history or “site data” also deletes the program’s data. Back up first.', shot: 'daten', caption: 'Fig. 9 – Backup, restore and CSV' },
    { id: 'einstellungen', title: 'Settings and users', intro: 'Under [[Einstellungen]] the owner changes [[Firma]] and [[Zahlungsziel (Tage)]] and creates users.',
      steps: ['Change the values and click [[Speichern]].', 'Under [[Neuer Benutzer]] choose [[Name]] and [[Rolle]]: the [[Inhaber]] may do everything, [[Mitarbeiter]] cannot finalise invoices, issue credit notes or correct stock.', 'Use [[Wechseln]] to choose who is working.'],
      tip: 'Roles are workflow rules on this device, not access protection.', shot: 'einstellungen', caption: 'Fig. 10 – Settings, users and language' },
    { id: 'hilfe', title: 'Troubleshooting', intro: 'The program checks every entry. If something is not possible, a clear message appears at the top and nothing is changed.',
      bullets: ['“Quantity exceeds what is open on the order.”: you cannot deliver more than is open on the order.', '“Not enough stock available.”: book a [[Wareneingang]] first.', 'Data gone? Load the last backup via [[Sicherung wiederherstellen]].', 'Other workstations: data is not shared automatically. Transfer it with a backup.', 'Have invoices and tax rates checked by your tax adviser before use.', 'Questions: via your INFINITY EARN customer portal.'] },
  ],
};

export const MANUAL_TEXTS: Record<Lang, Texts> = { de: DE, it: IT, en: EN };

/** Ersetzt [[Schlüssel]] durch die Bezeichnung des Programms in Anführungszeichen. */
export function label(lang: Lang, text: string): string {
  const [o, c] = Q[lang];
  return text.replace(/\[\[([^\]]+)\]\]/g, (_m, k: string) => `${o}${tr(lang, k)}${c}`);
}

export function placeholders(): string[] {
  const keys = new Set<string>();
  const all = JSON.stringify([DE, IT, EN]);
  for (const m of all.matchAll(/\[\[([^\]]+)\]\]/g)) keys.add(m[1] as string);
  return [...keys];
}

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const hexRgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export interface ManualMeta { pages: number; images: number; chapters: string[] }

export function buildManual(brand: Brand, setup: Setup, opts: { version: string; created?: Date }): { bytes: Uint8Array; meta: ManualMeta } {
  const lang = brand.lang;
  const t = MANUAL_TEXTS[lang];
  const accent = hexRgb(brandColors(brand.primary).primary);
  const L = (s: string): string => label(lang, s);
  const doc = new PdfDoc({ title: `${t.doc} - ${t.product} - ${brand.company}`, author: brand.company, lang, created: opts.created, footer: t.page, accent });
  const shot = (name: ShotName): Uint8Array => {
    const s = SHOTS_JPEG_BASE64[lang][name];
    if (!s) throw new Error(`MANUAL_SHOT_MISSING:${lang}-${name}`);
    return b64(s);
  };

  // Deckblatt
  doc.newPage({ footer: false });
  doc.rect(0, doc.pageH - 300, doc.pageW, 300, accent);
  const logo = safeLogo(brand.logoDataUrl);
  if (logo?.startsWith('data:image/jpeg;base64,')) {
    try {
      doc.y = doc.pageH - 60;
      doc.image(b64(logo.slice(23)), { width: 90, x: doc.margin, frame: false });
    } catch {
      /* Logo nicht lesbar: Deckblatt ohne Logo */
    }
  }
  doc.text(doc.margin, doc.pageH - 200, t.doc, { size: 30, bold: true, color: [255, 255, 255] });
  doc.text(doc.margin, doc.pageH - 232, t.product, { size: 17, color: [255, 255, 255] });
  doc.text(doc.margin, doc.pageH - 340, t.forCompany, { size: 10, color: doc.muted });
  doc.text(doc.margin, doc.pageH - 362, brand.company, { size: 18, bold: true });
  doc.text(doc.margin, doc.pageH - 386, `${t.version}: ${opts.version}`, { size: 9.5, color: doc.muted });
  doc.y = doc.pageH - 430;
  doc.paragraph(t.contents, { size: 13, bold: true, gapAfter: 6 });
  t.chapters.forEach((c, i) => doc.paragraph(`${i + 1}   ${c.title}`, { size: 10.5, gapAfter: 1 }));
  doc.y -= 10;
  doc.note(t.figuresNote);

  // Ihre Einrichtung
  doc.newPage();
  doc.heading(t.setupTitle);
  doc.paragraph(t.setupIntro);
  doc.paragraph(t.taxRates, { bold: true, gapAfter: 2 });
  doc.bullets(setup.taxRates.map((r) => (r.label.includes('%') ? r.label : `${r.label} (${(r.bps / 100).toLocaleString(lang === 'en' ? 'en-GB' : lang)} %)`)));
  doc.paragraph(t.numbers, { bold: true, gapAfter: 2 });
  doc.bullets(Object.entries(setup.prefixes).map(([k, p]) => `${t.seq[k] ?? k}: ${p}00001, ${p}00002 …`));
  doc.paragraph(t.paymentTerm(setup.paymentTermDays), { bold: true });

  const chapters: string[] = [];
  t.chapters.forEach((c, i) => {
    if (i > 0 && (c.shot || i === 0)) doc.newPage();
    doc.heading(`${i + 1} ${c.title}`);
    chapters.push(c.id);
    doc.paragraph(L(c.intro));
    if (c.steps) doc.bullets(c.steps.map(L), { numbered: true });
    if (c.bullets) doc.bullets(c.bullets.map(L));
    if (c.tip) doc.note(L(c.tip), { label: t.tipLabel });
    if (c.shot) doc.image(shot(c.shot), { caption: c.caption });
    if (c.shot2) doc.image(shot(c.shot2), { caption: c.caption2 });
  });
  const bytes = doc.toBytes();
  return { bytes, meta: { pages: doc.pageCount, images: doc.imageCount, chapters } };
}
