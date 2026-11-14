// Service worker minimal : permet l'installation comme application et garde l'interface
// en cache. Les données (Supabase) ne sont jamais mises en cache.
const CACHE = 'batiscope-v1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim())))
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  // Réseau d'abord, cache en secours (hors connexion : l'interface s'ouvre quand même).
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copie = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copie)) }
    return r
  }).catch(() => caches.match(e.request).then((r) => r || caches.match(self.registration.scope))))
})
