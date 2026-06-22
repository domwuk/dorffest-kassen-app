const CACHE_NAME = 'kassensystem-v8';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Fix 2: Per-Asset-Installation – ein fehlgeschlagenes Asset (z. B. 404) bricht
// den gesamten Install nicht mehr ab. Einzelne Fehler werden still ignoriert.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS.map((asset) => cache.add(asset).catch(() => {})))
    )
  );
  self.skipWaiting();
});

// Ermöglicht der Seite, einen wartenden SW sofort zu aktivieren (Update-Banner).
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Fix 3: self.clients.claim() wird innerhalb der waitUntil-Promise-Kette
// aufgerufen, damit die Aktivierung deterministisch abläuft.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

const APP_SHELL = ASSETS.map((asset) => new URL(asset, self.location.href).href);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Nur eigene GET-Requests behandeln; alles andere normal ans Netz.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navigationen (Seitenaufrufe) → App-Shell (index.html), offline-fähig.
  // Fix 4 (Navigation): fetch-Fallback mit .catch, damit ein Offline-Erstaufruf
  // keine unbehandelte Promise-Rejection erzeugt.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) =>
        cached || fetch(request).catch(() => caches.match('./index.html'))
      )
    );
    return;
  }

  // Fix 5: App-Shell-Mitgliedschaft auch bei Query-Strings korrekt prüfen
  // (url.href würde z. B. index.html?v=2 nicht matchen).
  const inShell =
    APP_SHELL.includes(url.href) ||
    APP_SHELL.includes(url.origin + url.pathname);

  // Nur App-Shell-Assets cachen (index.html, manifest.json, icons).
  if (!inShell) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      // Fix 4 (Fetch): Netzwerk-Fetch mit .catch-Fallback, damit Offline-Cache-Miss
      // kein unbehandeltes Reject in respondWith erzeugt.
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            // Fix 4 (Cache-Write): cache.put-Fehler (z. B. Storage voll) werden
            // silent ignoriert und werfen keine unbehandelte Rejection.
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request));
    })
  );
});
