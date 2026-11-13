// Oberfläche: drei Arbeitsbereiche (Artikel, Lager, Rechnungen). Jede Aktion speichert sofort; Fehler werden verständlich angezeigt.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;

namespace InfinityEarn.WinLager
{
    public class MainForm : Form
    {
        readonly Brand brand;
        readonly Store store;
        readonly CultureInfo culture;
        readonly Color accent;
        readonly ToolStripStatusLabel status = new ToolStripStatusLabel();
        readonly List<KeyValuePair<string, int>> draft = new List<KeyValuePair<string, int>>();

        DataGridView articleGrid, moveGrid, invoiceGrid, draftGrid;
        TextBox fSku, fName, fPrice, fMin, bQty, bReason, iCustomer, iQty;
        ComboBox fTax, bArticle, iArticle;
        Label lowLabel, draftTotal;
        public TabControl Tabs;

        string L(string key) { return Strings.Get(brand.Language, key); }

        public MainForm(Brand brand, Store store)
        {
            this.brand = brand;
            this.store = store;
            culture = CultureInfo.GetCultureInfo(brand.Culture);
            accent = ColorTranslator.FromHtml(brand.Color);
            Text = brand.Company + " – " + brand.ProductName;
            Font = new Font("Segoe UI", 10f);
            MinimumSize = new Size(980, 640);
            Size = new Size(1180, 760);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(246, 248, 250);
            AutoScaleMode = AutoScaleMode.Dpi;

            var header = new Panel { Dock = DockStyle.Top, Height = 64, BackColor = accent };
            var title = new Label { Text = brand.Company, ForeColor = ReadableOn(accent), Font = new Font("Segoe UI Semibold", 16f), AutoSize = true, Location = new Point(20, 8), UseMnemonic = false };
            var sub = new Label { Text = brand.ProductName + " · Version " + brand.Version, ForeColor = ReadableOn(accent), AutoSize = true, Location = new Point(22, 38), UseMnemonic = false };
            header.Controls.Add(title);
            header.Controls.Add(sub);

            Tabs = new TabControl { Dock = DockStyle.Fill, Padding = new Point(18, 6) };
            Tabs.TabPages.Add(ArticlesPage());
            Tabs.TabPages.Add(StockPage());
            Tabs.TabPages.Add(InvoicesPage());

            var strip = new StatusStrip();
            strip.Items.Add(status);
            Controls.Add(Tabs);
            Controls.Add(header);
            Controls.Add(strip);
            RefreshAll();
            Say(L("datadir") + ": " + Path.GetDirectoryName(store.Path));
            if (store.RecoveredFromBackup) MessageBox.Show(this, L("recovered"), brand.ProductName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        static Color ReadableOn(Color c)
        {
            double lum = (0.2126 * c.R + 0.7152 * c.G + 0.0722 * c.B) / 255.0;
            return lum > 0.6 ? Color.FromArgb(20, 28, 40) : Color.White;
        }

        void Say(string msg) { status.Text = msg; }

        void Fail(Exception ex)
        {
            var d = ex as DomainException;
            MessageBox.Show(this, d != null ? d.Message : ex.Message, L("error"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        /// <summary>Aktion ausführen, speichern, Ansicht aktualisieren – oder Fehler anzeigen und nichts ändern.</summary>
        bool Do(Action action)
        {
            try
            {
                action();
                store.Save();
                RefreshAll();
                Say(L("saved") + " · " + DateTime.Now.ToString("T", culture));
                return true;
            }
            catch (Exception ex)
            {
                // Bei Fehler gespeicherten Stand neu laden, damit Ansicht und Datei übereinstimmen.
                try { var fresh = Store.Load(store.Path); store.Articles = fresh.Articles; store.Movements = fresh.Movements; store.Invoices = fresh.Invoices; } catch { }
                RefreshAll();
                Fail(ex);
                return false;
            }
        }

        DataGridView Grid()
        {
            var g = new DataGridView
            {
                Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows = false, RowHeadersVisible = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect, MultiSelect = false, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                BackgroundColor = Color.White, BorderStyle = BorderStyle.None, EnableHeadersVisualStyles = false,
            };
            g.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(234, 239, 244);
            g.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI Semibold", 9.5f);
            g.DefaultCellStyle.SelectionBackColor = Color.FromArgb(Math.Min(255, accent.R / 4 + 190), Math.Min(255, accent.G / 4 + 190), Math.Min(255, accent.B / 4 + 190));
            g.DefaultCellStyle.SelectionForeColor = Color.Black;
            g.AlternatingRowsDefaultCellStyle.BackColor = Color.FromArgb(250, 251, 252);
            return g;
        }

        static Label Lbl(string t) { return new Label { Text = t, AutoSize = true, Margin = new Padding(0, 8, 0, 2), UseMnemonic = false }; }
        Button Btn(string t, EventHandler onClick, bool primary)
        {
            var b = new Button { Text = t, AutoSize = true, Padding = new Padding(8, 2, 8, 2), Margin = new Padding(0, 8, 8, 0), FlatStyle = FlatStyle.Flat, UseMnemonic = false };
            if (primary) { b.BackColor = accent; b.ForeColor = ReadableOn(accent); b.FlatAppearance.BorderColor = accent; }
            b.Click += onClick;
            return b;
        }

        Panel Side(Control[] controls)
        {
            var p = new FlowLayoutPanel { Dock = DockStyle.Right, Width = 320, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(16), BackColor = Color.White, AutoScroll = true };
            FlowLayoutPanel row = null;
            foreach (var c in controls)
            {
                if (c is Button)
                {
                    // Aufeinanderfolgende Knöpfe nebeneinander, mit Umbruch – alles bleibt ohne Scrollen sichtbar.
                    if (row == null) { row = new FlowLayoutPanel { FlowDirection = FlowDirection.LeftToRight, WrapContents = true, AutoSize = true, MaximumSize = new Size(290, 0), Margin = new Padding(0, 4, 0, 0) }; p.Controls.Add(row); }
                    row.Controls.Add(c);
                    continue;
                }
                row = null;
                if (c is TextBox || c is ComboBox) c.Width = 280;
                p.Controls.Add(c);
            }
            return p;
        }

        ComboBox TaxBox()
        {
            var cb = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
            foreach (var t in brand.TaxRatesBps) cb.Items.Add((t / 100m).ToString("0.##", culture) + " %");
            cb.SelectedIndex = 0;
            return cb;
        }

        int SelectedTax(ComboBox cb) { return brand.TaxRatesBps[Math.Max(0, cb.SelectedIndex)]; }

        static int ParseQty(string s)
        {
            int q;
            if (!int.TryParse((s ?? "").Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out q) || q <= 0) throw new DomainException("QTY", "Menge: ganze Zahl ab 1");
            return q;
        }

        static int ParseMin(string s)
        {
            int q;
            if (!int.TryParse((s ?? "").Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out q) || q < 0) throw new DomainException("MIN", "Mindestbestand: ganze Zahl ab 0");
            return q;
        }

        // ------------------------------------------------------------ Artikel

        TabPage ArticlesPage()
        {
            var page = new TabPage(L("articles")) { BackColor = BackColor, Padding = new Padding(12) };
            articleGrid = Grid();
            articleGrid.SelectionChanged += (s, e) => FillArticleForm();
            fSku = new TextBox { Name = "fSku" }; fName = new TextBox { Name = "fName" }; fPrice = new TextBox { Name = "fPrice" }; fMin = new TextBox { Name = "fMin", Text = "0" }; fTax = TaxBox();
            lowLabel = new Label { AutoSize = true, ForeColor = Color.FromArgb(160, 60, 30), MaximumSize = new Size(280, 0), Margin = new Padding(0, 16, 0, 0) };
            page.Controls.Add(articleGrid);
            page.Controls.Add(Side(new Control[] {
                Lbl(L("sku")), fSku, Lbl(L("name")), fName, Lbl(L("price")), fPrice, Lbl(L("tax")), fTax, Lbl(L("min")), fMin,
                Btn(L("add"), (s, e) => Do(() => store.AddArticle(fSku.Text, fName.Text, Money.Parse(fPrice.Text), SelectedTax(fTax), ParseMin(fMin.Text))), true),
                Btn(L("save"), (s, e) => Do(() => store.UpdateArticle(fSku.Text, fName.Text, Money.Parse(fPrice.Text), SelectedTax(fTax), ParseMin(fMin.Text))), false),
                Btn(L("delete"), (s, e) => { if (MessageBox.Show(this, L("confirmdelete"), brand.ProductName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes) Do(() => store.DeleteArticle(fSku.Text)); }, false),
                Btn(L("export"), (s, e) => ExportCsv(), false),
                lowLabel,
            }));
            return page;
        }

        void FillArticleForm()
        {
            if (articleGrid.SelectedRows.Count == 0) return;
            var a = store.Find(Convert.ToString(articleGrid.SelectedRows[0].Cells[0].Value));
            if (a == null) return;
            fSku.Text = a.Sku; fName.Text = a.Name; fPrice.Text = (a.PriceCents / 100m).ToString("0.00", culture); fMin.Text = a.MinStock.ToString(CultureInfo.InvariantCulture);
            int idx = Array.IndexOf(brand.TaxRatesBps, a.TaxBps);
            if (idx >= 0) fTax.SelectedIndex = idx;
        }

        void ExportCsv()
        {
            using (var dlg = new SaveFileDialog { Filter = "CSV|*.csv", FileName = "artikel.csv" })
            {
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                File.WriteAllText(dlg.FileName, store.ArticlesCsv(), new UTF8Encoding(true));
                Say(dlg.FileName);
            }
        }

        // ------------------------------------------------------------ Lager

        TabPage StockPage()
        {
            var page = new TabPage(L("stock")) { BackColor = BackColor, Padding = new Padding(12) };
            moveGrid = Grid();
            bArticle = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Name = "bArticle" };
            bQty = new TextBox { Name = "bQty", Text = "1" };
            bReason = new TextBox { Name = "bReason" };
            page.Controls.Add(moveGrid);
            page.Controls.Add(Side(new Control[] {
                Lbl(L("item")), bArticle, Lbl(L("qty")), bQty, Lbl(L("reason")), bReason,
                Btn(L("in"), (s, e) => Do(() => store.Book(SkuOf(bArticle), ParseQty(bQty.Text), bReason.Text)), true),
                Btn(L("out"), (s, e) => Do(() => store.Book(SkuOf(bArticle), -ParseQty(bQty.Text), bReason.Text)), false),
            }));
            return page;
        }

        static string SkuOf(ComboBox cb)
        {
            var s = cb.SelectedItem as string;
            if (s == null) throw new DomainException("NOT_FOUND", "Bitte einen Artikel wählen");
            return s.Split(new[] { " – " }, StringSplitOptions.None)[0];
        }

        // ------------------------------------------------------------ Rechnungen

        TabPage InvoicesPage()
        {
            var page = new TabPage(L("invoices")) { BackColor = BackColor, Padding = new Padding(12) };
            var split = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, SplitterDistance = 260 };
            invoiceGrid = Grid();
            invoiceGrid.CellDoubleClick += (s, e) => OpenSelectedInvoice();
            draftGrid = Grid();
            split.Panel1.Controls.Add(invoiceGrid);
            split.Panel2.Controls.Add(draftGrid);
            iCustomer = new TextBox { Name = "iCustomer" };
            iArticle = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Name = "iArticle" };
            iQty = new TextBox { Name = "iQty", Text = "1" };
            draftTotal = new Label { AutoSize = true, Font = new Font("Segoe UI Semibold", 11f), Margin = new Padding(0, 14, 0, 0) };
            page.Controls.Add(split);
            page.Controls.Add(Side(new Control[] {
                Lbl(L("customer")), iCustomer, Lbl(L("item")), iArticle, Lbl(L("qty")), iQty,
                Btn(L("addline"), (s, e) => { try { draft.Add(new KeyValuePair<string, int>(SkuOf(iArticle), ParseQty(iQty.Text))); RefreshDraft(); } catch (Exception ex) { Fail(ex); } }, false),
                Btn(L("clearlines"), (s, e) => { draft.Clear(); RefreshDraft(); }, false),
                draftTotal,
                Btn(L("create"), (s, e) => CreateInvoice(), true),
                Btn(L("open"), (s, e) => OpenSelectedInvoice(), false),
            }));
            return page;
        }

        void CreateInvoice()
        {
            Invoice inv = null;
            if (Do(() => { inv = store.CreateInvoice(iCustomer.Text, draft.ToList()); }))
            {
                draft.Clear();
                RefreshDraft();
                Say(L("invoice") + " " + inv.Number + " · " + Money.Format(inv.GrossCents, brand.Currency, culture));
            }
        }

        public string WriteInvoiceFile(Invoice inv)
        {
            string dir = Path.Combine(Path.GetDirectoryName(store.Path), L("invoices"));
            Directory.CreateDirectory(dir);
            string file = Path.Combine(dir, inv.Number + ".html");
            File.WriteAllText(file, store.InvoiceHtml(inv, brand), new UTF8Encoding(false));
            return file;
        }

        void OpenSelectedInvoice()
        {
            if (invoiceGrid.SelectedRows.Count == 0) return;
            var no = Convert.ToString(invoiceGrid.SelectedRows[0].Cells[0].Value);
            var inv = store.Invoices.FirstOrDefault(i => i.Number == no);
            if (inv == null) return;
            try { System.Diagnostics.Process.Start(WriteInvoiceFile(inv)); } catch (Exception ex) { Fail(ex); }
        }

        // ------------------------------------------------------------ Anzeigen

        void RefreshDraft()
        {
            draftGrid.Columns.Clear();
            draftGrid.Columns.Add("sku", L("sku")); draftGrid.Columns.Add("name", L("name")); draftGrid.Columns.Add("qty", L("qty")); draftGrid.Columns.Add("net", L("net"));
            Shape(draftGrid, "name", new[] { "qty", "net" });
            long net = 0, tax = 0;
            foreach (var l in draft)
            {
                var a = store.Find(l.Key);
                if (a == null) continue;
                var line = new InvoiceLine { Qty = l.Value, UnitCents = a.PriceCents, TaxBps = a.TaxBps };
                net += line.NetCents; tax += line.TaxCents;
                draftGrid.Rows.Add(a.Sku, a.Name, l.Value, Money.Format(line.NetCents, brand.Currency, culture));
            }
            draftTotal.Text = L("gross") + ": " + Money.Format(net + tax, brand.Currency, culture);
        }

        /// <summary>Breite Textspalte, Zahlen rechtsbündig.</summary>
        static void Shape(DataGridView g, string wide, string[] numeric)
        {
            foreach (DataGridViewColumn c in g.Columns)
            {
                c.FillWeight = c.Name == wide ? 260 : 100;
                c.MinimumWidth = Math.Max(c.Name == wide ? 160 : 0, TextRenderer.MeasureText(c.HeaderText, g.ColumnHeadersDefaultCellStyle.Font ?? g.Font).Width + 16);
                if (numeric.Contains(c.Name)) { c.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight; c.HeaderCell.Style.Alignment = DataGridViewContentAlignment.MiddleRight; }
            }
        }

        void RefreshAll()
        {
            articleGrid.Columns.Clear();
            foreach (var k in new[] { "sku", "name", "price", "tax", "onhand", "min" }) articleGrid.Columns.Add(k, L(k));
            Shape(articleGrid, "name", new[] { "price", "tax", "onhand", "min" });
            foreach (var a in store.Articles.OrderBy(a => a.Sku, StringComparer.OrdinalIgnoreCase))
            {
                int i = articleGrid.Rows.Add(a.Sku, a.Name, Money.Format(a.PriceCents, brand.Currency, culture), (a.TaxBps / 100m).ToString("0.##", culture) + " %", a.Stock, a.MinStock);
                if (a.MinStock > 0 && a.Stock <= a.MinStock) articleGrid.Rows[i].DefaultCellStyle.ForeColor = Color.FromArgb(170, 60, 20);
            }
            var low = store.LowStock().Select(a => a.Sku).ToList();
            lowLabel.Text = low.Count > 0 ? L("low") + ": " + string.Join(", ", low) : "";

            var items = store.Articles.OrderBy(a => a.Sku, StringComparer.OrdinalIgnoreCase).Select(a => a.Sku + " – " + a.Name).ToArray();
            foreach (var cb in new[] { bArticle, iArticle })
            {
                var keep = cb.SelectedItem as string;
                cb.Items.Clear();
                cb.Items.AddRange(items);
                if (keep != null && items.Contains(keep)) cb.SelectedItem = keep; else if (items.Length > 0) cb.SelectedIndex = 0;
            }

            moveGrid.Columns.Clear();
            foreach (var k in new[] { "date", "sku", "qty", "onhand", "reason" }) moveGrid.Columns.Add(k, L(k));
            Shape(moveGrid, "reason", new[] { "qty", "onhand" });
            foreach (var m in Enumerable.Reverse(store.Movements).Take(500)) moveGrid.Rows.Add(m.At.ToString("g", culture), m.Sku, (m.Delta > 0 ? "+" : "") + m.Delta, m.StockAfter, m.Reason);

            invoiceGrid.Columns.Clear();
            foreach (var k in new[] { "number", "date", "customer", "lines", "gross" }) invoiceGrid.Columns.Add(k, L(k));
            Shape(invoiceGrid, "customer", new[] { "lines", "gross" });
            foreach (var inv in Enumerable.Reverse(store.Invoices)) invoiceGrid.Rows.Add(inv.Number, inv.Date.ToString("d", culture), inv.Customer, inv.Lines.Count, Money.Format(inv.GrossCents, brand.Currency, culture));
            if (draftGrid != null) RefreshDraft();
        }
    }
}
