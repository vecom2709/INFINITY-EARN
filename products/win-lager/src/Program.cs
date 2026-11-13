// Einstiegspunkt. Ohne Argumente: normale Anwendung.
// Prüfmodi für den echten Installationstest (Funktion 157/158), schreiben einen Bericht und beenden sich:
//   --check <bericht.json> [<screenshot.png>]   Daten laden, Oberfläche aufbauen und rendern, Bericht schreiben
//   --add-article <SKU> <Name> <Preis> <Bestand>   Artikel anlegen, Bestand buchen, speichern (Datenhaltung über Neustart)
using System;
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
