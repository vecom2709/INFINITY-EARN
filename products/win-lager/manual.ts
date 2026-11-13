import { PdfDoc, type Rgb } from '../../packages/shared/src/pdf-doc.ts';
import { SHOTS_JPEG_BASE64, UI_STRINGS } from './generated/manual-assets.ts';

/**
 * Bebilderte Bedienungsanleitung (PDF) zu „Lager & Rechnung für Windows“ (Funktion 157) – DE/IT/EN.
 * Abbildungen sind echte Bildschirmfotos des gebauten Programms mit Beispieldaten (scripts/build-win-lager-assets.ts).
 * Knopf- und Feldnamen stehen als [[Schlüssel]] im Text und werden aus den Programmtexten (Strings.cs) eingesetzt,
 * damit Anleitung und Oberfläche immer dieselben Wörter verwenden. Meldungen werden ebenfalls aus dem Programm zitiert.
 */
export type WinLang = 'de' | 'it' | 'en';
export type WinCountry = 'IT' | 'DE' | 'AT';
type Shot = 'firma' | 'artikel' | 'lager' | 'kunden' | 'rechnungen';

export const WIN_TAX: Record<WinCountry, number[]> = { IT: [2200, 1000, 400, 0], DE: [1900, 700, 0], AT: [2000, 1000, 1300, 0] };
export const WIN_PRODUCT_NAME: Record<WinLang, string> = { de: 'Lager & Rechnung', it: 'Magazzino & Fatture', en: 'Stock & Invoices' };

export interface ChapterCtx { setup: string; exe: string; product: string; id: string; country: WinCountry }
interface Chapter { id: string; title: string; intro: string; steps?: string[]; bullets?: string[]; tip?: string; shot?: Shot; caption?: string }
interface Texts {
  doc: string; forCompany: string; version: string; contents: string; page: (p: number, t: number) => string; figuresNote: string; tipLabel: string;
  setupTitle: string; setupIntro: string; taxRates: string; numbers: string; numbersText: string; currency: string;
  messagesTitle: string; messagesIntro: string; messageHelp: Record<string, string>;
  chapters: (ctx: ChapterCtx) => Chapter[];
}

const Q: Record<WinLang, [string, string]> = { de: ['„', '“'], it: ['«', '»'], en: ['“', '”'] };

/** Meldungen, die in der Anleitung erklärt werden (Beispielwerte für die Platzhalter). */
const MESSAGES: [string, (string | number)[]][] = [
  ['e_seller', ['@f_street']],
  ['e_customer_unknown', ['Example']],
  ['e_stock_for', ['A-100', 40, 100]],
  ['e_duplicate', ['A-100']],
  ['e_in_use', []],
  ['e_in_stock', []],
  ['e_price_decimals', []],
  ['e_qty_int', []],
  ['e_data_newer', []],
];

const DE: Texts = {
  doc: 'Bedienungsanleitung', forCompany: 'Ausgeliefert für', version: 'Programmfassung', contents: 'Inhalt',
  page: (p, t) => `Bedienungsanleitung Lager & Rechnung · Seite ${p} von ${t}`,
  figuresNote: 'Die Abbildungen zeigen das echte Programm mit Beispieldaten. Firmenname, Farbe und Steuersätze Ihrer Fassung können abweichen; Knöpfe, Felder und Abläufe sind identisch.',
  tipLabel: 'Tipp:',
  setupTitle: 'Ihre Einrichtung', setupIntro: 'Diese Werte sind in Ihrer Fassung fest eingestellt:', taxRates: 'Steuersätze zur Auswahl', numbers: 'Rechnungsnummern',
  numbersText: 'Fortlaufend je Kalenderjahr ohne Lücken: RE-2026-0001, RE-2026-0002 … Eine abgelehnte Rechnung verbraucht keine Nummer.', currency: 'Währung: Euro (EUR), Preise netto mit zwei Nachkommastellen.',
  messagesTitle: 'Meldungen und was sie bedeuten', messagesIntro: 'Das Programm prüft jede Eingabe. Ist etwas nicht möglich, erscheint ein Hinweisfenster und es wird nichts verändert. Häufige Meldungen:',
  messageHelp: {
    e_seller: 'Die Pflichtangaben Ihrer Firma fehlen oder sind ungültig. Im Bereich [[company]] ergänzen und [[save]] klicken; die Meldung nennt die fehlenden Felder.',
    e_customer_unknown: 'Rechnungen gehen nur an angelegte Kunden. Den Kunden zuerst im Bereich [[customers]] mit Anschrift anlegen.',
    e_stock_for: 'Die Rechnung braucht mehr Ware, als im Lager ist. Erst den Wareneingang buchen oder die Menge verringern. Es entsteht keine Rechnung.',
    e_duplicate: 'Jede Artikelnummer gibt es nur einmal (Groß- und Kleinschreibung zählt nicht). Eine andere Nummer wählen oder den vorhandenen Artikel ändern.',
    e_in_use: 'Artikel, die auf einer Rechnung stehen, bleiben für Ihre Unterlagen erhalten.',
    e_in_stock: 'Ein Artikel mit Bestand kann nicht gelöscht werden. Den Bestand zuerst mit [[out]] auf 0 buchen.',
    e_price_decimals: 'Preise mit höchstens zwei Nachkommastellen eingeben, z. B. 12,50.',
    e_qty_int: 'Mengen sind ganze Zahlen ab 1.',
    e_data_newer: 'Die Datendatei wurde mit einer neueren Fassung gespeichert. Bitte die neueste Fassung installieren; die Datei bleibt unverändert.',
  },
  chapters: ({ setup, product, country }) => [
    { id: 'installation', title: 'Installation und Start', intro: `${product} ist für Windows 10 und Windows 11 vorgesehen und unter Windows 11 geprüft. Sie brauchen keine Administratorrechte und kein Internet; Ihre Daten bleiben auf diesem Computer.`,
      steps: [`Die Datei ${setup} doppelklicken und die Frage mit „OK“ bestätigen.`, 'Windows kann mit „Der Computer wurde durch Windows geschützt“ warnen, weil das Programm nicht digital signiert ist. Wenn die Datei von uns stammt: „Weitere Informationen“ und dann „Trotzdem ausführen“ wählen.', `Nach der Installation startet das Programm auf Wunsch sofort. Später finden Sie es im Startmenü unter ${product}.`, 'Das Programm öffnet sich mit fünf Bereichen: [[articles]], [[stock]], [[customers]], [[invoices]] und [[company]].'],
      tip: 'Das Programm kann nur einmal gleichzeitig geöffnet sein. So können sich zwei Fenster nicht gegenseitig Daten überschreiben.' },
    { id: 'firma', title: 'Firmendaten eintragen (vor der ersten Rechnung)', intro: 'Rechnungen brauchen gesetzliche Pflichtangaben über Ihre Firma. Tragen Sie sie einmal im Bereich [[company]] ein. Solange etwas fehlt, erstellt das Programm keine Rechnung und zeigt im Bereich [[invoices]], was fehlt.',
      steps: country === 'IT'
        ? ['[[f_name]], [[f_street]], [[f_zip]], [[f_city]] und [[f_province]] eintragen.', 'Die [[f_vat]] (11 Ziffern) eintragen, bei Bedarf auch den [[f_taxno]]. Beide werden mit Prüfziffer geprüft.', 'Im Regime forfettario den Haken bei [[exempt_it]] setzen.', '[[save]] klicken.']
        : ['[[f_name]], [[f_street]], [[f_zip]] und [[f_city]] eintragen.', 'Die [[f_taxno]] oder die [[f_vat]] eintragen. Mindestens eins davon ist Pflicht, gern beide.', `Als Kleinunternehmer den Haken bei [[exempt_${country === 'AT' ? 'at' : 'de'}]] setzen. Rechnungen enthalten dann keine Umsatzsteuer, aber den gesetzlichen Hinweis.`, '[[save]] klicken.'],
      tip: 'Eine Änderung gilt nur für neue Rechnungen. Bereits erstellte Rechnungen behalten die Angaben, die beim Erstellen galten.', shot: 'firma', caption: 'Abb. 1 – Firma: Pflichtangaben für alle Rechnungen' },
    { id: 'artikel', title: 'Artikel anlegen und pflegen', intro: 'Im Bereich [[articles]] pflegen Sie Ihr Sortiment. Die Liste zeigt [[onhand]] und [[min]] jedes Artikels.',
      steps: ['Rechts [[sku]], [[name]], [[price]] (z. B. 12,50), [[tax]] und [[min]] eintragen.', '[[add]] klicken. Jede Artikelnummer gibt es nur einmal.', 'Zum Ändern einen Artikel in der Liste anklicken – das Formular wird gefüllt. Werte ändern und [[save]] klicken.', '[[delete]] entfernt nur Artikel ohne Bestand und ohne Rechnung.', '[[export]] speichert die Artikelliste als CSV-Datei für Excel oder die Buchhaltung.'],
      tip: 'Artikel, deren Bestand den Mindestbestand erreicht, erscheinen in der Liste rot und unter „[[low]]“.', shot: 'artikel', caption: 'Abb. 2 – Artikel: Liste mit Bestand, Formular und Hinweis auf Mindestbestand' },
    { id: 'lager', title: 'Wareneingang und Warenausgang', intro: 'Im Bereich [[stock]] buchen Sie jede Warenbewegung. Der Bestand ergibt sich immer aus den Buchungen; jede Buchung wird mit Datum, Menge, neuem Bestand und Grund protokolliert.',
      steps: ['[[item]] wählen und die [[qty]] eintragen.', 'Einen [[reason]] angeben, z. B. „Lieferung Großhandel“.', '[[in]] für gelieferte Ware oder [[out]] für Entnahmen klicken.'],
      bullets: ['Der Bestand kann nie negativ werden. Fehlt Ware, wird nichts gebucht.', 'Rechnungen buchen den Warenausgang automatisch mit dem Grund „[[invoice]] RE-…“.'],
      shot: 'lager', caption: 'Abb. 3 – Lager: alle Bewegungen, neueste oben' },
    { id: 'kunden', title: 'Kunden anlegen', intro: 'Rechnungen gehen nur an Kunden, die im Bereich [[customers]] mit vollständiger Anschrift angelegt sind.',
      steps: ['[[f_name]], [[f_street]], [[f_zip]], [[f_city]] und [[f_country]] eintragen (Länderkürzel, z. B. DE, AT, IT).',
        country === 'IT'
          ? 'Für Kunden in Italien die [[f_vat]] oder den [[f_taxno]] eintragen, dazu den [[f_sdi]] (7 Zeichen) oder eine [[f_pec]]. Ohne Angabe gilt 0000000; die Rechnung liegt dann im Bereich des Kunden bei der Agenzia delle Entrate.'
          : 'Die [[f_vat]] des Kunden eintragen, wenn er eine hat, z. B. für Lieferungen an Firmen in anderen EU-Ländern.',
        '[[add]] klicken. Zum Ändern den Kunden in der Liste anklicken, Werte ändern und [[save]] klicken.'],
      tip: 'Jede Rechnung behält die Anschrift, die beim Erstellen galt. Spätere Änderungen oder das Löschen eines Kunden verändern alte Rechnungen nicht.', shot: 'kunden', caption: 'Abb. 4 – Kunden: Liste und Formular mit Anschrift' },
    { id: 'rechnungen', title: 'Rechnungen schreiben', intro: 'Im Bereich [[invoices]] erstellen Sie Rechnungen aus Ihren Artikeln. Oben stehen die fertigen Rechnungen, unten der Entwurf.',
      steps: ['Den Kunden beim Feld [[customer]] aus der Liste wählen.',
        `Das [[servicedate]] einstellen: den Tag der Lieferung oder Leistung.${country === 'IT' ? ' In Italien höchstens 12 Tage zurück; es wird zum Datum der Rechnung.' : ''}`,
        '[[item]] wählen, [[qty]] eintragen und [[addline]] klicken. Das für jede Position wiederholen.', 'Unter den Positionen sehen Sie den [[gross]]-Betrag. [[clearlines]] beginnt den Entwurf neu.', '[[create]] klicken. Die Rechnung erhält die nächste Nummer und der Bestand wird abgebucht.', 'Eine Rechnung in der Liste auswählen und [[open]] klicken. Sie öffnet sich im Browser; dort drucken oder als PDF speichern.',
        ...(country === 'IT' ? ['Für die elektronische Rechnung die Rechnung wählen und [[fpa_export]] klicken. Die XML-Datei im kostenlosen Portal „Fatture e Corrispettivi“ der Agenzia delle Entrate hochladen oder per PEC an das SdI senden. Die Rechnung im Browser ist dann nur eine Kopie zur Ansicht.'] : [])],
      bullets: ['Jede Rechnung enthält Name und Anschrift von Ihnen und vom Kunden, Steuernummer bzw. USt-IdNr., Rechnungsdatum, fortlaufende Nummer, Menge und Bezeichnung, Leistungsdatum sowie Netto und Steuer je Steuersatz.',
        ...(country === 'DE' ? ['E-Rechnung: Für Rechnungen an Unternehmen in Deutschland gilt ab 2027 (Vorjahresumsatz über 800.000 €) bzw. ab 2028 die Pflicht zur E-Rechnung. Diese Fassung erstellt noch keine E-Rechnung (XRechnung/ZUGFeRD). Klären Sie mit Ihrem Steuerberater, ab wann Sie sie brauchen.'] : [])],
      tip: 'Reicht der Bestand für eine Position nicht, entsteht keine Rechnung und keine Nummer wird verbraucht. Die Steuer wird je Steuersatz kaufmännisch gerundet.', shot: 'rechnungen', caption: 'Abb. 5 – Rechnungen: Liste, Entwurf mit zwei Positionen und Gesamtbetrag' },
    { id: 'daten', title: 'Datensicherung', intro: 'Alle Daten liegen in einer Datei auf diesem Computer: %APPDATA%\\InfinityEarn\\{id}\\daten.xml. Der Pfad steht unten in der Statuszeile des Programms.',
      steps: ['Jede Änderung wird sofort gespeichert. Dabei bleibt die vorherige Fassung als daten.xml.bak erhalten.', 'Zum Sichern das Programm schließen und den ganzen Ordner auf einen USB-Stick oder ein anderes Laufwerk kopieren.', 'Zum Zurückspielen das Programm schließen und die Dateien zurück in den Ordner kopieren.'],
      tip: 'Ist die Datendatei beschädigt (z. B. nach einem Stromausfall), lädt das Programm automatisch die letzte Sicherung und meldet: „[[recovered]]“' },
    { id: 'update', title: 'Update und Deinstallation', intro: 'Ein Update ist eine neuere Installationsdatei. Ihre Daten bleiben dabei immer erhalten.',
      steps: ['Für ein Update das Programm schließen und die neue Installationsdatei ausführen.', 'Ist das Programm noch geöffnet, bricht die Installation ab und verändert nichts. Programm schließen, erneut versuchen.', `Zum Entfernen: Windows-Einstellungen > Apps > Installierte Apps > ${product} > Deinstallieren.`, 'Die Deinstallation entfernt nur die Programmdateien. Ihre Daten bleiben im Datenordner, bis Sie ihn selbst löschen.'] },
  ],
};

const IT: Texts = {
  doc: 'Manuale d\'uso', forCompany: 'Consegnato a', version: 'Versione del programma', contents: 'Indice',
  page: (p, t) => `Manuale d'uso Magazzino & Fatture · Pagina ${p} di ${t}`,
  figuresNote: 'Le figure mostrano il programma reale con dati di esempio. Nome dell\'azienda, colore e aliquote della vostra versione possono differire; pulsanti, campi e procedure sono identici.',
  tipLabel: 'Suggerimento:',
  setupTitle: 'La vostra configurazione', setupIntro: 'Questi valori sono impostati nella vostra versione:', taxRates: 'Aliquote IVA selezionabili', numbers: 'Numeri di fattura',
  numbersText: 'Progressivi per anno solare, senza salti: RE-2026-0001, RE-2026-0002 … Una fattura rifiutata non consuma alcun numero.', currency: 'Valuta: euro (EUR), prezzi netti con due decimali.',
  messagesTitle: 'Messaggi e significato', messagesIntro: 'Il programma controlla ogni inserimento. Se un\'operazione non è possibile, compare una finestra di avviso e non viene modificato nulla. Messaggi frequenti:',
  messageHelp: {
    e_seller: 'I dati obbligatori della vostra azienda mancano o non sono validi. Completarli nell\'area [[company]] e fare clic su [[save]]; il messaggio indica i campi mancanti.',
    e_customer_unknown: 'Le fatture vanno solo a clienti registrati. Registrare prima il cliente con indirizzo nell\'area [[customers]].',
    e_stock_for: 'La fattura richiede più merce di quella in magazzino. Registrare prima il carico o ridurre la quantità. Non viene creata alcuna fattura.',
    e_duplicate: 'Ogni codice esiste una sola volta (maiuscole e minuscole non contano). Scegliere un altro codice o modificare l\'articolo esistente.',
    e_in_use: 'Gli articoli presenti in una fattura restano conservati per la vostra documentazione.',
    e_in_stock: 'Un articolo con giacenza non può essere eliminato. Portare prima la giacenza a 0 con [[out]].',
    e_price_decimals: 'Inserire i prezzi con al massimo due decimali, ad es. 12,50.',
    e_qty_int: 'Le quantità sono numeri interi da 1.',
    e_data_newer: 'Il file dati è stato salvato con una versione più recente. Installare la versione più recente; il file resta invariato.',
  },
  chapters: ({ setup, product, country }) => [
    { id: 'installation', title: 'Installazione e avvio', intro: `${product} è previsto per Windows 10 e Windows 11 ed è verificato con Windows 11. Non servono diritti di amministratore né Internet; i vostri dati restano su questo computer.`,
      steps: [`Fare doppio clic sul file ${setup} e confermare con «OK».`, 'Windows può avvisare con «PC protetto da Windows» perché il programma non è firmato digitalmente. Se il file proviene da noi: scegliere «Ulteriori informazioni» e poi «Esegui comunque».', `Dopo l'installazione il programma può essere avviato subito. In seguito lo trovate nel menu Start alla voce ${product}.`, 'Il programma si apre con cinque aree: [[articles]], [[stock]], [[customers]], [[invoices]] e [[company]].'],
      tip: 'Il programma può essere aperto una sola volta alla volta. Così due finestre non possono sovrascriversi i dati a vicenda.' },
    { id: 'firma', title: 'Dati aziendali (prima della prima fattura)', intro: 'Le fatture richiedono i dati obbligatori della vostra azienda. Inseriteli una volta nell\'area [[company]]. Finché manca qualcosa, il programma non crea fatture e indica nell\'area [[invoices]] che cosa manca.',
      steps: country === 'IT'
        ? ['Inserire [[f_name]], [[f_street]], [[f_zip]], [[f_city]] e [[f_province]].', 'Inserire la [[f_vat]] (11 cifre) ed eventualmente il [[f_taxno]]. Entrambi vengono verificati con la cifra di controllo.', 'In regime forfettario spuntare [[exempt_it]].', 'Fare clic su [[save]].']
        : ['Inserire [[f_name]], [[f_street]], [[f_zip]] e [[f_city]].', 'Inserire il [[f_taxno]] o la [[f_vat]]: almeno uno dei due è obbligatorio.', `Per le piccole imprese spuntare [[exempt_${country === 'AT' ? 'at' : 'de'}]]. Le fatture non contengono IVA ma la dicitura di legge.`, 'Fare clic su [[save]].'],
      tip: 'Una modifica vale solo per le nuove fatture. Le fatture già create conservano i dati validi al momento della creazione.', shot: 'firma', caption: 'Fig. 1 – Azienda: dati obbligatori per tutte le fatture' },
    { id: 'artikel', title: 'Creare e gestire articoli', intro: 'Nell\'area [[articles]] gestite il vostro assortimento. L\'elenco mostra [[onhand]] e [[min]] di ogni articolo.',
      steps: ['A destra inserire [[sku]], [[name]], [[price]] (ad es. 12,50), [[tax]] e [[min]].', 'Fare clic su [[add]]. Ogni codice esiste una sola volta.', 'Per modificare, fare clic su un articolo nell\'elenco: il modulo viene compilato. Cambiare i valori e fare clic su [[save]].', '[[delete]] rimuove solo articoli senza giacenza e senza fattura.', '[[export]] salva l\'elenco articoli come file CSV per Excel o la contabilità.'],
      tip: 'Gli articoli la cui giacenza raggiunge la scorta minima compaiono in rosso e sotto «[[low]]».', shot: 'artikel', caption: 'Fig. 2 – Articoli: elenco con giacenza, modulo e avviso di scorta minima' },
    { id: 'lager', title: 'Carico e scarico', intro: 'Nell\'area [[stock]] registrate ogni movimento di merce. La giacenza risulta sempre dalle registrazioni; ogni movimento viene annotato con data, quantità, nuova giacenza e motivo.',
      steps: ['Scegliere l\'[[item]] e inserire la [[qty]].', 'Indicare un [[reason]], ad es. «Consegna grossista».', 'Fare clic su [[in]] per la merce ricevuta o su [[out]] per i prelievi.'],
      bullets: ['La giacenza non può mai diventare negativa. Se manca merce, non viene registrato nulla.', 'Le fatture registrano lo scarico automaticamente con il motivo «[[invoice]] RE-…».'],
      shot: 'lager', caption: 'Fig. 3 – Magazzino: tutti i movimenti, i più recenti in alto' },
    { id: 'kunden', title: 'Registrare i clienti', intro: 'Le fatture vanno solo a clienti registrati nell\'area [[customers]] con indirizzo completo.',
      steps: ['Inserire [[f_name]], [[f_street]], [[f_zip]], [[f_city]] e [[f_country]] (sigla, ad es. IT, DE, AT).',
        country === 'IT'
          ? 'Per clienti in Italia inserire la [[f_vat]] o il [[f_taxno]], più il [[f_sdi]] (7 caratteri) o un [[f_pec]]. Senza indicazione vale 0000000: la fattura è disponibile nell\'area riservata del cliente presso l\'Agenzia delle Entrate.'
          : 'Inserire la [[f_vat]] del cliente se ne ha una, ad es. per forniture ad aziende di altri paesi UE.',
        'Fare clic su [[add]]. Per modificare, fare clic sul cliente nell\'elenco, cambiare i valori e fare clic su [[save]].'],
      tip: 'Ogni fattura conserva l\'indirizzo valido al momento della creazione. Modifiche successive o l\'eliminazione di un cliente non cambiano le fatture precedenti.', shot: 'kunden', caption: 'Fig. 4 – Clienti: elenco e modulo con indirizzo' },
    { id: 'rechnungen', title: 'Emettere fatture', intro: 'Nell\'area [[invoices]] create fatture dai vostri articoli. In alto le fatture emesse, in basso la bozza.',
      steps: ['Scegliere il cliente dall\'elenco nel campo [[customer]].',
        `Impostare la [[servicedate]]: il giorno della consegna o della prestazione.${country === 'IT' ? ' Al massimo 12 giorni prima; diventa la data della fattura.' : ''}`,
        'Scegliere l\'[[item]], inserire la [[qty]] e fare clic su [[addline]]. Ripetere per ogni riga.', 'Sotto le righe vedete il [[gross]]. [[clearlines]] ricomincia la bozza.', 'Fare clic su [[create]]. La fattura riceve il numero successivo e la giacenza viene scaricata.', 'Selezionare una fattura nell\'elenco e fare clic su [[open]]. Si apre nel browser; da lì stamparla o salvarla in PDF.',
        ...(country === 'IT' ? ['Per la fattura elettronica selezionare la fattura e fare clic su [[fpa_export]]. Caricare il file XML nel portale gratuito «Fatture e Corrispettivi» dell\'Agenzia delle Entrate oppure inviarlo via PEC allo SdI. La fattura nel browser è allora solo una copia di cortesia.'] : [])],
      bullets: ['Ogni fattura contiene nome e indirizzo vostro e del cliente, partita IVA o codice fiscale (in Germania numero fiscale o partita IVA), data, numero progressivo, quantità e descrizione, data dell\'operazione, imponibile e IVA per aliquota.',
        ...(country === 'DE' ? ['Fattura elettronica in Germania: per le fatture ad aziende vale l\'obbligo dal 2027 (fatturato dell\'anno precedente oltre 800.000 €) o dal 2028. Questa versione non crea ancora fatture elettroniche (XRechnung/ZUGFeRD). Chiarite con il vostro consulente fiscale da quando vi servono.'] : [])],
      tip: 'Se la giacenza di una riga non basta, non viene creata alcuna fattura e nessun numero viene consumato. L\'IVA viene arrotondata per aliquota.', shot: 'rechnungen', caption: 'Fig. 5 – Fatture: elenco, bozza con due righe e totale' },
    { id: 'daten', title: 'Backup dei dati', intro: 'Tutti i dati si trovano in un file su questo computer: %APPDATA%\\InfinityEarn\\{id}\\daten.xml. Il percorso è indicato in basso nella barra di stato del programma.',
      steps: ['Ogni modifica viene salvata subito. La versione precedente resta come daten.xml.bak.', 'Per il backup chiudere il programma e copiare l\'intera cartella su una chiavetta USB o un altro disco.', 'Per il ripristino chiudere il programma e ricopiare i file nella cartella.'],
      tip: 'Se il file dati è danneggiato (ad es. dopo un blackout), il programma carica automaticamente l\'ultimo backup e avvisa: «[[recovered]]»' },
    { id: 'update', title: 'Aggiornamento e disinstallazione', intro: 'Un aggiornamento è un file di installazione più recente. I vostri dati restano sempre conservati.',
      steps: ['Per aggiornare chiudere il programma ed eseguire il nuovo file di installazione.', 'Se il programma è ancora aperto, l\'installazione si interrompe senza modificare nulla. Chiudere il programma e riprovare.', `Per rimuoverlo: Impostazioni di Windows > App > App installate > ${product} > Disinstalla.`, 'La disinstallazione rimuove solo i file del programma. I dati restano nella cartella dati finché non la eliminate voi.'] },
  ],
};

const EN: Texts = {
  doc: 'User guide', forCompany: 'Delivered to', version: 'Program version', contents: 'Contents',
  page: (p, t) => `User guide Stock & Invoices · Page ${p} of ${t}`,
  figuresNote: 'The figures show the real program with sample data. Company name, colour and tax rates of your version may differ; buttons, fields and workflows are identical.',
  tipLabel: 'Tip:',
  setupTitle: 'Your setup', setupIntro: 'These values are fixed in your version:', taxRates: 'Selectable tax rates', numbers: 'Invoice numbers',
  numbersText: 'Consecutive per calendar year without gaps: RE-2026-0001, RE-2026-0002 … A rejected invoice does not use up a number.', currency: 'Currency: euro (EUR), net prices with two decimals.',
  messagesTitle: 'Messages and what they mean', messagesIntro: 'The program checks every entry. If something is not possible, a notice appears and nothing is changed. Common messages:',
  messageHelp: {
    e_seller: 'Your company\'s mandatory details are missing or invalid. Complete them in the [[company]] area and click [[save]]; the message names the missing fields.',
    e_customer_unknown: 'Invoices only go to saved customers. First save the customer with an address in the [[customers]] area.',
    e_stock_for: 'The invoice needs more goods than are in stock. Book the goods in first or reduce the quantity. No invoice is created.',
    e_duplicate: 'Each SKU exists only once (upper and lower case do not matter). Choose another SKU or change the existing item.',
    e_in_use: 'Items that appear on an invoice are kept for your records.',
    e_in_stock: 'An item with stock cannot be deleted. First book the stock down to 0 with [[out]].',
    e_price_decimals: 'Enter prices with at most two decimals, e.g. 12.50.',
    e_qty_int: 'Quantities are whole numbers from 1.',
    e_data_newer: 'The data file was saved by a newer version. Please install the newest version; the file stays unchanged.',
  },
  chapters: ({ setup, product, country }) => [
    { id: 'installation', title: 'Installation and start', intro: `${product} is intended for Windows 10 and Windows 11 and has been tested on Windows 11. You need no administrator rights and no internet; your data stays on this computer.`,
      steps: [`Double-click the file ${setup} and confirm with “OK”.`, 'Windows may warn “Windows protected your PC” because the program is not digitally signed. If the file comes from us: choose “More info” and then “Run anyway”.', `After installation the program can start right away. Later you find it in the Start menu under ${product}.`, 'The program opens with five areas: [[articles]], [[stock]], [[customers]], [[invoices]] and [[company]].'],
      tip: 'The program can only be open once at a time, so two windows can never overwrite each other\'s data.' },
    { id: 'firma', title: 'Company details (before the first invoice)', intro: 'Invoices need your company\'s mandatory details. Enter them once in the [[company]] area. As long as something is missing, the program creates no invoice and shows what is missing in the [[invoices]] area.',
      steps: country === 'IT'
        ? ['Enter [[f_name]], [[f_street]], [[f_zip]], [[f_city]] and [[f_province]].', 'Enter the [[f_vat]] (11 digits) and, if needed, the [[f_taxno]]. Both are checked with their check digit.', 'Under the flat-rate scheme tick [[exempt_it]].', 'Click [[save]].']
        : ['Enter [[f_name]], [[f_street]], [[f_zip]] and [[f_city]].', 'Enter the [[f_taxno]] or the [[f_vat]]. At least one of them is required; both are fine.', `As a small business tick [[exempt_${country === 'AT' ? 'at' : 'de'}]]. Invoices then contain no VAT but the statutory note.`, 'Click [[save]].'],
      tip: 'A change applies to new invoices only. Invoices already created keep the details that applied when they were created.', shot: 'firma', caption: 'Fig. 1 – Company: mandatory details for all invoices' },
    { id: 'artikel', title: 'Adding and editing items', intro: 'In the [[articles]] area you maintain your product range. The list shows [[onhand]] and [[min]] for every item.',
      steps: ['On the right enter [[sku]], [[name]], [[price]] (e.g. 12.50), [[tax]] and [[min]].', 'Click [[add]]. Each SKU exists only once.', 'To edit, click an item in the list – the form is filled in. Change the values and click [[save]].', '[[delete]] only removes items without stock and without invoices.', '[[export]] saves the item list as a CSV file for Excel or your accountant.'],
      tip: 'Items whose stock reaches the minimum appear in red and under “[[low]]”.', shot: 'artikel', caption: 'Fig. 2 – Items: list with stock, form and minimum-stock notice' },
    { id: 'lager', title: 'Goods in and goods out', intro: 'In the [[stock]] area you book every movement of goods. Stock always results from the bookings; each one is logged with date, quantity, new stock and reason.',
      steps: ['Choose the [[item]] and enter the [[qty]].', 'Give a [[reason]], e.g. “Wholesale delivery”.', 'Click [[in]] for received goods or [[out]] for withdrawals.'],
      bullets: ['Stock can never become negative. If goods are missing, nothing is booked.', 'Invoices book goods out automatically with the reason “[[invoice]] RE-…”.'],
      shot: 'lager', caption: 'Fig. 3 – Stock: all movements, newest first' },
    { id: 'kunden', title: 'Adding customers', intro: 'Invoices only go to customers saved in the [[customers]] area with a full address.',
      steps: ['Enter [[f_name]], [[f_street]], [[f_zip]], [[f_city]] and [[f_country]] (country code, e.g. DE, AT, IT).',
        country === 'IT'
          ? 'For customers in Italy enter the [[f_vat]] or the [[f_taxno]], plus the [[f_sdi]] (7 characters) or a [[f_pec]]. Without one, 0000000 applies and the invoice is available in the customer\'s area at the Agenzia delle Entrate.'
          : 'Enter the customer\'s [[f_vat]] if they have one, e.g. for supplies to companies in other EU countries.',
        'Click [[add]]. To edit, click the customer in the list, change the values and click [[save]].'],
      tip: 'Each invoice keeps the address that applied when it was created. Later changes or deleting a customer do not change earlier invoices.', shot: 'kunden', caption: 'Fig. 4 – Customers: list and form with address' },
    { id: 'rechnungen', title: 'Writing invoices', intro: 'In the [[invoices]] area you create invoices from your items. Finished invoices are at the top, the draft below.',
      steps: ['Choose the customer from the list in the [[customer]] field.',
        `Set the [[servicedate]]: the day of delivery or service.${country === 'IT' ? ' At most 12 days back; it becomes the invoice date.' : ''}`,
        'Choose the [[item]], enter the [[qty]] and click [[addline]]. Repeat for each line.', 'Below the lines you see the [[gross]]. [[clearlines]] starts the draft again.', 'Click [[create]]. The invoice receives the next number and the stock is booked out.', 'Select an invoice in the list and click [[open]]. It opens in your browser; print it or save it as PDF from there.',
        ...(country === 'IT' ? ['For the electronic invoice select the invoice and click [[fpa_export]]. Upload the XML file in the free “Fatture e Corrispettivi” portal of the Agenzia delle Entrate or send it to the SdI by PEC. The invoice in the browser is then only a courtesy copy.'] : [])],
      bullets: ['Every invoice contains your and the customer\'s name and address, tax number or VAT ID, invoice date, consecutive number, quantity and description, date of supply, and net amount and tax per rate.',
        ...(country === 'DE' ? ['E-invoicing: for invoices to businesses in Germany, e-invoices become mandatory from 2027 (prior-year turnover above €800,000) or from 2028. This version does not yet create e-invoices (XRechnung/ZUGFeRD). Check with your tax adviser when you will need them.'] : [])],
      tip: 'If the stock for a line is not enough, no invoice is created and no number is used. Tax is rounded per rate.', shot: 'rechnungen', caption: 'Fig. 5 – Invoices: list, draft with two lines and total' },
    { id: 'daten', title: 'Backing up your data', intro: 'All data is in one file on this computer: %APPDATA%\\InfinityEarn\\{id}\\daten.xml. The path is shown in the program\'s status bar at the bottom.',
      steps: ['Every change is saved immediately. The previous version is kept as daten.xml.bak.', 'To back up, close the program and copy the whole folder to a USB stick or another drive.', 'To restore, close the program and copy the files back into the folder.'],
      tip: 'If the data file is damaged (e.g. after a power cut), the program loads the last backup automatically and says: “[[recovered]]”' },
    { id: 'update', title: 'Update and uninstall', intro: 'An update is a newer installation file. Your data is always kept.',
      steps: ['To update, close the program and run the new installation file.', 'If the program is still open, the installation stops and changes nothing. Close the program and try again.', `To remove it: Windows Settings > Apps > Installed apps > ${product} > Uninstall.`, 'Uninstalling only removes the program files. Your data stays in the data folder until you delete it yourself.'] },
  ],
};

export const WIN_MANUAL_TEXTS: Record<WinLang, Texts> = { de: DE, it: IT, en: EN };

/** Ersetzt [[Schlüssel]] durch die Bezeichnung im Programm (in Anführungszeichen außer bei Satzzeichen-Rahmen). */
export function winLabel(lang: WinLang, text: string): string {
  const [o, c] = Q[lang];
  return text.replace(/(["„«“]?)\[\[([a-z_]+)\]\](["“»”]?)/g, (_m, pre: string, k: string, post: string) => {
    const v = UI_STRINGS[lang][k];
    if (v === undefined) throw new Error(`MANUAL_LABEL_UNKNOWN:${lang}-${k}`);
    return pre || post ? `${pre}${v}${post}` : `${o}${v}${c}`;
  });
}

/** Alle in der Anleitung verwendeten Programmtexte (für den Test: jeder Schlüssel existiert im Programm). */
export function winPlaceholders(): string[] {
  const keys = new Set<string>(MESSAGES.map(([k]) => k));
  for (const lang of ['de', 'it', 'en'] as const) {
    for (const country of ['DE', 'AT', 'IT'] as const) {
      const t = WIN_MANUAL_TEXTS[lang];
      const all = JSON.stringify([t.chapters({ setup: 's', exe: 'e', product: 'p', id: 'i', country }), t.messageHelp]);
      for (const m of all.matchAll(/\[\[([a-z_]+)\]\]/g)) keys.add(m[1] as string);
    }
  }
  return [...keys];
}

/** Platzhalter {0} … füllen; „@schlüssel“ setzt den Programmtext dieser Sprache ein. */
const fmt = (lang: WinLang, s: string, args: (string | number)[]): string => s.replace(/\{(\d)\}/g, (_m, i: string) => {
  const a = args[Number(i)] ?? '';
  return typeof a === 'string' && a.startsWith('@') ? (UI_STRINGS[lang][a.slice(1)] ?? a) : String(a);
});

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const hexRgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export interface WinManualOptions { company: string; color: string; lang: WinLang; country: WinCountry; productId: string; version: string; created?: Date }
export interface WinManualMeta { pages: number; images: number; chapters: string[] }

export function buildWinManual(o: WinManualOptions): { bytes: Uint8Array; meta: WinManualMeta } {
  const lang = o.lang;
  const t = WIN_MANUAL_TEXTS[lang];
  const product = WIN_PRODUCT_NAME[lang];
  const accent = hexRgb(/^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : '#1F5FA8');
  const L = (s: string): string => winLabel(lang, s.replace(/\{id\}/g, o.productId));
  const doc = new PdfDoc({ title: `${t.doc} - ${product} - ${o.company}`, author: o.company, lang, created: o.created, footer: t.page, accent });
  const chapters = t.chapters({ setup: `${o.productId}-setup-${o.version}.exe`, exe: `${o.productId}.exe`, product, id: o.productId, country: o.country });

  // Deckblatt
  doc.newPage({ footer: false });
  doc.rect(0, doc.pageH - 300, doc.pageW, 300, accent);
  doc.text(doc.margin, doc.pageH - 200, t.doc, { size: 30, bold: true, color: [255, 255, 255] });
  doc.text(doc.margin, doc.pageH - 232, `${product} · Windows`, { size: 17, color: [255, 255, 255] });
  doc.text(doc.margin, doc.pageH - 340, t.forCompany, { size: 10, color: doc.muted });
  doc.text(doc.margin, doc.pageH - 362, o.company, { size: 18, bold: true });
  doc.text(doc.margin, doc.pageH - 386, `${t.version}: ${o.version}`, { size: 9.5, color: doc.muted });
  doc.y = doc.pageH - 430;
  doc.paragraph(t.contents, { size: 13, bold: true, gapAfter: 6 });
  [t.setupTitle, ...chapters.map((c) => c.title), t.messagesTitle].forEach((title, i) => doc.paragraph(`${i + 1}   ${title}`, { size: 10.5, gapAfter: 1 }));
  doc.y -= 10;
  doc.note(t.figuresNote);

  // 1 Ihre Einrichtung
  doc.newPage();
  doc.heading(`1 ${t.setupTitle}`);
  doc.paragraph(t.setupIntro);
  doc.paragraph(t.taxRates, { bold: true, gapAfter: 2 });
  doc.bullets(WIN_TAX[o.country].map((bps) => `${(bps / 100).toLocaleString(lang === 'en' ? 'en-GB' : lang)} %`));
  doc.paragraph(t.numbers, { bold: true, gapAfter: 2 });
  doc.paragraph(t.numbersText);
  doc.paragraph(t.currency);

  const ids: string[] = ['einrichtung'];
  chapters.forEach((c, i) => {
    if (c.shot || i === 0) doc.newPage();
    else doc.y -= 12;
    doc.heading(`${i + 2} ${c.title}`);
    ids.push(c.id);
    doc.paragraph(L(c.intro));
    if (c.steps) doc.bullets(c.steps.map(L), { numbered: true });
    if (c.bullets) doc.bullets(c.bullets.map(L));
    if (c.tip) doc.note(L(c.tip), { label: t.tipLabel });
    if (c.shot) {
      const s = SHOTS_JPEG_BASE64[lang][c.shot];
      if (!s) throw new Error(`MANUAL_SHOT_MISSING:${lang}-${c.shot}`);
      doc.image(b64(s), { caption: c.caption });
    }
  });

  // Meldungen – wörtlich aus dem Programm
  doc.newPage();
  doc.heading(`${chapters.length + 2} ${t.messagesTitle}`);
  ids.push('meldungen');
  doc.paragraph(t.messagesIntro);
  const [qo, qc] = Q[lang];
  for (const [key, args] of MESSAGES) {
    const msg = UI_STRINGS[lang][key];
    if (!msg) throw new Error(`MANUAL_MESSAGE_UNKNOWN:${lang}-${key}`);
    doc.paragraph(`${qo}${fmt(lang, msg, args)}${qc}`, { bold: true, gapAfter: 1 });
    doc.paragraph(L(t.messageHelp[key] ?? ''), { indent: 12 });
  }
  return { bytes: doc.toBytes(), meta: { pages: doc.pageCount, images: doc.imageCount, chapters: ids } };
}
