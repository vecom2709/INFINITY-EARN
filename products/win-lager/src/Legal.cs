// Rechtliche Pflichtangaben auf Rechnungen (Deutschland: § 14 Abs. 4 UStG, Österreich: § 11 UStG) und
// elektronische Rechnung für Italien (FatturaPA, Format FPR12 für Unternehmen und Privatpersonen, Schema v1.2).
// Keine Rechtsberatung: Die Regeln setzen die Pflichtfelder technisch durch; die steuerliche Beurteilung bleibt beim Anwender.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using System.Xml.Schema;

namespace InfinityEarn.WinLager
{
    /// <summary>Verkäufer (Firmendaten) oder Kunde. Felder je Land: DE/AT VatId = USt-IdNr./UID, TaxNumber = Steuernummer;
    /// IT VatId = Partita IVA (11 Ziffern, ohne „IT“), TaxNumber = Codice fiscale, SdiCode/Pec = Empfänger im SdI.</summary>
    public class Party
    {
        public string Name = "", Street = "", Zip = "", City = "", Province = "", Country = "", VatId = "", TaxNumber = "", SdiCode = "", Pec = "";
        /// <summary>Nur Verkäufer: Kleinunternehmer (DE § 19 UStG, AT § 6 Abs. 1 Z 27 UStG) bzw. Regime forfettario (IT).</summary>
        public bool Exempt;
        public Party Copy() { return (Party)MemberwiseClone(); }
    }

    public static class Legal
    {
        static string L(string key) { return Strings.Get(BrandData.Language, key); }
        static string T(string s) { return (s ?? "").Trim(); }
        static string Compact(string s) { return T(s).Replace(" ", "").Replace(".", "").Replace("-", "").ToUpperInvariant(); }
        static bool Digits(string s, int min, int max) { return s.Length >= min && s.Length <= max && s.All(c => c >= '0' && c <= '9'); }

        /// <summary>Leerzeichen entfernen, Länder- und Steuerkennungen vereinheitlichen. Italienische P.IVA ohne „IT“.</summary>
        public static Party Normalize(Party p)
        {
            var n = p.Copy();
            n.Name = T(p.Name); n.Street = T(p.Street); n.Zip = T(p.Zip).ToUpperInvariant(); n.City = T(p.City);
            n.Province = T(p.Province).ToUpperInvariant(); n.Country = T(p.Country).ToUpperInvariant();
            n.VatId = Compact(p.VatId);
            if (n.Country == "IT" && n.VatId.Length == 13 && n.VatId.StartsWith("IT")) n.VatId = n.VatId.Substring(2);
            n.TaxNumber = n.Country == "IT" ? Compact(p.TaxNumber) : T(p.TaxNumber);
            n.SdiCode = Compact(p.SdiCode); n.Pec = T(p.Pec);
            return n;
        }

        /// <summary>Partita IVA: 11 Ziffern, letzte ist Prüfziffer (Luhn-Verfahren).</summary>
        public static bool PartitaIva(string s)
        {
            if (s == null || !Digits(s, 11, 11)) return false;
            int sum = 0;
            for (int i = 0; i < 10; i++) { int d = s[i] - '0'; if (i % 2 == 1) { d *= 2; if (d > 9) d -= 9; } sum += d; }
            return (10 - sum % 10) % 10 == s[10] - '0';
        }

        static readonly int[] CfOdd = { 1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23 };

        /// <summary>Codice fiscale: Person (16 Zeichen mit Prüfbuchstabe) oder Firma (11 Ziffern wie P.IVA).</summary>
        public static bool CodiceFiscale(string s)
        {
            if (s == null) return false;
            if (s.Length == 11) return PartitaIva(s);
            if (!Regex.IsMatch(s, "^[A-Z0-9]{16}$")) return false;
            int sum = 0;
            for (int i = 0; i < 15; i++) { char c = s[i]; int v = c >= '0' && c <= '9' ? c - '0' : c - 'A'; sum += i % 2 == 0 ? CfOdd[v] : v; }
            return s[15] == (char)('A' + sum % 26);
        }

        /// <summary>USt-IdNr. im Format des Landes (DE123456789, ATU12345678, IT + P.IVA, sonst Länderkürzel + 2–13 Zeichen).</summary>
        public static bool VatId(string s, string country)
        {
            if (country == "DE") return Regex.IsMatch(s, "^DE[0-9]{9}$");
            if (country == "AT") return Regex.IsMatch(s, "^ATU[0-9]{8}$");
            if (country == "IT") return PartitaIva(s);
            return Regex.IsMatch(s, "^[A-Z]{2}[0-9A-Z]{2,13}$");
        }

        static bool ZipOk(string zip, string country)
        {
            if (country == "DE" || country == "IT") return Digits(zip, 5, 5);
            if (country == "AT") return Digits(zip, 4, 4);
            return zip.Length >= 1 && zip.Length <= 12;
        }

        static bool TaxNumberOk(string s)
        {
            string d = new string(s.Where(c => c >= '0' && c <= '9').ToArray());
            return Regex.IsMatch(s, "^[0-9 /]+$") && d.Length >= 9 && d.Length <= 13;
        }

        static void Need(List<string> list, bool ok, string key, bool empty)
        {
            if (!ok) list.Add(L(key) + (empty ? "" : " (" + L("w_invalid") + ")"));
        }

        static void Address(List<string> m, Party p, int nameMax, int streetMax)
        {
            Need(m, p.Name.Length > 0 && p.Name.Length <= nameMax, "f_name", p.Name.Length == 0);
            Need(m, p.Street.Length > 0 && p.Street.Length <= streetMax, "f_street", p.Street.Length == 0);
            Need(m, ZipOk(p.Zip, p.Country), "f_zip", p.Zip.Length == 0);
            Need(m, p.City.Length > 0 && p.City.Length <= 60, "f_city", p.City.Length == 0);
            Need(m, Regex.IsMatch(p.Country, "^[A-Z]{2}$"), "f_country", p.Country.Length == 0);
            if (p.Country == "IT") Need(m, p.Province.Length == 0 || Regex.IsMatch(p.Province, "^[A-Z]{2}$"), "f_province", false);
        }

        /// <summary>Fehlende oder ungültige Firmendaten (leer = vollständig).</summary>
        public static List<string> SellerMissing(Party p)
        {
            var m = new List<string>();
            Address(m, p, 80, 60);
            if (p.Country == "IT")
            {
                Need(m, p.Province.Length == 2, "f_province", p.Province.Length == 0);
                Need(m, PartitaIva(p.VatId), "f_vat", p.VatId.Length == 0);
                if (p.TaxNumber.Length > 0) Need(m, CodiceFiscale(p.TaxNumber), "f_taxno", false);
            }
            else
            {
                // § 14 Abs. 4 Nr. 2 UStG: Steuernummer oder USt-IdNr. – mindestens eins, beide im gültigen Format.
                if (p.VatId.Length == 0 && p.TaxNumber.Length == 0) m.Add(L("f_taxno") + " / " + L("f_vat"));
                if (p.VatId.Length > 0) Need(m, VatId(p.VatId, p.Country), "f_vat", false);
                if (p.TaxNumber.Length > 0) Need(m, TaxNumberOk(p.TaxNumber), "f_taxno", false);
            }
            return m;
        }

        public static void CheckSeller(Party p)
        {
            var m = SellerMissing(p);
            if (m.Count > 0) throw DomainException.Of("SELLER", "e_seller", string.Join(", ", m));
        }

        /// <summary>Fehlende oder ungültige Kundendaten für Rechnungen eines Verkäufers aus sellerCountry.</summary>
        public static List<string> CustomerMissing(Party c, string sellerCountry)
        {
            var m = new List<string>();
            bool it = sellerCountry == "IT";
            Address(m, c, it ? 80 : 200, it ? 60 : 120);
            if (c.VatId.Length > 0) Need(m, VatId(c.VatId, c.Country), "f_vat", false);
            if (it && c.Country == "IT")
            {
                // FatturaPA: Partita IVA oder Codice fiscale des Kunden ist Pflicht; Empfänger über Codice destinatario oder PEC.
                if (c.VatId.Length == 0 && c.TaxNumber.Length == 0) m.Add(L("f_vat") + " / " + L("f_taxno"));
                if (c.TaxNumber.Length > 0) Need(m, CodiceFiscale(c.TaxNumber), "f_taxno", false);
                Need(m, Regex.IsMatch(c.SdiCode, "^[A-Z0-9]{7}$"), "f_sdi", c.SdiCode.Length == 0);
                if (c.Pec.Length > 0) Need(m, Regex.IsMatch(c.Pec, @"^[^@\s]+@[^@\s]+\.[^@\s]+$") && c.Pec.Length <= 256, "f_pec", false);
            }
            return m;
        }

        public static void CheckCustomer(Party c, string sellerCountry)
        {
            var m = CustomerMissing(c, sellerCountry);
            if (m.Count > 0) throw DomainException.Of("CUSTOMER_DATA", "e_customer_data", c.Name, string.Join(", ", m));
        }
    }

    /// <summary>FatturaPA (Format FPR12, Schema 1.2) für italienische Verkäufer. Übermittlung an das SdI macht der Anwender:
    /// Upload im kostenlosen Portal „Fatture e Corrispettivi“ der Agenzia delle Entrate oder per PEC.
    /// Nicht unterstützt (klare Fehlermeldung statt falscher Datei): Rechnungen an die öffentliche Verwaltung (FPA12),
    /// Steuersatz 0 % ohne Regime forfettario (Natura je Geschäftsfall), Rechnungen vor Schema 2 ohne Pflichtangaben.</summary>
    public static class FatturaPa
    {
        public const string Ns = "http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2";
        public const string ExemptReference = "Operazione in franchigia da IVA ai sensi dell'art. 1, cc. 54-89, L. 190/2014";
        public const long BolloThresholdCents = 7747;

        /// <summary>Text auf den erlaubten Zeichensatz (Basic Latin + Latin-1) bringen und kürzen.</summary>
        public static string Latin(string s, int max)
        {
            var sb = new StringBuilder();
            foreach (char ch in s ?? "")
            {
                switch (ch)
                {
                    case '–': case '—': case '‑': case '−': sb.Append('-'); break;
                    case '„': case '“': case '”': case '«': case '»': sb.Append('"'); break;
                    case '‚': case '‘': case '’': sb.Append('\''); break;
                    case '€': sb.Append("EUR"); break;
                    case '…': sb.Append("..."); break;
                    default: sb.Append(ch <= 'ÿ' && !char.IsControl(ch) ? ch : '?'); break;
                }
            }
            string t = Regex.Replace(sb.ToString(), @"\s+", " ").Trim();
            return t.Length > max ? t.Substring(0, max).TrimEnd() : t;
        }

        static string Amt(long cents) { return (cents / 100m).ToString("0.00", CultureInfo.InvariantCulture); }
        static string Rate(int bps) { return (bps / 100m).ToString("0.00", CultureInfo.InvariantCulture); }
        static XElement E(string name, object value) { return new XElement(name, value); }

        /// <summary>Fortlaufende Kennung je Rechnung (5 Zeichen, Basis 36) aus Jahr und Nummer: eindeutig über Jahre.</summary>
        public static string Progressive(Invoice inv)
        {
            var m = Regex.Match(inv.Number ?? "", @"(\d{4})-(\d+)$");
            if (!m.Success) throw DomainException.Of("FATTURAPA", "e_fpa_legacy");
            long v = (long.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) % 100) * 100000 + long.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
            const string digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
            var sb = new StringBuilder();
            do { sb.Insert(0, digits[(int)(v % 36)]); v /= 36; } while (v > 0);
            return sb.ToString().PadLeft(5, '0');
        }

        /// <summary>Dateiname nach Vorgabe des SdI: IT + P.IVA + _ + Kennung.</summary>
        public static string FileName(Invoice inv) { Check(inv); return "IT" + inv.Seller.VatId + "_" + Progressive(inv) + ".xml"; }

        static void Check(Invoice inv)
        {
            if (inv.Seller == null || !inv.ServiceDate.HasValue) throw DomainException.Of("FATTURAPA", "e_fpa_legacy");
            if (inv.Seller.Country != "IT") throw DomainException.Of("FATTURAPA", "e_fpa_country");
            if (!inv.Exempt && inv.Lines.Any(l => l.TaxBps == 0)) throw DomainException.Of("FATTURAPA", "e_fpa_zero");
        }

        static XElement Sede(Party p)
        {
            bool it = p.Country == "IT";
            return new XElement("Sede",
                E("Indirizzo", Latin(p.Street, 60)),
                E("CAP", it ? p.Zip : "00000"),
                E("Comune", Latin(it ? p.City : (p.Zip + " " + p.City), 60)),
                it && p.Province.Length == 2 ? E("Provincia", p.Province) : null,
                E("Nazione", p.Country));
        }

        public static XDocument Document(Invoice inv)
        {
            Check(inv);
            var s = inv.Seller;
            var b = inv.Buyer;
            bool buyerIt = b.Country == "IT";
            string dest = buyerIt ? (b.SdiCode.Length == 7 ? b.SdiCode : "0000000") : "XXXXXXX";
            XNamespace p = Ns;
            XElement buyerId = null;
            if (b.VatId.Length > 0)
                buyerId = new XElement("IdFiscaleIVA", E("IdPaese", b.Country), E("IdCodice", buyerIt || !b.VatId.StartsWith(b.Country) ? b.VatId : b.VatId.Substring(2)));
            else if (!buyerIt)
                buyerId = new XElement("IdFiscaleIVA", E("IdPaese", b.Country), E("IdCodice", "99999999999"));

            var header = new XElement("FatturaElettronicaHeader",
                new XElement("DatiTrasmissione",
                    new XElement("IdTrasmittente", E("IdPaese", "IT"), E("IdCodice", s.TaxNumber.Length > 0 ? s.TaxNumber : s.VatId)),
                    E("ProgressivoInvio", Progressive(inv)),
                    E("FormatoTrasmissione", "FPR12"),
                    E("CodiceDestinatario", dest),
                    buyerIt && dest == "0000000" && b.Pec.Length > 0 ? E("PECDestinatario", b.Pec) : null),
                new XElement("CedentePrestatore",
                    new XElement("DatiAnagrafici",
                        new XElement("IdFiscaleIVA", E("IdPaese", "IT"), E("IdCodice", s.VatId)),
                        s.TaxNumber.Length > 0 ? E("CodiceFiscale", s.TaxNumber) : null,
                        new XElement("Anagrafica", E("Denominazione", Latin(s.Name, 80))),
                        E("RegimeFiscale", inv.Exempt ? "RF19" : "RF01")),
                    Sede(s)),
                new XElement("CessionarioCommittente",
                    new XElement("DatiAnagrafici",
                        buyerId,
                        buyerIt && b.TaxNumber.Length > 0 ? E("CodiceFiscale", b.TaxNumber) : null,
                        new XElement("Anagrafica", E("Denominazione", Latin(b.Name, 80)))),
                    Sede(b)));

            int n = 1;
            var lines = inv.Lines.Select(l => new XElement("DettaglioLinee",
                E("NumeroLinea", n++),
                new XElement("CodiceArticolo", E("CodiceTipo", "INTERNO"), E("CodiceValore", Latin(l.Sku, 35))),
                E("Descrizione", Latin(l.Name, 1000)),
                E("Quantita", l.Qty.ToString(CultureInfo.InvariantCulture) + ".00"),
                E("PrezzoUnitario", Amt(l.UnitCents)),
                E("PrezzoTotale", Amt(l.NetCents)),
                E("AliquotaIVA", Rate(l.TaxBps)),
                l.TaxBps == 0 ? E("Natura", "N2.2") : null)).ToList();
            var summary = inv.TaxGroups().Select(g => new XElement("DatiRiepilogo",
                E("AliquotaIVA", Rate(g.TaxBps)),
                g.TaxBps == 0 ? E("Natura", "N2.2") : null,
                E("ImponibileImporto", Amt(g.NetCents)),
                E("Imposta", Amt(g.TaxCents)),
                g.TaxBps > 0 ? E("EsigibilitaIVA", "I") : null,
                g.TaxBps == 0 ? E("RiferimentoNormativo", ExemptReference) : null)).ToList();

            var body = new XElement("FatturaElettronicaBody",
                new XElement("DatiGenerali",
                    new XElement("DatiGeneraliDocumento",
                        E("TipoDocumento", "TD01"),
                        E("Divisa", "EUR"),
                        E("Data", inv.DocumentDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
                        E("Numero", Latin(inv.Number, 20)),
                        inv.Exempt && inv.GrossCents > BolloThresholdCents ? new XElement("DatiBollo", E("BolloVirtuale", "SI"), E("ImportoBollo", "2.00")) : null,
                        E("ImportoTotaleDocumento", Amt(inv.GrossCents)))),
                new XElement("DatiBeniServizi", lines, summary));

            return new XDocument(new XDeclaration("1.0", "UTF-8", null),
                new XElement(p + "FatturaElettronica",
                    new XAttribute("versione", "FPR12"),
                    new XAttribute(XNamespace.Xmlns + "p", Ns),
                    new XAttribute(XNamespace.Xmlns + "ds", "http://www.w3.org/2000/09/xmldsig#"),
                    new XAttribute(XNamespace.Xmlns + "xsi", "http://www.w3.org/2001/XMLSchema-instance"),
                    header, body));
        }

        // Amtliches Schema (Schema_VFPR12_v1.2.3.xsd von fatturapa.gov.it) ist als Ressource „fpr12.xsd“ eingebettet.
        // Das W3C-Signaturschema wird nicht geladen (kein Netzzugriff): ds:Signature ist bei FPR12 optional und wird nie erzeugt.
        const string SignatureStub = "<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema' targetNamespace='http://www.w3.org/2000/09/xmldsig#'><xs:element name='Signature'/></xs:schema>";
        static XmlSchemaSet schema;

        public static XmlSchemaSet Schema()
        {
            if (schema != null) return schema;
            using (var s = typeof(FatturaPa).Assembly.GetManifestResourceStream("fpr12.xsd"))
            {
                if (s == null) throw DomainException.Of("FATTURAPA", "e_fpa_schema");
                var set = new XmlSchemaSet { XmlResolver = null };
                set.Add(XmlSchema.Read(new StringReader(SignatureStub), null));
                using (var r = XmlReader.Create(s, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null })) set.Add(null, r);
                set.Compile();
                schema = set;
            }
            return schema;
        }

        /// <summary>Abweichungen vom amtlichen Schema (leer = gültig).</summary>
        public static List<string> SchemaErrors(XDocument doc)
        {
            var errors = new List<string>();
            doc.Validate(Schema(), (o, e) => errors.Add(e.Message));
            return errors;
        }

        /// <summary>Datei-Inhalt: UTF-8 ohne BOM, mit XML-Deklaration. Nur schemagültige Dateien werden erzeugt.</summary>
        public static byte[] Bytes(Invoice inv)
        {
            var doc = Document(inv);
            var errors = SchemaErrors(doc);
            if (errors.Count > 0) throw DomainException.Of("FATTURAPA", "e_fpa_invalid", errors[0]);
            using (var ms = new MemoryStream())
            {
                using (var w = XmlWriter.Create(ms, new XmlWriterSettings { Encoding = new UTF8Encoding(false), Indent = true }))
                    doc.Save(w);
                return ms.ToArray();
            }
        }
    }
}
