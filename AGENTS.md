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
- **Persistenz:** Warenkorb: Sitzung (`sessionStorage`); Statistik: dauerhaft (`localStorage`) — siehe [Wichtige Eigenheiten](#wichtige-eigenheiten--gotchas)

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
├── icon-192.png        # App-Icon 192×192 (Homescreen / Manifest) — Guttauer Wappen mit rotem €-Overlay, full-bleed dunkelteal, lossless-optimiert (~11,7 KB)
├── icon-512.png        # App-Icon 512×512 (Splash / Manifest) — gleiche Grafik, lossless-optimiert (~41 KB); full-bleed → safe für Android maskable
├── wappen-192.png      # Guttauer Wappen 192×192 (Info-Bereich / Emblem) — lossless-optimiert (~9,4 KB)
├── wappen-512.png      # Guttauer Wappen 512×512 (Info-Bereich / Emblem) — lossless-optimiert (~33 KB)
└── AGENTS.md           # Diese Datei
```

Die **gesamte Anwendung steckt in `index.html`** — Struktur, Styling und
JavaScript-Logik sind in dieser einen Datei vereint. Es gibt keine separaten
`.css`- oder `.js`-Dateien für die App-Logik.

## index.html im Detail

### Aufbau der Oberfläche (DOM)

- **`#tabs`** — Tab-Leiste, dynamisch befüllt. Enthält:
  - **Produkt-Tabs** (Bar, Bier, Essen) — mit Text, je nach Kategorie eingefärbt.
  - Zwei **Icon-Buttons** rechts außen (via CSS `margin-left: auto` auf den ersten):
    - **`ℹ`** (`aria-label="Info"`, Klassen `tab-btn tab-icon`) — öffnet die Info-View.
    - **`⚙`** (`aria-label="Einstellungen"`, Klassen `tab-btn tab-icon`) — öffnet die Einstellungen-View.
  - Die Icon-Buttons sind **lila** (`color: var(--purple)`); wenn ihre View aktiv ist, erhalten sie einen ausgefüllten lila Hintergrund (`background: var(--purple); color: #ffffff`) — entspricht einem klaren iOS-Standard-Active-Zustand.
  - Der jeweils aktive Tab/Icon erhält die Klasse `active`. `renderTabs()` setzt `active` auf einem Produkt-Tab nur, wenn `currentView === 'products'` — in der Info- oder Einstellungen-View ist kein Produkt-Tab hervorgehoben; stattdessen erhält das zugehörige Icon-Btn die Klasse.
  - Inaktive `.tab-btn` verwenden **kein** `opacity: 0.5` (würde Kontrast verletzen); stattdessen wird ein eingeschobener `box-shadow` mit volldeckendem weißem Text eingesetzt (≥ 4,5 : 1 in beiden Themes).
  - Eine separate Toggle-Zeile (`.pfand-row`) gibt es **nicht mehr** — alle Umschalter wurden in die Einstellungen-View verschoben.
- **`.main`** — enthält `.left` und `.right#rightCol`. Layout ist **mobile-first zweispaltig** (auch im Hochformat) — siehe [Layout / Responsivität](#layout--responsivität).
  - **`.left`** → `#productList` (Produkt-Buttons, Info-Box oder Einstellungen-Box) + `#pfandMinusBtn` (Pfand-Rückgabe-Button).
  - **`.right`** (id=`rightCol`) → `<h2>Bestellung</h2>` + `#cart` (Bestellungs-Liste) + **`.cart-controls`** (enthält `#neuBtn` „Leeren" und `#totalBar` Gesamt-Leiste, öffnet Wechselgeld). Wird in der Info-View und der Einstellungen-View vollständig ausgeblendet (`.left` expandiert dann auf volle Breite).
- **`#changeOverlay`** — Modal für die Wechselgeld-Berechnung (`role="dialog"`, `aria-modal="true"`, `aria-labelledby="changeOverlayTitle"`). Enthält die benannten Elemente **`#overlayTotalLabel`** (Label-Span in der `.overlay-row.total`, wechselt zwischen „Zu zahlen" und „Auszahlung an Kunde") und **`#overlayInputWrap`** (Wrapper um das Eingabefeld, wird bei negativem Gesamtbetrag ausgeblendet). Implementiert einen **Focus-Trap** (Tab/Shift+Tab kreist innerhalb der `.overlay-card`) und gibt den Fokus beim Schließen an das auslösende Element zurück (`overlayReturnFocusEl`). Der ✕-Button hat `aria-label="Schließen"`.
- **`#clearOverlay`** — Bestätigungs-Modal fürs Leeren der Bestellung (`role="dialog"`, `aria-modal="true"`, `aria-labelledby="clearOverlayTitle"`). Gleiche CSS-Klassen (`.overlay`/`.overlay-card`/`.overlay-close-x`/`.overlay-buttons`) wie das Wechselgeld-Overlay. Enthält: `<h2 id="clearOverlayTitle">Bestellung leeren?</h2>`, einen Absatz `.overlay-confirm-text` „Möchtest du die komplette Bestellung wirklich leeren?", einen **Warnhinweis-Absatz** `.overlay-confirm-hint` „Hinweis: Die Bestellung wird **nicht** als Verkauf gezählt. Zum Abschließen „Fertig" im Wechselgeld-Dialog nutzen." (roter Hintergrund, Klasse `.overlay-confirm-hint`), die Buttons `#clearCancelBtn` „Abbrechen" (`.btn-close`) und `#clearConfirmBtn` „Leeren" (`.btn-danger`) sowie `#clearCloseX` (✕, `aria-label="Schließen"`). Implementiert Focus-Trap und Fokus-Rückgabe.
- **`#statsResetOverlay`** — Bestätigungs-Modal fürs Zurücksetzen der Statistik (gleiche Overlay-Klassen, `role="dialog"`, `aria-modal="true"`, `aria-labelledby="statsResetOverlayTitle"`). Enthält: `<h2>Statistik zurücksetzen?</h2>`, „Abbrechen" (`.btn-close`) und „Zurücksetzen" (`.btn-danger`). ✕-Button hat `aria-label="Schließen"`. Kein nativer `confirm()`-Aufruf. Implementiert Focus-Trap und Fokus-Rückgabe.
- **`#statsExportOverlay`** — Modal für den Statistik-Export (`role="dialog"`, `aria-modal="true"`, `aria-labelledby="statsExportOverlayTitle"`). Wird beim Tippen auf „Export" **immer** geöffnet (kein stiller Clipboard-Versuch vorab). Zeigt den Export-Text in einem readonly `<textarea>` sowie den Hinweis „Zum Sichern markieren & kopieren (z. B. in Notizen)". Der Button **`#statsExportCopyBtn`** „Kopieren" schreibt den Inhalt via `navigator.clipboard.writeText` in die Zwischenablage (Fallback: `select` + `document.execCommand('copy')` + `setSelectionRange(0, 99999)` für volle iOS-Auswahl); bei Fehlschlag beider Wege Feedback „Bitte manuell kopieren" statt stiller Fehler; zeigt sonst kurz „Kopiert!". ✕-Button hat `aria-label="Schließen"`. „Schließen", ✕ und Klick auf den Hintergrund schließen das Overlay. Implementiert Focus-Trap und Fokus-Rückgabe.
- **Overlay `z-index`:** Alle `.overlay`-Elemente verwenden `z-index: 2000` — damit liegen Modals stets über der Undo-Snackbar (`z-index: 1000`) und dem Update-Banner (`z-index: 1000`).
- **`.sub-nav`** (innerhalb der Info-View) — kleine Unter-Navigation mit zwei `.sub-nav-btn`-Buttons („Info" / „Statistik"), die zwischen den beiden Sub-Views der Info-View umschaltet. Nur in der Info-View sichtbar.
- **`.wappen-emblem`** — das Guttauer Wappen, eingefügt durch `renderInfoView()` als `<img class="wappen-emblem" src="wappen-512.png" onerror="this.style.display='none'">`. Wird oben in der Info-Box platziert (über dem Titel), ist ~120 px hoch auf Smartphones / ~140 px auf breiten Bildschirmen, zentriert, mit CSS-Drop-Shadow. Funktioniert in beiden Farbthemen. Der `onerror`-Handler blendet das Bild aus, wenn die PNG-Datei nicht geladen werden kann. Die PNG-Datei `wappen-512.png` ist im Service-Worker-Cache (`ASSETS`) hinterlegt — daher offline verfügbar.
- **`<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,…">`** (im `<head>`) — SVG-Favicon: vereinfachtes Schild (gelb `#FBE324`, dunkle Kontur `#16313B`) mit einem fetten „€"-Overlay, das an das Guttauer Wappen erinnert und bei kleinen Größen lesbar bleibt. Das `apple-touch-icon` (icon-192.png) bleibt für den iOS-Homescreen erhalten.
- **`.update-banner`** — Fix-positioniertes Banner (unten, `z-index: 1000`), das erscheint, wenn der Service Worker eine neue Version gefunden hat. Zeigt „Neue Version verfügbar." und einen Button „Neu laden", der `postMessage('skipWaiting')` an den wartenden SW sendet und danach die Seite neu lädt. Wird per `showUpdateBanner()` aus dem `updatefound`-Listener erzeugt; ein `controllerchange`-Listener lädt die Seite einmalig neu, sobald der neue SW die Kontrolle übernimmt. Die Seite merkt sich `hadController = !!navigator.serviceWorker.controller` vor dem Laden; der `controllerchange`-Listener gibt bei Erstinstallation (kein vorheriger Controller) frühzeitig zurück — so wird bei der allerersten Installation kein sofortiges Reload ausgelöst.
- **`.undo-snackbar`** (`#undoSnackbar`) — Fix-positionierte Snackbar (`role="status"`, `aria-live="polite"`, über der Summen-Leiste), die nach dem Entfernen einer Position angezeigt wird. Zeigt „„Name" entfernt" und einen „Rückgängig"-Button, der die Position an ihrer ursprünglichen Stelle wiederherstellt. Verschwindet nach ~4,5 s automatisch. Wird von `showUndoSnackbar(removedItem, originalIndex)` erzeugt; ruft zunächst `dismissUndoSnackbar()` auf, um eine ggf. noch sichtbare vorherige Snackbar zu entfernen.

#### Einstellungen-View (`.settings-box`)

Wird durch Klick auf das ⚙-Icon geöffnet (`currentView = 'settings'`). Aufgebaut von `renderSettingsView()` in `#productList`. Alle Toggle-Zeilen werden über den internen Helfer **`addToggleRow(labelText, checked, onChange, hint, id)`** erzeugt: Label links (`.settings-label`, `flex: 1`), Toggle-Switch rechts (`.switch`/`.slider`) — iOS-Standard-Layout (`justify-content: space-between`). Der optionale `hint`-Parameter fügt eine `.settings-hint`-Zeile darunter ein. Der `id`-Parameter liefert einen deterministischen Label-ID-Prefix (`'settings-label-' + id`); Aufrufer übergeben `'theme'` bzw. `'pfand'` — kein `Math.random()` mehr.

Gruppen in der Einstellungen-View:

- **Gruppe „Darstellung"** (`.settings-group-label`):
  - **„Dunkler Modus"** (Toggle) — gebunden an `getTheme()` / `setTheme()`. Hint: „Abends in der Bar dunkel, tagsüber draußen hell."
- **Gruppe „Kasse"** (`.settings-group-label`):
  - **„Pfand berechnen"** (Toggle) — steuert `pfandBerechnen`. Umschalten ruft `applyPfandToCart()` — bereits vorhandene Warenkorb-Positionen werden sofort aktualisiert. Hint: „Schlägt beim Antippen automatisch das Becher-Pfand auf."
- **Für jeden Block-Tab** (`Bier`, `Essen`): ein **`.settings-group-label`** (z. B. „Bier-Bereich" / „Essensstand") gefolgt von einer **`.settings-hint`**-Zeile (aus `BLOCK_TABS[tab].note`), dem **segmentierten Steuerelement** (`.segmented` / `.segmented-btn`, aktiver Block erhält Klasse `active`) und einer **`.settings-block-desc`**-Zeile, die den aktuell gewählten Block beschreibt (aus `BLOCK_TABS[tab].blockDesc[activeBlock]`). Klick auf einen `.segmented-btn` ruft `setActiveBlock(tab, block)` und rendert neu.

Der Pfand-Rückgabe-Button (`#pfandMinusBtn`) wird ausgeblendet, sobald die aktuelle Produktliste keine Pfand-Produkte enthält (z. B. Block „Badewannenrennen" oder alle Essen-Blöcke) oder wenn eine Nicht-Produkt-View aktiv ist.

### Zentrale Datenstruktur: `PRODUKTE`

Das Objekt `PRODUKTE` (oben im `<script>`) ist die **einzige Stelle, an der
Produkte/Preise gepflegt werden**. Es enthält ausschließlich verkaufbare Kategorien —
Info und Einstellungen sind eigene Views, keine Einträge in `PRODUKTE`.

```js
const PRODUKTE = {
  "Bar":  [ { name, preis, pfand }, ... ],   // flaches Array
  "Bier": {                                   // Block-Tab (Objekt mit Unterblöcken)
    "Bierwagen":       [ { name, preis, pfand }, ... ],
    "Badewannenrennen":[ { name, preis, pfand }, ... ],
  },
  "Essen": {                                  // Block-Tab (Objekt mit Unterblöcken)
    "Bratbude":   [ { name, preis, pfand }, ... ],
    "Crepe-Bude": [ { name, preis, pfand }, ... ],
  },
};
```

**Zwei Formen pro Kategorie sind möglich:**

1. **Array** → einfache Produktliste (z. B. `Bar`).
2. **Block-Tab (Objekt mit Unterblöcken)** → mehrere benannte Blöcke, von denen jeweils
   einer angezeigt wird. Welche Tabs als Block-Tabs gelten, legt `BLOCK_TABS` fest.

Produktfelder:
- `name` (String) — Anzeigename auf dem Button.
- `preis` (Number) — Preis in Euro.
- `pfand` (Number) — Pfand in Euro pro Produkt (`0.0`, wenn kein Pfand anfällt).
  Pfand ist **rein produktbasiert** — kein globaler Pfand-Betrag pro Kategorie.

`TAB_CLASS` ordnet jeder Kategorie eine CSS-Klasse für die Tab-Farbe zu
(`tab-bar`, `tab-bier`, `tab-essen`). Beim Anlegen einer neuen Kategorie
ggf. hier eine Farbe ergänzen, sonst bleibt der Tab grau/neutral.

#### Block-Tab-Konfiguration: `BLOCK_TABS`

```js
const BLOCK_TABS = {
  "Bier":  {
    label: "Bier-Bereich",  defaultBlock: "Bierwagen",
    blocks: ["Bierwagen", "Badewannenrennen"],
    note: "Zwei Ausschank-Bereiche mit eigener Karte.",
    blockDesc: {
      "Bierwagen":        "Mit Pfand (2,00 € je Becher).",
      "Badewannenrennen": "Ohne Pfand – eigene Getränkeauswahl.",
    },
  },
  "Essen": {
    label: "Essensstand",   defaultBlock: "Bratbude",
    blocks: ["Bratbude",  "Crepe-Bude"],
    note: "Zwei Stände – kein Pfand.",
    blockDesc: {
      "Bratbude":   "Herzhaft: Bratwurst, Steak, Pommes …",
      "Crepe-Bude": "Süß: Crepes, Waffeln, Zuckerwatte.",
    },
  },
};
```

`BLOCK_TABS` beschreibt, welche Kategorien Block-Tabs sind, wie ihr Label in
den Einstellungen lautet, welcher Block beim Start aktiv ist (`defaultBlock`)
und welche Blöcke existieren. Die Felder **`note`** (kurze Hinweiszeile, in der
Einstellungen-View als `.settings-hint` angezeigt) und **`blockDesc`** (Map
Blockname → Kurzbeschreibung, angezeigt als `.settings-block-desc` unter dem
Segmented-Control) wurden in v9 ergänzt. Der aktuell angezeigte Block je Tab
wird in `activeBlock` gespeichert.

#### Aktuelle Produktdaten

**Bar** (flaches Array — Pfand 2,00 € je Produkt, außer Pullchen):

| Name | Preis | Pfand |
|------|------:|------:|
| Glas Sekt / Fruchtsecco 0,1l | 2,00 € | 2,00 € |
| Schoppen Wein 0,1l | 2,00 € | 2,00 € |
| Flasche Wein / Sekt / Fruchtsecco | 10,00 € | 2,00 € |
| Desperados | 4,00 € | 2,00 € |
| alkoholfrei 0,4l | 2,50 € | 2,00 € |
| alkoholfrei 0,2l | 1,50 € | 2,00 € |
| alkoholfrei Flasche | 6,00 € | 2,00 € |
| Mixgetränke | 6,00 € | 2,00 € |
| Cocktails | 6,00 € | 2,00 € |
| Cocktails (alkoholfrei) | 4,00 € | 2,00 € |
| Pullchen | 2,50 € | 0,00 € |

**Bier → Block „Bierwagen"** (Pfand 2,00 € je Produkt, außer Pullchen):

| Name | Preis | Pfand |
|------|------:|------:|
| Bier / Radler 0,4l | 3,50 € | 2,00 € |
| Bier / Radler 0,25l | 2,50 € | 2,00 € |
| alkoholfrei 0,4l | 2,50 € | 2,00 € |
| alkoholfrei 0,2l | 1,50 € | 2,00 € |
| alkoholfrei Flasche | 6,00 € | 2,00 € |
| Pullchen | 2,50 € | 0,00 € |

**Bier → Block „Badewannenrennen"** (kein Pfand):

| Name | Preis | Pfand |
|------|------:|------:|
| Bier / Radler 0,4l | 3,50 € | 0,00 € |
| Bier / Radler 0,2l | 2,00 € | 0,00 € |
| Wein / Sekt / Fruchtsecco 0,2l | 3,00 € | 0,00 € |
| alkoholfrei 0,4l | 2,50 € | 0,00 € |
| alkoholfrei 0,2l | 1,50 € | 0,00 € |

**Essen → Block „Bratbude"** (kein Pfand):

| Name | Preis |
|------|------:|
| Bratwurst mit Brötchen | 3,50 € |
| Steak mit Brötchen | 4,50 € |
| Spieß mit Brötchen | 4,50 € |
| Hotdog | 3,00 € |
| Pommes | 2,50 € |
| Fischsemmel | 3,50 € |
| Frühlingsrolle 2 Stück | 3,50 € |
| Frühlingsrolle 3 Stück | 5,00 € |

**Essen → Block „Crepe-Bude"** (kein Pfand):

| Name | Preis |
|------|------:|
| Crepes Puderzucker | 2,50 € |
| Crepes Nutella / Apfelmus | 3,50 € |
| Crepes mit Käse | 3,50 € |
| Crepes mit Käse & Schinken | 4,00 € |
| Waffel Zimt / Zucker | 3,00 € |
| Waffel Nutella / Apfelmus | 4,00 € |
| Zuckerwatte | 2,00 € |

### Wichtige State-Variablen

| Variable       | Bedeutung                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------- |
| `currentView`  | aktive Haupt-View: `'products'` (Standard) \| `'info'` \| `'settings'`                      |
| `currentTab`   | aktuell gewählte Produkt-Kategorie (Default: erste Kategorie in `PRODUKTE`)                  |
| `cart`         | Array der Bestellungs-Positionen                                                             |
| `pfandBerechnen` | ob Pfand auf Produkte aufgeschlagen wird (Toggle in Einstellungen, Default `true`)         |
| `activeBlock`  | je Block-Tab der aktuell angezeigte Unterblock, z. B. `{ Bier: 'Bierwagen', Essen: 'Bratbude' }` |
| `infoView`     | aktive Sub-View der Info-View: `'info'` (Standard) oder `'statistik'`                       |
| `currentTheme` | aktives Farbthema: `'dark'` (Standard) \| `'light'`; gesetzt durch `loadThemePreference()` beim Start |
| `changeMode`   | aktueller Modus des Wechselgeld-Overlays: `'positive'` \| `'zero'` \| `'payout'`; wird in `openChangeOverlay()` gesetzt; der „Fertig"-Guard prüft `changeMode === 'positive'` |

Konstante **`THEME_STORAGE_KEY = 'kassenTheme'`** — `localStorage`-Schlüssel für die Theme-Präferenz.

Konstante **`TAB_HEADING`** — ordnet flachen Tabs einen optionalen Überschriften-Text zu (z. B. `{ "Bar": "Getränke" }`); Block-Tabs verwenden stattdessen den Blocknamen als Überschrift.

`cart`-Einträge haben die Form
`{ name, preis, pfand, pfandOriginal?, isPfandAbzug? }`. Das Feld `pfandOriginal`
speichert den Pfand-Wert aus den Produktdaten und wird von `applyPfandToCart()`
genutzt, um Pfand für bereits vorhandene Positionen nachträglich zu aktualisieren.
Der Pfand-Rückgabe-Eintrag nutzt `preis: -PFAND_RUECKGABE_EURO` und `isPfandAbzug: true`
(kein `pfandOriginal`, wird von `applyPfandToCart()` übersprungen).

### Pfand-Schalter und Block-Auswahl (Einstellungen-View)

Ab v8 leben **alle Umschalter** in der Einstellungen-View (`currentView = 'settings'`),
erreichbar über das ⚙-Icon:

- **„Pfand berechnen"** (Toggle-Switch) — steuert `pfandBerechnen`. Umschalten
  ruft `applyPfandToCart()`, sodass bereits im Warenkorb liegende Positionen
  sofort aktualisiert werden (`pfand = pfandBerechnen ? (item.pfandOriginal||0) : 0`).
  Die manuelle Pfand-Rückgabe (`isPfandAbzug`) bleibt dabei unberührt.
  `addToCart(p)` ist die **einzige** Stelle, die beim Hinzufügen über Pfand entscheidet
  (kein `includePfand`/`showPfand`-Argument mehr).
- **Block-Auswahl je Tab** (segmentierte Buttons, `.segmented`/`.segmented-btn`) —
  für jeden Block-Tab (Bier, Essen) ein eigenes Segment-Steuerelement. Klick ruft
  `setActiveBlock(tab, blockName)`. Der Pfand-Rückgabe-Button (`#pfandMinusBtn`)
  wird ausgeblendet, sobald die aktuelle Produktliste keine Pfand-Produkte enthält
  (z. B. Block „Badewannenrennen" oder alle Essen-Blöcke) oder wenn eine
  Nicht-Produkt-View aktiv ist.

### Die Info-View

Erreichbar über das **ℹ-Icon** in der Tab-Leiste (`currentView = 'info'`). Aufgebaut
von `renderInfoView()` in `#productList`. Die rechte Spalte (`#rightCol`) ist dabei
ausgeblendet, `.left` nimmt die volle Breite ein.

- Zeigt eine Sub-Navigation (`.sub-nav`) mit zwei `.sub-nav-btn`-Buttons „Info" und
  „Statistik". Klick setzt `infoView` und rendert neu.
- Bei `infoView === 'info'`: eine `.info-box` aus `INFO_TAB` mit dem **Guttauer Wappen** (`.wappen-emblem`) ganz oben — als `<img src="wappen-512.png" onerror="this.style.display='none'">` — sowie Titel
  (`.info-box-title`), Absätzen (`.info-box-text`) und
  Zwischenüberschriften (`.info-box-subtitle`).
- Bei `infoView === 'statistik'`: das Statistik-Panel (siehe [Statistik](#statistik)).

Inhalt des Info-Reiters kommt aus der Konstante **`INFO_TAB`**:
- `titel` (String) — aktuell `"Guttauer Dorf- und Teichfest 2026"`.
- `absaetze` (Array) — jeder Eintrag ist entweder ein **String** (Absatz) oder ein
  **Objekt `{ ueberschrift: "…" }`** (Zwischenüberschrift).

> **Reihenfolge der Konstanten:** `INFO_TAB` referenziert `PFAND_RUECKGABE_EURO`
> (und ggf. weitere Konstanten). Diese Konstanten müssen deshalb **vor** `INFO_TAB`
> im Quellcode deklariert sein, um einen Temporal-Dead-Zone-ReferenceError zu
> vermeiden.

> Inhalt ändern → `INFO_TAB` in `index.html` editieren (`titel`, `absaetze`).

### Layout / Responsivität

Das Layout ist **mobile-first zweispaltig** — auch im Hochformat:

- **Hochformat / Standard (mobile-first):** `.main` ist `flex-direction: row`.
  Produkte links (`.left`, `flex: 1.1 1 0`, ca. 52–53 %), Warenkorb rechts
  (`#rightCol`, `flex: 1 1 0`, ca. 47–48 %); beide haben `min-width: 0`, damit
  die Flex-Ratio greift. Beide Spalten scrollen **intern** (`overflow-y: auto`);
  kein Seiten-Scroll. `#app` ist `position: fixed; inset: 0` (inkl. Safe-Area-Padding),
  damit iOS keine Scroll-Bounce außerhalb erzeugt.
  - **Produkt-Buttons:** Im schmalen Hochformat-Grid (`grid-template-columns: 1fr`)
    gestapelt — eine Spalte, um den engen `.left`-Bereich zu nutzen.
  - **Warenkorb-Zeilen:** Im Hochformat gestapelt — `.cart-item` ist
    `flex-direction: column`. `.cart-item-top` (Name + Pfand-Subzeile, volle Breite,
    Word-Wrap normal) oben, `.cart-item-bottom` (Preis + ✕-Button) darunter.
  - **`.cart-controls`-Leiste** („Leeren" + Gesamt) ist `flex: none` am Ende der
    rechten Spalte und dadurch **immer sichtbar** (kein Sticky-Hack nötig).

- **Querformat / ≥ 700 px (`@media (min-width: 700px), (orientation: landscape)`):**
  - `.left` bekommt `flex: 1.3 1 0`.
  - Produktgitter wechselt auf `repeat(auto-fill, minmax(150px, 1fr))` (mehrspaltiger Grid).
  - Produkt-Buttons werden größer (`min-height: 96px`, Schrift 19 px, Padding 22 px × 14 px).
  - Warenkorb-Zeilen werden wieder einzeilig: `.cart-item` wechselt auf
    `flex-direction: row` (Name | Preis | ✕ in einer Zeile).

- **≥ 1024 px:** Produkt-Buttons noch größer (`min-height: 116px`, Schrift 21 px,
  `border-radius: 16px`); Grid **maximal 3 Spalten** (`grid-template-columns: repeat(3, 1fr)`) — die Buttons strecken sich auf die volle verfügbare Breite, es erscheinen nie mehr als 3 Spalten. Auf Smartphones im Hochformat bleibt es bei einer Spalte.

- **Gleiche Button-Höhe:** `.product-grid-inner` nutzt `grid-auto-rows: 1fr` und
  `.product-btn` hat `height: 100%` — alle Produkt-Buttons in einem Grid sind
  gleich hoch (bestimmt durch den höchsten Button). `min-height` dient als Untergrenze.

- **Hell/Dunkel-Theme und WCAG-AA-Farben:** Alle Farben werden über CSS-Variablen gesteuert, die pro Theme definiert sind: `:root, :root[data-theme="dark"] { … }` (dunkle Palette: `--bg #10181b`, `--card-bg #1c272b`, `--text #f2f2f7` u. a.) und `:root[data-theme="light"] { … }` (helle Palette: `--bg #f2f2f7`, `--card-bg #ffffff`, `--text #111111` u. a.). Beide Themes sind WCAG-AA-konform — dunkel für den Barbetrieb am Abend, hell für den Außeneinsatz in der Sonne. Kategorie-Button-Farben (Bar: Orange-Familie, Bier: Grün-Familie, Essen: Grau/Blau-Familie) sind je Theme fein abgestimmt; die gemeinsamen CSS-Variablen `--orange`/`--green`/`--purple` werden von Toggle, Summen-Leiste, `.btn-done` und `.change-result.positive` genutzt. Pro Theme sind zusätzlich Tönung-Variablen definiert: `--green-tint`, `--green-border`, `--red-tint`, `--red-border`, `--orange-tint` — sie ersetzen zuvor hartcodierte `rgba`-Werte in `.stat-card-full`, `.stat-card-negative`, `.change-result.positive/.negative`, `.overlay-confirm-hint` und `.stats-reminder`, sodass alle Farbzustände in beiden Themes lesbar sind.

- **Theme-Wechsel (v10):** `applyTheme()` erzwingt nach dem Setzen von `data-theme` einen synchronen Reflow (`void document.documentElement.offsetHeight`), damit der Theme-Wechsel sofort neu gezeichnet wird. Im `<head>` stehen zwei media-gesteuerte `<meta name="theme-color">`-Tags (dunkel `#10181b` für `prefers-color-scheme: dark`, hell `#f2f2f7` für `light`); `applyTheme()` aktualisiert sie via `querySelectorAll` — so bleibt die Statusleistenfarbe auch beim Laufzeit-Toggle korrekt.

- **iOS/Android-Design-Pass (v9):** CSS entspricht dem iOS Human Interface Guidelines- und Material Design 3-Standard: System-Fontstack (`system-ui, -apple-system, …`), einheitliche Typskala, Touch-Targets ≥ 44 px / 48 px, konsistente Abstands-Skala, subtile Elevation/Oberflächen, schnelle zweckmäßige Übergänge (~150–200 ms). `@media (prefers-reduced-motion: reduce)` deaktiviert nicht-essentielle Animationen. iOS-Style-Switch und Segmented-Control sind poliert.

- **Info- und Einstellungen-View:** `#rightCol` wird per Inline-Style auf `display: none`
  gesetzt (`updateLayoutForView()`), sodass die gesamte rechte Seite verborgen ist.
  `.left` wird auf volle Breite ausgedehnt (`flex: 1 1 100%`).

- **Pfand-Rückgabe-Button:** Sitzt direkt unter dem Produktgitter (`.product-grid`
  ist `flex: none`) — kein toter Leerraum.

- **Bestellungs-Liste (`#cart`):** `flex: 1 1 0` — füllt den verfügbaren Platz
  und scrollt intern, wenn mehr Positionen vorhanden sind als angezeigt werden können.

### Render-Funktionen

- **`renderApp()`** — zentrale Re-Render-Funktion: ruft `renderTabs()` +
  `renderContent()` + `updateLayoutForView()` + `updatePfandButtonVisibility()`.
  Jede State-Änderung (Tab-Wechsel, View-Wechsel, Block-Auswahl) ruft `renderApp()`.
- **`renderTabs()`** — baut die Produkt-Tab-Buttons (aus `PRODUKTE`-Schlüsseln,
  mit Kategoriefarbe und `active`-Markierung) sowie die zwei Icon-Buttons
  (ℹ / ⚙) am rechten Rand. Klick auf einen Produkt-Tab setzt `currentView='products'`
  und `currentTab`; Klick auf ℹ/⚙ setzt `currentView` entsprechend.
  `active` wird einem Produkt-Tab **nur** gesetzt, wenn `currentView === 'products'` — in der Info- oder Einstellungen-View ist kein Produkt-Tab hervorgehoben; stattdessen erhält das zugehörige Icon-Btn die Klasse.
- **`renderContent()`** — Dispatcher: bei `currentView === 'info'` → `renderInfoView()`;
  bei `currentView === 'settings'` → `renderSettingsView()`; sonst → `renderProductTab()`.
- **`renderProductTab()`** — rendert die Produkte des aktuellen Tabs in `#productList`:
  - Setzt `productListEl.setAttribute('data-tab', TAB_CLASS[currentTab])` für
    kategoriebasierte Button-Farben per CSS.
  - **Array** → ein einfaches Grid (`product-grid-inner`) mit einer `.block-heading`-Überschrift aus `TAB_HEADING[currentTab]` (z. B. „Getränke" für Bar).
  - **Block-Tab** (`isBlockTab(currentTab)` → wahr) → zeigt nur den via `getActiveBlock()`
    ermittelten Block mit einer `.block-heading`-Überschrift.
  - **Generisches Objekt** (kein Block-Tab-Eintrag in `BLOCK_TABS`) → alle Unterblöcke
    nacheinander, jeweils mit Überschrift.
- **`renderInfoView()`** — baut in `#productList` die Sub-Navigation (`.sub-nav`)
  und je nach `infoView` die Info-Box aus `INFO_TAB` oder das Statistik-Panel.
  Bei der Info-Box wird das Guttauer Wappen als `.wappen-emblem`
  (`<img src="wappen-512.png" onerror="this.style.display='none'">`) ganz oben (vor dem Titel) eingefügt.
- **`renderSettingsView()`** — baut in `#productList` die `.settings-box` mit
  Darstellungs-Gruppe (Dunkler-Modus-Toggle via `addToggleRow(..., 'theme')`), Kassen-Gruppe
  (Pfand-Toggle via `addToggleRow(..., 'pfand')`) und segmentierten Block-Steuerelementen für
  jeden Block-Tab (inkl. Hinweiszeile aus `BLOCK_TABS[tab].note` und
  Blockbeschreibung aus `BLOCK_TABS[tab].blockDesc`).
- **`makeProductButton(p)`** — erzeugt einen Produkt-Button; zeigt Name und
  **ausschließlich den Preis** (`formatEuro(p.preis)`) als Sub-Zeile. Pfand wird
  stattdessen im Warenkorb als „inkl. X,XX € Pfand"-Subzeile ausgewiesen.
  `onclick` ist direkt `addToCart(p)` — kein `showPfand`-Argument mehr.
- **`isBlockTab(tab)`** — gibt `true` zurück, wenn `BLOCK_TABS[tab]` existiert
  und `PRODUKTE[tab]` ein nicht-Array-Objekt ist.
- **`getActiveBlock(tab)`** — gibt den aktuell aktiven Block für einen Block-Tab zurück;
  fällt auf `BLOCK_TABS[tab].defaultBlock` oder den ersten Block zurück, wenn
  `activeBlock[tab]` ungültig ist.
- **`setActiveBlock(tab, blockName)`** — setzt `activeBlock[tab]`, wenn `blockName`
  in `PRODUKTE[tab]` existiert.
- **`currentProductList()`** — gibt die aktuell sichtbare Produktliste zurück:
  flaches Array für `Bar`, oder den aktiven Block für Block-Tabs; nützlich für
  `updatePfandButtonVisibility()`.
- **`updateLayoutForView()`** — blendet `#rightCol` aus und setzt `.left` auf volle
  Breite, wenn `currentView` `'info'` oder `'settings'` ist; stellt normales
  Zwei-Spalten-Layout für `'products'` wieder her.
- **`updatePfandButtonVisibility()`** — zeigt `#pfandMinusBtn` nur, wenn
  `currentView === 'products'` **und** `currentProductList().some(p => p.pfand > 0)`.
  Versteckt den Button für Blöcke ohne Pfand (z. B. „Badewannenrennen", alle Essen-Blöcke)
  und für die Info-/Einstellungen-View.
- **`renderCart()`** — gruppiert identische Positionen zu einer Zeile mit Menge
  (`N× Produktname`), zeigt die Pfand-Subzeile „inkl. X,XX € Pfand / Stück" bei Menge > 1,
  und berechnet die Zeilensumme als `(Preis + Pfand) × Menge`. Die zugrunde liegende
  `cart`-Liste bleibt unverändert. Ruft `updateTotal()` und `persistCart()`. Zeilenbeträge
  in Cent via `formatCents()`.
- **`updateTotal()`** — aktualisiert die Summen-Leiste; Betrag intern in Cent
  via `getCurrentTotalCents()`, Anzeige über `formatCents()`.

### Warenkorb-Aktionen

- **`addToCart(p)`** — fügt Produkt hinzu; ist die **einzige Pfand-Entscheidungsstelle**:
  speichert `pfand: pfandBerechnen ? (p.pfand||0) : 0` und `pfandOriginal: p.pfand||0`
  (damit der Pfand-Toggle auch nachträglich wirken kann). Kein `includePfand`/`showPfand`-Parameter.
- **`addPfandAbzug()`** — fügt „Pfand-Rückgabe" mit `-PFAND_RUECKGABE_EURO`
  hinzu (über `#pfandMinusBtn`, Beschriftung „Pfand zurück -2,00 €"). Der Button hat
  einen ~400 ms **Debounce** gegen versehentliche Doppel-Taps.
- **`applyPfandToCart()`** — iteriert den Warenkorb und setzt für jede Position
  `pfand = pfandBerechnen ? (item.pfandOriginal||0) : 0`; überspringt
  `isPfandAbzug`-Einträge. Wird vom Pfand-Toggle in der Einstellungen-View aufgerufen.
- **`removeOneOfGroup(key)`** — entfernt jeweils **eine** Einheit der angegebenen Gruppe
  (die zuletzt hinzugefügte, d. h. von hinten im Array). Ruft `showUndoSnackbar()` und
  `renderCart()`. Wird vom ✕-Button einer Gruppenzeile im Warenkorb verwendet;
  `aria-label` lautet bei Menge > 1 „Eine Position entfernen".
- **`cartGroupKey(item)`** — Schlüssel zum Gruppieren identischer Positionen:
  `${isPfandAbzug?'A':'P'}|${name}|${toCents(preis)}|${toCents(pfand||0)}`.
  Der **Preis ist Teil des Schlüssels**, damit gleichnamige Produkte aus verschiedenen
  Bereichen mit unterschiedlichem Preis nicht fälschlich zu einer Zeile zusammengefasst werden.
- **`showUndoSnackbar(removedItem, originalIndex)`** — zeigt die Undo-Snackbar
  (`.undo-snackbar`, `#undoSnackbar`) mit „„Name" entfernt" + Button „Rückgängig".
  Ruft zunächst `dismissUndoSnackbar()` auf, um eine ggf. noch sichtbare vorherige Snackbar zu entfernen.
  Klick auf „Rückgängig" fügt die Position an `originalIndex` wieder ein und rendert
  den Warenkorb neu. Verschwindet nach ~4,5 s automatisch.
- **`dismissUndoSnackbar()`** — entfernt die Snackbar sofort aus dem DOM und löscht ihren Timer. Wird am Beginn von `resetCart()`, `openChangeOverlay()`, `openClearOverlay()`, `openStatsResetOverlay()` und `openStatsExportOverlay()` aufgerufen — so kann die Snackbar eine geöffnete Modal-Ebene nie überleben und verhindert das nachträgliche Wiedereinsetzen einer Position nach dem Kassenabschluss.
- **`persistCart()` / `restoreCart()`** — Warenkorb-Sitzungspersistenz über
  `sessionStorage` (Schlüssel `kassenCart`): `renderCart()` ruft `persistCart()`;
  beim Start stellt `restoreCart()` den Warenkorb der laufenden Sitzung wieder her
  (überlebt App-Wechsel / kurzes Wegswitchen, **nicht** einen vollständigen App-Kill).
  `restoreCart()` leitet jeden geladenen Eintrag durch **`normalizeCartItem(it)`**, das
  Felder validiert und coerct (ungültige `preis`/`name`-Werte werden verworfen, `pfand`
  erhält einen Standardwert, `pfandOriginal` wird abgeleitet, `isPfandAbzug` bleibt erhalten) — beschädigte Einträge werden herausgefiltert.
- **`resetCart()`** — leert den Warenkorb (nach Abschluss oder „Leeren").
  Der „Leeren"-Button (`#neuBtn`) öffnet bei nicht-leerem Warenkorb das
  **`#clearOverlay`**-Bestätigungs-Dialog (h2 „Bestellung leeren?", grauer
  „Abbrechen"-Button und roter „Leeren"-Button). Ist der Warenkorb bereits leer,
  wird `resetCart()` direkt ausgelöst — ohne Dialog.

### Wechselgeld-Overlay

Öffnet beim Tippen auf die **Summen-Leiste** (`#totalBar` →
`openChangeOverlay()`); `#totalBar` hat `role=button` und `tabindex=0` und reagiert zusätzlich auf Enter/Space per Keydown-Listener (Tastaturzugänglichkeit). Das Overlay öffnet **nicht**, wenn der Warenkorb leer
ist (`cart.length === 0` → sofortiger `return`). Für nicht-leere Warenkörbe
gibt es drei Fälle, die jeweils `changeMode` setzen (`'positive'` | `'zero'` | `'payout'`):

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
    verwendet das Regex `/^\d{1,9}([.,]\d{1,2})?$/` — lehnt wissenschaftliche Notation,
    mehrfache Trenner, Buchstaben und mehr als 2 Nachkommastellen ab;
    gibt Integer-Cent oder `null` zurück). `Rückgeld = Erhalten − Total` in Cent; zeigt „Rückgeld" (positiv)
    oder „Fehlt" (negativ).
- **Negativer Gesamtbetrag (Auszahlungs-Modus):** Tritt auf, wenn mehr Pfand
  zurückgegeben wurde als Produkte gekauft wurden. Das Overlay öffnet im
  Auszahlungs-Modus: `#overlayTotalLabel` zeigt „Auszahlung an Kunde",
  `#overlayTotal` den **Absolutbetrag**, `#overlayInputWrap` und `#quickAmounts`
  werden ausgeblendet (`style.display = 'none'`), und `#changeResult` zeigt
  „Bitte X,XX € an Kunde auszahlen" (Klasse `change-result negative`).

- **„Fertig" (`#overlayDoneBtn`)** — Verhalten je nach Modus:
  - **Normaler Kassiermodus (`changeMode === 'positive'`):** Schließt erst ab, wenn `parseEuroCents(receivedInput.value) !== null` **und** der eingegebene Betrag ≥ Gesamtbetrag ist. Ist diese Bedingung nicht erfüllt, bleibt das Overlay offen, `#changeResult` zeigt „Bitte ausreichenden Betrag eingeben." (Klasse `change-result negative`) und der Fokus kehrt ins Eingabefeld zurück. Verhindert versehentliches Buchen bei „Fehlt …" oder leerem Feld.
  - **0-€-Modus und Auszahlungs-Modus (`changeMode === 'zero'` / `'payout'`, Eingabefeld ausgeblendet):** „Fertig" ist jederzeit abschließbar — kein Guard.
  - Bei erfolgreichem Abschluss: `recordSale()` (Statistik-Aufzeichnung) → `closeChangeOverlay()` → `resetCart()`. Jede so abgeschlossene Bestellung wird in der Statistik gezählt — unabhängig vom Betrag.
- Schließen ohne Reset: „✕" oben rechts oder Klick auf den abgedunkelten
  Hintergrund. Das Overlay implementiert einen **Focus-Trap** (Tab/Shift+Tab kreist innerhalb der `.overlay-card`) und gibt den Fokus beim Schließen an das auslösende Element zurück.

### Statistik

Die App erfasst **dauerhaft** (per `localStorage`) Verkaufsstatistiken über
alle abgeschlossenen Bestellungen. Im privaten Modus (z. B. iOS Safari) fällt
sie auf einen In-Memory-Betrieb zurück — kein Absturz, aber Daten gehen beim
Schließen verloren; der Export-Button ermöglicht dann die manuelle Sicherung.

#### Datenschicht

- **Speicherschlüssel:** `kassenStatistik` (Konstante `STATS_STORAGE_KEY`),
  Schemaversion `STATS_VERSION = 1`.
- **In-Memory-Fallback:** `let memoryStats` — `saveStats(stats)` hält die Stats **immer** auch in `memoryStats` (vor dem `localStorage`-Schreibversuch). Schlägt das Schreiben fehl (privater Modus / Speicher voll), setzt das Modul-Flag `statsUseMemory = true`; danach gibt `loadStats()` direkt `normalizeStats(memoryStats)` zurück — so bleibt die In-Memory-Kopie für die gesamte Sitzung autoritativ und es kommt zu keinem stillen Datenverlust. `loadStats()` nutzt `memoryStats` auch als Fallback, wenn `localStorage` leer oder nicht lesbar ist.
- **Defensive Normalisierung:** `toIntSafe(value)` = `Math.round(Number(value))` → endliche Ganzzahl, sonst `0`. `normalizeStats(data)` coerct alle Zahlfelder (`einnahmenCents`, `pfandEinnahmenCents`, `ausgabenCents`, `bons`) und jeden `produkte`-Eintrag zu `{ name, preisCents, anzahl, umsatzCents }` via `toIntSafe`; das `produkte`-Objekt wird mit `Object.create(null)` angelegt (prototype-pollution-sicher) und ist abwärtskompatibel mit alten name-only-Schlüsseln. `loadStats()` leitet geladene Daten durch `normalizeStats` — verhindert String-Konkatenation / NaN aus beschädigten `localStorage`-Daten.
- **Datenform:**
  ```js
  {
    version,
    produkte: { "<name>|<preisCents>": { name, preisCents, anzahl, umsatzCents } },
    einnahmenCents,        // Produktumsatz: Summe aller Produktpreise (ohne Pfand)
    pfandEinnahmenCents,   // Pfand eingenommen: Summe der beim Verkauf aufgeschlagenen Pfandbeträge
    ausgabenCents,         // Pfand ausgezahlt: Summe aller Pfand-Rückgaben (positive Cent)
    bons                   // Anzahl abgeschlossener Bestellungen
  }
  ```
  - `produkte`: Schlüssel ist `name + '|' + preisCents` (damit gleichnamige Produkte mit unterschiedlichem Preis getrennt gezählt werden); jeder Eintrag enthält `name` (Anzeigename), `preisCents`, Verkaufsanzahl (`anzahl`) und Umsatz in Cent (`umsatzCents` = Anzahl × Preis, **ohne** Pfand-Anteil). Abwärtskompatibel mit alten name-only-Schlüsseln.
  - `einnahmenCents`: Summe der Produktpreise aller verkauften Positionen
    (**Produktumsatz**, kein Pfand enthalten).
  - `pfandEinnahmenCents`: Summe der beim Abschluss tatsächlich
    aufgeschlagenen Pfandbeträge (`item.pfand`) über alle verkauften Positionen
    (= **Pfand eingenommen**).
  - `ausgabenCents`: Summe aller Pfand-Rückgabe-Beträge (= **Pfand ausgezahlt**,
    positiver Cent-Wert).
  - `bons`: Zähler abgeschlossener Bestellungen.

#### Funktionen

| Funktion | Beschreibung |
| -------- | ------------ |
| `emptyStats()` | Liefert ein frisch genulltes Stats-Objekt (inkl. `pfandEinnahmenCents: 0`). |
| `toIntSafe(value)` | `Math.round(Number(value))` → endliche Ganzzahl, sonst `0`. Verhindert String-Konkatenation / NaN aus beschädigten Daten. |
| `normalizeStats(data)` | Coerct alle Zahlfelder sowie jeden `produkte`-Eintrag zu sauberen Typen via `toIntSafe`. Das `produkte`-Objekt wird mit `Object.create(null)` angelegt (prototype-pollution-sicher). Wird von `loadStats()` auf geladene Daten angewendet. |
| `loadStats()` | Liest + parst `localStorage`, leitet Daten durch `normalizeStats`; gibt `emptyStats()` bei Fehler/fehlendem Eintrag zurück. Nutzt `memoryStats` als Fallback, wenn `localStorage` leer oder nicht lesbar ist. |
| `saveStats(stats)` | Hält Stats **immer** in `memoryStats` (vor dem Schreibversuch); persistiert als JSON; gibt `false` zurück bei Fehler (z. B. Storage voll / privater Modus). |
| `statsStorageAvailable()` | Boolean: prüft, ob `localStorage` beschreibbar ist (z. B. `false` im privaten Modus). |
| `statsKassenbestandCents(stats)` | Hilfsfunktion: gibt `einnahmenCents + pfandEinnahmenCents − ausgabenCents` zurück = tatsächlicher Kassenbestand gesamt (Bargeld in der Kasse). Wird von UI und Export verwendet. |
| `recordSale()` | Aufgerufen beim Abschließen einer Bestellung: iteriert den Warenkorb — für jede normale Position (`!isPfandAbzug`) werden `produkte[name+'|'+preisCents].anzahl` und `umsatzCents` sowie `einnahmenCents` inkrementiert und **zusätzlich** `pfandEinnahmenCents += toCents(item.pfand \|\| 0)` akkumuliert; für `isPfandAbzug`-Einträge wird `ausgabenCents` um den Absolutbetrag erhöht; `bons` wird einmalig pro Bestellung hochgezählt. Leerer Warenkorb → kein Bon. |
| `resetStats()` | Persistiert `emptyStats()` (setzt alle Werte auf null). |
| `buildStatsExport(stats)` | Nimmt einen optionalen `stats`-Snapshot (nutzt denselben wie die UI-Anzeige). Gibt einen mehrzeiligen deutschen Zusammenfassungstext zurück: Titelzeile via `INFO_TAB.titel`, dann „Stand: <Datum/Uhrzeit>" (`new Date().toLocaleString('de-DE')`), Produkt-Zeilen **absteigend nach Anzahl** (gleiche Reihenfolge wie UI-Liste), dann „Bestellungen gesamt", „Produktumsatz", „Pfand eingenommen", „Pfand ausgezahlt", „Pfand einbehalten" oder **„Pfand Fehlbetrag"** bei negativem Saldo (`pfandEinnahmenCents − ausgabenCents`), „Kassenbestand gesamt" (`statsKassenbestandCents`). |

#### Auslöser: Wann wird `recordSale()` gerufen?

`recordSale()` wird vom „Fertig"-Button (`#overlayDoneBtn`) im
Wechselgeld-Overlay aufgerufen — **bevor** `closeChangeOverlay()` und
`resetCart()`. Damit wird jede abgeschlossene Bestellung gezählt, unabhängig
vom Gesamtbetrag (auch 0 € und Auszahlungs-Modus).

#### UI (Info-View → Sub-View „Statistik")

Die Statistik ist über das ℹ-Icon und den Sub-Nav-Button „Statistik" erreichbar.
`renderInfoView()` zeigt bei `infoView === 'statistik'` ein Statistik-Panel:

- **Zusammenfassungs-Karten** (`.stats-summary` / `.stat-card`): sechs Karten —
  „Bestellungen" (`bons`), „Produktumsatz" (`formatCents(einnahmenCents)`),
  „Pfand eingenommen" (`formatCents(pfandEinnahmenCents)`), „Pfand ausgezahlt"
  (`formatCents(ausgabenCents)`), „Pfand einbehalten" bzw. **„Pfand Fehlbetrag"**
  (`formatCents(pfandEinnahmenCents − ausgabenCents)`) — bei negativem Saldo (mehr ausgezahlt als
  eingenommen) erscheint das Label „Pfand Fehlbetrag" und die Karte erhält rote Tönung
  (Klasse `.stat-card-negative`) statt verwirrend grün — und **„Kassenbestand gesamt"**
  (`formatCents(statsKassenbestandCents(stats))`) — letztere hervorgehoben: volle
  Breite (CSS-Klasse `.stat-card-full`, `grid-column: 1 / -1`), grün getönter
  Hintergrund, größere Werteschrift. Sie ist die betonte Ergebnis-Kenngröße.
- **„Stand: …"-Zeitstempel** (`.stats-stand`) direkt unter der Überschrift; zeigt `new Date().toLocaleString('de-DE')`.
- **Sicherungs-Hinweis** (`.stats-reminder`): erscheint, wenn Speicher verfügbar **und** `bons > 0` — „Tipp: Statistik regelmäßig per „Export" sichern (z. B. in Notizen)." (iOS kann Speicher nach ~7 Tagen Inaktivität löschen).
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
- **Button „Export":** Öffnet beim Tippen **immer** das Overlay
  `#statsExportOverlay` mit dem Export-Text in einem readonly `<textarea>`
  (so kann der Inhalt gelesen, markiert und kopiert werden) sowie dem Hinweis
  „Zum Sichern markieren & kopieren (z. B. in Notizen)". Der Button
  `#statsExportCopyBtn` „Kopieren" schreibt den Inhalt via
  `navigator.clipboard.writeText` in die Zwischenablage (Fallback: `select` +
  `document.execCommand('copy')`) und zeigt kurz „Kopiert!". „Schließen", ✕
  und Klick auf den Hintergrund schließen das Overlay.
- Alle Stats-UI-Elemente werden über `createElement`/`textContent` erzeugt
  (XSS-sicher, kein `innerHTML` mit ungeprüften Daten).

## PWA / Offline

### manifest.json
- `name: "Dorffest Kasse Guttau"`, deutsche `description`, `lang: "de"`, `dir: "ltr"`, `orientation: "portrait"`, `categories: ["business","utilities","finance"]`.
- `display: "standalone"` → läuft wie eine native App ohne Browser-UI.
- `id`, `scope` und `start_url` sind **relativ** (`"./"` bzw. `"./index.html"`), weil die App von einem GitHub-Pages-Unterpfad (`/dorffest-kassen-app/`) ausgeliefert wird — absolute `"/"` würden dazu führen, dass der Browser eine falsche Scope-Zuordnung vornimmt.
- Theme/Background `#16313b`.
- Icons: Das `icons`-Array enthält je zwei Einträge pro PNG (`icon-192.png`, `icon-512.png`) — einmal mit `purpose: "any"` (Standard) und einmal mit `purpose: "maskable"` (für Android Adaptive Icons, verhindert Letterboxing/Beschnitt). Die Icon-PNGs zeigen das Guttauer Wappen mit rotem €-Overlay auf full-bleed dunkeltealem Hintergrund.
- iOS-spezifisches Verhalten zusätzlich über `<meta>`-Tags in `index.html`
  (`apple-mobile-web-app-capable`, `-status-bar-style`, `-title`,
  `apple-touch-icon`).
- Ein `<meta name="referrer" content="strict-origin-when-cross-origin">` ist
  im `<head>` gesetzt.

### service-worker.js
- **Cache-Name:** `kassensystem-v10`.
- **Installation (gehärtet):** `install` cacht Assets per `Promise.all(ASSETS.map(a => cache.add(a).catch(() => {})))` — ein einzelnes fehlendes Asset bricht den gesamten Install-Vorgang **nicht** mehr ab. `self.skipWaiting()` wird **innerhalb** der `waitUntil`-Promise-Kette aufgerufen (via `.then(() => self.skipWaiting())` nach Abschluss des Cachings) — der SW aktiviert sich also erst, wenn sein Cache vollständig befüllt ist.
- **Message-Handler:** Reagiert auf `postMessage('skipWaiting')` von der Seite (Update-Banner) mit `self.skipWaiting()` — aktiviert den wartenden SW sofort.
- **Aktivierung:** `activate` löscht alte Caches (mit `.catch(() => {})` je Löschvorgang) und ruft `self.clients.claim()` innerhalb der `waitUntil`-Promise-Kette — deterministischer Ablauf.
- **Fetch-Handler (gehärtet):** Verarbeitet ausschließlich **same-origin
  GET-Anfragen**. Navigations-Requests werden aus dem Cache mit
  `./index.html` bedient (mit `.catch`-Fallback auf den Cache, damit kein unbehandeltes Reject entsteht). Nur Assets aus der `ASSETS`-Liste (App-Shell,
  als absolute URLs in `APP_SHELL`) werden gecacht — nach Prüfung auf
  `response.ok && response.type === 'basic'`. Cache-Writes (`cache.put`) nutzen `.catch(() => {})` gegen Storage-voll-Fehler. Cross-Origin-Anfragen,
  Nicht-GET-Methoden und Fehlerantworten werden **nicht** gecacht.
- **App-Shell-Mitgliedschaft:** wird tolerant gegen Query-Strings geprüft — `APP_SHELL.includes(url.href) || APP_SHELL.includes(url.origin + url.pathname)`.
- **Cache-First-Strategie:** Bei `fetch` wird zuerst der Cache geprüft; bei
  Treffer wird dieser geliefert, sonst aus dem Netz geholt und — sofern es
  sich um ein App-Shell-Asset handelt — in den Cache geschrieben (mit `.catch`-Fallback auf Cache-Eintrag bei Netzwerkfehler).
- **Vorab gecachte Assets (`ASSETS`):** `index.html`, `manifest.json`,
  `icon-192.png`, `icon-512.png`, `wappen-192.png`, `wappen-512.png`.
- **Update-Hinweis in der Seite:** `index.html` registriert den SW mit `updatefound`-Listener → zeigt bei installierter neuer Version das Banner `.update-banner` „Neue Version verfügbar. / Neu laden"; ein `controllerchange`-Listener lädt die Seite einmalig neu (verhindert „stale" App auf installierten Geräten). Die Seite merkt sich `hadController = !!navigator.serviceWorker.controller` vor dem Laden; der `controllerchange`-Listener gibt bei Erstinstallation (kein vorheriger Controller) frühzeitig zurück — so wird bei der allerersten Installation kein sofortiges Reload ausgelöst.

> **Cache-Busting beim Deployen:** Da `index.html` aggressiv gecacht wird,
> muss bei Änderungen der **`CACHE_NAME` erhöht** werden (z. B. auf
> `kassensystem-v11`), damit Geräte die neue Version laden. Sonst sehen bereits
> installierte Geräte weiterhin den alten Stand. **Das ist der häufigste
> Stolperstein bei Updates.**

## Häufige Aufgaben

### Produkte/Preise ändern
→ Im Objekt **`PRODUKTE`** in `index.html` editieren. Format einhalten
(`{ name, preis, pfand }`). Pfand ist **pro Produkt** — es gibt keinen Kategorie-weiten
Pfand. Kein Build nötig — Datei speichern, im Browser neu laden.
**`CACHE_NAME` im Service Worker erhöhen**, wenn die Änderung auf installierten
Geräten ankommen soll.

### Den Info-Reiter ändern
→ Info ist jetzt eine **eigene View** (`currentView = 'info'`), kein Eintrag in `PRODUKTE`.
Titel und Inhalte in der Konstante **`INFO_TAB`** in `index.html` anpassen:
- `titel` — Überschrift der Info-Box (String).
- `absaetze` — Array aus Strings (Absatz, `.info-box-text`) und/oder Objekten
  `{ ueberschrift: "…" }` (Zwischenüberschrift, `.info-box-subtitle`).

**Achtung Reihenfolge:** Da `INFO_TAB` die Konstante `PFAND_RUECKGABE_EURO`
referenziert, muss diese **vor** `INFO_TAB` im Quellcode stehen.

### Neue Produkt-Kategorie hinzufügen
1. Schlüssel in `PRODUKTE` ergänzen (flaches Array **oder** Objekt mit Unterblöcken).
2. In `TAB_CLASS` eine Tab-Farbklasse hinterlegen (sonst neutral/grau).
3. Soll die neue Kategorie ein **Block-Tab** sein (d. h. nur ein Block wird
   gleichzeitig angezeigt, Auswahl über die Einstellungen), einen Eintrag in
   **`BLOCK_TABS`** ergänzen mit `label`, `defaultBlock`, `blocks`-Array,
   `note` (Hinweiszeile in den Einstellungen) und `blockDesc` (Beschreibungstexte
   je Block). `isBlockTab()`, `getActiveBlock()`, `setActiveBlock()`, `renderSettingsView()`
   und `renderProductTab()` arbeiten generisch gegen `BLOCK_TABS` — keine
   weiteren Code-Änderungen nötig.

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

- **Warenkorb-Sitzungspersistenz (kein dauerhafter Speicher):** Der Warenkorb wird für die **laufende Sitzung** in `sessionStorage` (Schlüssel `kassenCart`) gesichert und überlebt so App-Wechsel oder kurzes Wegswitchen. Bei vollständigem Schließen / App-Kill ist er weg. Es gibt weiterhin **keine Bon-Historie** — bewusst minimal als reine Kalkulations-/Kassierhilfe. Die **Statistik** (Verkäufe, Umsatz) wird dagegen per `localStorage` (Schlüssel `kassenStatistik`) dauerhaft gespeichert; im privaten Modus (z. B. iOS Safari) fällt die App auf einen In-Memory-Betrieb zurück (kein Absturz, aber die Daten gehen beim Schließen verloren — der Export-Button ermöglicht in diesem Fall die manuelle Sicherung).
- **Pfand ist rein produktbasiert:** Jedes Produkt trägt seinen eigenen `pfand`-Wert.
  Es gibt keinen globalen Tab-Pfand mehr. `addToCart(p)` ist die einzige Stelle, die
  über Pfand entscheidet. Die Einstellungen-View bietet einen globalen „Pfand berechnen"-Toggle,
  der nachträglich auf den gesamten Warenkorb wirkt (`applyPfandToCart()`).
- **Block-Tabs über `BLOCK_TABS` generalisiert:** Die frühere hartcodierte Essen-Logik
  (feste Schlüssel, eigene Toggle-Variable, `isEssenTab()`) wurde durch den
  generischen `BLOCK_TABS`-Mechanismus ersetzt. Neue Block-Tabs werden ausschließlich
  über `BLOCK_TABS` konfiguriert — kein weiterer Code-Eingriff nötig. Aktuell
  registrierte Block-Tabs: **Bier** (Bierwagen / Badewannenrennen) und
  **Essen** (Bratbude / Crepe-Bude).
- **`PFAND_RUECKGABE_EURO` vor `INFO_TAB` deklarieren:** `INFO_TAB` referenziert
  `PFAND_RUECKGABE_EURO` direkt im Initializer. Werden die Konstantenreihenfolgen
  vertauscht, entsteht ein Temporal-Dead-Zone-ReferenceError.
- **Geldbeträge in Cent:** Alle internen Berechnungen (Summen, Wechselgeld,
  Schnellbeträge) laufen in **Integer-Cent** (`toCents()`, `formatCents()`,
  `getCurrentTotalCents()`), um Gleitkomma-Rundungsfehler zu vermeiden. Die
  Anzeige erfolgt ausschließlich im **deutschen Kommaformat** via `formatCents()`
  (z. B. „2,00 €") bzw. `formatEuro()` für Euro-Werte. Die kleinste praktische
  Stückelung beträgt **0,50 €** (50 Cent).
- **Service-Worker-Caching** kann alte Stände „festhalten" → bei Updates
  `CACHE_NAME` erhöhen.
- **Farbthema über `data-theme` und CSS-Variablen:** Das Hell/Dunkel-Theme wird per `data-theme`-Attribut auf `<html>` gesetzt (`'dark'` | `'light'`). Alle Farben sind als CSS-Variablen pro Theme definiert — nie Farben hartcodieren, immer `var(--…)` nutzen. Die Präferenz wird in `localStorage` unter dem Schlüssel `kassenTheme` gespeichert; beim ersten Start folgt die App `prefers-color-scheme`, fällt danach auf `'dark'` zurück.
- **Guttauer Wappen als PNG im Info-Bereich:** Das Wappen liegt als `wappen-192.png` / `wappen-512.png` im Repo. `renderInfoView()` zeigt es als `<img class="wappen-emblem" src="wappen-512.png" onerror="this.style.display='none'">` oben in der Info-Box. Die PNGs sind in der Service-Worker-`ASSETS`-Liste hinterlegt, daher offline verfügbar. Das **Favicon** ist davon getrennt: ein inline-SVG (vereinfachtes Schild + „€") als Data-URI im `<head>`.
- **Undo-Snackbar wird bei Modal-Öffnung und Warenkorb-Reset verworfen:** `dismissUndoSnackbar()` wird zu Beginn von `resetCart()`, `openChangeOverlay()`, `openClearOverlay()`, `openStatsResetOverlay()` und `openStatsExportOverlay()` aufgerufen. Die Snackbar kann dadurch eine laufende Modal-Ebene nie überleben — verhindert, dass eine Position nach Kassenabschluss noch nachträglich wiederhergestellt wird.
- **Statistik-Schlüssel enthält Name und Preis:** `produkte`-Einträge in den gespeicherten Stats werden mit `name + '|' + preisCents` als Schlüssel abgelegt. Gleichnamige Produkte aus verschiedenen Bereichen mit unterschiedlichem Preis werden damit korrekt getrennt gezählt. Alte name-only-Schlüssel bleiben durch `normalizeStats` abwärtskompatibel.
- **Einzeldatei-Architektur:** Alles in `index.html`. Kein Build, keine Module,
  keine Dependencies — Änderungen sind direkt und sofort wirksam.

## Repository-Status

- **Kein Git-Repository** initialisiert (`git rev-parse` meldet „kein
  Git-Repository"). Liegt trotz des Pfads unter `GIT-Repos/` aktuell ohne
  Versionskontrolle vor. Bei Bedarf `git init` ausführen.
- `.DS_Store` (macOS) liegt im Verzeichnis und sollte bei einem späteren
  `git init` via `.gitignore` ausgeschlossen werden.
