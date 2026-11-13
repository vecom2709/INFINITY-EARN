// INFINITY EARN – Lager & Rechnung für Windows (Funktion 157). Fachkern ohne Oberfläche.
// C# 5 / .NET Framework 4.x: wird mit dem in Windows enthaltenen Compiler übersetzt (keine Downloads, keine Laufzeit-Installation).
// Beträge immer in Cent (long), nie als Gleitkommazahl.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Xml.Linq;

namespace InfinityEarn.WinLager
{
    public class DomainException : Exception
    {
        public readonly string Code;
        public DomainException(string code, string message) : base(message) { Code = code; }
        /// <summary>Meldung in der Sprache des Programms (Strings.cs), Platzhalter {0} … werden ersetzt.</summary>
        public static DomainException Of(string code, string key, params object[] args)
        {
            return new DomainException(code, string.Format(CultureInfo.InvariantCulture, Strings.Get(BrandData.Language, key), args));
        }
    }

    public class Article
    {
        public string Sku;
        public string Name;
        public long PriceCents;
        public int TaxBps;
        public int Stock;
        public int MinStock;
    }

    public class Movement
    {
        public DateTime At;
        public string Sku;
        public int Delta;
        public string Reason;
        public int StockAfter;
    }

    public class InvoiceLine
    {
        public string Sku;
        public string Name;
        public int Qty;
        public long UnitCents;
        public int TaxBps;
        public long NetCents { get { return UnitCents * Qty; } }
        public long TaxCents { get { return Money.RoundDiv(NetCents * TaxBps, 10000); } }
    }

    public class Invoice
    {
        public string Number;
        public DateTime Date;
        public string Customer;
        public List<InvoiceLine> Lines = new List<InvoiceLine>();
        public long NetCents { get { return Lines.Sum(l => l.NetCents); } }
        public long TaxCents { get { return Lines.Sum(l => l.TaxCents); } }
        public long GrossCents { get { return NetCents + TaxCents; } }
    }

    public static class Money
    {
        /// <summary>Kaufmännisch runden (ab 0,5 auf), auch für negative Werte symmetrisch.</summary>
        public static long RoundDiv(long value, long divisor)
        {
            long q = value / divisor, r = value % divisor;
            if (Math.Abs(r) * 2 >= divisor) q += value < 0 ? -1 : 1;
            return q;
        }

        public static string Format(long cents, string currency, CultureInfo culture)
        {
            return (cents / 100m).ToString("N2", culture) + " " + (currency == "EUR" ? "€" : currency);
        }

        /// <summary>„12,50“, „12.50“, „1.234,56“ → Cent. Ungültig → DomainException.</summary>
        public static long Parse(string text)
        {
            string s = (text ?? "").Trim().Replace("€", "").Replace(" ", "");
            if (s.Length == 0) throw DomainException.Of("PRICE", "e_price_missing");
            int comma = s.LastIndexOf(','), dot = s.LastIndexOf('.');
            if (comma > dot) s = s.Replace(".", "").Replace(',', '.');
            else if (dot > comma && comma >= 0) s = s.Replace(",", "");
            decimal d;
            if (!decimal.TryParse(s, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out d)) throw DomainException.Of("PRICE", "e_price_invalid", text);
            if (d < 0 || d > 10000000m) throw DomainException.Of("PRICE", "e_price_range");
            if (decimal.Round(d, 2) != d) throw DomainException.Of("PRICE", "e_price_decimals");
            return (long)(d * 100m);
        }
    }

    /// <summary>Datenbestand mit allen Geschäftsregeln. Speichern atomar mit Sicherungskopie.</summary>
    public class Store
    {
        public const int SchemaVersion = 1;
        public readonly string Path;
        public List<Article> Articles = new List<Article>();
        public List<Movement> Movements = new List<Movement>();
        public List<Invoice> Invoices = new List<Invoice>();
        public Func<DateTime> Clock = () => DateTime.Now;

        public Store(string path) { Path = path; }

        public static string DefaultDataDir(string productId)
        {
            string over = Environment.GetEnvironmentVariable("INFINITY_DATA_DIR");
            if (!string.IsNullOrEmpty(over)) return over;
            return System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "InfinityEarn", productId);
        }

        public Article Find(string sku)
        {
            return Articles.FirstOrDefault(a => string.Equals(a.Sku, sku, StringComparison.OrdinalIgnoreCase));
        }

        public Article AddArticle(string sku, string name, long priceCents, int taxBps, int minStock)
        {
            sku = (sku ?? "").Trim();
            name = (name ?? "").Trim();
            if (sku.Length == 0 || sku.Length > 30) throw DomainException.Of("SKU", "e_sku");
            if (name.Length == 0 || name.Length > 120) throw DomainException.Of("NAME", "e_name");
            if (Find(sku) != null) throw DomainException.Of("DUPLICATE", "e_duplicate", sku);
            if (priceCents < 0) throw DomainException.Of("PRICE", "e_price_negative");
            if (taxBps < 0 || taxBps > 3000) throw DomainException.Of("TAX", "e_tax");
            if (minStock < 0) throw DomainException.Of("MIN", "e_min_negative");
            var a = new Article { Sku = sku, Name = name, PriceCents = priceCents, TaxBps = taxBps, Stock = 0, MinStock = minStock };
            Articles.Add(a);
            return a;
        }

        public void UpdateArticle(string sku, string name, long priceCents, int taxBps, int minStock)
        {
            var a = Find(sku);
            if (a == null) throw DomainException.Of("NOT_FOUND", "e_not_found");
            name = (name ?? "").Trim();
            if (name.Length == 0 || name.Length > 120) throw DomainException.Of("NAME", "e_name");
            if (priceCents < 0) throw DomainException.Of("PRICE", "e_price_negative");
            if (taxBps < 0 || taxBps > 3000) throw DomainException.Of("TAX", "e_tax");
            if (minStock < 0) throw DomainException.Of("MIN", "e_min_negative");
            a.Name = name; a.PriceCents = priceCents; a.TaxBps = taxBps; a.MinStock = minStock;
        }

        public void DeleteArticle(string sku)
        {
            var a = Find(sku);
            if (a == null) throw DomainException.Of("NOT_FOUND", "e_not_found");
            if (Invoices.Any(i => i.Lines.Any(l => string.Equals(l.Sku, a.Sku, StringComparison.OrdinalIgnoreCase)))) throw DomainException.Of("IN_USE", "e_in_use");
            if (a.Stock != 0) throw DomainException.Of("IN_STOCK", "e_in_stock");
            Articles.Remove(a);
        }

        /// <summary>Wareneingang (+) oder -ausgang (−). Bestand wird nie negativ.</summary>
        public Movement Book(string sku, int delta, string reason)
        {
            var a = Find(sku);
            if (a == null) throw DomainException.Of("NOT_FOUND", "e_not_found");
            if (delta == 0) throw DomainException.Of("QTY", "e_qty_zero");
            if (Math.Abs((long)delta) > 1000000) throw DomainException.Of("QTY", "e_qty_big");
            if (a.Stock + delta < 0) throw DomainException.Of("STOCK", "e_stock", a.Stock);
            a.Stock += delta;
            var m = new Movement { At = Clock(), Sku = a.Sku, Delta = delta, Reason = (reason ?? "").Trim(), StockAfter = a.Stock };
            Movements.Add(m);
            return m;
        }

        public IEnumerable<Article> LowStock()
        {
            return Articles.Where(a => a.Stock <= a.MinStock && a.MinStock > 0);
        }

        /// <summary>Lückenlose Nummer je Jahr: RE-2026-0001.</summary>
        public string NextInvoiceNumber()
        {
            int year = Clock().Year;
            string prefix = "RE-" + year + "-";
            int max = Invoices.Where(i => i.Number.StartsWith(prefix)).Select(i => int.Parse(i.Number.Substring(prefix.Length), CultureInfo.InvariantCulture)).DefaultIfEmpty(0).Max();
            return prefix + (max + 1).ToString("0000", CultureInfo.InvariantCulture);
        }

        /// <summary>Rechnung erstellen und Bestand abbuchen – alles oder nichts.</summary>
        public Invoice CreateInvoice(string customer, IList<KeyValuePair<string, int>> lines)
        {
            customer = (customer ?? "").Trim();
            if (customer.Length == 0 || customer.Length > 200) throw DomainException.Of("CUSTOMER", "e_customer");
            if (lines == null || lines.Count == 0) throw DomainException.Of("NO_LINES", "e_no_lines");
            var need = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (var l in lines)
            {
                if (l.Value <= 0) throw DomainException.Of("QTY", "e_qty_min1");
                if (Find(l.Key) == null) throw DomainException.Of("NOT_FOUND", "e_not_found_sku", l.Key);
                int cur;
                need.TryGetValue(l.Key, out cur);
                need[l.Key] = cur + l.Value;
            }
            foreach (var n in need)
            {
                var a = Find(n.Key);
                if (a.Stock < n.Value) throw DomainException.Of("STOCK", "e_stock_for", a.Sku, a.Stock, n.Value);
            }
            var inv = new Invoice { Number = NextInvoiceNumber(), Date = Clock(), Customer = customer };
            foreach (var l in lines)
            {
                var a = Find(l.Key);
                inv.Lines.Add(new InvoiceLine { Sku = a.Sku, Name = a.Name, Qty = l.Value, UnitCents = a.PriceCents, TaxBps = a.TaxBps });
            }
            foreach (var n in need) Book(n.Key, -n.Value, Strings.Get(BrandData.Language, "invoice") + " " + inv.Number);
            Invoices.Add(inv);
            return inv;
        }

        // ------------------------------------------------------------ Speichern / Laden

        static string D(DateTime d) { return d.ToString("o", CultureInfo.InvariantCulture); }
        static DateTime PD(string s) { return DateTime.Parse(s, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind); }
        static string S(XElement e, string n) { var a = e.Attribute(n); if (a == null) throw DomainException.Of("DATA", "e_data_attr", n); return a.Value; }
        static long L(XElement e, string n) { return long.Parse(S(e, n), CultureInfo.InvariantCulture); }
        static int I(XElement e, string n) { return int.Parse(S(e, n), CultureInfo.InvariantCulture); }

        public void Save()
        {
            var x = new XDocument(new XElement("winlager", new XAttribute("schema", SchemaVersion),
                new XElement("articles", Articles.Select(a => new XElement("a", new XAttribute("sku", a.Sku), new XAttribute("name", a.Name), new XAttribute("price", a.PriceCents), new XAttribute("tax", a.TaxBps), new XAttribute("stock", a.Stock), new XAttribute("min", a.MinStock)))),
                new XElement("movements", Movements.Select(m => new XElement("m", new XAttribute("at", D(m.At)), new XAttribute("sku", m.Sku), new XAttribute("delta", m.Delta), new XAttribute("reason", m.Reason), new XAttribute("after", m.StockAfter)))),
                new XElement("invoices", Invoices.Select(i => new XElement("i", new XAttribute("no", i.Number), new XAttribute("date", D(i.Date)), new XAttribute("customer", i.Customer),
                    i.Lines.Select(l => new XElement("l", new XAttribute("sku", l.Sku), new XAttribute("name", l.Name), new XAttribute("qty", l.Qty), new XAttribute("unit", l.UnitCents), new XAttribute("tax", l.TaxBps))))))));
            string dir = System.IO.Path.GetDirectoryName(Path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            string tmp = Path + "." + System.Diagnostics.Process.GetCurrentProcess().Id + ".tmp";
            x.Save(tmp);
            if (File.Exists(Path)) File.Replace(tmp, Path, Path + ".bak");
            else File.Move(tmp, Path);
        }

        /// <summary>Lädt den Bestand. Fehlt die Datei → leer. Beschädigt → Sicherungskopie, sonst klare Fehlermeldung (nie stilles Überschreiben).</summary>
        public static Store Load(string path)
        {
            var s = new Store(path);
            if (!File.Exists(path)) return s;
            try { s.ReadFrom(XDocument.Load(path)); return s; }
            catch (Exception first)
            {
                string bak = path + ".bak";
                if (File.Exists(bak))
                {
                    var b = new Store(path);
                    b.ReadFrom(XDocument.Load(bak));
                    b.RecoveredFromBackup = true;
                    return b;
                }
                throw DomainException.Of("DATA", "e_data_nobackup", first.Message);
            }
        }

        public bool RecoveredFromBackup;

        void ReadFrom(XDocument x)
        {
            var root = x.Root;
            if (root == null || root.Name != "winlager") throw DomainException.Of("DATA", "e_data_foreign");
            if (I(root, "schema") > SchemaVersion) throw DomainException.Of("DATA", "e_data_newer");
            Articles = root.Element("articles").Elements("a").Select(e => new Article { Sku = S(e, "sku"), Name = S(e, "name"), PriceCents = L(e, "price"), TaxBps = I(e, "tax"), Stock = I(e, "stock"), MinStock = I(e, "min") }).ToList();
            Movements = root.Element("movements").Elements("m").Select(e => new Movement { At = PD(S(e, "at")), Sku = S(e, "sku"), Delta = I(e, "delta"), Reason = S(e, "reason"), StockAfter = I(e, "after") }).ToList();
            Invoices = root.Element("invoices").Elements("i").Select(e => new Invoice
            {
                Number = S(e, "no"), Date = PD(S(e, "date")), Customer = S(e, "customer"),
                Lines = e.Elements("l").Select(l => new InvoiceLine { Sku = S(l, "sku"), Name = S(l, "name"), Qty = I(l, "qty"), UnitCents = L(l, "unit"), TaxBps = I(l, "tax") }).ToList(),
            }).ToList();
        }

        // ------------------------------------------------------------ Export

        static string Csv(string v) { return "\"" + (v ?? "").Replace("\"", "\"\"") + "\""; }

        /// <summary>Artikelliste als CSV (Semikolon, UTF-8 mit BOM – öffnet in Excel/LibreOffice mit Umlauten).</summary>
        public string ArticlesCsv()
        {
            var sb = new StringBuilder();
            sb.Append("Artikelnummer;Bezeichnung;Preis netto;Steuer %;Bestand;Mindestbestand\r\n");
            foreach (var a in Articles.OrderBy(a => a.Sku, StringComparer.OrdinalIgnoreCase))
                sb.Append(Csv(a.Sku)).Append(';').Append(Csv(a.Name)).Append(';').Append((a.PriceCents / 100m).ToString("0.00", CultureInfo.GetCultureInfo("de-DE"))).Append(';').Append((a.TaxBps / 100m).ToString("0.##", CultureInfo.GetCultureInfo("de-DE"))).Append(';').Append(a.Stock).Append(';').Append(a.MinStock).Append("\r\n");
            return sb.ToString();
        }

        static string H(string s) { return System.Net.WebUtility.HtmlEncode(s ?? ""); }

        /// <summary>Druckfertige Rechnung als eigenständige HTML-Datei (ohne Skripte, ohne externe Inhalte).</summary>
        public string InvoiceHtml(Invoice inv, Brand brand)
        {
            var c = CultureInfo.GetCultureInfo(brand.Culture);
            var sb = new StringBuilder();
            sb.Append("<!doctype html><html lang=\"").Append(H(brand.Language)).Append("\"><head><meta charset=\"utf-8\"><title>").Append(H(inv.Number)).Append("</title><style>body{font:14px Segoe UI,Arial,sans-serif;color:#1d2433;margin:40px}h1{color:").Append(H(brand.Color)).Append(";margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:8px;border-bottom:1px solid #dde3ea;text-align:left}td.n,th.n{text-align:right}.tot td{font-weight:700;border:0}.muted{color:#5b6576}</style></head><body>");
            sb.Append("<h1>").Append(H(brand.Company)).Append("</h1><p class=\"muted\">").Append(H(Strings.Get(brand.Language, "invoice"))).Append(" ").Append(H(inv.Number)).Append(" · ").Append(inv.Date.ToString("d", c)).Append("</p>");
            sb.Append("<p><strong>").Append(H(Strings.Get(brand.Language, "customer"))).Append(":</strong> ").Append(H(inv.Customer)).Append("</p>");
            sb.Append("<table><thead><tr><th>").Append(H(Strings.Get(brand.Language, "item"))).Append("</th><th class=\"n\">").Append(H(Strings.Get(brand.Language, "qty"))).Append("</th><th class=\"n\">").Append(H(Strings.Get(brand.Language, "unit"))).Append("</th><th class=\"n\">").Append(H(Strings.Get(brand.Language, "tax"))).Append("</th><th class=\"n\">").Append(H(Strings.Get(brand.Language, "net"))).Append("</th></tr></thead><tbody>");
            foreach (var l in inv.Lines)
                sb.Append("<tr><td>").Append(H(l.Sku)).Append(" – ").Append(H(l.Name)).Append("</td><td class=\"n\">").Append(l.Qty).Append("</td><td class=\"n\">").Append(H(Money.Format(l.UnitCents, brand.Currency, c))).Append("</td><td class=\"n\">").Append((l.TaxBps / 100m).ToString("0.##", c)).Append(" %</td><td class=\"n\">").Append(H(Money.Format(l.NetCents, brand.Currency, c))).Append("</td></tr>");
            sb.Append("</tbody><tfoot>");
            sb.Append("<tr class=\"tot\"><td colspan=\"4\" class=\"n\">").Append(H(Strings.Get(brand.Language, "net"))).Append("</td><td class=\"n\">").Append(H(Money.Format(inv.NetCents, brand.Currency, c))).Append("</td></tr>");
            sb.Append("<tr class=\"tot\"><td colspan=\"4\" class=\"n\">").Append(H(Strings.Get(brand.Language, "taxsum"))).Append("</td><td class=\"n\">").Append(H(Money.Format(inv.TaxCents, brand.Currency, c))).Append("</td></tr>");
            sb.Append("<tr class=\"tot\"><td colspan=\"4\" class=\"n\">").Append(H(Strings.Get(brand.Language, "gross"))).Append("</td><td class=\"n\">").Append(H(Money.Format(inv.GrossCents, brand.Currency, c))).Append("</td></tr>");
            sb.Append("</tfoot></table></body></html>");
            return sb.ToString();
        }
    }
}
