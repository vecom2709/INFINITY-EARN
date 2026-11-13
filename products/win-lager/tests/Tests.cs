// Fachtests des Kerns (positiv, negativ, Datenintegrität). Ausgabe: eine Zeile je Test, Exit-Code = Anzahl Fehler.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Xml.Linq;

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
        static string Throws(Action a) { return Catch(a).Code; }
        static DomainException Catch(Action a) { try { a(); } catch (DomainException d) { return d; } throw new Exception("Fehler erwartet, aber keiner"); }

        static string TempFile() { var d = Path.Combine(Path.GetTempPath(), "ie-winlager-test-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(d); return Path.Combine(d, "daten.xml"); }
        static readonly DateTime Now = new DateTime(2026, 11, 13, 10, 0, 0);
        static Party SellerOk(string country)
        {
            if (country == "IT") return new Party { Name = "Ferramenta Rossi S.r.l.", Street = "Via Roma 1", Zip = "00185", City = "Roma", Province = "RM", Country = "IT", VatId = "IT 012 345 678 97" };
            if (country == "AT") return new Party { Name = "Muster GmbH", Street = "Hauptplatz 1", Zip = "8010", City = "Graz", Country = "AT", VatId = "ATU12345678" };
            return new Party { Name = "Musterfirma GmbH", Street = "Musterstraße 1", Zip = "12345", City = "Musterstadt", Country = "DE", TaxNumber = "12/345/67890", VatId = "DE 123 456 789" };
        }
        static Party CustOk(string name, string country)
        {
            if (country == "IT") return new Party { Name = name, Street = "Via Verdi 2", Zip = "20121", City = "Milano", Province = "MI", Country = "IT", TaxNumber = "rssmra85t10a562s" };
            if (country == "AT") return new Party { Name = name, Street = "Ring 2", Zip = "1010", City = "Wien", Country = "AT" };
            return new Party { Name = name, Street = "Kundenweg 2", Zip = "54321", City = "Beispielstadt", Country = "DE" };
        }
        static Store Fresh() { return Fresh(BrandData.Country); }
        static Store Fresh(string country)
        {
            var s = new Store(TempFile()) { Country = country };
            s.Clock = () => Now;
            s.UpdateSeller(SellerOk(country));
            foreach (var n in new[] { "K", "Kunde 2", "Kunde & Co", "Café Ñandú GmbH", "Ferramenta Rossi" }) s.SaveCustomer(CustOk(n, country), true);
            return s;
        }
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
            T("Rechnung: Summen je Steuersatz gerundet, Steuer korrekt, Bestand abgebucht, lückenlose Nummern", () =>
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
            T("Steuerkennungen: Partita IVA und Codice fiscale mit Prüfziffer, USt-IdNr. DE/AT im Format", () =>
            {
                True(Legal.PartitaIva("01234567897"), "P.IVA gültig"); True(!Legal.PartitaIva("01234567890"), "P.IVA Prüfziffer falsch"); True(!Legal.PartitaIva("0123456789"), "10 Ziffern");
                True(Legal.CodiceFiscale("RSSMRA85T10A562S"), "CF Person"); True(!Legal.CodiceFiscale("RSSMRA85T10A562T"), "CF Prüfbuchstabe falsch"); True(Legal.CodiceFiscale("80012345676"), "CF Firma = 11 Ziffern");
                True(Legal.VatId("DE123456789", "DE"), "DE"); True(!Legal.VatId("DE12345678", "DE"), "DE zu kurz"); True(Legal.VatId("ATU12345678", "AT"), "AT"); True(!Legal.VatId("AT12345678", "AT"), "AT ohne U");
                var n = Legal.Normalize(new Party { Country = "it", VatId = "IT 012.345.678-97", TaxNumber = "rssmra85t10a562s" });
                Eq("01234567897", n.VatId, "IT-Präfix und Trennzeichen entfernt"); Eq("RSSMRA85T10A562S", n.TaxNumber, "CF groß"); Eq("IT", n.Country, "Land groß");
            });
            T("Firmendaten: ohne Pflichtangaben keine Rechnung, Meldung nennt die fehlenden Felder", () =>
            {
                foreach (var country in new[] { "DE", "AT", "IT" })
                {
                    var s = new Store(TempFile()) { Country = country };
                    s.Clock = () => Now;
                    s.SaveCustomer(CustOk("K", country), true);
                    s.AddArticle("A", "A", 100, 0, 0); s.Book("A", 5, "");
                    var ex = Catch(() => s.CreateInvoice("K", new[] { P("A", 1) }));
                    Eq("SELLER", ex.Code, country + ": Code");
                    True(ex.Message.Contains(Strings.Get(BrandData.Language, "f_street")), country + ": Straße genannt – " + ex.Message);
                    Eq(0, s.Invoices.Count, country + ": keine Rechnung"); Eq(5, s.Find("A").Stock, country + ": Bestand unverändert");
                    var bad = SellerOk(country); bad.Zip = "1"; Eq("SELLER", Throws(() => s.UpdateSeller(bad)), country + ": PLZ ungültig");
                    s.UpdateSeller(SellerOk(country));
                    Eq(country, s.Seller.Country, "Land aus der Kundenfassung");
                }
                var de = new Store(TempFile()) { Country = "DE" };
                var noIds = SellerOk("DE"); noIds.TaxNumber = ""; noIds.VatId = "";
                Eq("SELLER", Throws(() => de.UpdateSeller(noIds)), "DE: Steuernummer oder USt-IdNr. Pflicht");
                noIds.TaxNumber = "12/345/67890"; de.UpdateSeller(noIds);
                var it = new Store(TempFile()) { Country = "IT" };
                var noPiva = SellerOk("IT"); noPiva.VatId = "01234567890";
                Eq("SELLER", Throws(() => it.UpdateSeller(noPiva)), "IT: P.IVA mit falscher Prüfziffer");
                var noProv = SellerOk("IT"); noProv.Province = "";
                Eq("SELLER", Throws(() => it.UpdateSeller(noProv)), "IT: Provinz Pflicht");
            });
            T("Kunden: Anschrift Pflicht, keine Doppelten; Italien: P.IVA oder Codice fiscale, Codice destinatario Standard 0000000", () =>
            {
                var s = Fresh("DE");
                var noStreet = CustOk("Neu", "DE"); noStreet.Street = "";
                Eq("CUSTOMER_DATA", Throws(() => s.SaveCustomer(noStreet, true)), "Straße fehlt");
                Eq("DUPLICATE", Throws(() => s.SaveCustomer(CustOk("k", "DE"), true)), "doppelt (Groß/Klein)");
                var ch = CustOk("Kunde Schweiz", "DE"); ch.Country = "CH"; ch.Zip = "8001"; ch.City = "Zürich"; s.SaveCustomer(ch, true);
                var it = Fresh("IT");
                var noId = CustOk("Privato", "IT"); noId.TaxNumber = "";
                Eq("CUSTOMER_DATA", Throws(() => it.SaveCustomer(noId, true)), "IT: weder P.IVA noch CF");
                noId.VatId = "12345678903"; var saved = it.SaveCustomer(noId, true);
                Eq("0000000", saved.SdiCode, "Codice destinatario Standard");
                var badSdi = CustOk("Sdi falsch", "IT"); badSdi.SdiCode = "ABC";
                Eq("CUSTOMER_DATA", Throws(() => it.SaveCustomer(badSdi, true)), "Codice destinatario 7 Zeichen");
                var upd = CustOk("K", "IT"); upd.Street = "Via Nuova 9"; it.SaveCustomer(upd, false);
                Eq("Via Nuova 9", it.FindCustomer("K").Street, "geändert");
                it.DeleteCustomer("K"); True(it.FindCustomer("K") == null, "gelöscht");
            });
            T("Rechnung: nur an angelegte Kunden; Leistungsdatum nicht in der Zukunft, Italien höchstens 12 Tage zurück", () =>
            {
                var s = Fresh("DE"); s.AddArticle("A", "A", 100, 1900, 0); s.Book("A", 9, "");
                Eq("CUSTOMER", Throws(() => s.CreateInvoice("Unbekannt", new[] { P("A", 1) })), "unbekannter Kunde");
                Eq("SERVICE_DATE", Throws(() => s.CreateInvoice("K", new[] { P("A", 1) }, Now.AddDays(1))), "Zukunft");
                var old = s.CreateInvoice("K", new[] { P("A", 1) }, Now.AddDays(-40));
                Eq(Now.AddDays(-40).Date, old.ServiceDate.Value, "DE: Leistung vor 40 Tagen erlaubt"); Eq(Now, old.Date, "Ausstellungsdatum heute");
                var it = Fresh("IT"); it.AddArticle("A", "A", 100, 2200, 0); it.Book("A", 9, "");
                Eq("SERVICE_DATE", Throws(() => it.CreateInvoice("K", new[] { P("A", 1) }, Now.AddDays(-13))), "IT: 13 Tage");
                var inv = it.CreateInvoice("K", new[] { P("A", 1) }, Now.AddDays(-12));
                Eq(Now.AddDays(-12).Date, inv.DocumentDate, "IT: Datum der Rechnung = Datum der Leistung");
            });
            T("Rechnung: Anschriften eingefroren – spätere Änderungen an Firma und Kunde ändern alte Rechnungen nicht", () =>
            {
                var s = Fresh("DE"); s.AddArticle("A", "A", 100, 1900, 0); s.Book("A", 9, "");
                var inv = s.CreateInvoice("K", new[] { P("A", 1) });
                var newSeller = SellerOk("DE"); newSeller.Street = "Neue Straße 99"; s.UpdateSeller(newSeller);
                var newCust = CustOk("K", "DE"); newCust.City = "Anderswo"; s.SaveCustomer(newCust, false);
                Eq("Musterstraße 1", inv.Seller.Street, "Firma eingefroren"); Eq("Beispielstadt", inv.Buyer.City, "Kunde eingefroren");
                s.DeleteCustomer("K"); Eq("K", inv.Customer, "Rechnung bleibt nach Löschen des Kunden");
            });
            T("Steuer je Steuersatz aufgeschlüsselt und gerundet; Rechnungen alter Versionen behalten ihre Rundung je Position", () =>
            {
                var s = Fresh("DE"); s.AddArticle("A", "A", 2, 1900, 0); s.AddArticle("B", "B", 1000, 700, 0); s.Book("A", 9, ""); s.Book("B", 9, "");
                var inv = s.CreateInvoice("K", new[] { P("A", 1), P("A", 1), P("A", 1), P("B", 1) });
                var g = inv.TaxGroups();
                Eq(2, g.Count, "zwei Sätze"); Eq(1900, g[0].TaxBps, "höchster zuerst"); Eq(6L, g[0].NetCents, "Netto 19 %");
                Eq(1L, g[0].TaxCents, "19 % von 0,06 € = 1,14 Cent → 1 Cent (je Satz)"); Eq(70L, g[1].TaxCents, "7 % von 10,00");
                var legacy = new Invoice { Lines = inv.Lines };
                Eq(1L + 70L, inv.TaxCents, "neu: je Satz"); Eq(0L + 70L, legacy.TaxCents, "alt: je Position 3 × 0,38 Cent → 0");
            });
            T("Kleinunternehmer / regime forfettario: keine Steuer, Hinweis auf der Rechnung", () =>
            {
                foreach (var country in new[] { "DE", "AT", "IT" })
                {
                    var s = Fresh(country); var sel = SellerOk(country); sel.Exempt = true; s.UpdateSeller(sel);
                    s.AddArticle("A", "A", 10000, 1900, 0); s.Book("A", 2, "");
                    var inv = s.CreateInvoice("K", new[] { P("A", 1) });
                    Eq(0L, inv.TaxCents, country + ": keine Steuer"); Eq(10000L, inv.GrossCents, country + ": brutto = netto"); True(inv.Exempt, country + ": gekennzeichnet");
                    var html = s.InvoiceHtml(inv, Brand.Current());
                    True(html.Contains(System.Net.WebUtility.HtmlEncode(Strings.Get(BrandData.Language, "note_exempt_" + country.ToLowerInvariant()))), country + ": Hinweis");
                }
            });
            T("Rechnung als HTML enthält alle Pflichtangaben (§ 14 Abs. 4 UStG)", () =>
            {
                var s = Fresh("DE"); s.AddArticle("A-1", "Schraube", 1999, 1900, 0); s.AddArticle("B-2", "Buch", 1500, 700, 0); s.Book("A-1", 5, ""); s.Book("B-2", 5, "");
                var inv = s.CreateInvoice("K", new[] { P("A-1", 3), P("B-2", 1) }, new DateTime(2026, 11, 10));
                var html = s.InvoiceHtml(inv, Brand.Current());
                var c = CultureInfo.GetCultureInfo(Brand.Current().Culture);
                Func<string, string> H = System.Net.WebUtility.HtmlEncode;
                foreach (var must in new[] { "Musterfirma GmbH", H("Musterstraße 1"), "12345 Musterstadt", "K", "Kundenweg 2", "54321 Beispielstadt", "12/345/67890", "DE123456789", "RE-2026-0001",
                    Now.ToString("d", c), new DateTime(2026, 11, 10).ToString("d", c), "Schraube", H(Strings.Get(BrandData.Language, "servicedate")),
                    H(string.Format(Strings.Get(BrandData.Language, "netrate"), "19")), H(string.Format(Strings.Get(BrandData.Language, "taxrate"), "7")),
                    H(Money.Format(5997, "EUR", c)), H(Money.Format(1139, "EUR", c)), H(Money.Format(105, "EUR", c)), H(Money.Format(5997 + 1500 + 1139 + 105, "EUR", c)) })
                    True(html.Contains(must), "fehlt: " + must);
                True(!html.Contains("<script"), "keine Skripte");
            });
            T("FatturaPA: Aufbau FPR12, Pflichtfelder, Beträge, Zeichensatz, Dateiname", () =>
            {
                var s = Fresh("IT");
                var b = CustOk("Falegnameria «Esempio» – Società", "IT"); b.TaxNumber = ""; b.VatId = "12345678903"; b.SdiCode = "ABC1234"; s.SaveCustomer(b, true);
                s.AddArticle("A-100", "Vite M6 × 40 – zincata „extra“ €", 15, 2200, 0); s.AddArticle("D-500", "Manuale", 3900, 400, 0); s.Book("A-100", 900, ""); s.Book("D-500", 5, "");
                var inv = s.CreateInvoice(b.Name, new[] { P("A-100", 500), P("D-500", 1) }, Now.AddDays(-2));
                var x = FatturaPa.Document(inv);
                XNamespace ns = FatturaPa.Ns;
                Eq(ns + "FatturaElettronica", x.Root.Name, "Wurzel"); Eq("FPR12", (string)x.Root.Attribute("versione"), "Version");
                Func<string, string> V = path => { XElement e = x.Root; foreach (var part in path.Split('/')) { e = e.Element(part); if (e == null) throw new Exception("fehlt: " + path); } return e.Value; };
                Eq("FPR12", V("FatturaElettronicaHeader/DatiTrasmissione/FormatoTrasmissione"), "Format");
                Eq("ABC1234", V("FatturaElettronicaHeader/DatiTrasmissione/CodiceDestinatario"), "Empfänger");
                Eq("01234567897", V("FatturaElettronicaHeader/CedentePrestatore/DatiAnagrafici/IdFiscaleIVA/IdCodice"), "P.IVA Verkäufer");
                Eq("RF01", V("FatturaElettronicaHeader/CedentePrestatore/DatiAnagrafici/RegimeFiscale"), "Regime");
                Eq("RM", V("FatturaElettronicaHeader/CedentePrestatore/Sede/Provincia"), "Provinz");
                Eq("12345678903", V("FatturaElettronicaHeader/CessionarioCommittente/DatiAnagrafici/IdFiscaleIVA/IdCodice"), "P.IVA Kunde");
                Eq("Falegnameria \"Esempio\" - Società", V("FatturaElettronicaHeader/CessionarioCommittente/DatiAnagrafici/Anagrafica/Denominazione"), "Zeichen umgesetzt, Latin-1 bleibt");
                Eq("TD01", V("FatturaElettronicaBody/DatiGenerali/DatiGeneraliDocumento/TipoDocumento"), "Typ");
                Eq(Now.AddDays(-2).ToString("yyyy-MM-dd"), V("FatturaElettronicaBody/DatiGenerali/DatiGeneraliDocumento/Data"), "Datum = Leistung");
                Eq("RE-2026-0001", V("FatturaElettronicaBody/DatiGenerali/DatiGeneraliDocumento/Numero"), "Nummer");
                var lines = x.Root.Element("FatturaElettronicaBody").Element("DatiBeniServizi").Elements("DettaglioLinee").ToList();
                Eq(2, lines.Count, "Zeilen"); Eq("Vite M6 × 40 - zincata \"extra\" EUR", lines[0].Element("Descrizione").Value, "Beschreibung");
                Eq("500.00", lines[0].Element("Quantita").Value, "Menge"); Eq("0.15", lines[0].Element("PrezzoUnitario").Value, "Preis"); Eq("75.00", lines[0].Element("PrezzoTotale").Value, "Zeile"); Eq("22.00", lines[0].Element("AliquotaIVA").Value, "Satz");
                Eq("NumeroLinea,CodiceArticolo,Descrizione,Quantita,PrezzoUnitario,PrezzoTotale,AliquotaIVA", string.Join(",", lines[0].Elements().Select(e => e.Name.LocalName)), "Reihenfolge Zeile");
                var sum = x.Root.Element("FatturaElettronicaBody").Element("DatiBeniServizi").Elements("DatiRiepilogo").ToList();
                Eq("75.00|16.50|39.00|1.56", string.Join("|", sum.SelectMany(r => new[] { r.Element("ImponibileImporto").Value, r.Element("Imposta").Value })), "Riepilogo je Satz");
                Eq("132.06", V("FatturaElettronicaBody/DatiGenerali/DatiGeneraliDocumento/ImportoTotaleDocumento"), "Gesamt");
                Eq("IT01234567897_" + FatturaPa.Progressive(inv) + ".xml", FatturaPa.FileName(inv), "Dateiname");
                True(FatturaPa.Progressive(inv).Length == 5, "Kennung 5 Zeichen");
                var bytes = FatturaPa.Bytes(inv);
                True(bytes[0] == (byte)'<', "ohne BOM"); True(System.Text.Encoding.UTF8.GetString(bytes).StartsWith("<?xml version=\"1.0\" encoding=\"utf-8\"?>", StringComparison.OrdinalIgnoreCase), "XML-Deklaration UTF-8");
                foreach (var e in x.Descendants()) foreach (var ch in e.Nodes().OfType<XText>().SelectMany(t => t.Value)) True(ch <= 'ÿ', "nur Latin-1: " + e.Name);
            });
            T("FatturaPA: Privatkunde mit PEC, forfettario mit Bollo, ausländischer Kunde, klare Fehler statt falscher Datei", () =>
            {
                var s = Fresh("IT"); s.AddArticle("A", "A", 10000, 2200, 0); s.AddArticle("Z", "Zero", 100, 0, 0); s.Book("A", 9, ""); s.Book("Z", 9, "");
                var priv = CustOk("Mario Rossi", "IT"); priv.Pec = "mario@pec.example.it"; s.SaveCustomer(priv, true);
                var x = FatturaPa.Document(s.CreateInvoice("Mario Rossi", new[] { P("A", 1) }));
                var tr = x.Root.Element("FatturaElettronicaHeader").Element("DatiTrasmissione");
                Eq("0000000", tr.Element("CodiceDestinatario").Value, "privat"); Eq("mario@pec.example.it", tr.Element("PECDestinatario").Value, "PEC");
                var ana = x.Root.Element("FatturaElettronicaHeader").Element("CessionarioCommittente").Element("DatiAnagrafici");
                Eq("RSSMRA85T10A562S", ana.Element("CodiceFiscale").Value, "CF"); True(ana.Element("IdFiscaleIVA") == null, "ohne P.IVA");
                Eq("FATTURAPA", Throws(() => FatturaPa.Document(s.CreateInvoice("K", new[] { P("Z", 1) }))), "0 % ohne Natura → Fehler");
                var de = CustOk("Kunde DE", "IT"); de.Country = "DE"; de.Zip = "54321"; de.City = "Beispielstadt"; de.Province = ""; de.TaxNumber = ""; de.VatId = "DE123456789"; s.SaveCustomer(de, true);
                var xd = FatturaPa.Document(s.CreateInvoice("Kunde DE", new[] { P("A", 1) }));
                Eq("XXXXXXX", xd.Root.Element("FatturaElettronicaHeader").Element("DatiTrasmissione").Element("CodiceDestinatario").Value, "Ausland");
                var cc = xd.Root.Element("FatturaElettronicaHeader").Element("CessionarioCommittente");
                Eq("DE|123456789", cc.Element("DatiAnagrafici").Element("IdFiscaleIVA").Element("IdPaese").Value + "|" + cc.Element("DatiAnagrafici").Element("IdFiscaleIVA").Element("IdCodice").Value, "USt-IdNr. Ausland");
                Eq("00000", cc.Element("Sede").Element("CAP").Value, "CAP Ausland");
                var sel = SellerOk("IT"); sel.Exempt = true; s.UpdateSeller(sel);
                var f = FatturaPa.Document(s.CreateInvoice("K", new[] { P("A", 1) }));
                Eq("RF19", f.Descendants("RegimeFiscale").Single().Value, "forfettario");
                Eq("N2.2", f.Descendants("DettaglioLinee").Single().Element("Natura").Value, "Natura Zeile");
                Eq(FatturaPa.ExemptReference, f.Descendants("RiferimentoNormativo").Single().Value, "Rechtsgrundlage");
                Eq("SI|2.00", f.Descendants("BolloVirtuale").Single().Value + "|" + f.Descendants("ImportoBollo").Single().Value, "Bollo über 77,47 €");
                var de2 = Fresh("DE"); de2.AddArticle("A", "A", 100, 1900, 0); de2.Book("A", 1, "");
                Eq("FATTURAPA", Throws(() => FatturaPa.Document(de2.CreateInvoice("K", new[] { P("A", 1) }))), "nur Italien");
                Eq("FATTURAPA", Throws(() => FatturaPa.Document(new Invoice { Number = "RE-2026-0001", Date = Now })), "alte Rechnung");
            });
            T("Speichern/Laden Schema 2: Firma, Kunden und eingefrorene Rechnungsdaten; Schema 1 wird weiter gelesen", () =>
            {
                var s = Fresh("DE"); s.AddArticle("A", "A", 100, 1900, 0); s.Book("A", 2, "");
                s.CreateInvoice("Café Ñandú GmbH", new[] { P("A", 1) }, new DateTime(2026, 11, 1)); s.Save();
                var r = Store.Load(s.Path);
                Eq("12/345/67890", r.Seller.TaxNumber, "Firma"); Eq(s.Customers.Count, r.Customers.Count, "Kunden");
                var i = r.Invoices[0];
                Eq(new DateTime(2026, 11, 1), i.ServiceDate.Value, "Leistungsdatum"); Eq("Kundenweg 2", i.Buyer.Street, "Kunde eingefroren"); Eq("DE123456789", i.Seller.VatId, "Firma eingefroren"); True(i.PerRate, "Rundung je Satz");
                var p1 = TempFile();
                File.WriteAllText(p1, "<winlager schema=\"1\"><articles><a sku=\"A\" name=\"A\" price=\"5\" tax=\"1900\" stock=\"0\" min=\"0\"/></articles><movements/><invoices><i no=\"RE-2025-0001\" date=\"2025-05-01T10:00:00\" customer=\"Altkunde\"><l sku=\"A\" name=\"A\" qty=\"1\" unit=\"2\" tax=\"1900\"/><l sku=\"A\" name=\"A\" qty=\"1\" unit=\"2\" tax=\"1900\"/></i></invoices></winlager>");
                var o = Store.Load(p1);
                Eq("Altkunde", o.Invoices[0].Customer, "alter Kunde"); True(o.Invoices[0].Seller == null && !o.Invoices[0].ServiceDate.HasValue, "alte Rechnung ohne Pflichtangaben");
                Eq(0L, o.Invoices[0].TaxCents, "alte Rundung je Position (2 × 0,38 Cent → 0; je Satz wäre es 1 Cent)"); Eq(0, o.Customers.Count, "keine Kunden");
                True(o.InvoiceHtml(o.Invoices[0], Brand.Current()).Contains("Altkunde"), "alte Rechnung druckbar");
                o.Save(); Eq("2", XDocument.Load(p1).Root.Attribute("schema").Value, "beim Speichern auf Schema 2");
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
