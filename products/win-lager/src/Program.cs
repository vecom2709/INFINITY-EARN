// Einstiegspunkt. Ohne Argumente: normale Anwendung.
// Prüfmodi für den echten Installationstest (Funktion 157/158), schreiben einen Bericht und beenden sich:
//   --check <bericht.json> [<screenshot.png>]   Daten laden, Oberfläche aufbauen und rendern, Bericht schreiben
//   --add-article <SKU> <Name> <Preis> <Bestand>   Artikel anlegen, Bestand buchen, speichern (Datenhaltung über Neustart)
//   --shots <ordner>   Abbildungen der Bedienungsanleitung (JPEG) mit Beispieldaten in einem eigenen Temp-Ordner – Kundendaten werden nie berührt
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace InfinityEarn.WinLager
{
    static class Program
    {
        static string Json(string s) { return "\"" + (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"") + "\""; }

        [STAThread]
        static int Main(string[] args)
        {
            var brand = Brand.Current();
            string dataPath = Path.Combine(Store.DefaultDataDir(brand.ProductId), "daten.xml");
            // Prüfmodi greifen auf dieselben Daten zu wie die Oberfläche: nur einer gleichzeitig (gleiche Sperre wie die Einzelinstanz).
            if (args.Length >= 2 && args[0] == "--shots") return Shots(brand, args[1]);
            bool cli = args.Length > 0 && (args[0] == "--add-article" || args[0] == "--check");
            Mutex cliLock = null;
            if (cli)
            {
                cliLock = new Mutex(false, "InfinityEarn." + brand.ProductId);
                bool got;
                try { got = cliLock.WaitOne(TimeSpan.FromSeconds(30)); } catch (AbandonedMutexException) { got = true; }
                if (!got) { Console.Error.WriteLine("Programm ist geöffnet – Daten sind gesperrt."); return 5; }
            }
            try
            {
                if (args.Length >= 5 && args[0] == "--add-article")
                {
                    var s = Store.Load(dataPath);
                    s.AddArticle(args[1], args[2], Money.Parse(args[3]), brand.TaxRatesBps[0], 0);
                    s.Book(args[1], int.Parse(args[4], CultureInfo.InvariantCulture), "Prüfung");
                    s.Save();
                    return 0;
                }
                if (args.Length >= 2 && args[0] == "--check")
                {
                    var s = Store.Load(dataPath);
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    string png = args.Length >= 3 ? args[2] : null;
                    int tabs = 0, controls = 0;
                    using (var f = new MainForm(brand, s))
                    {
                        f.ShowInTaskbar = false;
                        f.StartPosition = FormStartPosition.Manual;
                        f.Location = new Point(-20000, -20000);
                        f.Show();
                        Application.DoEvents();
                        tabs = f.Tabs.TabPages.Count;
                        controls = CountControls(f);
                        if (png != null)
                        {
                            f.Location = new Point(0, 0);
                            using (var bmp = new Bitmap(f.Width, f.Height))
                            {
                                f.DrawToBitmap(bmp, new Rectangle(0, 0, f.Width, f.Height));
                                bmp.Save(png, ImageFormat.Png);
                            }
                        }
                        f.Close();
                    }
                    var report = new StringBuilder();
                    report.Append("{\"ok\":true,\"product\":").Append(Json(brand.ProductId)).Append(",\"version\":").Append(Json(brand.Version))
                        .Append(",\"exe\":").Append(Json(Application.ExecutablePath)).Append(",\"dataPath\":").Append(Json(dataPath))
                        .Append(",\"articles\":[").Append(string.Join(",", s.Articles.Select(a => "{\"sku\":" + Json(a.Sku) + ",\"stock\":" + a.Stock + "}"))).Append("]")
                        .Append(",\"invoices\":").Append(s.Invoices.Count).Append(",\"tabs\":").Append(tabs).Append(",\"controls\":").Append(controls)
                        .Append(",\"clr\":").Append(Json(Environment.Version.ToString())).Append(",\"os\":").Append(Json(RealOs())).Append("}");
                    File.WriteAllText(args[1], report.ToString(), new UTF8Encoding(false));
                    return 0;
                }

                bool created;
                using (var mutex = new Mutex(true, "InfinityEarn." + brand.ProductId, out created))
                {
                    if (!created) { MessageBox.Show(brand.Language == "en" ? "The program is already open." : brand.Language == "it" ? "Il programma è già aperto." : "Das Programm ist bereits geöffnet.", brand.ProductName); return 2; }
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    Application.Run(new MainForm(brand, Store.Load(dataPath)));
                }
                return 0;
            }
            catch (Exception ex)
            {
                if (args.Length >= 2 && args[0] == "--check") { File.WriteAllText(args[1], "{\"ok\":false,\"error\":" + Json(ex.Message) + "}", new UTF8Encoding(false)); return 1; }
                if (args.Length > 0) { Console.Error.WriteLine(ex.Message); return 1; }
                MessageBox.Show(ex.Message, brand.ProductName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
            finally
            {
                if (cliLock != null) { try { cliLock.ReleaseMutex(); } catch { } cliLock.Dispose(); }
            }
        }

        // Beispieldaten der Anleitung je Sprache: { Nummer, Bezeichnung, Preis (Cent), Steuer-Index, Mindestbestand, Eingang }
        static readonly Dictionary<string, object[][]> DemoArticles = new Dictionary<string, object[][]>
        {
            { "de", new[] { new object[] { "A-100", "Schraube M6 × 40, verzinkt", 15L, 0, 200, 1000 }, new object[] { "A-200", "Dübel 8 mm", 9L, 0, 300, 2000 }, new object[] { "B-310", "Akku-Bohrschrauber 18 V", 12900L, 0, 2, 6 }, new object[] { "C-420", "Arbeitshandschuhe Gr. 10", 450L, 0, 20, 80 }, new object[] { "D-500", "Fachbuch Holzbau", 3900L, 1, 0, 10 } } },
            { "it", new[] { new object[] { "A-100", "Vite M6 × 40, zincata", 15L, 0, 200, 1000 }, new object[] { "A-200", "Tassello 8 mm", 9L, 0, 300, 2000 }, new object[] { "B-310", "Avvitatore a batteria 18 V", 12900L, 0, 2, 6 }, new object[] { "C-420", "Guanti da lavoro tg. 10", 450L, 0, 20, 80 }, new object[] { "D-500", "Manuale costruzioni in legno", 3900L, 2, 0, 10 } } },
            { "en", new[] { new object[] { "A-100", "Screw M6 × 40, zinc-plated", 15L, 0, 200, 1000 }, new object[] { "A-200", "Wall plug 8 mm", 9L, 0, 300, 2000 }, new object[] { "B-310", "Cordless drill 18 V", 12900L, 0, 2, 6 }, new object[] { "C-420", "Work gloves size 10", 450L, 0, 20, 80 }, new object[] { "D-500", "Timber construction handbook", 3900L, 1, 0, 10 } } },
        };
        static readonly Dictionary<string, string[]> DemoTexts = new Dictionary<string, string[]>
        {
            // { Lieferung, Verkauf, Kunde 1, Kunde 2, Kunde im Entwurf }
            { "de", new[] { "Lieferung Großhandel", "Verkauf Theke", "Schreinerei Beispiel", "Hausverwaltung Muster", "Bauservice Beispiel" } },
            { "it", new[] { "Consegna grossista", "Vendita al banco", "Falegnameria Esempio", "Condominio Modello", "Edilizia Esempio" } },
            { "en", new[] { "Wholesale delivery", "Counter sale", "Example Joinery", "Sample Property Services", "Example Builders" } },
        };

        /// <summary>Abbildungen der Anleitung: Beispielbestand in einem eigenen Temp-Ordner, je Bereich ein JPEG. Beispieldaten, nie Kundendaten.</summary>
        static int Shots(Brand brand, string outDir)
        {
            string lang = DemoArticles.ContainsKey(brand.Language) ? brand.Language : "de";
            string tmp = Path.Combine(Path.GetTempPath(), "ie-winlager-shots-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tmp);
            Directory.CreateDirectory(outDir);
            try
            {
                var s = new Store(Path.Combine(tmp, "daten.xml"));
                var t0 = new DateTime(2026, 11, 2, 8, 0, 0);
                int tick = 0;
                s.Clock = () => t0.AddHours(5 * tick++);
                var texts = DemoTexts[lang];
                foreach (var a in DemoArticles[lang])
                {
                    int ti = Math.Min((int)a[3], brand.TaxRatesBps.Length - 1);
                    s.AddArticle((string)a[0], (string)a[1], (long)a[2], brand.TaxRatesBps[ti], (int)a[4]);
                    s.Book((string)a[0], (int)a[5], texts[0]);
                }
                s.CreateInvoice(texts[2], new[] { new KeyValuePair<string, int>("A-100", 500), new KeyValuePair<string, int>("A-200", 300), new KeyValuePair<string, int>("B-310", 2) });
                s.Book("C-420", -12, texts[1]);
                s.CreateInvoice(texts[3], new[] { new KeyValuePair<string, int>("A-100", 260), new KeyValuePair<string, int>("A-200", 150), new KeyValuePair<string, int>("B-310", 2), new KeyValuePair<string, int>("D-500", 1) });
                s.Save();

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                var jpeg = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);
                var q = new EncoderParameters(1);
                q.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 78L);
                var names = new[] { "artikel", "lager", "rechnungen" };
                using (var f = new MainForm(brand, s))
                {
                    f.ShowInTaskbar = false;
                    f.StartPosition = FormStartPosition.Manual;
                    f.Location = new Point(0, 0);
                    f.Show();
                    f.SelectArticle("B-310");
                    f.ShowStatus(Strings.Get(brand.Language, "datadir") + ": %APPDATA%\\InfinityEarn\\" + brand.ProductId);
                    f.DemoDraft(texts[4], new[] { new KeyValuePair<string, int>("A-100", 100), new KeyValuePair<string, int>("C-420", 10) });
                    for (int i = 0; i < names.Length; i++)
                    {
                        f.Tabs.SelectedIndex = i;
                        Application.DoEvents();
                        f.Refresh();
                        using (var bmp = new Bitmap(f.Width, f.Height))
                        {
                            f.DrawToBitmap(bmp, new Rectangle(0, 0, f.Width, f.Height));
                            bmp.Save(Path.Combine(outDir, names[i] + ".jpg"), jpeg, q);
                        }
                    }
                    f.Close();
                }
                File.WriteAllText(Path.Combine(outDir, "rechnung.html"), s.InvoiceHtml(s.Invoices[0], brand), new UTF8Encoding(false));
                return 0;
            }
            catch (Exception ex) { Console.Error.WriteLine(ex.Message); return 1; }
            finally { try { Directory.Delete(tmp, true); } catch { } }
        }

        /// <summary>Echte Windows-Version (Environment.OSVersion meldet ohne Manifest eine Kompatibilitätsversion).</summary>
        static string RealOs()
        {
            try
            {
                using (var k = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
                {
                    string build = Convert.ToString(k.GetValue("CurrentBuild"));
                    int b; int.TryParse(build, out b);
                    return (b >= 22000 ? "Windows 11" : "Windows 10") + " " + Convert.ToString(k.GetValue("DisplayVersion")) + " (Build " + build + ")";
                }
            }
            catch { return Environment.OSVersion.VersionString; }
        }

        static int CountControls(Control c) { return 1 + c.Controls.Cast<Control>().Sum(x => CountControls(x)); }
    }
}
