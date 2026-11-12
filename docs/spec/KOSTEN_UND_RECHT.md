# KOSTEN, CLAUDE, RECHT — VERBINDLICHE GRENZEN

## Null-Euro-Zusatzfixkosten (Startphase)
- Ziel: Keine neuen **monatlichen Software-Fixkosten** zusätzlich zum vorhandenen Claude-Abonnement.
- Claude Code nutzt innerhalb offizieller Abo-Nutzungsgrenzen die jeweils verfügbaren Routinen; zusätzliche API-Nutzung nicht automatisch freischalten. Abolimits können Prozesse verlangsamen oder stoppen.
- Cloudflare Workers/Pages/D1 & Co. nur im aktuell überprüften Gratisumfang verwenden; Free-Tiers können sich ändern. Nicht jeder Produktbereich eignet sich für kostenlose Cloud-Compute.
- Zahlungsdienste berechnen **Transaktionsgebühren**, selbst ohne Monatsgrundgebühr. Bei Steuern, Gewerbeanmeldung, Rückerstattungen, Chargebacks und ggf. Beratung können weitere Kosten anfallen.
- Kein Tool darf heimlich einen Kostenplan hochstufen, API-Guthaben kaufen, bezahlte Werbung buchen oder Accounts mit Kreditkarte anlegen.

## Nicht automatisierbar ohne Eigentümer bzw. fachliche Freigabe
- Rechtsform, steuerliche Registrierung, Bankidentität/KYC, notwendige Provider-Verträge.
- Entscheidung, in welchem Land INFINITY EARN tatsächlich betrieben wird; steuerlicher Wohnsitz / Betriebsstätte.
- Datenschutz-/AGB-/Widerrufsregeln passend zu Kundenländern/Produkten.
- Rechtliche und steuerliche Prüfung vor Livebetrieb; rechtlich verantwortliche Person bleibt Mensch.
- Notwendige Steuererklärungen und verantwortete Übermittlung; eine Datei ist kein Ersatz für die gesetzlichen Pflichten.

## Italien / EU – besondere Prüfstellen
- Bei Geschäftsführung in Italien ist steuerliche Registrierung (ggf. Partita IVA) mit zuständiger Stelle abzuklären.
- Elektronische Rechnungen sind in vielen italienischen Fällen über **Sistema di Interscambio (SdI)** zu führen; es gibt kostenlose behördliche Portaldienste, aber eine vollautomatische technische API-Anbindung ist nicht automatisch gratis oder zulässig.
- EU-B2C-Verkäufe digitaler Leistungen können OSS/Umsatzsteuerregeln berühren.
- Für digitale Downloads sind Informationspflichten und Regeln zum Widerruf zu prüfen.
- E-Mail/WhatsApp-Akquise nur bei belastbarer rechtlicher Grundlage und Einhaltung von E-Privacy-/Marketingregeln; Plattform-AGB beachten.

## 0-€-Kosten-Policy – Startwerte
```
MAX_NEW_MONTHLY_FIXED_COST_EUR=0
ALLOW_PAID_APIS=false
ALLOW_AUTO_UPGRADE=false
ALLOW_PAID_ADS=false
ALLOW_NEW_FINANCIAL_COMMITMENTS=false
LIVE_SALES_ENABLED=false
AUTO_MARKETING_OUTREACH=false
ALLOW_UNREVIEWED_DEPLOY=false
```

## Verantwortliche Quellen / offizielle Dokumentation
- Anthropic Subscription Usage: https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work
- Anthropic Subscription Code: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-max-or-ultra-plan
- Claude Code routines: https://claude.com/resources/articles/introducing-routines-in-claude-code
- Cloudflare limits: https://developers.cloudflare.com/workers/platform/limits/
- Stripe Italia: https://stripe.com/it/pricing
- Italienische elektronische Rechnung: https://agenziaentrate.gov.it/portale/web/english/electronic-invoicing
- EU VAT OSS: https://europa.eu/youreurope/business/finance-and-tax/vat/one-stop-shop/index_en.htm
- EU Widerruf: https://europa.eu/youreurope/business/selling-in-eu/selling-goods-services/ecommerce-distance-selling/index_en.htm
- EU Marketing-Daten: https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data/can-data-received-third-party-be-used-marketing_it
