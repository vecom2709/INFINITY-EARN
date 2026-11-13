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
