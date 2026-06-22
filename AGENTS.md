# AGENTS.md — Dorffest Kassen-App

Dokumentation für KI-Agenten und Entwickler:innen, die an diesem Projekt arbeiten.

## Überblick

Eine **kleine Kassen-App (Point of Sale)** für ein Dorffest. Realisiert als
**Progressive Web App (PWA)**, die vollständig **offline** läuft — primär auf
iOS (zum Homescreen hinzugefügt), funktioniert aber genauso unter Android und
auf dem Desktop.

Kernidee: Bedienpersonal tippt Produkte an, die App führt einen
Einkaufswagen, berechnet die Summe inkl. **Pfand**, und bietet eine
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
- **`.main`** — zweispaltiges Layout:
  - **`.left`** → `#productList` (Produkt-Buttons) + `#pfandMinusBtn` (Pfand-Rückgabe-Button).
  - **`.right`** → `#cart` (Einkaufswagen) + `#neuBtn` (Leeren) + `#totalBar` (Summe, öffnet Wechselgeld).
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
  "TKA": { info: true },                       // KEINE Produkte → Info-/Über-Reiter
};
```

**Drei Formen pro Kategorie sind möglich:**

1. **Array** → einfache Liste von Produkten (z. B. `Bar`, `Bier`).
2. **Objekt mit Unterblöcken** → mehrere benannte Gruppen (z. B. `Essen`).
3. **Info-Objekt `{ info: true }`** → kein Produkt-Reiter, sondern eine
   Info-/Über-Box (z. B. `TKA`). Inhalt kommt aus `INFO_TAB` (Titel +
   `absaetze`-Liste). Siehe [Der Info-Reiter (TKA)](#der-info-reiter-tka).

Produktfelder:
- `name` (String) — Anzeigename auf dem Button.
- `preis` (Number) — Preis in Euro.
- `pfand` (Number) — Pfand in Euro (`0.0`, wenn kein Pfand anfällt).

`TAB_CLASS` ordnet jeder Kategorie eine CSS-Klasse für die Tab-Farbe zu
(`tab-bar`, `tab-bier`, `tab-essen`, `tab-tka`). Beim Anlegen einer neuen
Kategorie ggf. hier eine Farbe ergänzen, sonst bleibt der Tab grau/neutral.

### Wichtige State-Variablen

| Variable               | Bedeutung                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| `currentTab`           | aktuell gewählte Kategorie (Default: erste Kategorie)            |
| `cart`                 | Array der Einkaufswagen-Positionen                               |
| `pfandBerechnen`       | ob Pfand auf Produkte aufgeschlagen wird (Toggle, Default `true`)|
| `essenZeigeCrepeBude`  | im Essen-Tab: `false` = Bratbude, `true` = Crepe-Bude           |

`cart`-Einträge haben die Form
`{ name, preis, pfand, isPfandAbzug? }`. Der Pfand-Rückgabe-Eintrag nutzt
`preis: -2.0` und `isPfandAbzug: true`.

### Der kontextabhängige Toggle (`#pfandToggle`)

Der Schalter in `.pfand-row` hat **je nach Tab eine andere Funktion** —
das ist eine der wichtigsten Eigenheiten der App:

- **Normale Tabs (Bar, Bier):** Label „Pfand berechnen". Steuert
  `pfandBerechnen` — also ob beim Antippen eines Produkts dessen Pfand mit in
  den Warenkorb wandert.
- **Essen-Tab:** Label „Crepe-Bude anzeigen". Steuert `essenZeigeCrepeBude` —
  schaltet zwischen den Unterblöcken **Bratbude** und **Crepe-Bude** um. Pfand
  gibt es bei Essen nicht; der Pfand-Button wird ausgeblendet.
- **TKA-Tab (Info):** Die ganze `.pfand-row` (Toggle) **und** der Pfand-Button
  werden ausgeblendet — der Reiter zeigt nur eine Info-Box, keine Produkte.

Erkannt wird der Essen-Modus über `isEssenTab()` (`currentTab === 'Essen'`
**und** `PRODUKTE['Essen']` ist **kein** Array). Der Info-Modus wird über
`isInfoTab()` erkannt (Kategorie ist ein Objekt mit `info: true`).

### Der Info-Reiter (TKA)

`TKA` ist **keine Produktkategorie**, sondern ein **Info-/Über-Reiter** —
übernommen aus der Android-Vorlage, wo dieser Tab eine Card „APP Informationen"
anzeigte (Text: „Dorffest Guttau 2026 …"). Die drei Buchstaben „TKA" sind im
Original-APK **nicht ausgeschrieben**; nur die Funktion (App-Info) ist belegt.

- In `PRODUKTE` als `"TKA": { info: true }` hinterlegt (kein Produkt-Array).
- Inhalt kommt aus der Konstante **`INFO_TAB`** (`titel` + `absaetze`-Array).
- `renderProducts()` prüft **zuerst** `isInfoTab()` und rendert dann eine
  `.info-box` (Titel + Absätze) statt eines Produkt-Grids — `return` davor
  verhindert, dass der generische Objekt-Zweig greift.
- Toggle-Zeile und Pfand-Button sind auf diesem Tab ausgeblendet.

> Inhalt ändern → `INFO_TAB` in `index.html` editieren. Neuen Info-Reiter
> anlegen → Kategorie als `{ info: true }` in `PRODUKTE` ergänzen (und ggf.
> `INFO_TAB` verallgemeinern, das aktuell **fest** den einen Info-Tab speist).

### Render-Funktionen

- **`renderTabs()`** — baut die Tab-Buttons, markiert den aktiven, hängt
  `onclick` an (Tab wechseln → alles neu rendern).
- **`renderProducts()`** — rendert je nach Datenform:
  - Info-Objekt (`{ info: true }`) → `.info-box` aus `INFO_TAB` (früher `return`).
  - Array → ein Grid (oder Hinweis, wenn leer).
  - Essen-Objekt → nur der via Toggle gewählte Unterblock, mit Überschrift.
  - generisches Objekt → **alle** Unterblöcke untereinander mit Überschriften.
  - `makeButton(p, showPfand)` erzeugt einen Produkt-Button; `showPfand`
    blendet die „+ X € Pfand"-Zeile ein/aus.
- **`renderCart()`** — zeichnet alle Warenkorb-Positionen inkl.
  Entfernen-Button und ruft `updateTotal()`.
- **`updateTotal()` / `getCurrentTotal()`** — Summe = Σ (`preis` + `pfand`)
  über alle Positionen.

### Warenkorb-Aktionen

- **`addToCart(p)`** — fügt Produkt hinzu; Pfand nur, wenn `pfandBerechnen`.
- **`addPfandAbzug()`** — fügt „Pfand-Rückgabe" mit `-2.0 €` hinzu
  (über `#pfandMinusBtn`, Beschriftung „Pfand -2€").
- **`removeItem(index)`** — entfernt eine Position.
- **`resetCart()`** — leert den Warenkorb (nach Abschluss oder „Neu").
  Der „Neu"-Button fragt bei nicht-leerem Warenkorb per `confirm()` nach.

### Wechselgeld-Overlay

Öffnet beim Tippen auf die **Summen-Leiste** (`#totalBar` → `openChangeOverlay()`):

- Zeigt Gesamtbetrag, Eingabefeld für „Erhalten", Schnellbetrag-Buttons.
- **Schnellbeträge** werden dynamisch berechnet: Aufrundungen des Totals
  (nächster 1er/5er/10er/20er) plus feste gängige Scheine (5/10/50), gefiltert
  auf Werte `≥ Total`, dedupliziert.
- **`calcChange()`** — `Rückgeld = Erhalten − Total`; zeigt „Rückgeld" (positiv)
  oder „Fehlt" (negativ). Akzeptiert Komma **und** Punkt als Dezimaltrenner.
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

### service-worker.js
- **Cache-Name:** `kassensystem-v1`.
- **Cache-First-Strategie:** Bei `fetch` wird zuerst der Cache geprüft; bei
  Treffer wird dieser geliefert, sonst aus dem Netz geholt **und** in den Cache
  geschrieben (Runtime-Caching). Fällt das Netz aus, wird — falls vorhanden —
  der gecachte Stand zurückgegeben.
- **Vorab gecachte Assets (`ASSETS`):** `index.html`, `manifest.json`,
  `icon-192.png`, `icon-512.png`.
- `install` ruft `skipWaiting()`, `activate` löscht alte Caches und ruft
  `clients.claim()` → neue Version übernimmt zügig.

> **Cache-Busting beim Deployen:** Da `index.html` aggressiv gecacht wird,
> muss bei Änderungen der **`CACHE_NAME` erhöht** werden (z. B. auf
> `kassensystem-v2`), damit Geräte die neue Version laden. Sonst sehen bereits
> installierte Geräte weiterhin den alten Stand. **Das ist der häufigste
> Stolperstein bei Updates.**

## Häufige Aufgaben

### Produkte/Preise ändern
→ Im Objekt **`PRODUKTE`** in `index.html` editieren. Format einhalten
(`{ name, preis, pfand }`). Kein Build nötig — Datei speichern, im Browser neu
laden. **`CACHE_NAME` im Service Worker erhöhen**, wenn die Änderung auf
installierten Geräten ankommen soll.

### Den `TKA`-Info-Reiter ändern
→ `TKA` ist ein **Info-/Über-Reiter** (`{ info: true }`), keine Produkt­liste.
Text/Überschrift in der Konstante **`INFO_TAB`** (`titel`, `absaetze`) in
`index.html` anpassen. Farbe ggf. in `TAB_CLASS`. Soll TKA doch Produkte
zeigen, stattdessen ein Produkt-Array hinterlegen (dann entfällt die Info-Box).

### Neue Kategorie hinzufügen
1. Schlüssel in `PRODUKTE` ergänzen (Array **oder** Unterblock-Objekt).
2. In `TAB_CLASS` eine Tab-Farbklasse hinterlegen (sonst neutral).
3. Bei einem Unterblock-Objekt, das wie „Essen" per Toggle umschalten soll,
   beachten: Die Umschalt-Logik in `isEssenTab()` / `updateToggleForTab()` /
   `renderProducts()` ist **fest auf den Schlüssel `'Essen'` und die Blocknamen
   `'Bratbude'`/`'Crepe-Bude'` verdrahtet**. Für andere Umschalt-Kategorien
   müsste diese Logik verallgemeinert werden.

### Pfandbetrag ändern
→ Der Rückgabe-Button ist mit **`-2.0 €` hartkodiert** (`addPfandAbzug()`,
Button-Text „Pfand -2€"). Pro Produkt steckt der Pfand in dessen `pfand`-Feld.
Beides bei einer Änderung anpassen.

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
- **Pfand `-2€` hartkodiert** im Rückgabe-Button.
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
