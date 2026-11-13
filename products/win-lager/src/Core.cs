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

    public class TaxGroup
    {
        public int TaxBps;
        public long NetCents;
        public long TaxCents;
    }

    public class Invoice
    {
        public string Number;
        /// <summary>Ausstellungsdatum.</summary>
        public DateTime Date;
        /// <summary>Leistungs-/Lieferdatum (§ 14 Abs. 4 Nr. 6 UStG; IT: data dell'operazione). null = alte Rechnung vor Schema 2.</summary>
        public DateTime? ServiceDate;
        /// <summary>Verkäufer und Kunde, beim Erstellen eingefroren. Seller null = alte Rechnung vor Schema 2.</summary>
        public Party Seller;
        public Party Buyer = new Party();
        public string Customer { get { return Buyer.Name; } set { Buyer.Name = value; } }
        public bool Exempt;
        /// <summary>Steuer je Steuersatz gerundet (ab Schema 2, passt zur FatturaPA-Prüfung). Alte Rechnungen: je Position, unverändert.</summary>
        public bool PerRate;
        public List<InvoiceLine> Lines = new List<InvoiceLine>();
        public long NetCents { get { return Lines.Sum(l => l.NetCents); } }
        public long TaxCents { get { return TaxGroups().Sum(g => g.TaxCents); } }
        public long GrossCents { get { return NetCents + TaxCents; } }
        /// <summary>Datum der Rechnung: in Italien das Datum der Leistung (sofortige Rechnung), sonst das Ausstellungsdatum.</summary>
        public DateTime DocumentDate { get { return Seller != null && Seller.Country == "IT" && ServiceDate.HasValue ? ServiceDate.Value : Date; } }

        /// <summary>Entgelt und Steuer nach Steuersätzen aufgeschlüsselt (§ 14 Abs. 4 Nr. 7/8 UStG), höchster Satz zuerst.</summary>
        public List<TaxGroup> TaxGroups()
        {
            return Lines.GroupBy(l => l.TaxBps).OrderByDescending(g => g.Key).Select(g =>
            {
                long net = g.Sum(l => l.NetCents);
                return new TaxGroup { TaxBps = g.Key, NetCents = net, TaxCents = PerRate ? Money.RoundDiv(net * g.Key, 10000) : g.Sum(l => l.TaxCents) };
            }).ToList();
        }
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
        public const int SchemaVersion = 2;
        public readonly string Path;
        /// <summary>Land des Verkäufers (aus der Kundenfassung). Bestimmt Pflichtangaben und Steuerregeln.</summary>
        public string Country = BrandData.Country;
        public Party Seller;
        public List<Party> Customers = new List<Party>();
        public List<Article> Articles = new List<Article>();
        public List<Movement> Movements = new List<Movement>();
        public List<Invoice> Invoices = new List<Invoice>();
        public Func<DateTime> Clock = () => DateTime.Now;

        public Store(string path) { Path = path; Seller = new Party { Name = BrandData.Company, Country = Country }; }

        // ------------------------------------------------------------ Firmendaten und Kunden

        /// <summary>Firmendaten speichern – nur vollständig und gültig. Das Land ist durch die Kundenfassung festgelegt.</summary>
        public void UpdateSeller(Party p)
        {
            var n = Legal.Normalize(p);
            n.Country = Country;
            Legal.CheckSeller(n);
            Seller = n;
        }

        public Party FindCustomer(string name)
        {
            name = (name ?? "").Trim();
            return Customers.FirstOrDefault(c => string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>Kunde anlegen (isNew) oder ändern. Rechnungen behalten die Anschrift, die beim Erstellen galt.</summary>
        public Party SaveCustomer(Party p, bool isNew)
        {
            var n = Legal.Normalize(p);
            if (n.Country.Length == 0) n.Country = Country;
            if (Country == "IT" && n.Country == "IT" && n.SdiCode.Length == 0) n.SdiCode = "0000000";
            n.Exempt = false;
            if (n.Name.Length == 0) throw DomainException.Of("CUSTOMER", "e_customer");
            Legal.CheckCustomer(n, Country);
            var existing = FindCustomer(n.Name);
            if (isNew)
            {
                if (existing != null) throw DomainException.Of("DUPLICATE", "e_customer_dup", n.Name);
                Customers.Add(n);
            }
            else
            {
                if (existing == null) throw DomainException.Of("NOT_FOUND", "e_customer_notfound");
                Customers[Customers.IndexOf(existing)] = n;
            }
            return n;
        }

        public void DeleteCustomer(string name)
        {
            var c = FindCustomer(name);
            if (c == null) throw DomainException.Of("NOT_FOUND", "e_customer_notfound");
            Customers.Remove(c);
        }

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
            return CreateInvoice(customer, lines, Clock().Date);
        }

        /// <summary>Rechnung mit allen Pflichtangaben: vollständige Firmendaten, angelegter Kunde mit Anschrift, Leistungsdatum.</summary>
        public Invoice CreateInvoice(string customer, IList<KeyValuePair<string, int>> lines, DateTime serviceDate)
        {
            customer = (customer ?? "").Trim();
            if (customer.Length == 0 || customer.Length > 200) throw DomainException.Of("CUSTOMER", "e_customer");
            var seller = Seller.Copy();
            seller.Country = Country;
            Legal.CheckSeller(seller);
            var buyer = FindCustomer(customer);
            if (buyer == null) throw DomainException.Of("CUSTOMER", "e_customer_unknown", customer);
            Legal.CheckCustomer(buyer, Country);
            DateTime today = Clock().Date;
            serviceDate = serviceDate.Date;
            if (serviceDate > today) throw DomainException.Of("SERVICE_DATE", "e_service_future");
            // Italien: sofortige Rechnung (TD01) höchstens 12 Tage nach der Leistung; Datum der Rechnung = Datum der Leistung.
            if (Country == "IT" && serviceDate < today.AddDays(-12)) throw DomainException.Of("SERVICE_DATE", "e_service_it");
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
            var inv = new Invoice { Number = NextInvoiceNumber(), Date = Clock(), ServiceDate = serviceDate, Seller = seller, Buyer = buyer.Copy(), Exempt = seller.Exempt, PerRate = true };
            foreach (var l in lines)
            {
                var a = Find(l.Key);
                inv.Lines.Add(new InvoiceLine { Sku = a.Sku, Name = a.Name, Qty = l.Value, UnitCents = a.PriceCents, TaxBps = seller.Exempt ? 0 : a.TaxBps });
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
        static string O(XElement e, string n) { var a = e.Attribute(n); return a == null ? "" : a.Value; }

        static XElement PX(string tag, Party p)
        {
            return new XElement(tag, new XAttribute("name", p.Name), new XAttribute("street", p.Street), new XAttribute("zip", p.Zip), new XAttribute("city", p.City),
                new XAttribute("prov", p.Province), new XAttribute("country", p.Country), new XAttribute("vat", p.VatId), new XAttribute("taxno", p.TaxNumber),
                new XAttribute("sdi", p.SdiCode), new XAttribute("pec", p.Pec), new XAttribute("exempt", p.Exempt ? "1" : "0"));
        }

        static Party PP(XElement e)
        {
            return new Party { Name = O(e, "name"), Street = O(e, "street"), Zip = O(e, "zip"), City = O(e, "city"), Province = O(e, "prov"), Country = O(e, "country"),
                VatId = O(e, "vat"), TaxNumber = O(e, "taxno"), SdiCode = O(e, "sdi"), Pec = O(e, "pec"), Exempt = O(e, "exempt") == "1" };
        }

        public void Save()
        {
            var x = new XDocument(new XElement("winlager", new XAttribute("schema", SchemaVersion),
                PX("seller", Seller),
                new XElement("customers", Customers.Select(c => PX("c", c))),
                new XElement("articles", Articles.Select(a => new XElement("a", new XAttribute("sku", a.Sku), new XAttribute("name", a.Name), new XAttribute("price", a.PriceCents), new XAttribute("tax", a.TaxBps), new XAttribute("stock", a.Stock), new XAttribute("min", a.MinStock)))),
                new XElement("movements", Movements.Select(m => new XElement("m", new XAttribute("at", D(m.At)), new XAttribute("sku", m.Sku), new XAttribute("delta", m.Delta), new XAttribute("reason", m.Reason), new XAttribute("after", m.StockAfter)))),
                new XElement("invoices", Invoices.Select(i => new XElement("i", new XAttribute("no", i.Number), new XAttribute("date", D(i.Date)), new XAttribute("customer", i.Customer),
                    i.ServiceDate.HasValue ? new XAttribute("service", D(i.ServiceDate.Value)) : null,
                    new XAttribute("exempt", i.Exempt ? "1" : "0"), new XAttribute("taxmode", i.PerRate ? "rate" : "line"),
                    i.Seller != null ? PX("seller", i.Seller) : null,
                    i.Seller != null ? PX("buyer", i.Buyer) : null,
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
            // Schema 1 (vor den Pflichtangaben): keine Firmendaten/Kunden; alte Rechnungen bleiben unverändert (Rundung je Position).
            var seller = root.Element("seller");
            Seller = seller != null ? PP(seller) : new Party { Name = BrandData.Company, Country = Country };
            var customers = root.Element("customers");
            Customers = customers != null ? customers.Elements("c").Select(PP).ToList() : new List<Party>();
            Invoices = root.Element("invoices").Elements("i").Select(e =>
            {
                var inv = new Invoice
                {
                    Number = S(e, "no"), Date = PD(S(e, "date")),
                    ServiceDate = O(e, "service").Length > 0 ? PD(O(e, "service")) : (DateTime?)null,
                    Seller = e.Element("seller") != null ? PP(e.Element("seller")) : null,
                    Buyer = e.Element("buyer") != null ? PP(e.Element("buyer")) : new Party { Name = S(e, "customer") },
                    Exempt = O(e, "exempt") == "1", PerRate = O(e, "taxmode") == "rate",
                    Lines = e.Elements("l").Select(l => new InvoiceLine { Sku = S(l, "sku"), Name = S(l, "name"), Qty = I(l, "qty"), UnitCents = L(l, "unit"), TaxBps = I(l, "tax") }).ToList(),
                };
                return inv;
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

        static string AddressHtml(Party p, bool withCountry)
        {
            var parts = new List<string> { H(p.Street), H(p.Zip + " " + p.City + (p.Province.Length > 0 ? " (" + p.Province + ")" : "")) };
            if (withCountry) parts.Add(H(p.Country));
            return string.Join("<br>", parts);
        }

        /// <summary>Steuerkennungen des Verkäufers bzw. Kunden: Steuernummer / USt-IdNr. bzw. P.IVA / C.F.</summary>
        static string TaxIdsHtml(Party p, string lang)
        {
            var ids = new List<string>();
            if (p.VatId.Length > 0) ids.Add(H(Strings.Get(lang, "f_vat")) + " " + H((p.Country == "IT" ? "IT" : "") + p.VatId));
            if (p.TaxNumber.Length > 0) ids.Add(H(Strings.Get(lang, "f_taxno")) + " " + H(p.TaxNumber));
            return string.Join(" · ", ids);
        }

        /// <summary>Druckfertige Rechnung als eigenständige HTML-Datei (ohne Skripte, ohne externe Inhalte) mit den Pflichtangaben
        /// nach § 14 Abs. 4 UStG: Name und Anschrift beider Seiten, Steuernummer/USt-IdNr., Ausstellungsdatum, fortlaufende Nummer,
        /// Menge und Bezeichnung, Leistungsdatum, Entgelt und Steuer je Steuersatz bzw. Hinweis auf die Steuerbefreiung.</summary>
        public string InvoiceHtml(Invoice inv, Brand brand)
        {
            var c = CultureInfo.GetCultureInfo(brand.Culture);
            string lang = brand.Language;
            Func<string, string> T = k => H(Strings.Get(lang, k));
            Func<long, string> M = v => H(Money.Format(v, brand.Currency, c));
            var s = inv.Seller;
            var sb = new StringBuilder();
            sb.Append("<!doctype html><html lang=\"").Append(H(lang)).Append("\"><head><meta charset=\"utf-8\"><title>").Append(H(inv.Number)).Append("</title><style>")
              .Append("body{font:14px Segoe UI,Arial,sans-serif;color:#1d2433;margin:40px;max-width:820px}h1{color:").Append(H(brand.Color)).Append(";margin:0 0 4px;font-size:22px}h2{margin:28px 0 8px;font-size:18px}")
              .Append("table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:7px 8px;border-bottom:1px solid #dde3ea;text-align:left;vertical-align:top}td.n,th.n{text-align:right}.tot td{border:0;padding:4px 8px}.tot.g td{font-weight:700;border-top:2px solid #1d2433}")
              .Append(".muted{color:#5b6576}.small{font-size:11px}.addr{margin-top:28px;line-height:1.45}.meta td{border:0;padding:2px 12px 2px 0}.note{margin-top:20px;padding:10px 12px;background:#f3f5f8;border-radius:6px}footer{margin-top:36px;font-size:12px;color:#5b6576;border-top:1px solid #dde3ea;padding-top:10px}")
              .Append("@media print{body{margin:16mm}}</style></head><body>");
            if (s == null)
            {
                // Rechnung aus einer Programmversion vor den Pflichtangaben: unverändert wiedergeben.
                sb.Append("<h1>").Append(H(brand.Company)).Append("</h1><p class=\"muted\">").Append(T("invoice")).Append(" ").Append(H(inv.Number)).Append(" · ").Append(inv.Date.ToString("d", c)).Append("</p>");
                sb.Append("<p><strong>").Append(T("customer")).Append(":</strong> ").Append(H(inv.Customer)).Append("</p>");
            }
            else
            {
                var b = inv.Buyer;
                sb.Append("<header><h1>").Append(H(s.Name)).Append("</h1><div class=\"muted\">").Append(H(s.Street)).Append(" · ").Append(H(s.Zip + " " + s.City)).Append(s.Province.Length > 0 ? " (" + H(s.Province) + ")" : "").Append(" · ").Append(H(s.Country)).Append("</div></header>");
                sb.Append("<div class=\"addr\"><div class=\"small muted\">").Append(H(s.Name)).Append(" · ").Append(H(s.Street)).Append(" · ").Append(H(s.Zip + " " + s.City)).Append("</div>");
                sb.Append("<strong>").Append(H(b.Name)).Append("</strong><br>").Append(AddressHtml(b, b.Country != s.Country));
                string bids = TaxIdsHtml(b, lang);
                if (bids.Length > 0) sb.Append("<br><span class=\"small\">").Append(bids).Append("</span>");
                sb.Append("</div>");
                sb.Append("<h2>").Append(T("invoice")).Append(" ").Append(H(inv.Number)).Append("</h2><table class=\"meta\"><tbody>");
                sb.Append("<tr><td class=\"muted\">").Append(T("invoicedate")).Append("</td><td>").Append(inv.DocumentDate.ToString("d", c)).Append("</td></tr>");
                if (inv.ServiceDate.HasValue) sb.Append("<tr><td class=\"muted\">").Append(T("servicedate")).Append("</td><td>").Append(inv.ServiceDate.Value.ToString("d", c)).Append("</td></tr>");
                sb.Append("</tbody></table>");
            }
            sb.Append("<table><thead><tr><th>").Append(T("pos")).Append("</th><th>").Append(T("item")).Append("</th><th class=\"n\">").Append(T("qty")).Append("</th><th class=\"n\">").Append(T("unit")).Append("</th><th class=\"n\">").Append(T("tax")).Append("</th><th class=\"n\">").Append(T("net")).Append("</th></tr></thead><tbody>");
            int pos = 1;
            foreach (var l in inv.Lines)
                sb.Append("<tr><td>").Append(pos++).Append("</td><td>").Append(H(l.Sku)).Append(" – ").Append(H(l.Name)).Append("</td><td class=\"n\">").Append(l.Qty).Append("</td><td class=\"n\">").Append(M(l.UnitCents)).Append("</td><td class=\"n\">").Append((l.TaxBps / 100m).ToString("0.##", c)).Append(" %</td><td class=\"n\">").Append(M(l.NetCents)).Append("</td></tr>");
            sb.Append("</tbody><tfoot>");
            if (s == null)
            {
                sb.Append("<tr class=\"tot\"><td colspan=\"5\" class=\"n\">").Append(T("net")).Append("</td><td class=\"n\">").Append(M(inv.NetCents)).Append("</td></tr>");
                sb.Append("<tr class=\"tot\"><td colspan=\"5\" class=\"n\">").Append(T("taxsum")).Append("</td><td class=\"n\">").Append(M(inv.TaxCents)).Append("</td></tr>");
            }
            else
            {
                foreach (var g in inv.TaxGroups())
                {
                    string rate = (g.TaxBps / 100m).ToString("0.##", c);
                    sb.Append("<tr class=\"tot\"><td colspan=\"5\" class=\"n\">").Append(H(string.Format(Strings.Get(lang, "netrate"), rate))).Append("</td><td class=\"n\">").Append(M(g.NetCents)).Append("</td></tr>");
                    if (!inv.Exempt) sb.Append("<tr class=\"tot\"><td colspan=\"5\" class=\"n\">").Append(H(string.Format(Strings.Get(lang, "taxrate"), rate))).Append("</td><td class=\"n\">").Append(M(g.TaxCents)).Append("</td></tr>");
                }
            }
            sb.Append("<tr class=\"tot g\"><td colspan=\"5\" class=\"n\">").Append(T("gross")).Append("</td><td class=\"n\">").Append(M(inv.GrossCents)).Append("</td></tr>");
            sb.Append("</tfoot></table>");
            if (s != null)
            {
                if (inv.Exempt) sb.Append("<p class=\"note\">").Append(T("note_exempt_" + s.Country.ToLowerInvariant())).Append("</p>");
                if (s.Country == "IT") sb.Append("<p class=\"note\">").Append(T("courtesy")).Append("</p>");
                sb.Append("<footer>").Append(H(s.Name)).Append(" · ").Append(H(s.Street)).Append(" · ").Append(H(s.Zip + " " + s.City)).Append("<br>").Append(TaxIdsHtml(s, lang)).Append("</footer>");
            }
            sb.Append("</body></html>");
            return sb.ToString();
        }
    }
}
