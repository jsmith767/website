// Recipe Consolidator service worker: lets the installed app open offline.
// Network first, so a fresh deploy is picked up whenever there is a connection;
// the cached copy is only used when the network fails.
const CACHE = 'rc-v3';
const APP_SHELL = [
    './',
    'index.html',
    'rc-app.css',
    'recipe-consolidator.js',
    'rc-plan.js',
    'WholeFoods.json',
    'manifest.webmanifest',
    'icons/icon-192.png',
    '../style.css'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    // Only same-origin files and the icon font; never the recipe server or form endpoints
    const isIconFont = /fontawesome/.test(url.hostname);
    if (url.origin !== self.location.origin && !isIconFont) return;

    event.respondWith(
        fetch(req)
            .then(res => {
                if (res && (res.ok || res.type === 'opaque')) {
                    const copy = res.clone();
                    caches.open(CACHE).then(cache => cache.put(req, copy));
                }
                return res;
            })
            .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
    );
});
