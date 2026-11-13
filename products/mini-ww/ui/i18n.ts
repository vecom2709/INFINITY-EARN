/** Texte der Mini-Warenwirtschaft (DE ist Schlüssel; IT/EN vollständig – ein Test prüft das). */
export type Lang = 'de' | 'it' | 'en';

const D: Record<string, [string, string]> = {
  // Navigation
  'Übersicht': ['Panoramica', 'Overview'], 'Artikel': ['Articoli', 'Items'], 'Kunden': ['Clienti', 'Customers'], 'Angebote': ['Offerte', 'Quotes'],
  'Aufträge': ['Ordini', 'Orders'], 'Rechnungen': ['Fatture', 'Invoices'], 'Berichte': ['Report', 'Reports'], 'Daten': ['Dati', 'Data'], 'Einstellungen': ['Impostazioni', 'Settings'],
  'Zum Inhalt springen': ['Vai al contenuto', 'Skip to content'], 'Hauptmenü': ['Menu principale', 'Main menu'],
  'Angemeldet als': ['Utente attivo', 'Signed in as'], 'Inhaber': ['Titolare', 'Owner'], 'Mitarbeiter': ['Collaboratore', 'Staff'],
  'Einsteiger': ['Base', 'Basic'], 'Profi': ['Esperto', 'Pro'], 'Ansicht': ['Vista', 'View'], 'Sprache': ['Lingua', 'Language'],
  // Übersicht
  'Umsatz diesen Monat (netto)': ['Fatturato del mese (netto)', 'Revenue this month (net)'], 'Offene Posten': ['Partite aperte', 'Open items'],
  'davon überfällig': ['di cui scadute', 'of which overdue'], 'Lagerwert (Einkauf)': ['Valore di magazzino (acquisto)', 'Stock value (cost)'],
  'Knapper Bestand': ['Scorte basse', 'Low stock'], 'Alles im grünen Bereich.': ['Tutto in ordine.', 'All good.'],
  'Zu tun': ['Da fare', 'To do'], 'Rechnungsentwürfe festschreiben': ['Emettere le bozze di fattura', 'Finalise draft invoices'],
  'Lieferungen ohne Rechnung': ['Consegne non fatturate', 'Deliveries not invoiced'], 'Offene Aufträge': ['Ordini aperti', 'Open orders'],
  'Letzte Sicherung': ['Ultimo backup', 'Last backup'], 'noch nie': ['mai', 'never'], 'Jetzt sichern': ['Esegui backup', 'Back up now'],
  'Ihre Daten liegen nur in diesem Browser. Sichern Sie regelmäßig.': ['I dati sono solo in questo browser. Esegui backup regolarmente.', 'Your data lives only in this browser. Back up regularly.'],
  // Artikel
  'Neuer Artikel': ['Nuovo articolo', 'New item'], 'Artikelnummer': ['Codice articolo', 'Item number'], 'Bezeichnung': ['Descrizione', 'Description'],
  'Einheit': ['Unità', 'Unit'], 'Verkaufspreis': ['Prezzo di vendita', 'Sales price'], 'Einkaufspreis': ['Prezzo di acquisto', 'Purchase price'],
  'Steuersatz': ['Aliquota IVA', 'Tax rate'], 'Anlegen': ['Crea', 'Create'], 'Bestand': ['Giacenza', 'Stock'], 'Reserviert': ['Riservato', 'Reserved'],
  'Verfügbar': ['Disponibile', 'Available'], 'Wareneingang': ['Carico merce', 'Goods receipt'], 'Menge': ['Quantità', 'Quantity'], 'Buchen': ['Registra', 'Book'],
  'Korrektur (+/−)': ['Rettifica (+/−)', 'Correction (+/−)'], 'Grund': ['Motivo', 'Reason'], 'Korrigieren': ['Rettifica', 'Correct'],
  'Suche': ['Cerca', 'Search'], 'Noch keine Artikel.': ['Nessun articolo.', 'No items yet.'], 'Bewegungen': ['Movimenti', 'Movements'],
  // Kunden
  'Neuer Kunde': ['Nuovo cliente', 'New customer'], 'Name': ['Nome', 'Name'], 'E-Mail': ['E-mail', 'Email'], 'Adresse': ['Indirizzo', 'Address'],
  'USt-IdNr.': ['Partita IVA', 'VAT ID'], 'Noch keine Kunden.': ['Nessun cliente.', 'No customers yet.'], 'Kundennr.': ['N. cliente', 'Customer no.'],
  // Angebote / Aufträge
  'Neues Angebot': ['Nuova offerta', 'New quote'], 'Angebot': ['Offerta', 'Quote'], 'Neuer Auftrag (ohne Angebot)': ['Nuovo ordine (senza offerta)', 'New order (without quote)'],
  'Kunde': ['Cliente', 'Customer'], 'Position': ['Posizione', 'Line'], 'Gültig (Tage)': ['Validità (giorni)', 'Valid (days)'],
  'Als Entwurf speichern': ['Salva come bozza', 'Save as draft'], 'Auftrag anlegen': ['Crea ordine', 'Create order'],
  'Nummer': ['Numero', 'Number'], 'Status': ['Stato', 'Status'], 'Betrag': ['Importo', 'Amount'], 'Aktion': ['Azione', 'Action'],
  'Entwurf': ['Bozza', 'Draft'], 'Versendet': ['Inviata', 'Sent'], 'Angenommen': ['Accettata', 'Accepted'], 'Abgelehnt': ['Rifiutata', 'Rejected'],
  'Festschreiben': ['Emetti', 'Finalise'], 'Annehmen': ['Accetta', 'Accept'], 'Ablehnen': ['Rifiuta', 'Reject'], 'gültig bis': ['valida fino al', 'valid until'],
  'Offen': ['Aperto', 'Open'], 'Teilgeliefert': ['Parzialmente consegnato', 'Partly delivered'], 'Geliefert': ['Consegnato', 'Delivered'], 'Storniert': ['Annullato', 'Cancelled'],
  'Liefern': ['Consegna', 'Deliver'], 'offen': ['aperto', 'open'], 'Rest stornieren': ['Annulla il resto', 'Cancel remainder'],
  'Noch keine Angebote.': ['Nessuna offerta.', 'No quotes yet.'], 'Noch keine Aufträge.': ['Nessun ordine.', 'No orders yet.'],
  'Erst Kunden und Artikel anlegen.': ['Crea prima clienti e articoli.', 'Create customers and items first.'], 'Drucken': ['Stampa', 'Print'],
  // Rechnungen
  'Lieferungen abrechnen': ['Fattura le consegne', 'Invoice deliveries'], 'Rechnungsentwurf erstellen': ['Crea bozza di fattura', 'Create draft invoice'],
  'Keine offenen Lieferungen.': ['Nessuna consegna da fatturare.', 'No deliveries to invoice.'], 'Lieferung': ['Consegna', 'Delivery'],
  'Rechnung': ['Fattura', 'Invoice'], 'Gutschrift': ['Nota di credito', 'Credit note'], 'Festgeschrieben': ['Emessa', 'Final'], 'Verwerfen': ['Scarta', 'Discard'],
  'Fällig': ['Scadenza', 'Due'], 'Bezahlt': ['Pagato', 'Paid'], 'Zahlung erfassen': ['Registra pagamento', 'Record payment'],
  'Gutschrift erstellen': ['Crea nota di credito', 'Create credit note'], 'Ware zurück ins Lager': ['Merce rientrata in magazzino', 'Return goods to stock'],
  'Mahnstufe': ['Livello sollecito', 'Dunning level'], 'Guthaben des Kunden': ['Credito del cliente', 'Customer credit'], 'Noch keine Belege.': ['Nessun documento.', 'No documents yet.'],
  'Netto': ['Imponibile', 'Net'], 'Steuer': ['IVA', 'Tax'], 'Brutto': ['Totale', 'Gross'], 'Summe': ['Totale', 'Total'], 'Einzelpreis': ['Prezzo unitario', 'Unit price'],
  'Bitte vor Verwendung von der Steuerberatung prüfen lassen.': ['Da verificare con il commercialista prima dell’uso.', 'Have this checked by your tax adviser before use.'],
  // Berichte
  'Umsatz': ['Fatturato', 'Revenue'], 'Von': ['Dal', 'From'], 'Bis': ['Al', 'To'], 'Anzeigen': ['Mostra', 'Show'], 'Lagerliste': ['Elenco magazzino', 'Stock list'], 'Wert': ['Valore', 'Value'],
  'Rechnungen / Gutschriften': ['Fatture / note di credito', 'Invoices / credit notes'],
  // Daten
  'Sicherung herunterladen': ['Scarica backup', 'Download backup'], 'Sicherung wiederherstellen': ['Ripristina backup', 'Restore backup'],
  'Ersetzt alle Daten in diesem Browser durch die Sicherung.': ['Sostituisce tutti i dati di questo browser con il backup.', 'Replaces all data in this browser with the backup.'],
  'CSV-Export': ['Esporta CSV', 'CSV export'], 'CSV-Import': ['Importa CSV', 'CSV import'], 'Datei': ['File', 'File'], 'Importieren': ['Importa', 'Import'],
  'Integritätsprüfung': ['Verifica integrità', 'Integrity check'], 'Alle Daten sind konsistent.': ['Tutti i dati sono coerenti.', 'All data is consistent.'],
  // Einstellungen
  'Firma': ['Azienda', 'Company'], 'Zahlungsziel (Tage)': ['Termine di pagamento (giorni)', 'Payment term (days)'], 'Speichern': ['Salva', 'Save'],
  'Benutzer': ['Utenti', 'Users'], 'Neuer Benutzer': ['Nuovo utente', 'New user'], 'Rolle': ['Ruolo', 'Role'], 'Wechseln': ['Cambia', 'Switch'],
  'Rollen sind Ablaufregeln auf diesem Gerät, kein Zugriffsschutz.': ['I ruoli sono regole operative su questo dispositivo, non una protezione di accesso.', 'Roles are workflow rules on this device, not access protection.'],
  // Meldungen aus Aktionen
  'Unbekannte Aktion.': ['Azione sconosciuta.', 'Unknown action.'], 'Artikel angelegt.': ['Articolo creato.', 'Item created.'], 'Wareneingang gebucht.': ['Carico registrato.', 'Goods receipt booked.'],
  'Korrektur gebucht.': ['Rettifica registrata.', 'Correction booked.'], 'Kunde angelegt.': ['Cliente creato.', 'Customer created.'],
  'Angebot als Entwurf gespeichert.': ['Offerta salvata come bozza.', 'Quote saved as draft.'], 'Angebot festgeschrieben und nummeriert.': ['Offerta emessa e numerata.', 'Quote finalised and numbered.'],
  'Angebot angenommen – Auftrag angelegt, Ware reserviert.': ['Offerta accettata – ordine creato, merce riservata.', 'Quote accepted – order created, stock reserved.'],
  'Angebot als abgelehnt markiert.': ['Offerta segnata come rifiutata.', 'Quote marked as rejected.'], 'Auftrag angelegt, Ware reserviert.': ['Ordine creato, merce riservata.', 'Order created, stock reserved.'],
  'Lieferung gebucht.': ['Consegna registrata.', 'Delivery booked.'], 'Restmenge storniert.': ['Quantità residua annullata.', 'Remainder cancelled.'],
  'Rechnungsentwurf erstellt.': ['Bozza di fattura creata.', 'Draft invoice created.'], 'Entwurf verworfen.': ['Bozza scartata.', 'Draft discarded.'],
  'Beleg festgeschrieben und nummeriert.': ['Documento emesso e numerato.', 'Document finalised and numbered.'],
  'Gutschrift als Entwurf erstellt – bitte festschreiben.': ['Nota di credito creata come bozza – da emettere.', 'Credit note drafted – please finalise.'],
  'Zahlung erfasst.': ['Pagamento registrato.', 'Payment recorded.'], 'Einstellungen gespeichert.': ['Impostazioni salvate.', 'Settings saved.'],
  'Benutzer angelegt.': ['Utente creato.', 'User created.'], 'Benutzer gewechselt.': ['Utente cambiato.', 'User switched.'], 'Sprache gewechselt.': ['Lingua cambiata.', 'Language changed.'],
  'Ansicht gewechselt.': ['Vista cambiata.', 'View changed.'], 'Sicherung wiederhergestellt.': ['Backup ripristinato.', 'Backup restored.'],
  'Import abgeschlossen.': ['Importazione completata.', 'Import completed.'], 'Sicherung heruntergeladen.': ['Backup scaricato.', 'Backup downloaded.'],
  'Demo – alle Daten bleiben nur in diesem Browser.': ['Demo – tutti i dati restano solo in questo browser.', 'Demo – all data stays in this browser only.'],
  'Vorgang nicht möglich – bitte Eingaben prüfen.': ['Operazione non possibile – controllare i dati.', 'Not possible – please check your entries.'],
  // Fachfehler je Code (IT/EN; Deutsch zeigt die detaillierte Meldung der Fachlogik)
  ERR_UNKNOWN_USER: ['Utente sconosciuto.', 'Unknown user.'], ERR_FORBIDDEN: ['Operazione riservata al titolare.', 'Only the owner may do this.'],
  ERR_INVALID_QUANTITY: ['Quantità non valida: inserire un numero intero maggiore di 0.', 'Invalid quantity: enter a whole number greater than 0.'],
  ERR_INVALID_AMOUNT: ['Importo non valido (es. 12,50).', 'Invalid amount (e.g. 12.50).'], ERR_ARTICLE_NOT_FOUND: ['Articolo non trovato.', 'Item not found.'],
  ERR_CUSTOMER_NOT_FOUND: ['Cliente non trovato.', 'Customer not found.'], ERR_SUPPLIER_NOT_FOUND: ['Fornitore non trovato.', 'Supplier not found.'],
  ERR_INVALID_SKU: ['Codice articolo non valido (1–40 caratteri: lettere, cifre, . - _).', 'Invalid item number (1–40 characters: letters, digits, . - _).'],
  ERR_DUPLICATE_SKU: ['Codice articolo già esistente.', 'Item number already exists.'], ERR_INVALID_NAME: ['Nome mancante o troppo lungo.', 'Name missing or too long.'],
  ERR_UNKNOWN_TAX_RATE: ['Aliquota IVA sconosciuta.', 'Unknown tax rate.'], ERR_INVALID_EMAIL: ['Indirizzo e-mail non valido.', 'Invalid email address.'],
  ERR_REASON_REQUIRED: ['Indicare un motivo.', 'Please give a reason.'], ERR_NEGATIVE_STOCK: ['La giacenza diventerebbe negativa.', 'Stock would become negative.'],
  ERR_BELOW_RESERVED: ['La merce è riservata per ordini.', 'The goods are reserved for orders.'], ERR_NO_LINES: ['Inserire almeno una posizione.', 'Enter at least one line.'],
  ERR_ARTICLE_INACTIVE: ['Articolo non più attivo.', 'Item is no longer active.'], ERR_DUPLICATE_LINE: ['Articolo ripetuto: unire le quantità.', 'Item listed twice: combine the quantities.'],
  ERR_QUOTE_NOT_FOUND: ['Offerta non trovata.', 'Quote not found.'], ERR_ORDER_NOT_FOUND: ['Ordine non trovato.', 'Order not found.'],
  ERR_INVALID_STATE: ['Operazione non possibile in questo stato.', 'Not possible in this status.'], ERR_QUOTE_EXPIRED: ['L’offerta è scaduta.', 'The quote has expired.'],
  ERR_INSUFFICIENT_STOCK: ['Giacenza disponibile insufficiente.', 'Not enough stock available.'], ERR_REF_REQUIRED: ['Riferimento consegna mancante.', 'Delivery reference missing.'],
  ERR_DUPLICATE_BOOKING: ['Questa consegna è già registrata.', 'This delivery is already booked.'], ERR_NOT_IN_ORDER: ['Articolo non presente nell’ordine.', 'Item is not part of the order.'],
  ERR_OVER_DELIVERY: ['Quantità superiore al residuo dell’ordine.', 'Quantity exceeds what is open on the order.'], ERR_INVOICE_NOT_FOUND: ['Documento non trovato.', 'Document not found.'],
  ERR_NO_DELIVERIES: ['Selezionare almeno una consegna.', 'Select at least one delivery.'], ERR_DELIVERY_NOT_FOUND: ['Consegna non trovata.', 'Delivery not found.'],
  ERR_ALREADY_INVOICED: ['Consegna già fatturata.', 'Delivery already invoiced.'], ERR_MIXED_CUSTOMERS: ['Consegne di clienti diversi non possono andare in una fattura.', 'Deliveries for different customers cannot share an invoice.'],
  ERR_IMMUTABLE: ['Documento emesso: non modificabile, usare una nota di credito.', 'Final document: cannot be changed, use a credit note.'],
  ERR_NOT_IN_INVOICE: ['Articolo non presente nella fattura.', 'Item is not part of the invoice.'], ERR_OVER_CREDIT: ['Quantità superiore a quanto fatturato.', 'Quantity exceeds what was invoiced.'],
  ERR_OVERPAYMENT: ['Importo superiore al residuo da pagare.', 'Amount exceeds what is open.'], ERR_INVALID_DUNNING: ['Termini di sollecito non validi.', 'Invalid dunning periods.'],
  ERR_INVALID_TAX_RATE: ['Aliquote IVA non valide.', 'Invalid tax rates.'], ERR_INVALID_SETUP: ['Configurazione iniziale non valida.', 'Invalid initial setup.'], ERR_TAX_RATE_IN_USE: ['Aliquota usata da articoli.', 'Tax rate is used by items.'],
  ERR_BACKUP_INVALID: ['Il file non è un backup valido.', 'The file is not a valid backup.'], ERR_BACKUP_VERSION: ['Versione del backup non compatibile.', 'Backup version not compatible.'],
  ERR_BACKUP_CORRUPT: ['Backup danneggiato o modificato.', 'Backup is damaged or was altered.'], ERR_BACKUP_INCONSISTENT: ['Backup non coerente: dati non ripristinati.', 'Backup is inconsistent: data not restored.'],
  ERR_CSV_HEADER: ['Intestazione CSV non corretta.', 'Incorrect CSV header.'], ERR_CSV_ROWS: ['Errori nelle righe del CSV: nulla è stato importato.', 'Errors in CSV rows: nothing was imported.'],
};

export function tr(lang: Lang, de: string): string {
  if (lang === 'de') return de;
  const hit = D[de];
  return hit ? hit[lang === 'it' ? 0 : 1] : de;
}

export const KEYS: readonly string[] = Object.keys(D);
