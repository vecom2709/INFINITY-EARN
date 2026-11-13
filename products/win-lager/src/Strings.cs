// Kundenspezifische Einstellungen (vom Build je Auftrag erzeugt: BrandData.g.cs) und Texte in DE/IT/EN.
using System.Collections.Generic;

namespace InfinityEarn.WinLager
{
    public class Brand
    {
        public string ProductId;
        public string ProductName;
        public string Version;
        public string Company;
        public string Color;
        public string Language;
        public string Culture;
        public string Currency;
        public string Country;
        public int[] TaxRatesBps;

        public static Brand Current()
        {
            return new Brand
            {
                ProductId = BrandData.ProductId, ProductName = BrandData.ProductName, Version = BrandData.Version, Company = BrandData.Company,
                Color = BrandData.Color, Language = BrandData.Language, Culture = BrandData.Culture, Currency = BrandData.Currency, Country = BrandData.Country, TaxRatesBps = BrandData.TaxRatesBps,
            };
        }
    }

    public static class Strings
    {
        static readonly Dictionary<string, string[]> T = new Dictionary<string, string[]>
        {
            // key: { de, it, en }
            { "articles", new[] { "Artikel", "Articoli", "Items" } },
            { "stock", new[] { "Lager", "Magazzino", "Stock" } },
            { "invoices", new[] { "Rechnungen", "Fatture", "Invoices" } },
            { "invoice", new[] { "Rechnung", "Fattura", "Invoice" } },
            { "sku", new[] { "Artikelnummer", "Codice", "SKU" } },
            { "name", new[] { "Bezeichnung", "Descrizione", "Name" } },
            { "price", new[] { "Preis netto", "Prezzo netto", "Net price" } },
            { "tax", new[] { "Steuer", "IVA", "Tax" } },
            { "onhand", new[] { "Bestand", "Giacenza", "On hand" } },
            { "min", new[] { "Mindestbestand", "Scorta minima", "Minimum" } },
            { "add", new[] { "Neu anlegen", "Nuovo", "Add" } },
            { "save", new[] { "Speichern", "Salva", "Save" } },
            { "delete", new[] { "Löschen", "Elimina", "Delete" } },
            { "export", new[] { "Als CSV exportieren", "Esporta CSV", "Export CSV" } },
            { "in", new[] { "Wareneingang", "Carico", "Goods in" } },
            { "out", new[] { "Warenausgang", "Scarico", "Goods out" } },
            { "qty", new[] { "Menge", "Quantità", "Qty" } },
            { "reason", new[] { "Grund", "Motivo", "Reason" } },
            { "book", new[] { "Buchen", "Registra", "Book" } },
            { "history", new[] { "Lagerbewegungen", "Movimenti", "Movements" } },
            { "low", new[] { "Unter Mindestbestand", "Sotto scorta", "Below minimum" } },
            { "customer", new[] { "Kunde", "Cliente", "Customer" } },
            { "addline", new[] { "Position hinzufügen", "Aggiungi riga", "Add line" } },
            { "create", new[] { "Rechnung erstellen", "Crea fattura", "Create invoice" } },
            { "open", new[] { "Öffnen / drucken", "Apri / stampa", "Open / print" } },
            { "item", new[] { "Artikel", "Articolo", "Item" } },
            { "unit", new[] { "Einzelpreis", "Prezzo unit.", "Unit price" } },
            { "net", new[] { "Netto", "Imponibile", "Net" } },
            { "taxsum", new[] { "Steuer", "IVA", "Tax" } },
            { "gross", new[] { "Gesamt", "Totale", "Total" } },
            { "number", new[] { "Nummer", "Numero", "Number" } },
            { "date", new[] { "Datum", "Data", "Date" } },
            { "lines", new[] { "Positionen", "Righe", "Lines" } },
            { "saved", new[] { "Gespeichert", "Salvato", "Saved" } },
            { "error", new[] { "Bitte prüfen", "Controllare", "Please check" } },
            { "datadir", new[] { "Datenordner", "Cartella dati", "Data folder" } },
            { "recovered", new[] { "Die Datendatei war beschädigt – die letzte Sicherung wurde geladen.", "Il file dati era danneggiato – è stato caricato l'ultimo backup.", "The data file was damaged – the last backup was loaded." } },
            { "confirmdelete", new[] { "Artikel wirklich löschen?", "Eliminare davvero l'articolo?", "Really delete this item?" } },
            { "clearlines", new[] { "Positionen leeren", "Svuota righe", "Clear lines" } },
            // Meldungen der Fachregeln ({0} … werden ersetzt)
            { "e_price_missing", new[] { "Preis fehlt", "Prezzo mancante", "Price missing" } },
            { "e_price_invalid", new[] { "Preis ungültig: {0}", "Prezzo non valido: {0}", "Invalid price: {0}" } },
            { "e_price_range", new[] { "Preis außerhalb 0 bis 10.000.000", "Prezzo fuori dall'intervallo 0–10.000.000", "Price outside 0 to 10,000,000" } },
            { "e_price_decimals", new[] { "Höchstens zwei Nachkommastellen", "Al massimo due decimali", "At most two decimal places" } },
            { "e_sku", new[] { "Artikelnummer: 1 bis 30 Zeichen", "Codice: da 1 a 30 caratteri", "SKU: 1 to 30 characters" } },
            { "e_name", new[] { "Bezeichnung: 1 bis 120 Zeichen", "Descrizione: da 1 a 120 caratteri", "Name: 1 to 120 characters" } },
            { "e_duplicate", new[] { "Artikelnummer gibt es schon: {0}", "Codice già esistente: {0}", "SKU already exists: {0}" } },
            { "e_price_negative", new[] { "Preis darf nicht negativ sein", "Il prezzo non può essere negativo", "Price cannot be negative" } },
            { "e_tax", new[] { "Steuersatz 0 bis 30 %", "Aliquota IVA da 0 a 30 %", "Tax rate 0 to 30 %" } },
            { "e_min_negative", new[] { "Mindestbestand darf nicht negativ sein", "La scorta minima non può essere negativa", "Minimum cannot be negative" } },
            { "e_not_found", new[] { "Artikel nicht gefunden", "Articolo non trovato", "Item not found" } },
            { "e_in_use", new[] { "Artikel steht auf einer Rechnung und bleibt erhalten", "L'articolo è su una fattura e viene conservato", "The item is on an invoice and is kept" } },
            { "e_in_stock", new[] { "Erst den Bestand auf 0 buchen", "Prima portare la giacenza a 0", "Book the stock down to 0 first" } },
            { "e_qty_zero", new[] { "Menge darf nicht 0 sein", "La quantità non può essere 0", "Quantity cannot be 0" } },
            { "e_qty_big", new[] { "Menge zu groß", "Quantità troppo grande", "Quantity too large" } },
            { "e_stock", new[] { "Nicht genug Bestand: {0} vorhanden", "Giacenza insufficiente: {0} disponibili", "Not enough stock: {0} available" } },
            { "e_customer", new[] { "Kunde: 1 bis 200 Zeichen", "Cliente: da 1 a 200 caratteri", "Customer: 1 to 200 characters" } },
            { "e_no_lines", new[] { "Mindestens eine Position", "Almeno una riga", "At least one line" } },
            { "e_qty_min1", new[] { "Menge muss mindestens 1 sein", "La quantità deve essere almeno 1", "Quantity must be at least 1" } },
            { "e_not_found_sku", new[] { "Artikel nicht gefunden: {0}", "Articolo non trovato: {0}", "Item not found: {0}" } },
            { "e_stock_for", new[] { "Nicht genug Bestand für {0}: {1} vorhanden, {2} benötigt", "Giacenza insufficiente per {0}: {1} disponibili, {2} richiesti", "Not enough stock for {0}: {1} available, {2} needed" } },
            { "e_data_attr", new[] { "Datei beschädigt: {0} fehlt", "File danneggiato: manca {0}", "File damaged: {0} missing" } },
            { "e_data_nobackup", new[] { "Datendatei beschädigt und keine Sicherung vorhanden: {0}", "File dati danneggiato e nessun backup disponibile: {0}", "Data file damaged and no backup available: {0}" } },
            { "e_data_foreign", new[] { "Keine Datendatei dieses Programms", "Non è un file dati di questo programma", "Not a data file of this program" } },
            { "e_data_newer", new[] { "Datei stammt aus einer neueren Programmversion", "Il file proviene da una versione più recente del programma", "The file comes from a newer program version" } },
            { "e_qty_int", new[] { "Menge: ganze Zahl ab 1", "Quantità: numero intero da 1", "Quantity: whole number from 1" } },
            { "e_min_int", new[] { "Mindestbestand: ganze Zahl ab 0", "Scorta minima: numero intero da 0", "Minimum: whole number from 0" } },
            { "e_choose", new[] { "Bitte einen Artikel wählen", "Scegliere un articolo", "Please choose an item" } },
            // Firmendaten, Kunden und Pflichtangaben der Rechnung
            { "customers", new[] { "Kunden", "Clienti", "Customers" } },
            { "company", new[] { "Firma", "Azienda", "Company" } },
            { "f_name", new[] { "Name / Firma", "Nome / Ragione sociale", "Name / company" } },
            { "f_street", new[] { "Straße und Hausnummer", "Indirizzo e numero civico", "Street and number" } },
            { "f_zip", new[] { "PLZ", "CAP", "Postcode" } },
            { "f_city", new[] { "Ort", "Comune", "City" } },
            { "f_province", new[] { "Provinz (2 Buchstaben)", "Provincia (sigla)", "Province (2 letters)" } },
            { "f_country", new[] { "Land (z. B. DE)", "Nazione (es. IT)", "Country (e.g. DE)" } },
            { "f_vat", new[] { "USt-IdNr.", "Partita IVA", "VAT ID" } },
            { "f_taxno", new[] { "Steuernummer", "Codice fiscale", "Tax number" } },
            { "f_sdi", new[] { "SdI-Empfängercode", "Codice destinatario", "SdI recipient code" } },
            { "f_pec", new[] { "PEC-Adresse", "Indirizzo PEC", "PEC address" } },
            { "w_invalid", new[] { "ungültig", "non valido", "invalid" } },
            { "company_intro", new[] { "Diese Angaben stehen auf jeder Rechnung und sind gesetzlich vorgeschrieben. Ohne sie erstellt das Programm keine Rechnung. Eine Änderung gilt nur für neue Rechnungen.", "Questi dati compaiono su ogni fattura e sono obbligatori per legge. Senza di essi il programma non crea fatture. Una modifica vale solo per le nuove fatture.", "These details appear on every invoice and are required by law. Without them the program creates no invoice. A change applies to new invoices only." } },
            { "customers_intro", new[] { "Rechnungen gehen nur an angelegte Kunden mit vollständiger Anschrift. Jede Rechnung behält die Anschrift, die beim Erstellen galt.", "Le fatture vanno solo a clienti registrati con indirizzo completo. Ogni fattura conserva l'indirizzo valido al momento della creazione.", "Invoices go only to saved customers with a full address. Each invoice keeps the address that applied when it was created." } },
            { "exempt_de", new[] { "Kleinunternehmer (§ 19 UStG) – keine Umsatzsteuer", "Piccola impresa (§ 19 UStG) – senza IVA", "Small business (§ 19 UStG) – no VAT" } },
            { "exempt_at", new[] { "Kleinunternehmer (§ 6 Abs. 1 Z 27 UStG) – keine Umsatzsteuer", "Piccola impresa (§ 6 c. 1 n. 27 UStG) – senza IVA", "Small business (§ 6 (1) 27 UStG) – no VAT" } },
            { "exempt_it", new[] { "Regime forfettario (L. 190/2014) – ohne MwSt.", "Regime forfettario (L. 190/2014) – senza IVA", "Flat-rate scheme (L. 190/2014) – no VAT" } },
            { "note_exempt_de", new[] { "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.", "Ai sensi del § 19 UStG (Germania) non viene addebitata l'IVA.", "No VAT is charged under § 19 UStG (small business)." } },
            { "note_exempt_at", new[] { "Umsatzsteuerbefreit – Kleinunternehmer gemäß § 6 Abs. 1 Z 27 UStG.", "Esente IVA – piccola impresa ai sensi del § 6 c. 1 n. 27 UStG (Austria).", "VAT exempt – small business under § 6 (1) 27 UStG (Austria)." } },
            { "note_exempt_it", new[] { "Operazione in franchigia da IVA ai sensi dell'art. 1, cc. 54-89, L. 190/2014 (Pauschalregelung, ohne MwSt.).", "Operazione in franchigia da IVA ai sensi dell'art. 1, cc. 54-89, L. 190/2014 – regime forfettario.", "Operazione in franchigia da IVA ai sensi dell'art. 1, cc. 54-89, L. 190/2014 (flat-rate scheme, no VAT)." } },
            { "courtesy", new[] { "Kopie zur Ansicht – die steuerlich gültige Rechnung ist die über das SdI übermittelte XML-Datei (FatturaPA).", "Copia di cortesia – la fattura valida ai fini fiscali è il file XML trasmesso tramite SdI (FatturaPA).", "Courtesy copy – the invoice valid for tax purposes is the XML file sent through the SdI (FatturaPA)." } },
            { "invoicedate", new[] { "Rechnungsdatum", "Data fattura", "Invoice date" } },
            { "servicedate", new[] { "Leistungsdatum", "Data dell'operazione", "Date of supply" } },
            { "pos", new[] { "Pos.", "N.", "No." } },
            { "netrate", new[] { "Netto {0} %", "Imponibile {0} %", "Net {0} %" } },
            { "taxrate", new[] { "Umsatzsteuer {0} %", "IVA {0} %", "VAT {0} %" } },
            { "fpa_export", new[] { "FatturaPA (XML) speichern", "Salva FatturaPA (XML)", "Save FatturaPA (XML)" } },
            { "fpa_saved", new[] { "XML-Datei gespeichert:\n{0}\n\nÜbermitteln: im kostenlosen Portal „Fatture e Corrispettivi“ der Agenzia delle Entrate hochladen oder per PEC an das SdI senden.", "File XML salvato:\n{0}\n\nTrasmissione: caricarlo nel portale gratuito «Fatture e Corrispettivi» dell'Agenzia delle Entrate oppure inviarlo via PEC allo SdI.", "XML file saved:\n{0}\n\nTo send it: upload it in the free “Fatture e Corrispettivi” portal of the Agenzia delle Entrate or send it to the SdI by PEC." } },
            { "e_seller", new[] { "Firmendaten unvollständig (Reiter „Firma“): {0}", "Dati aziendali incompleti (scheda «Azienda»): {0}", "Company details incomplete (“Company” tab): {0}" } },
            { "e_customer_data", new[] { "Kundendaten von {0} unvollständig: {1}", "Dati del cliente {0} incompleti: {1}", "Customer details of {0} incomplete: {1}" } },
            { "e_customer_unknown", new[] { "Kunde nicht angelegt: {0} (Reiter „Kunden“)", "Cliente non registrato: {0} (scheda «Clienti»)", "Customer not saved: {0} (“Customers” tab)" } },
            { "e_customer_dup", new[] { "Kunde gibt es schon: {0}", "Cliente già esistente: {0}", "Customer already exists: {0}" } },
            { "e_customer_notfound", new[] { "Kunde nicht gefunden", "Cliente non trovato", "Customer not found" } },
            { "e_choose_customer", new[] { "Bitte einen Kunden wählen", "Scegliere un cliente", "Please choose a customer" } },
            { "e_service_future", new[] { "Leistungsdatum liegt in der Zukunft", "La data dell'operazione è nel futuro", "The date of supply is in the future" } },
            { "e_service_it", new[] { "Sofortige Rechnung: Leistungsdatum höchstens 12 Tage zurück", "Fattura immediata: data dell'operazione al massimo 12 giorni prima", "Immediate invoice: date of supply at most 12 days back" } },
            { "e_fpa_country", new[] { "FatturaPA gibt es nur für Verkäufer in Italien", "La FatturaPA è prevista solo per cedenti in Italia", "FatturaPA is only for sellers in Italy" } },
            { "e_fpa_legacy", new[] { "Diese Rechnung stammt aus einer älteren Programmversion ohne Pflichtangaben – keine FatturaPA möglich", "Questa fattura proviene da una versione precedente senza dati obbligatori – FatturaPA non possibile", "This invoice comes from an older version without mandatory details – no FatturaPA possible" } },
            { "e_fpa_schema", new[] { "Amtliches FatturaPA-Schema fehlt im Programm – bitte neu installieren", "Schema ufficiale FatturaPA mancante nel programma – reinstallare", "Official FatturaPA schema missing from the program – please reinstall" } },
            { "e_fpa_invalid", new[] { "FatturaPA entspricht nicht dem amtlichen Schema, keine Datei erzeugt: {0}", "La FatturaPA non è conforme allo schema ufficiale, nessun file creato: {0}", "FatturaPA does not match the official schema, no file created: {0}" } },
            { "e_fpa_zero", new[] { "Steuersatz 0 % braucht in der FatturaPA die Art der Befreiung (Natura) – das unterstützt das Programm nicht. Bitte einen Steuersatz wählen oder den Steuerberater fragen.", "L'aliquota 0 % richiede nella FatturaPA la Natura dell'operazione – non supportata dal programma. Scegliere un'aliquota o chiedere al commercialista.", "A 0 % rate needs the nature of the exemption (Natura) in FatturaPA – not supported by the program. Choose a tax rate or ask your tax adviser." } },
            { "version", new[] { "Version", "Versione", "Version" } },
            { "unsignedlabel", new[] { "unsigniert", "non firmato", "unsigned" } },
        };

        public static string Get(string lang, string key)
        {
            string[] v;
            if (!T.TryGetValue(key, out v)) return key;
            return lang == "it" ? v[1] : lang == "en" ? v[2] : v[0];
        }

        public static IEnumerable<string> Keys { get { return T.Keys; } }
    }
}
