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
- **`#changeOverlay`** — Modal für die Wechselgeld-Berechnung.

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

| Variable               | Bedeutung                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| `currentTab`           | aktuell gewählte Kategorie (Default: erste Kategorie)            |
| `cart`                 | Array der Bestellungs-Positionen                                 |
| `pfandBerechnen`       | ob Pfand auf Produkte aufgeschlagen wird (Toggle, Default `true`)|
| `essenZeigeCrepeBude`  | im Essen-Tab: `false` = Bratbude, `true` = Crepe-Bude           |

`cart`-Einträge haben die Form
`{ name, preis, pfand, isPfandAbzug? }`. Der Pfand-Rückgabe-Eintrag nutzt
`preis: -PFAND_RUECKGABE_EURO` und `isPfandAbzug: true`.

### Der kontextabhängige Toggle (`#pfandToggle`)

Der Schalter in `.pfand-row` hat **je nach Tab eine andere Funktion** —
das ist eine der wichtigsten Eigenheiten der App:

- **Normale Tabs (Bar, Bier):** Label „Pfand berechnen". Steuert
  `pfandBerechnen` — also ob beim Antippen eines Produkts dessen Pfand mit in
  den Warenkorb wandert.
- **Essen-Tab:** Label „Crepe-Bude anzeigen". Steuert `essenZeigeCrepeBude` —
  schaltet zwischen den Unterblöcken **Bratbude** und **Crepe-Bude** um. Pfand
  gibt es bei Essen nicht; der Pfand-Button wird ausgeblendet.
- **Info-Tab:** Die ganze `.pfand-row` (Toggle) **und** der Pfand-Button werden
  ausgeblendet. Zusätzlich wird die **gesamte rechte Spalte** (`#rightCol` —
  Bestellung-Überschrift, Bestellungs-Liste, „Leeren"-Button, Gesamt-Leiste) versteckt und `.left` expandiert
  auf volle Breite — der Reiter zeigt ausschließlich die Info-Box.

Erkannt wird der Essen-Modus über `isEssenTab()` (`currentTab === 'Essen'`
**und** `PRODUKTE['Essen']` ist **kein** Array). Der Info-Modus wird über
`isInfoTab()` erkannt (Kategorie ist ein Objekt mit `info: true`).

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
  `.info-box` (Titel, Absätze, Zwischenüberschriften) statt eines Produkt-Grids
  — ein früher `return` verhindert, dass der generische Objekt-Zweig greift.
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
  - Info-Objekt (`{ info: true }`) → `.info-box` aus `INFO_TAB` mit Absätzen
    (`.info-box-text`) und Zwischenüberschriften (`.info-box-subtitle`); die
    rechte Spalte ist via `updateLayoutForTab()` ausgeblendet (früher `return`).
  - Array → ein Grid (oder Hinweis, wenn leer).
  - Essen-Objekt → nur der via Toggle gewählte Unterblock, mit Überschrift.
  - generisches Objekt → **alle** Unterblöcke untereinander mit Überschriften.
  - `makeButton(p, showPfand)` erzeugt einen Produkt-Button; `showPfand`
    blendet die „+ X,XX € Pfand"-Zeile ein/aus; alle Preise werden via
    `formatEuro()` im deutschen Kommaformat angezeigt.
- **`renderCart()`** — zeichnet alle Warenkorb-Positionen inkl.
  Entfernen-Button und ruft `updateTotal()`. Zeilenbeträge werden in Cent
  berechnet und über `formatCents()` angezeigt.
- **`updateTotal()`** — aktualisiert die Summen-Leiste; Betrag intern in Cent
  via `getCurrentTotalCents()`, Anzeige über `formatCents()`.

### Warenkorb-Aktionen

- **`addToCart(p)`** — fügt Produkt hinzu; Pfand nur, wenn `pfandBerechnen`.
- **`addPfandAbzug()`** — fügt „Pfand-Rückgabe" mit `-PFAND_RUECKGABE_EURO`
  hinzu (über `#pfandMinusBtn`, Beschriftung wird beim Init aus der Konstante
  gesetzt: „Pfand zurück -2,00 €").
- **`removeItem(index)`** — entfernt eine Position.
- **`resetCart()`** — leert den Warenkorb (nach Abschluss oder „Leeren").
  Der „Leeren"-Button fragt bei nicht-leerem Warenkorb per `confirm('Bestellung wirklich leeren?')` nach.

### Wechselgeld-Overlay

Öffnet beim Tippen auf die **Summen-Leiste** (`#totalBar` →
`openChangeOverlay()`), sofern der Gesamtbetrag > 0 ist:

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
- **„Fertig"** schließt das Overlay **und leert den Warenkorb** (`resetCart()`).
- Schließen ohne Reset: „✕" oben rechts oder Klick auf den abgedunkelten
  Hintergrund.

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
- **Cache-Name:** `kassensystem-v2`.
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
> `kassensystem-v3`), damit Geräte die neue Version laden. Sonst sehen bereits
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

- **Keine Persistenz:** Der Warenkorb lebt nur im Speicher (`cart`-Array). Beim
  Neuladen/Schließen ist er weg. Es gibt **keinen Umsatzspeicher, keine
  Bon-Historie, kein localStorage** — bewusst minimal als reine Kalkulations-/
  Kassierhilfe.
- **Toggle mit Doppelfunktion:** Derselbe Schalter bedeutet je nach Tab „Pfand
  berechnen" **oder** „Crepe-Bude anzeigen" (siehe oben). Häufige
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
