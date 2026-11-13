// Installer und Deinstallationsprogramm in einer Datei (Funktion 157). Pro Benutzer, ohne Administratorrechte.
// Installiert nach %LOCALAPPDATA%\Programs\InfinityEarn\<Produkt>, Startmenü-Verknüpfung, Eintrag unter „Apps & Features“.
// Deinstallation entfernt nur die eigenen Dateien; Kundendaten (%APPDATA%\InfinityEarn\<Produkt>) bleiben erhalten.
// Argumente: /S (still)  /D=<Ordner>  /uninstall
// Exit-Codes: 0 ok · 3 Voraussetzung fehlt · 4 Programm läuft noch · 5 sonstiger Fehler · 6 abgebrochen
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

namespace InfinityEarn.WinLagerSetup
{
    static class Setup
    {
        static bool silent;
        static string logPath;

        static string KeyPath { get { return @"Software\Microsoft\Windows\CurrentVersion\Uninstall\InfinityEarn." + SetupData.ProductId; } }
        static string ShortcutPath { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), SetupData.ProductName + ".lnk"); } }
        static string DefaultDir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "InfinityEarn", SetupData.ProductId); } }
        static string DataDir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "InfinityEarn", SetupData.ProductId); } }

        /// <summary>Text in der Sprache der Kundenfassung (de/it/en).</summary>
        static string T(string de, string it, string en) { return SetupData.Language == "it" ? it : SetupData.Language == "en" ? en : de; }

        static string Running { get { return T("Das Programm läuft noch. Bitte schließen und erneut versuchen. Es wurde nichts verändert.", "Il programma è ancora aperto. Chiuderlo e riprovare. Non è stato modificato nulla.", "The program is still running. Please close it and try again. Nothing was changed."); } }

        static void Log(string msg)
        {
            try { File.AppendAllText(logPath, DateTime.Now.ToString("s") + " " + msg + Environment.NewLine, Encoding.UTF8); } catch { }
        }

        static int Done(int code, string msg)
        {
            Log("exit " + code + ": " + msg);
            if (!silent) MessageBox.Show(msg, SetupData.ProductName, MessageBoxButtons.OK, code == 0 ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
            else if (code != 0) Console.Error.WriteLine(msg);
            return code;
        }

        [STAThread]
        static int Main(string[] args)
        {
            silent = args.Any(a => a.Equals("/S", StringComparison.OrdinalIgnoreCase));
            string dirArg = args.Where(a => a.StartsWith("/D=", StringComparison.OrdinalIgnoreCase)).Select(a => a.Substring(3).Trim('"')).FirstOrDefault();
            logPath = Path.Combine(Path.GetTempPath(), "InfinityEarn-" + SetupData.ProductId + "-setup.log");
            Log("start " + string.Join(" ", args) + " version " + SetupData.Version);
            try
            {
                if (args.Any(a => a.Equals("/uninstall", StringComparison.OrdinalIgnoreCase))) return Uninstall(dirArg);
                return Install(dirArg ?? DefaultDir);
            }
            catch (Exception ex)
            {
                return Done(5, T("Fehler: ", "Errore: ", "Error: ") + ex.Message);
            }
        }

        /// <summary>.NET Framework 4.6.2 oder neuer (in Windows 10/11 enthalten). Simulierbar für den Negativtest.</summary>
        static bool FrameworkPresent()
        {
            if (Environment.GetEnvironmentVariable("INFINITY_SIMULATE_NO_NETFX") == "1") return false;
            using (var k = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full"))
            {
                var v = k == null ? null : k.GetValue("Release");
                return v is int && (int)v >= 394802;
            }
        }

        /// <summary>Das Programm hält während der Laufzeit eine benannte Sperre (Einzelinstanz). Windows erlaubt das Umbenennen laufender Dateien – darauf verlassen wir uns nicht.</summary>
        static bool ProgramRunning()
        {
            System.Threading.Mutex m;
            if (System.Threading.Mutex.TryOpenExisting("InfinityEarn." + SetupData.ProductId, out m)) { m.Dispose(); return true; }
            return false;
        }

        static int Install(string dir)
        {
            if (!FrameworkPresent()) return Done(3, T("Voraussetzung fehlt: .NET Framework 4.6.2 oder neuer ist nicht installiert. Es ist in Windows 10 und 11 enthalten; unter älteren Systemen bitte über Windows Update installieren. Es wurde nichts verändert.", "Requisito mancante: .NET Framework 4.6.2 o successivo non è installato. È incluso in Windows 10 e 11; sui sistemi più vecchi installarlo tramite Windows Update. Non è stato modificato nulla.", "Missing requirement: .NET Framework 4.6.2 or later is not installed. It is included in Windows 10 and 11; on older systems please install it via Windows Update. Nothing was changed."));
            if (!silent && MessageBox.Show(string.Format(T("{0} {1} für {2} installieren?\n\nOrdner: {3}\n\nHinweis: Das Programm ist nicht digital signiert.", "Installare {0} {1} per {2}?\n\nCartella: {3}\n\nNota: il programma non è firmato digitalmente.", "Install {0} {1} for {2}?\n\nFolder: {3}\n\nNote: the program is not digitally signed."), SetupData.ProductName, SetupData.Version, SetupData.Company, dir), SetupData.ProductName, MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK) return Done(6, T("Installation abgebrochen.", "Installazione annullata.", "Installation cancelled."));

            if (ProgramRunning()) return Done(4, Running);
            byte[] app;
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("app.exe"))
            {
                if (s == null) return Done(5, T("Installationspaket unvollständig (Programm fehlt).", "Pacchetto di installazione incompleto (manca il programma).", "Installation package incomplete (program missing)."));
                using (var m = new MemoryStream()) { s.CopyTo(m); app = m.ToArray(); }
            }
            string previous = null;
            using (var k = Registry.CurrentUser.OpenSubKey(KeyPath)) if (k != null) previous = k.GetValue("DisplayVersion") as string;

            Directory.CreateDirectory(dir);
            string exe = Path.Combine(dir, SetupData.ExeName);
            string tmp = exe + ".new";
            File.WriteAllBytes(tmp, app);
            try
            {
                if (File.Exists(exe)) File.Replace(tmp, exe, null); else File.Move(tmp, exe);
            }
            catch (IOException)
            {
                File.Delete(tmp);
                return Done(4, Running);
            }
            string self = Assembly.GetExecutingAssembly().Location;
            string uninst = Path.Combine(dir, "uninstall.exe");
            if (!string.Equals(Path.GetFullPath(self), Path.GetFullPath(uninst), StringComparison.OrdinalIgnoreCase)) File.Copy(self, uninst, true);
            File.WriteAllText(Path.Combine(dir, "install.json"), "{\"product\":\"" + SetupData.ProductId + "\",\"version\":\"" + SetupData.Version + "\",\"files\":[\"" + SetupData.ExeName + "\",\"uninstall.exe\",\"install.json\"],\"signed\":false}", new UTF8Encoding(false));

            CreateShortcut(exe, dir);
            using (var k = Registry.CurrentUser.CreateSubKey(KeyPath))
            {
                k.SetValue("DisplayName", SetupData.ProductName);
                k.SetValue("DisplayVersion", SetupData.Version);
                k.SetValue("Publisher", SetupData.Company);
                k.SetValue("InstallLocation", dir);
                k.SetValue("DisplayIcon", exe);
                k.SetValue("UninstallString", "\"" + uninst + "\" /uninstall");
                k.SetValue("QuietUninstallString", "\"" + uninst + "\" /uninstall /S");
                k.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
                k.SetValue("EstimatedSize", (int)Math.Max(1, (app.Length + new FileInfo(uninst).Length) / 1024), RegistryValueKind.DWord);
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
            Log("installed " + SetupData.Version + (previous != null ? " (upgrade from " + previous + ")" : "") + " to " + dir);
            if (!silent && MessageBox.Show(SetupData.ProductName + T(" wurde installiert", " è stato installato", " has been installed") + (previous != null ? string.Format(T(" (aktualisiert von {0})", " (aggiornato da {0})", " (updated from {0})"), previous) : "") + ".\n" + T("Ihre Daten liegen in: ", "I vostri dati si trovano in: ", "Your data is stored in: ") + DataDir + "\n\n" + T("Jetzt starten?", "Avviare ora?", "Start now?"), SetupData.ProductName, MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                Process.Start(exe);
            return 0;
        }

        static void CreateShortcut(string exe, string dir)
        {
            var t = Type.GetTypeFromProgID("WScript.Shell");
            if (t == null) { Log("WScript.Shell nicht verfügbar – keine Verknüpfung"); return; }
            object shell = Activator.CreateInstance(t);
            object lnk = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { ShortcutPath });
            var lt = lnk.GetType();
            lt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, lnk, new object[] { exe });
            lt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, lnk, new object[] { dir });
            lt.InvokeMember("Description", BindingFlags.SetProperty, null, lnk, new object[] { SetupData.ProductName + " – " + SetupData.Company });
            lt.InvokeMember("Save", BindingFlags.InvokeMethod, null, lnk, null);
        }

        static int Uninstall(string dirArg)
        {
            string dir = dirArg;
            if (dir == null) using (var k = Registry.CurrentUser.OpenSubKey(KeyPath)) if (k != null) dir = k.GetValue("InstallLocation") as string;
            if (dir == null) dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            if (!silent && MessageBox.Show(SetupData.ProductName + T(" entfernen?\n\nIhre Daten bleiben erhalten in:\n", " rimuovere?\n\nI vostri dati restano in:\n", " remove?\n\nYour data is kept in:\n") + DataDir, SetupData.ProductName, MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK) return Done(6, T("Deinstallation abgebrochen.", "Disinstallazione annullata.", "Uninstall cancelled."));
            string exe = Path.Combine(dir, SetupData.ExeName);
            if (ProgramRunning()) return Done(4, Running);
            try { if (File.Exists(exe)) File.Delete(exe); }
            catch (Exception) { return Done(4, Running); }
            foreach (var f in new[] { "install.json", SetupData.ExeName + ".new" }) { var p = Path.Combine(dir, f); if (File.Exists(p)) File.Delete(p); }
            if (File.Exists(ShortcutPath)) File.Delete(ShortcutPath);
            Registry.CurrentUser.DeleteSubKeyTree(KeyPath, false);
            string uninst = Path.Combine(dir, "uninstall.exe");
            string self = Path.GetFullPath(Assembly.GetExecutingAssembly().Location);
            if (string.Equals(self, Path.GetFullPath(uninst), StringComparison.OrdinalIgnoreCase))
            {
                // Sich selbst kann ein laufendes Programm nicht löschen: kurz nach dem Beenden entfernen; Ordner nur, wenn er leer ist (fremde Dateien bleiben).
                Process.Start(new ProcessStartInfo("cmd.exe", "/c ping 127.0.0.1 -n 3 >nul & del /f /q \"" + uninst + "\" & rmdir \"" + dir + "\"") { CreateNoWindow = true, UseShellExecute = false, WindowStyle = ProcessWindowStyle.Hidden });
            }
            else
            {
                if (File.Exists(uninst)) File.Delete(uninst);
                if (Directory.Exists(dir) && !Directory.EnumerateFileSystemEntries(dir).Any()) Directory.Delete(dir);
            }
            Log("uninstalled from " + dir);
            return silent ? 0 : Done(0, SetupData.ProductName + T(" wurde entfernt. Ihre Daten bleiben erhalten in:\n", " è stato rimosso. I vostri dati restano in:\n", " has been removed. Your data is kept in:\n") + DataDir);
        }
    }
}
