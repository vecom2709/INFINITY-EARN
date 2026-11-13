// Fachtests des Kerns (positiv, negativ, Datenintegrität). Ausgabe: eine Zeile je Test, Exit-Code = Anzahl Fehler.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;

namespace InfinityEarn.WinLager
{
    static class Tests
    {
        static int failed, passed;

        static void T(string name, Action body)
        {
            try { body(); passed++; Console.WriteLine("ok   " + name); }
            catch (Exception ex) { failed++; Console.WriteLine("FAIL " + name + " :: " + ex.GetType().Name + ": " + ex.Message); }
        }
        static void Eq<X>(X expected, X actual, string what) { if (!EqualityComparer<X>.Default.Equals(expected, actual)) throw new Exception(what + ": erwartet " + expected + ", erhalten " + actual); }
        static void True(bool c, string what) { if (!c) throw new Exception(what); }
        static string Throws(Action a) { try { a(); } catch (DomainException d) { return d.Code; } throw new Exception("Fehler erwartet, aber keiner"); }

        static string TempFile() { var d = Path.Combine(Path.GetTempPath(), "ie-winlager-test-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(d); return Path.Combine(d, "daten.xml"); }
        static Store Fresh() { var s = new Store(TempFile()); s.Clock = () => new DateTime(2026, 11, 13, 10, 0, 0); return s; }
        static KeyValuePair<string, int> P(string sku, int q) { return new KeyValuePair<string, int>(sku, q); }

        static int Main()
        {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            T("Geld: Eingabe DE/EN/Tausender, Rundung kaufmännisch, Ungültiges abgewiesen", () =>
            {
                Eq(1250L, Money.Parse("12,50"), "12,50"); Eq(1250L, Money.Parse("12.50"), "12.50"); Eq(123456L, Money.Parse("1.234,56"), "1.234,56"); Eq(123456L, Money.Parse("1,234.56"), "1,234.56"); Eq(700L, Money.Parse("7 €"), "7 €");
                Eq("PRICE", Throws(() => Money.Parse("")), "leer"); Eq("PRICE", Throws(() => Money.Parse("abc")), "abc"); Eq("PRICE", Throws(() => Money.Parse("-3")), "negativ"); Eq("PRICE", Throws(() => Money.Parse("1,234")), "3 Nachkommastellen");
                Eq(3L, Money.RoundDiv(25, 10), "2,5→3"); Eq(2L, Money.RoundDiv(24, 10), "2,4→2"); Eq(-3L, Money.RoundDiv(-25, 10), "−2,5→−3");
            });
            T("Artikel: Pflichtfelder, keine doppelte Nummer (auch Groß/Klein), Grenzen", () =>
            {
                var s = Fresh();
                s.AddArticle("A-1", "Schraube M6", 15, 2200, 10);
                Eq("DUPLICATE", Throws(() => s.AddArticle("a-1", "x", 1, 0, 0)), "doppelt");
                Eq("SKU", Throws(() => s.AddArticle("", "x", 1, 0, 0)), "leer"); Eq("NAME", Throws(() => s.AddArticle("B", " ", 1, 0, 0)), "Name"); Eq("TAX", Throws(() => s.AddArticle("B", "x", 1, 5000, 0)), "Steuer"); Eq("MIN", Throws(() => s.AddArticle("B", "x", 1, 0, -1)), "Min");
                Eq(1, s.Articles.Count, "nur ein Artikel");
            });
            T("Lager: Ein-/Ausgang, Bestand nie negativ, Bewegung protokolliert, Mindestbestand-Warnung", () =>
            {
                var s = Fresh();
                s.AddArticle("A", "Artikel A", 1000, 2200, 5);
                s.Book("A", 8, "Lieferung");
                Eq("STOCK", Throws(() => s.Book("A", -9, "zu viel")), "negativ verhindert");
                Eq(8, s.Find("A").Stock, "unverändert nach Fehler");
                s.Book("A", -3, "Verkauf");
                Eq(5, s.Find("A").Stock, "Bestand"); Eq(2, s.Movements.Count, "Bewegungen"); Eq(5, s.Movements[1].StockAfter, "Bestand danach");
                True(s.LowStock().Any(a => a.Sku == "A"), "Mindestbestand erreicht → Warnung");
                Eq("QTY", Throws(() => s.Book("A", 0, "")), "Menge 0");
            });
            T("Rechnung: Summen je Position gerundet, Steuer korrekt, Bestand abgebucht, lückenlose Nummern", () =>
            {
                var s = Fresh();
                s.AddArticle("A", "Artikel A", 1999, 2200, 0); s.AddArticle("B", "Artikel B", 333, 1000, 0); s.AddArticle("C", "Buch", 1500, 400, 0);
                s.Book("A", 10, ""); s.Book("B", 10, ""); s.Book("C", 1, "");
                var i1 = s.CreateInvoice("Ferramenta Rossi", new[] { P("A", 3), P("B", 7), P("C", 1) });
                Eq("RE-2026-0001", i1.Number, "Nummer");
                Eq(5997L + 2331L + 1500L, i1.NetCents, "Netto");
                Eq(1319L + 233L + 60L, i1.TaxCents, "Steuer: 59,97×22 % = 13,19; 23,31×10 % = 2,33; 15×4 % = 0,60");
                Eq(i1.NetCents + i1.TaxCents, i1.GrossCents, "Brutto");
                Eq(7, s.Find("A").Stock, "A abgebucht"); Eq(3, s.Find("B").Stock, "B abgebucht"); Eq(0, s.Find("C").Stock, "C abgebucht");
                Eq("RE-2026-0002", s.CreateInvoice("Kunde 2", new[] { P("A", 1) }).Number, "fortlaufend");
            });
            T("Rechnung: alles oder nichts – zu wenig Bestand ändert weder Bestand noch Nummernkreis", () =>
            {
                var s = Fresh();
                s.AddArticle("A", "A", 100, 2200, 0); s.AddArticle("B", "B", 100, 2200, 0);
                s.Book("A", 5, ""); s.Book("B", 1, "");
                Eq("STOCK", Throws(() => s.CreateInvoice("K", new[] { P("A", 2), P("B", 2) })), "B fehlt");
                Eq("STOCK", Throws(() => s.CreateInvoice("K", new[] { P("A", 3), P("a", 3) })), "gleicher Artikel zweimal summiert");
                Eq(5, s.Find("A").Stock, "A unverändert"); Eq(0, s.Invoices.Count, "keine Rechnung"); Eq(2, s.Movements.Count, "keine Bewegung");
                Eq("NO_LINES", Throws(() => s.CreateInvoice("K", new KeyValuePair<string, int>[0])), "leer"); Eq("CUSTOMER", Throws(() => s.CreateInvoice(" ", new[] { P("A", 1) })), "Kunde");
                Eq("RE-2026-0001", s.CreateInvoice("K", new[] { P("A", 1) }).Number, "keine Lücke im Nummernkreis");
            });
            T("Artikel mit Rechnung oder Bestand kann nicht gelöscht werden", () =>
            {
                var s = Fresh();
                s.AddArticle("A", "A", 100, 0, 0); s.Book("A", 1, "");
                Eq("IN_STOCK", Throws(() => s.DeleteArticle("A")), "Bestand");
                s.CreateInvoice("K", new[] { P("A", 1) });
                Eq("IN_USE", Throws(() => s.DeleteArticle("A")), "auf Rechnung");
            });
            T("Speichern/Laden: alles bleibt erhalten, Umlaute und Sonderzeichen unverändert", () =>
            {
                var s = Fresh();
                s.AddArticle("Ä-1", "Größe „XL“ & <Spezial>", 1234, 2200, 2); s.Book("Ä-1", 4, "Lieferung Müller");
                s.CreateInvoice("Café Ñandú GmbH", new[] { P("Ä-1", 1) });
                s.Save();
                var r = Store.Load(s.Path);
                Eq("Größe „XL“ & <Spezial>", r.Find("Ä-1").Name, "Name"); Eq(3, r.Find("Ä-1").Stock, "Bestand"); Eq(2, r.Movements.Count, "Bewegungen");
                Eq("Café Ñandú GmbH", r.Invoices[0].Customer, "Kunde"); Eq(1234L, r.Invoices[0].Lines[0].UnitCents, "Preis eingefroren");
            });
            T("Beschädigte Datei: Sicherung wird geladen und gemeldet; ohne Sicherung klare Fehlermeldung statt Überschreiben", () =>
            {
                var s = Fresh();
                s.AddArticle("A", "A", 100, 0, 0); s.Save();
                s.AddArticle("B", "B", 100, 0, 0); s.Save();
                File.WriteAllText(s.Path, "<winlager kaputt");
                var r = Store.Load(s.Path);
                True(r.RecoveredFromBackup, "aus Sicherung"); Eq(1, r.Articles.Count, "Stand der Sicherung");
                var p2 = TempFile(); File.WriteAllText(p2, "kein xml");
                Eq("DATA", Throws(() => Store.Load(p2)), "ohne Sicherung");
                Eq("kein xml", File.ReadAllText(p2), "Datei nicht überschrieben");
            });
            T("Neuere Datenversion wird nicht still geöffnet", () =>
            {
                var p = TempFile(); File.WriteAllText(p, "<winlager schema=\"99\"><articles/><movements/><invoices/></winlager>");
                Eq("DATA", Throws(() => Store.Load(p)), "Schema 99");
            });
            T("CSV-Export: Semikolon, Anführungszeichen maskiert, deutsche Zahlen", () =>
            {
                var s = Fresh(); s.AddArticle("A", "Rohr \"1/2\"; verzinkt", 1250, 2200, 0);
                var csv = s.ArticlesCsv();
                True(csv.Contains("\"Rohr \"\"1/2\"\"; verzinkt\";12,50;22;0;0"), csv);
            });
            T("Rechnung als HTML: Inhalte maskiert, keine Skripte, Beträge stimmen", () =>
            {
                var s = Fresh(); s.AddArticle("A", "<script>alert(1)</script>", 1000, 2200, 0); s.Book("A", 1, "");
                var inv = s.CreateInvoice("Kunde & Co", new[] { P("A", 1) });
                var html = s.InvoiceHtml(inv, Brand.Current());
                True(!html.Contains("<script>"), "kein Skript"); True(html.Contains("&lt;script&gt;"), "maskiert"); True(html.Contains("Kunde &amp; Co"), "Kunde maskiert");
                True(html.Contains(Money.Format(1220, "EUR", CultureInfo.GetCultureInfo(Brand.Current().Culture))), "Brutto 12,20");
            });
            T("Texte: jede Übersetzung DE/IT/EN vorhanden", () =>
            {
                foreach (var k in Strings.Keys) foreach (var l in new[] { "de", "it", "en" }) True(!string.IsNullOrEmpty(Strings.Get(l, k)) && Strings.Get(l, k) != k, k + "/" + l);
            });
            Console.WriteLine("passed=" + passed + " failed=" + failed);
            return failed;
        }
    }
}
