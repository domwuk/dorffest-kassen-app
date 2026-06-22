# AGENTS.md — Dorffest Kassen-App

Dokumentation für KI-Agenten und Entwickler:innen, die an diesem Projekt arbeiten.

## Überblick

Eine **kleine Kassen-App (Point of Sale)** für ein Dorffest. Realisiert als
**Progressive Web App (PWA)**, die vollständig **offline** läuft — primär auf
iOS (zum Homescreen hinzugefügt), funktioniert aber genauso unter Android und
auf dem Desktop.

Kernidee: Bedienpersonal tippt Produkte an, die App führt eine
**Bestellung**, berechnet die Summe inkl. **Pfand**, und bietet eine
**Wechselgeld-Berechnung** beim Kassieren.

- **Sprache der Oberfläche:** Deutsch
- **Zielgerät:** Smartphone/Tablet im Hochformat, Touch-Bedienung
- **Persistenz:** Keine (bewusst — siehe [Wichtige Eigenheiten](#wichtige-eigenheiten--gotchas))

## Tech-Stack

- **Reines HTML + CSS + Vanilla JavaScript** — kein Framework, kein Build-Schritt.
- **Keine Abhängigkeiten**, kein `package.json`, kein npm.
- **Kein Transpiler/Bundler** — der Code läuft direkt im Browser.
- PWA-Funktionalität über **Web App Manifest** + **Service Worker**.

> Es gibt bewusst **keine Toolchain**. Änderungen werden direkt in den
> Quelldateien vorgenommen und durch Öffnen im Browser getestet.

## Projektstruktur

```
dorffest-kassen-app/
├── index.html          # Komplette App: Markup, CSS (<style>) und Logik (<script>)
├── manifest.json       # PWA-Manifest (Name, Icons, Farben, Anzeige-Modus)
├── service-worker.js   # Offline-Caching (Cache-First-Strategie)
├── icon-192.png        # App-Icon 192×192 (Homescreen / Manifest)
├── icon-512.png        # App-Icon 512×512 (Splash / Manifest)
└── AGENTS.md           # Diese Datei
```

Die **gesamte Anwendung steckt in `index.html`** — Struktur, Styling und
JavaScript-Logik sind in dieser einen Datei vereint. Es gibt keine separaten
`.css`- oder `.js`-Dateien für die App-Logik.

## index.html im Detail

### Aufbau der Oberfläche (DOM)

- **`#tabs`** — Kategorie-Tabs, dynamisch aus `PRODUKTE` erzeugt.
- **`.pfand-row`** — Umschalter (Toggle) mit kontextabhängiger Funktion (siehe unten).
- **`.main`** — enthält `.left` und `.right#rightCol`. Layout ist **mobile-first einspaltig** (Hochformat) bzw. **zweispaltig** (Querformat / ≥ 700 px) — siehe [Layout / Responsivität](#layout--responsivität).
  - **`.left`** → `#productList` (Produkt-Buttons) + `#pfandMinusBtn` (Pfand-Rückgabe-Button).
  - **`.right`** (id=`rightCol`) → `<h2>Bestellung</h2>` + `#cart` (Bestellungs-Liste) + **`.cart-controls`** (enthält `#neuBtn` „Leeren" und `#totalBar` Gesamt-Leiste, öffnet Wechselgeld). Wird auf dem Info-Tab vollständig ausgeblendet (`.left` expandiert dann auf volle Breite).
- **`#changeOverlay`** — Modal für die Wechselgeld-Berechnung. Enthält die benannten Elemente **`#overlayTotalLabel`** (Label-Span in der `.overlay-row.total`, wechselt zwischen „Zu zahlen" und „Auszahlung an Kunde") und **`#overlayInputWrap`** (Wrapper um das Eingabefeld, wird bei negativem Gesamtbetrag ausgeblendet).
- **`#clearOverlay`** — Bestätigungs-Modal fürs Leeren der Bestellung. Gleiche CSS-Klassen (`.overlay`/`.overlay-card`/`.overlay-close-x`/`.overlay-buttons`) wie das Wechselgeld-Overlay. Enthält: `<h2>Bestellung leeren?</h2>`, einen Absatz `.overlay-confirm-text` „Möchtest du die komplette Bestellung wirklich leeren?", die Buttons `#clearCancelBtn` „Abbrechen" (`.btn-close`) und `#clearConfirmBtn` „Leeren" (`.btn-danger`) sowie `#clearCloseX` (✕).
- **`#statsResetOverlay`** — Bestätigungs-Modal fürs Zurücksetzen der Statistik (gleiche Overlay-Klassen). Enthält: `<h2>Statistik zurücksetzen?</h2>`, „Abbrechen" (`.btn-close`) und „Zurücksetzen" (`.btn-danger`). Kein nativer `confirm()`-Aufruf.
- **`#statsExportOverlay`** — Fallback-Modal für den Statistik-Export, wenn die Clipboard-API nicht verfügbar ist. Zeigt den Export-Text in einem readonly `<textarea>` zum manuellen Kopieren.
- **`.sub-nav`** (innerhalb des Info-Tab-Inhalts) — kleine Unter-Navigation mit zwei `.sub-nav-btn`-Buttons („Info" / „Statistik"), die zwischen den beiden Sub-Views des Info-Reiters umschaltet. Nur auf dem Info-Tab sichtbar.

### Zentrale Datenstruktur: `PRODUKTE`

Das Objekt `PRODUKTE` (oben im `<script>`) ist die **einzige Stelle, an der
Produkte/Preise gepflegt werden**. Es treibt Tabs und Produkt-Buttons.

```js
const PRODUKTE = {
  "Bar":  [ { name, preis, pfand }, ... ],   // flaches Array
  "Bier": [ { name, preis, pfand }, ... ],   // flaches Array
  "Essen": {                                   // Objekt mit Unterblöcken
    "Bratbude":   [ { name, preis, pfand }, ... ],
    "Crepe-Bude": [ { name, preis, pfand }, ... ],
  },
  "Info": { info: true },                      // KEINE Produkte → Info-/Über-Reiter
};
```

**Drei Formen pro Kategorie sind möglich:**

1. **Array** → einfache Liste von Produkten (z. B. `Bar`, `Bier`).
2. **Objekt mit Unterblöcken** → mehrere benannte Gruppen (z. B. `Essen`).
3. **Info-Objekt `{ info: true }`** → kein Produkt-Reiter, sondern eine
   Info-/Über-Box (z. B. `Info`). Inhalt kommt aus `INFO_TAB` (Titel +
   `absaetze`-Liste). Siehe [Der Info-Reiter](#der-info-reiter).

Produktfelder:
- `name` (String) — Anzeigename auf dem Button.
- `preis` (Number) — Preis in Euro.
- `pfand` (Number) — Pfand in Euro (`0.0`, wenn kein Pfand anfällt).

`TAB_CLASS` ordnet jeder Kategorie eine CSS-Klasse für die Tab-Farbe zu
(`tab-bar`, `tab-bier`, `tab-essen`, `tab-info`). Beim Anlegen einer neuen
Kategorie ggf. hier eine Farbe ergänzen, sonst bleibt der Tab grau/neutral.

### Wichtige State-Variablen

| Variable               | Bedeutung                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `currentTab`           | aktuell gewählte Kategorie (Default: erste Kategorie)                              |
| `cart`                 | Array der Bestellungs-Positionen                                                   |
| `pfandBerechnen`       | ob Pfand auf Produkte aufgeschlagen wird (Toggle, Default `true`)                  |
| `essenZeigeCrepeBude`  | im Essen-Tab: `false` = Bratbude, `true` = Crepe-Bude                             |
| `infoView`             | aktive Sub-View des Info-Reiters: `'info'` (Standard) oder `'statistik'`           |

`cart`-Einträge haben die Form
`{ name, preis, pfand, pfandOriginal?, isPfandAbzug? }`. Das Feld `pfandOriginal`
speichert den Pfand-Wert aus den Produktdaten und wird von `applyPfandToCart()`
genutzt, um Pfand für bereits vorhandene Positionen nachträglich zu aktualisieren.
Der Pfand-Rückgabe-Eintrag nutzt `preis: -PFAND_RUECKGABE_EURO` und `isPfandAbzug: true`
(kein `pfandOriginal`, wird von `applyPfandToCart()` übersprungen).

### Der kontextabhängige Toggle (`#pfandToggle`)

Der Schalter in `.pfand-row` hat **je nach Tab eine andere Funktion** —
das ist eine der wichtigsten Eigenheiten der App:

- **Normale Tabs (Bar, Bier):** Label „Pfand berechnen". Steuert
  `pfandBerechnen` — also ob beim Antippen eines Produkts dessen Pfand mit in
  den Warenkorb wandert. Das Umschalten wirkt **auch nachträglich** auf bereits
  im Warenkorb liegende Positionen: `applyPfandToCart()` setzt für jede Position
  `pfand = pfandBerechnen ? (item.pfandOriginal||0) : 0` und rendert den
  Warenkorb neu. Die manuelle Pfand-Rückgabe (`isPfandAbzug`) bleibt dabei unberührt.
- **Essen-Tab:** Label ist **fest** „Crepe-Bude anzeigen" — benennt die Funktion des Schalters; ob er an oder aus ist, zeigt, ob die Crepe-Bude angezeigt wird. Steuert
  `essenZeigeCrepeBude` — schaltet zwischen den Unterblöcken **Bratbude** und
  **Crepe-Bude** um. Pfand gibt es bei Essen nicht; der Pfand-Button wird ausgeblendet.
- **Info-Tab:** Die ganze `.pfand-row` (Toggle) **und** der Pfand-Button werden
  ausgeblendet. Zusätzlich wird die **gesamte rechte Spalte** (`#rightCol` —
  Bestellung-Überschrift, Bestellungs-Liste, „Leeren"-Button, Gesamt-Leiste) versteckt und `.left` expandiert
  auf volle Breite — der Reiter zeigt ausschließlich die Info-Box.

Erkannt wird der Essen-Modus über `isEssenTab()` (`currentTab === 'Essen'`
**und** `PRODUKTE['Essen']` ist **kein** Array). Der Info-Modus wird über
`isInfoTab()` erkannt (Kategorie ist ein Objekt mit `info: true`).

**Layout der Toggle-Zeile:** `.pfand-row` verwendet `justify-content: flex-end; gap: 12px;`,
sodass Label und Toggle **beide rechtsbündig gruppiert** sind (Label direkt links
vom Toggle) — statt Label links / Toggle rechts.

### Der Info-Reiter

Der **Info-Reiter** (Schlüssel `"Info"` in `PRODUKTE`) ist **keine
Produktkategorie**, sondern ein **Info-/Über-Reiter**. Er geht zurück auf einen
Info-Tab der Android-Vorlage, der eine Card „APP Informationen" anzeigte. Der
Reiter heißt jetzt einheitlich `"Info"`.

- In `PRODUKTE` als `"Info": { info: true }` hinterlegt (kein Produkt-Array).
- Inhalt kommt aus der Konstante **`INFO_TAB`**:
  - `titel` (String) — aktuell `"Guttauer Dorf- und Teichfest 2026"`.
  - `absaetze` (Array) — jeder Eintrag ist entweder ein **String** (wird als
    Absatz `.info-box-text` gerendert) oder ein **Objekt `{ ueberschrift: "…" }`**
    (wird als Zwischenüberschrift `.info-box-subtitle` gerendert). So lassen
    sich Abschnitte wie „Bedienung", „Pfand", „Essen", „Wechselgeld" strukturieren.
- `renderProducts()` prüft **zuerst** `isInfoTab()` und rendert dann eine
  kleine Sub-Navigation (`.sub-nav` mit zwei `.sub-nav-btn`-Buttons „Info" und
  „Statistik") sowie den jeweils aktiven Sub-View: bei `infoView === 'info'`
  eine `.info-box` aus `INFO_TAB` mit Absätzen (`.info-box-text`) und
  Zwischenüberschriften (`.info-box-subtitle`); bei `infoView === 'statistik'`
  das Statistik-Panel (siehe [Statistik](#statistik)). Die rechte Spalte ist
  via `updateLayoutForTab()` ausgeblendet (früher `return`).
- Toggle-Zeile, Pfand-Button **und die gesamte rechte Spalte** (`#rightCol`)
  sind auf diesem Tab ausgeblendet (`updateLayoutForTab()` wird beim Tab-Wechsel
  und in der Init-Sequenz aufgerufen, zusammen mit `updateToggleForTab()` und
  `updatePfandButtonVisibility()`). Mit `display: contents` auf Mobilgeräten werden
  beim Ausblenden von `#rightCol` auch alle seine Kinder (Bestellung-Überschrift,
  Bestellungs-Liste, `.cart-controls`) unsichtbar.

> **Reihenfolge der Konstanten:** `INFO_TAB` referenziert die Konstante
> `PFAND_RUECKGABE_EURO` (und weitere: `ESSEN_TAB`, `ESSEN_BLOCK_STANDARD`,
> `ESSEN_BLOCK_TOGGLE`). Diese Konstanten müssen deshalb **vor** `INFO_TAB` im
> Quellcode deklariert sein, um einen Temporal-Dead-Zone-ReferenceError zu
> vermeiden.

> Inhalt ändern → `INFO_TAB` in `index.html` editieren (`titel`, `absaetze`).
> Neuen Info-Reiter anlegen → Kategorie als `{ info: true }` in `PRODUKTE`
> ergänzen (und ggf. `INFO_TAB` verallgemeinern, das aktuell **fest** den einen
> Info-Tab speist).

### Layout / Responsivität

Das Layout ist **mobile-first** und vollständig responsiv:

- **Hochformat / < 700 px (Standard):** Einspaltig. `.right` hat `display: contents`,
  sodass seine Kinder (Bestellung-Überschrift, Bestellungs-Liste, `.cart-controls`)
  direkt in den Spaltenfluss eingebettet werden. Reihenfolge:
  Tabs → Toggle-Zeile → Produktgitter → Pfand-Rückgabe-Button (unmittelbar darunter,
  kein toter Leerraum) → Bestellung-Überschrift → Bestellungs-Liste → `.cart-controls`.
  **Kein Seiten-Scroll:** `.main` ist `overflow-y: hidden` und füllt die Viewport-Höhe.
  Stattdessen scrollen **`.left` (Produkte) und `#cart` (Bestellung) unabhängig
  intern** (`overflow-y: auto`, `flex: 1 1 0`, `min-height: 0`); `.left` bekommt
  etwas mehr Höhe (`flex-grow` ~1.4) als der Warenkorb (~1.0). Die `.cart-controls`-Leiste
  („Leeren" + Gesamt) ist `flex: none` am Ende von `.main` und dadurch **immer
  sichtbar** (kein Sticky-Hack nötig).

- **Querformat / ≥ 700 px (`@media (min-width: 700px), (orientation: landscape)`):**
  Zweispaltig — Produkte links (`.left`), Bestellung rechts (`#rightCol` mit
  `display: flex`). Beide Spalten scrollen unabhängig intern; `.cart-controls` ist
  am Ende der rechten Spalte. Der Warenkorb füllt die Spaltenhöhe.

- **Gleiche Button-Höhe:** `.product-grid-inner` nutzt `grid-auto-rows: 1fr` und
  `.product-btn` hat `height: 100%` — dadurch sind **alle Produkt-Buttons gleich hoch**
  (bestimmt durch den Button mit dem längsten/umbruchstärksten Text). `min-height`
  dient als Untergrenze.

- **Responsive Button-Größe:** Produkt-Buttons werden auf größeren Bildschirmen
  spürbar größer, um die Touch-Fläche zu verbessern — bei gleich bleibender
  Gleichhöhigkeit. Breakpoints:
  - **Standard (kleines Smartphone):** `min-height: 70px`, Schrift 16 px, Padding 16 px × 10 px.
  - **≥ 400 px:** `min-height: 86px`, Schrift 18 px, Padding 18 px × 12 px.
  - **≥ 700 px / Querformat:** `min-height: 96px`, Schrift 19 px, Padding 22 px × 14 px;
    Grid wechselt auf `repeat(auto-fill, minmax(150px, 1fr))`.
  - **≥ 1024 px:** `min-height: 116px`, Schrift 21 px, Padding 28 px × 16 px,
    `border-radius: 16px`; Grid `repeat(auto-fill, minmax(180px, 1fr))`.

- **Pfand-Rückgabe-Button:** Sitzt direkt unter dem Produktgitter (`.product-grid`
  ist `flex: none`, kein erzwungenes Strecken) — kein toter Leerraum.

- **Bestellungs-Liste (`#cart`):** `flex: 1 1 0` — **füllt den verfügbaren Platz**
  zwischen Produkten und Summen-Leiste (auch wenn leer, kein schmaler Streifen) und
  **scrollt intern**, wenn mehr Positionen vorhanden sind, als angezeigt werden können.
  Keine `max-height`-Begrenzung.

- **Info-Tab:** `#rightCol` wird per Inline-Style auf `display: none` gesetzt
  (`updateLayoutForTab()`), sodass die gesamte rechte Seite (Bestellung-Überschrift,
  Liste, `.cart-controls`) verborgen ist. `.left` wird auf volle Breite ausgedehnt
  (`flex: 1 1 100%`) und zeigt die Info-Box.

### Render-Funktionen

- **`renderTabs()`** — baut die Tab-Buttons, markiert den aktiven, hängt
  `onclick` an (Tab wechseln → alles neu rendern, `updateToggleForTab()`,
  `updatePfandButtonVisibility()`, `updateLayoutForTab()` aufrufen).
- **`renderProducts()`** — rendert je nach Datenform:
  - Setzt zunächst `productListEl.setAttribute('data-tab', TAB_CLASS[currentTab])`,
    damit per CSS die Produkt-Button-Farbe je Kategorie gesetzt wird
    (Bar = orange, Bier = grün, Essen = blaugrau; Info hat keine Produkte).
  - Info-Objekt (`{ info: true }`) → Sub-Navigation (`.sub-nav`) + aktiver Sub-View: `infoView === 'info'` zeigt `.info-box` aus `INFO_TAB`; `infoView === 'statistik'` zeigt das Statistik-Panel (siehe [Statistik](#statistik)); die rechte Spalte ist via `updateLayoutForTab()` ausgeblendet.
  - Array → ein Grid (oder Hinweis, wenn leer).
  - Essen-Objekt → nur der via Toggle gewählte Unterblock, mit Überschrift.
  - generisches Objekt → **alle** Unterblöcke untereinander mit Überschriften.
  - `makeButton(p, showPfand)` erzeugt einen Produkt-Button; der Button zeigt
    **ausschließlich den Preis** (`formatEuro(p.preis)`) als Sub-Zeile — eine
    „+ X,XX € Pfand"-Zeile auf dem Button gibt es nicht mehr. Pfand wird stattdessen
    im Warenkorb als „inkl. X,XX € Pfand"-Zeile ausgewiesen (wenn `item.pfand > 0`).
    Das Argument `showPfand` steuert nur noch, ob beim Antippen Pfand **in den
    Warenkorb** aufgenommen wird (`addToCart`), nicht die Button-Darstellung.
    Alle Preise werden via `formatEuro()` im deutschen Kommaformat angezeigt.
- **`renderCart()`** — zeichnet alle Warenkorb-Positionen inkl.
  Entfernen-Button und ruft `updateTotal()`. Zeilenbeträge werden in Cent
  berechnet und über `formatCents()` angezeigt.
- **`updateTotal()`** — aktualisiert die Summen-Leiste; Betrag intern in Cent
  via `getCurrentTotalCents()`, Anzeige über `formatCents()`.

### Warenkorb-Aktionen

- **`addToCart(p)`** — fügt Produkt hinzu; speichert `pfand: includePfand ? p.pfand : 0` und `pfandOriginal: p.pfand || 0` (damit der Pfand-Toggle auch nachträglich wirken kann).
- **`addPfandAbzug()`** — fügt „Pfand-Rückgabe" mit `-PFAND_RUECKGABE_EURO`
  hinzu (über `#pfandMinusBtn`, Beschriftung wird beim Init aus der Konstante
  gesetzt: „Pfand zurück -2,00 €").
- **`applyPfandToCart()`** — iteriert den Warenkorb und setzt für jede Position
  `pfand = pfandBerechnen ? (item.pfandOriginal||0) : 0`; überspringt
  `isPfandAbzug`-Einträge. Wird vom Pfand-Toggle-Handler aufgerufen, sobald
  `pfandBerechnen` wechselt, sodass bereits vorhandene Positionen dynamisch
  aktualisiert werden.
- **`removeItem(index)`** — entfernt eine Position.
- **`resetCart()`** — leert den Warenkorb (nach Abschluss oder „Leeren").
  Der „Leeren"-Button (`#neuBtn`) öffnet bei nicht-leerem Warenkorb das
  **`#clearOverlay`**-Bestätigungs-Dialog (h2 „Bestellung leeren?", grauer
  „Abbrechen"-Button und roter „Leeren"-Button). Ist der Warenkorb bereits leer,
  wird `resetCart()` direkt ausgelöst — ohne Dialog.

### Wechselgeld-Overlay

Öffnet beim Tippen auf die **Summen-Leiste** (`#totalBar` →
`openChangeOverlay()`). Das Overlay öffnet **nicht**, wenn der Warenkorb leer
ist (`cart.length === 0` → sofortiger `return`). Für nicht-leere Warenkörbe
gibt es drei Fälle:

- **Genau 0 € (nicht-leerer Warenkorb):** Abschließen-Modus. Label
  (`#overlayTotalLabel`) zeigt „Zu zahlen", `#overlayTotal` zeigt „0,00 €",
  Eingabefeld (`#overlayInputWrap`) und Schnellbeträge (`#quickAmounts`) sind
  ausgeblendet, `#changeResult` zeigt „Nichts zu zahlen – „Fertig" zum
  Abschließen". So werden z. B. Pfand-Rückgaben, die genau den Warenwert
  ausgleichen, trotzdem als Bestellung gezählt.
- **Positiver Gesamtbetrag (normaler Kassiervorgang):** Das Overlay öffnet im
  Wechselgeld-Modus. Das Label (`#overlayTotalLabel`) zeigt „Zu zahlen",
  `#overlayTotal` den Betrag, Eingabefeld (`#overlayInputWrap`) und
  Schnellbeträge (`#quickAmounts`) sind sichtbar.
  - Zeigt Betrag unter „Zu zahlen", Eingabefeld „Gegeben (€)" (`<input type="text"
    inputmode="decimal" autocomplete="off">`, Placeholder `0,00`), Schnellbetrag-Buttons.
  - **Schnellbeträge** werden in Cent berechnet auf Basis echter deutscher Münz-/
    Scheinwerte: `DENOMS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]` Cent
    (= 0,50 / 1 / 2 / 5 / 10 / 20 / 50 / 100 / 200 €). Kandidaten sind: der exakte
    Gesamtbetrag, der Gesamtbetrag aufgerundet auf das nächste Vielfache jeder
    Stückelung, sowie jede Stückelung selbst sofern sie ≥ Gesamtbetrag ist.
    Gefiltert auf ≥ Total, dedupliziert, aufsteigend sortiert, maximal 8 Einträge
    (kleinste = wahrscheinlichste zuerst). Beispiel: 3,50 € → 3,50 / 4,00 / 5,00 /
    10,00 / 20,00 / 50,00 / 100,00 / 200,00 €.
  - Alle Betragsanzeigen im Overlay verwenden deutsches Kommaformat via `formatCents()`.
  - **`calcChange()`** — parst den eingegebenen Betrag strikt via
    `parseEuroCents()` (trimmt, akzeptiert Komma **und** Punkt als Dezimaltrenner,
    lehnt leere/negative/nicht-finite Werte ab, gibt Integer-Cent oder `null`
    zurück). `Rückgeld = Erhalten − Total` in Cent; zeigt „Rückgeld" (positiv)
    oder „Fehlt" (negativ).
- **Negativer Gesamtbetrag (Auszahlungs-Modus):** Tritt auf, wenn mehr Pfand
  zurückgegeben wurde als Produkte gekauft wurden. Das Overlay öffnet im
  Auszahlungs-Modus: `#overlayTotalLabel` zeigt „Auszahlung an Kunde",
  `#overlayTotal` den **Absolutbetrag**, `#overlayInputWrap` und `#quickAmounts`
  werden ausgeblendet (`style.display = 'none'`), und `#changeResult` zeigt
  „Bitte X,XX € an Kunde auszahlen" (Klasse `change-result negative`).

- **„Fertig" (`#overlayDoneBtn`)** ruft zuerst `recordSale()` (Statistik-Aufzeichnung),
  dann `closeChangeOverlay()` und schließlich `resetCart()`. Jede abgeschlossene
  Bestellung wird so in der Statistik gezählt — unabhängig vom Betrag.
- Schließen ohne Reset: „✕" oben rechts oder Klick auf den abgedunkelten
  Hintergrund.

### Statistik

Die App erfasst **dauerhaft** (per `localStorage`) Verkaufsstatistiken über
alle abgeschlossenen Bestellungen. Im privaten Modus (z. B. iOS Safari) fällt
sie auf einen In-Memory-Betrieb zurück — kein Absturz, aber Daten gehen beim
Schließen verloren; der Export-Button ermöglicht dann die manuelle Sicherung.

#### Datenschicht

- **Speicherschlüssel:** `kassenStatistik` (Konstante `STATS_STORAGE_KEY`),
  Schemaversion `STATS_VERSION = 1`.
- **Datenform:**
  ```js
  {
    version,
    produkte: { "<Produktname>": { anzahl, umsatzCents } },
    einnahmenCents,   // Summe aller Produktpreise (ohne Pfand)
    ausgabenCents,    // Summe aller Pfand-Rückgaben (positive Cent)
    bons              // Anzahl abgeschlossener Bestellungen
  }
  ```
  - `produkte`: pro Produkt Verkaufsanzahl (`anzahl`) und Umsatz in Cent
    (`umsatzCents` = Anzahl × Preis, **ohne** Pfand-Anteil).
  - `einnahmenCents`: Summe der Produktpreise aller verkauften Positionen
    (kein Pfand enthalten).
  - `ausgabenCents`: Summe aller Pfand-Rückgabe-Beträge (positiver Cent-Wert).
  - `bons`: Zähler abgeschlossener Bestellungen.

#### Funktionen

| Funktion | Beschreibung |
| -------- | ------------ |
| `emptyStats()` | Liefert ein frisch genulltes Stats-Objekt. |
| `loadStats()` | Liest + parst `localStorage`; füllt fehlende Felder defensiv; gibt `emptyStats()` bei Fehler/fehlendem Eintrag zurück. |
| `saveStats(stats)` | Persistiert als JSON; gibt `false` zurück bei Fehler (z. B. Storage voll / privater Modus). |
| `statsStorageAvailable()` | Boolean: prüft, ob `localStorage` beschreibbar ist (z. B. `false` im privaten Modus). |
| `recordSale()` | Aufgerufen beim Abschließen einer Bestellung: iteriert den Warenkorb — für jede normale Position (`!isPfandAbzug`) werden `produkte[name].anzahl` und `umsatzCents` sowie `einnahmenCents` inkrementiert; für `isPfandAbzug`-Einträge wird `ausgabenCents` um den Absolutbetrag erhöht; `bons` wird einmalig pro Bestellung hochgezählt. Leerer Warenkorb → kein Bon. |
| `resetStats()` | Persistiert `emptyStats()` (setzt alle Werte auf null). |
| `buildStatsExport()` | Gibt einen mehrzeiligen deutschen Zusammenfassungstext zurück (Produkt-Zeilen + Bestellungen / Einnahmen / Ausgaben / Netto) zur Sicherung oder Weitergabe. |

#### Auslöser: Wann wird `recordSale()` gerufen?

`recordSale()` wird vom „Fertig"-Button (`#overlayDoneBtn`) im
Wechselgeld-Overlay aufgerufen — **bevor** `closeChangeOverlay()` und
`resetCart()`. Damit wird jede abgeschlossene Bestellung gezählt, unabhängig
vom Gesamtbetrag (auch 0 € und Auszahlungs-Modus).

#### UI (Info-Tab → Sub-View „Statistik")

Die Statistik ist über den Info-Reiter erreichbar. Beim Wechsel auf den
Info-Tab zeigt `renderProducts()` zunächst eine kleine Sub-Navigation
(`.sub-nav` mit zwei `.sub-nav-btn`-Buttons „Info" und „Statistik"). Klick
setzt die Modul-Variable `infoView` und rendert neu.

Bei `infoView === 'statistik'` wird ein Statistik-Panel gerendert:

- **Zusammenfassungs-Karten** (`.stats-summary` / `.stat-card`): Bestellungen
  (`bons`), Einnahmen Netto (`einnahmenCents − ausgabenCents`), Umsatz ohne
  Pfand (`einnahmenCents`), Ausgaben Pfand (`ausgabenCents`).
- **Produkt-Liste** (`.stats-list-item`): Name × Anzahl + Umsatz, absteigend
  nach Anzahl sortiert. Bei keinen erfassten Produkten erscheint der Hinweis
  „Noch keine Verkäufe erfasst."
- **Hinweis bei nicht verfügbarem Storage:** Ist `statsStorageAvailable()`
  `false` (z. B. iOS privater Modus), wird ein Warnhinweis angezeigt, dass
  Statistiken nicht gespeichert werden können.
- **Button „Zurücksetzen":** Öffnet das Bestätigungs-Overlay
  `#statsResetOverlay` (gleiche Klassen wie `#clearOverlay`; h2 „Statistik
  zurücksetzen?"; roter „Zurücksetzen"-Button, grauer „Abbrechen"-Button; kein
  nativer `confirm()`). Nach Bestätigung: `resetStats()` → Overlay schließen →
  neu rendern (leerer Zustand).
- **Button „Export":** Versucht
  `navigator.clipboard.writeText(buildStatsExport())`; bei Erfolg kurzes
  „Kopiert!"-Feedback. Ist die Clipboard-API nicht verfügbar, öffnet das
  Fallback-Overlay `#statsExportOverlay` mit dem Export-Text in einem readonly
  `<textarea>` zum manuellen Kopieren.
- Alle Stats-UI-Elemente werden über `createElement`/`textContent` erzeugt
  (XSS-sicher, kein `innerHTML` mit ungeprüften Daten).

## PWA / Offline

### manifest.json
- `display: "standalone"` → läuft wie eine native App ohne Browser-UI.
- `start_url: "./index.html"`, Theme/Background `#16313b`.
- Icons: `icon-192.png`, `icon-512.png`.
- iOS-spezifisches Verhalten zusätzlich über `<meta>`-Tags in `index.html`
  (`apple-mobile-web-app-capable`, `-status-bar-style`, `-title`,
  `apple-touch-icon`).
- Ein `<meta name="referrer" content="strict-origin-when-cross-origin">` ist
  im `<head>` gesetzt.

### service-worker.js
- **Cache-Name:** `kassensystem-v3`.
- **Fetch-Handler (gehärtet):** Verarbeitet ausschließlich **same-origin
  GET-Anfragen**. Navigations-Requests werden aus dem Cache mit
  `./index.html` bedient. Nur Assets aus der `ASSETS`-Liste (App-Shell,
  als absolute URLs in `APP_SHELL`) werden gecacht — nach Prüfung auf
  `response.ok && response.type === 'basic'`. Cross-Origin-Anfragen,
  Nicht-GET-Methoden und Fehlerantworten werden **nicht** gecacht.
- **Cache-First-Strategie:** Bei `fetch` wird zuerst der Cache geprüft; bei
  Treffer wird dieser geliefert, sonst aus dem Netz geholt und — sofern es
  sich um ein App-Shell-Asset handelt — in den Cache geschrieben.
- **Vorab gecachte Assets (`ASSETS`):** `index.html`, `manifest.json`,
  `icon-192.png`, `icon-512.png`.
- `install` ruft `skipWaiting()`, `activate` löscht alte Caches und ruft
  `clients.claim()` → neue Version übernimmt zügig.

> **Cache-Busting beim Deployen:** Da `index.html` aggressiv gecacht wird,
> muss bei Änderungen der **`CACHE_NAME` erhöht** werden (z. B. auf
> `kassensystem-v4`), damit Geräte die neue Version laden. Sonst sehen bereits
> installierte Geräte weiterhin den alten Stand. **Das ist der häufigste
> Stolperstein bei Updates.**

## Häufige Aufgaben

### Produkte/Preise ändern
→ Im Objekt **`PRODUKTE`** in `index.html` editieren. Format einhalten
(`{ name, preis, pfand }`). Kein Build nötig — Datei speichern, im Browser neu
laden. **`CACHE_NAME` im Service Worker erhöhen**, wenn die Änderung auf
installierten Geräten ankommen soll.

### Den Info-Reiter ändern
→ `"Info"` ist ein **Info-/Über-Reiter** (`{ info: true }`), keine Produkt­liste.
Titel und Inhalte in der Konstante **`INFO_TAB`** in `index.html` anpassen:
- `titel` — Überschrift der Info-Box (String).
- `absaetze` — Array aus Strings (Absatz, `.info-box-text`) und/oder Objekten
  `{ ueberschrift: "…" }` (Zwischenüberschrift, `.info-box-subtitle`).

Farbe des Tabs ggf. in `TAB_CLASS` ergänzen. **Achtung Reihenfolge:** Da
`INFO_TAB` die Konstante `PFAND_RUECKGABE_EURO` (und andere) referenziert,
müssen diese **vor** `INFO_TAB` im Quellcode stehen. Soll `"Info"` doch
Produkte zeigen, stattdessen ein Produkt-Array hinterlegen (dann entfällt die
Info-Box).

### Neue Kategorie hinzufügen
1. Schlüssel in `PRODUKTE` ergänzen (Array **oder** Unterblock-Objekt).
2. In `TAB_CLASS` eine Tab-Farbklasse hinterlegen (sonst neutral).
3. Bei einem Unterblock-Objekt, das wie „Essen" per Toggle umschalten soll,
   beachten: Die Umschalt-Logik in `isEssenTab()` / `updateToggleForTab()` /
   `renderProducts()` ist **fest auf den Schlüssel `'Essen'` und die Blocknamen
   `'Bratbude'`/`'Crepe-Bude'` verdrahtet**. Für andere Umschalt-Kategorien
   müsste diese Logik verallgemeinert werden.

### Pfandbetrag ändern
→ Der Rückgabe-Wert und die Button-Beschriftung werden beide aus der Konstante
**`PFAND_RUECKGABE_EURO`** gesetzt: `addPfandAbzug()` verwendet
`-PFAND_RUECKGABE_EURO`, und beim Init wird der Button-Text
`Pfand zurück -${formatEuro(PFAND_RUECKGABE_EURO)}` daraus erzeugt. Eine Änderung an
dieser einen Konstante aktualisiert beides gleichzeitig. Pro Produkt steckt der
Pfand zusätzlich in dessen `pfand`-Feld — auch das bei einer Änderung anpassen.

## Testen / Ausführen

- **Schnell:** `index.html` direkt im Browser öffnen.
- **Realistisch (mit Service Worker):** über lokalen HTTP-Server ausliefern,
  z. B. `python3 -m http.server` und `http://localhost:8000` öffnen.
  Service Worker benötigen einen `http(s)`-Ursprung (über `file://` greift der
  SW i. d. R. nicht).
- **PWA/iOS:** Seite hosten (HTTPS), in Safari öffnen → Teilen → „Zum
  Home-Bildschirm". Danach offline lauffähig.
- Es gibt **keine automatisierten Tests** und **kein Test-Framework**.

## Wichtige Eigenheiten / Gotchas

- **Keine Warenkorb-Persistenz:** Der Warenkorb lebt nur im Speicher (`cart`-Array). Beim
  Neuladen/Schließen ist er weg. Es gibt **keine Bon-Historie** — bewusst minimal als
  reine Kalkulations-/Kassierhilfe. Die **Statistik** (Verkäufe, Umsatz) wird
  dagegen per `localStorage` (Schlüssel `kassenStatistik`) dauerhaft gespeichert;
  im privaten Modus (z. B. iOS Safari) fällt die App auf einen In-Memory-Betrieb
  zurück (kein Absturz, aber die Daten gehen beim Schließen verloren — der
  Export-Button ermöglicht in diesem Fall die manuelle Sicherung).
- **Toggle mit Doppelfunktion:** Derselbe Schalter bedeutet je nach Tab „Pfand
  berechnen" (Bar/Bier) **oder** „Crepe-Bude anzeigen" (Essen; Label ist immer
  fest dieser Text, unabhängig von der aktuellen Stellung). Häufige
  Verwirrungsquelle bei Änderungen.
- **Hartcodierte Essen-Logik:** Schlüssel `'Essen'` und Blocknamen
  `'Bratbude'`/`'Crepe-Bude'` sind im Code verankert.
- **Geldbeträge in Cent:** Alle internen Berechnungen (Summen, Wechselgeld,
  Schnellbeträge) laufen in **Integer-Cent** (`toCents()`, `formatCents()`,
  `getCurrentTotalCents()`), um Gleitkomma-Rundungsfehler zu vermeiden. Die
  Anzeige erfolgt ausschließlich im **deutschen Kommaformat** via `formatCents()`
  (z. B. „2,00 €") bzw. `formatEuro()` für Euro-Werte. Die kleinste praktische
  Stückelung beträgt **0,50 €** (50 Cent).
- **Service-Worker-Caching** kann alte Stände „festhalten" → bei Updates
  `CACHE_NAME` erhöhen.
- **Einzeldatei-Architektur:** Alles in `index.html`. Kein Build, keine Module,
  keine Dependencies — Änderungen sind direkt und sofort wirksam.

## Repository-Status

- **Kein Git-Repository** initialisiert (`git rev-parse` meldet „kein
  Git-Repository"). Liegt trotz des Pfads unter `GIT-Repos/` aktuell ohne
  Versionskontrolle vor. Bei Bedarf `git init` ausführen.
- `.DS_Store` (macOS) liegt im Verzeichnis und sollte bei einem späteren
  `git init` via `.gitignore` ausgeschlossen werden.
