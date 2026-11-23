// Service worker : installation comme application et fonctionnement hors ligne de l'interface.
// À chaque version, toute l'interface (y compris les écrans jamais ouverts) est mise en cache dès l'installation,
// pour que Visibat s'ouvre en réunion sans réseau. Les données (Supabase) ne passent jamais par ce cache :
// Visibat garde ses propres copies sur l'appareil.
const VERSION = '__VERSION_PRECACHE__'
const FICHIERS = __LISTE_PRECACHE__
const CACHE = `batiscope-${VERSION}`
self.addEventListener('install', (e) => e.waitUntil(
  caches.open(CACHE).then((c) => Promise.all(FICHIERS.map((f) => c.add(new Request(f, { cache: 'reload' })).catch(() => undefined))))
    .then(() => self.skipWaiting())))
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim())))
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  // Fichiers versionnés (assets/…) : le cache d'abord, ils ne changent jamais.
  if (url.pathname.includes('/assets/')) {
    e.respondWith(caches.match(e.request, { ignoreVary: true }).then((r) => r || fetch(e.request).then((n) => {
      if (n.ok) { const copie = n.clone(); caches.open(CACHE).then((c) => c.put(e.request, copie)) }
      return n
    })))
    return
  }
  // Le reste (page, icônes) : réseau d'abord, cache en secours.
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copie = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copie)) }
    return r
  }).catch(() => caches.match(e.request, { ignoreSearch: true, ignoreVary: true }).then((r) => r || caches.match(new URL('./', self.registration.scope).href))
    .then((r) => r || caches.match(new URL('./index.html', self.registration.scope).href))))
})
