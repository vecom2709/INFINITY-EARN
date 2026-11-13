// Oberfläche: fünf Arbeitsbereiche (Artikel, Lager, Kunden, Rechnungen, Firma). Jede Aktion speichert sofort; Fehler werden verständlich angezeigt.
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

        DataGridView articleGrid, moveGrid, invoiceGrid, draftGrid, customerGrid;
        TextBox fSku, fName, fPrice, fMin, bQty, bReason, iQty;
        TextBox cName, cStreet, cZip, cCity, cProv, cCountry, cVat, cTaxNo, cSdi, cPec;
        TextBox sName, sStreet, sZip, sCity, sProv, sVat, sTaxNo;
        CheckBox sExempt;
        ComboBox fTax, bArticle, iArticle, iCustomer;
        DateTimePicker iService;
        Label lowLabel, draftTotal, sellerHint;
        public TabControl Tabs;

        string L(string key) { return Strings.Get(brand.Language, key); }
        bool Italy { get { return brand.Country == "IT"; } }

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

            var header = new Panel { Dock = DockStyle.Top, Height = 70, BackColor = accent };
            var title = new Label { Text = brand.Company, ForeColor = ReadableOn(accent), Font = new Font("Segoe UI Semibold", 16f), AutoSize = true, Location = new Point(20, 8), UseMnemonic = false };
            var sub = new Label { Text = brand.ProductName + " · " + L("version") + " " + brand.Version, ForeColor = ReadableOn(accent), AutoSize = true, Location = new Point(22, 44), UseMnemonic = false };
            header.Controls.Add(title);
            header.Controls.Add(sub);

            Tabs = new TabControl { Dock = DockStyle.Fill, Padding = new Point(18, 6) };
            Tabs.TabPages.Add(ArticlesPage());
            Tabs.TabPages.Add(StockPage());
            Tabs.TabPages.Add(CustomersPage());
            Tabs.TabPages.Add(InvoicesPage());
            Tabs.TabPages.Add(CompanyPage());

            var strip = new StatusStrip();
            strip.Items.Add(status);
            Controls.Add(Tabs);
            Controls.Add(header);
            Controls.Add(strip);
            FillSellerForm();
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
                try { var fresh = Store.Load(store.Path); store.Articles = fresh.Articles; store.Movements = fresh.Movements; store.Invoices = fresh.Invoices; store.Customers = fresh.Customers; store.Seller = fresh.Seller; } catch { }
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
                if (c is TextBox || c is ComboBox || c is DateTimePicker) c.Width = 280;
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
            if (!int.TryParse((s ?? "").Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out q) || q <= 0) throw DomainException.Of("QTY", "e_qty_int");
            return q;
        }

        static int ParseMin(string s)
        {
            int q;
            if (!int.TryParse((s ?? "").Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out q) || q < 0) throw DomainException.Of("MIN", "e_min_int");
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

        // ------------------------------------------------------------ Kunden

        static TextBox Box(string name) { return new TextBox { Name = name }; }
        static Label Hint(string text) { return new Label { Text = text, AutoSize = true, MaximumSize = new Size(280, 0), ForeColor = Color.FromArgb(91, 101, 118), Margin = new Padding(0, 0, 0, 6), UseMnemonic = false }; }

        TabPage CustomersPage()
        {
            var page = new TabPage(L("customers")) { BackColor = BackColor, Padding = new Padding(12) };
            customerGrid = Grid();
            customerGrid.SelectionChanged += (s, e) => FillCustomerForm();
            cName = Box("cName"); cStreet = Box("cStreet"); cZip = Box("cZip"); cCity = Box("cCity"); cProv = Box("cProv"); cCountry = Box("cCountry"); cCountry.Text = brand.Country;
            cVat = Box("cVat"); cTaxNo = Box("cTaxNo"); cSdi = Box("cSdi"); cPec = Box("cPec");
            var ctl = new List<Control> { Hint(L("customers_intro")), Lbl(L("f_name")), cName, Lbl(L("f_street")), cStreet, Lbl(L("f_zip")), cZip, Lbl(L("f_city")), cCity };
            if (Italy) ctl.AddRange(new Control[] { Lbl(L("f_province")), cProv });
            ctl.AddRange(new Control[] { Lbl(L("f_country")), cCountry, Lbl(L("f_vat")), cVat });
            if (Italy) ctl.AddRange(new Control[] { Lbl(L("f_taxno")), cTaxNo, Lbl(L("f_sdi")), cSdi, Lbl(L("f_pec")), cPec });
            ctl.Add(Btn(L("add"), (s, e) => Do(() => store.SaveCustomer(CustomerFromForm(), true)), true));
            ctl.Add(Btn(L("save"), (s, e) => Do(() => store.SaveCustomer(CustomerFromForm(), false)), false));
            ctl.Add(Btn(L("delete"), (s, e) => { if (MessageBox.Show(this, L("confirmdelete"), brand.ProductName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes) Do(() => store.DeleteCustomer(cName.Text)); }, false));
            page.Controls.Add(customerGrid);
            page.Controls.Add(Side(ctl.ToArray()));
            return page;
        }

        Party CustomerFromForm()
        {
            return new Party { Name = cName.Text, Street = cStreet.Text, Zip = cZip.Text, City = cCity.Text, Province = cProv.Text, Country = cCountry.Text, VatId = cVat.Text, TaxNumber = cTaxNo.Text, SdiCode = cSdi.Text, Pec = cPec.Text };
        }

        void FillCustomerForm()
        {
            if (customerGrid.SelectedRows.Count == 0) return;
            var c = store.FindCustomer(Convert.ToString(customerGrid.SelectedRows[0].Cells[0].Value));
            if (c == null) return;
            cName.Text = c.Name; cStreet.Text = c.Street; cZip.Text = c.Zip; cCity.Text = c.City; cProv.Text = c.Province; cCountry.Text = c.Country;
            cVat.Text = c.VatId; cTaxNo.Text = c.TaxNumber; cSdi.Text = c.SdiCode; cPec.Text = c.Pec;
        }

        // ------------------------------------------------------------ Firma (Pflichtangaben des Verkäufers)

        TabPage CompanyPage()
        {
            var page = new TabPage(L("company")) { BackColor = BackColor, Padding = new Padding(12) };
            // Zweispaltig: jedes Feld als Zelle (Beschriftung + Eingabe), damit alles ohne Scrollen sichtbar ist.
            var p = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = true, AutoScroll = true, Padding = new Padding(24, 16, 24, 16), BackColor = Color.White };
            sName = Box("sName"); sStreet = Box("sStreet"); sZip = Box("sZip"); sCity = Box("sCity"); sProv = Box("sProv"); sVat = Box("sVat"); sTaxNo = Box("sTaxNo");
            sExempt = new CheckBox { Name = "sExempt", Text = L("exempt_" + brand.Country.ToLowerInvariant()), AutoSize = true, Margin = new Padding(0, 12, 0, 0), UseMnemonic = false };
            var intro = new Label { Text = L("company_intro"), AutoSize = true, MaximumSize = new Size(760, 0), ForeColor = Color.FromArgb(91, 101, 118), Margin = new Padding(0, 0, 0, 4), UseMnemonic = false };
            var country = new TextBox { Text = brand.Country, ReadOnly = true, TabStop = false };
            var cells = new List<Control> { Cell(L("f_name"), sName), Cell(L("f_street"), sStreet), Cell(L("f_zip"), sZip), Cell(L("f_city"), sCity) };
            if (Italy) cells.Add(Cell(L("f_province"), sProv));
            cells.Add(Cell(L("f_country"), country));
            if (Italy) { cells.Add(Cell(L("f_vat"), sVat)); cells.Add(Cell(L("f_taxno"), sTaxNo)); }
            else { cells.Add(Cell(L("f_taxno"), sTaxNo)); cells.Add(Cell(L("f_vat"), sVat)); }
            p.Controls.Add(intro);
            p.SetFlowBreak(intro, true);
            foreach (var c in cells) p.Controls.Add(c);
            p.SetFlowBreak(cells[cells.Count - 1], true);
            p.Controls.Add(sExempt);
            p.SetFlowBreak(sExempt, true);
            p.Controls.Add(Btn(L("save"), (s, e) => Do(() => store.UpdateSeller(SellerFromForm())), true));
            page.Controls.Add(p);
            return page;
        }

        static Control Cell(string label, TextBox box)
        {
            var c = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoSize = true, Margin = new Padding(0, 0, 32, 0) };
            box.Width = 360;
            c.Controls.Add(Lbl(label));
            c.Controls.Add(box);
            return c;
        }

        Party SellerFromForm()
        {
            return new Party { Name = sName.Text, Street = sStreet.Text, Zip = sZip.Text, City = sCity.Text, Province = sProv.Text, Country = brand.Country, VatId = sVat.Text, TaxNumber = sTaxNo.Text, Exempt = sExempt.Checked };
        }

        void FillSellerForm()
        {
            var s = store.Seller;
            sName.Text = s.Name; sStreet.Text = s.Street; sZip.Text = s.Zip; sCity.Text = s.City; sProv.Text = s.Province; sVat.Text = s.VatId; sTaxNo.Text = s.TaxNumber; sExempt.Checked = s.Exempt;
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
            if (s == null) throw DomainException.Of("NOT_FOUND", "e_choose");
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
            iCustomer = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Name = "iCustomer" };
            // Datumsformat der Programmsprache (das Windows-Steuerelement nähme sonst das Systemformat).
            iService = new DateTimePicker { Name = "iService", Format = DateTimePickerFormat.Custom, CustomFormat = culture.DateTimeFormat.ShortDatePattern, Value = store.Clock().Date };
            sellerHint = new Label { AutoSize = true, ForeColor = Color.FromArgb(160, 60, 30), MaximumSize = new Size(280, 0), Margin = new Padding(0, 0, 0, 4), UseMnemonic = false };
            iArticle = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Name = "iArticle" };
            iQty = new TextBox { Name = "iQty", Text = "1" };
            draftTotal = new Label { AutoSize = true, Font = new Font("Segoe UI Semibold", 11f), Margin = new Padding(0, 14, 0, 0) };
            page.Controls.Add(split);
            var ctl = new List<Control> {
                sellerHint, Lbl(L("customer")), iCustomer, Lbl(L("servicedate")), iService, Lbl(L("item")), iArticle, Lbl(L("qty")), iQty,
                Btn(L("addline"), (s, e) => { try { draft.Add(new KeyValuePair<string, int>(SkuOf(iArticle), ParseQty(iQty.Text))); RefreshDraft(); } catch (Exception ex) { Fail(ex); } }, false),
                Btn(L("clearlines"), (s, e) => { draft.Clear(); RefreshDraft(); }, false),
                draftTotal,
                Btn(L("create"), (s, e) => CreateInvoice(), true),
                Btn(L("open"), (s, e) => OpenSelectedInvoice(), false),
            };
            if (Italy) ctl.Add(Btn(L("fpa_export"), (s, e) => ExportFatturaPa(), false));
            page.Controls.Add(Side(ctl.ToArray()));
            return page;
        }

        void CreateInvoice()
        {
            Invoice inv = null;
            if (Do(() => { inv = store.CreateInvoice(SelectedCustomer(), draft.ToList(), iService.Value.Date); }))
            {
                draft.Clear();
                RefreshDraft();
                Say(L("invoice") + " " + inv.Number + " · " + Money.Format(inv.GrossCents, brand.Currency, culture));
            }
        }

        string SelectedCustomer()
        {
            var c = iCustomer.SelectedItem as string;
            if (c == null) throw DomainException.Of("CUSTOMER", "e_choose_customer");
            return c;
        }

        /// <summary>FatturaPA-Datei in den Datenordner (Unterordner „FatturaPA“) schreiben; Name nach Vorgabe des SdI.</summary>
        public string WriteFatturaPa(Invoice inv)
        {
            string dir = Path.Combine(Path.GetDirectoryName(store.Path), "FatturaPA");
            Directory.CreateDirectory(dir);
            string file = Path.Combine(dir, FatturaPa.FileName(inv));
            File.WriteAllBytes(file, FatturaPa.Bytes(inv));
            return file;
        }

        void ExportFatturaPa()
        {
            var inv = SelectedInvoice();
            if (inv == null) return;
            try
            {
                string file = WriteFatturaPa(inv);
                Say(file);
                MessageBox.Show(this, string.Format(L("fpa_saved"), file), brand.ProductName, MessageBoxButtons.OK, MessageBoxIcon.Information);
                System.Diagnostics.Process.Start("explorer.exe", "/select,\"" + file + "\"");
            }
            catch (Exception ex) { Fail(ex); }
        }

        Invoice SelectedInvoice()
        {
            if (invoiceGrid.SelectedRows.Count == 0) return null;
            var no = Convert.ToString(invoiceGrid.SelectedRows[0].Cells[0].Value);
            return store.Invoices.FirstOrDefault(i => i.Number == no);
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
            var inv = SelectedInvoice();
            if (inv == null) return;
            try { System.Diagnostics.Process.Start(WriteInvoiceFile(inv)); } catch (Exception ex) { Fail(ex); }
        }

        // ------------------------------------------------------------ Anleitung (nur Abbildungsmodus --shots)

        /// <summary>Artikel in der Liste auswählen (füllt das Formular) – für die Abbildungen der Anleitung.</summary>
        public void SelectArticle(string sku)
        {
            foreach (DataGridViewRow r in articleGrid.Rows)
                if (string.Equals(Convert.ToString(r.Cells[0].Value), sku, StringComparison.OrdinalIgnoreCase)) { r.Selected = true; articleGrid.CurrentCell = r.Cells[0]; FillArticleForm(); return; }
        }

        /// <summary>Statuszeile setzen – für die Abbildungen der Anleitung (dort ohne echten Benutzerpfad).</summary>
        public void ShowStatus(string text) { Say(text); }

        /// <summary>Rechnungsentwurf vorbelegen (nicht gespeichert) – für die Abbildungen der Anleitung.</summary>
        public void DemoDraft(string customer, DateTime serviceDate, IEnumerable<KeyValuePair<string, int>> lines)
        {
            iCustomer.SelectedItem = customer;
            iService.Value = serviceDate;
            draft.Clear();
            draft.AddRange(lines);
            RefreshDraft();
        }

        // ------------------------------------------------------------ Anzeigen

        void RefreshDraft()
        {
            draftGrid.Columns.Clear();
            draftGrid.Columns.Add("sku", L("sku")); draftGrid.Columns.Add("name", L("name")); draftGrid.Columns.Add("qty", L("qty")); draftGrid.Columns.Add("net", L("net"));
            Shape(draftGrid, "name", new[] { "qty", "net" });
            var preview = new Invoice { PerRate = true };
            foreach (var l in draft)
            {
                var a = store.Find(l.Key);
                if (a == null) continue;
                var line = new InvoiceLine { Qty = l.Value, UnitCents = a.PriceCents, TaxBps = store.Seller.Exempt ? 0 : a.TaxBps };
                preview.Lines.Add(line);
                draftGrid.Rows.Add(a.Sku, a.Name, l.Value, Money.Format(line.NetCents, brand.Currency, culture));
            }
            draftTotal.Text = L("gross") + ": " + Money.Format(preview.GrossCents, brand.Currency, culture);
        }

        /// <summary>Breite Textspalte, Zahlen rechtsbündig.</summary>
        static void Shape(DataGridView g, string wide, string[] numeric)
        {
            foreach (DataGridViewColumn c in g.Columns)
            {
                c.FillWeight = c.Name == wide ? 340 : 100;
                c.MinimumWidth = Math.Max(c.Name == wide ? 160 : 0, TextRenderer.MeasureText(c.HeaderText, g.ColumnHeadersDefaultCellStyle.Font ?? g.Font).Width + 16);
                if (numeric.Contains(c.Name)) { c.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight; c.HeaderCell.Style.Alignment = DataGridViewContentAlignment.MiddleRight; }
            }
        }

        static void Refill(ComboBox cb, string[] items)
        {
            var keep = cb.SelectedItem as string;
            cb.Items.Clear();
            cb.Items.AddRange(items);
            if (keep != null && items.Contains(keep)) cb.SelectedItem = keep; else if (items.Length > 0) cb.SelectedIndex = 0;
        }

        Party SellerForCheck() { var s = store.Seller.Copy(); s.Country = store.Country; return s; }

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
            Refill(bArticle, items);
            Refill(iArticle, items);
            Refill(iCustomer, store.Customers.OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase).Select(c => c.Name).ToArray());
            var missing = Legal.SellerMissing(SellerForCheck());
            sellerHint.Text = missing.Count > 0 ? string.Format(L("e_seller"), string.Join(", ", missing)) : "";
            sellerHint.Visible = missing.Count > 0;

            customerGrid.Columns.Clear();
            foreach (var k in new[] { "f_name", "f_street", "f_zip", "f_city", "f_country", "f_vat" }) customerGrid.Columns.Add(k, L(k));
            Shape(customerGrid, "f_name", new string[0]);
            foreach (var c in store.Customers.OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase))
                customerGrid.Rows.Add(c.Name, c.Street, c.Zip, c.City, c.Country, c.VatId.Length > 0 ? c.VatId : c.TaxNumber);

            moveGrid.Columns.Clear();
            foreach (var k in new[] { "date", "sku", "qty", "onhand", "reason" }) moveGrid.Columns.Add(k, L(k));
            Shape(moveGrid, "reason", new[] { "qty", "onhand" });
            // Datum mit Uhrzeit nie abschneiden
            moveGrid.Columns["date"].MinimumWidth = TextRenderer.MeasureText(new DateTime(2026, 12, 28, 23, 59, 0).ToString("g", culture), moveGrid.Font).Width + 18;
            foreach (var m in Enumerable.Reverse(store.Movements).Take(500)) moveGrid.Rows.Add(m.At.ToString("g", culture), m.Sku, (m.Delta > 0 ? "+" : "") + m.Delta, m.StockAfter, m.Reason);

            invoiceGrid.Columns.Clear();
            foreach (var k in new[] { "number", "date", "customer", "lines", "gross" }) invoiceGrid.Columns.Add(k, L(k));
            Shape(invoiceGrid, "customer", new[] { "lines", "gross" });
            foreach (var inv in Enumerable.Reverse(store.Invoices)) invoiceGrid.Rows.Add(inv.Number, inv.DocumentDate.ToString("d", culture), inv.Customer, inv.Lines.Count, Money.Format(inv.GrossCents, brand.Currency, culture));
            if (draftGrid != null) RefreshDraft();
        }
    }
}
