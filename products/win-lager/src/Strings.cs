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
        public int[] TaxRatesBps;

        public static Brand Current()
        {
            return new Brand
            {
                ProductId = BrandData.ProductId, ProductName = BrandData.ProductName, Version = BrandData.Version, Company = BrandData.Company,
                Color = BrandData.Color, Language = BrandData.Language, Culture = BrandData.Culture, Currency = BrandData.Currency, TaxRatesBps = BrandData.TaxRatesBps,
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
