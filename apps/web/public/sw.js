/**
 * Service Worker — School OS
 *
 * Read-only offline cache for key operational views.
 * Strategies:
 *   - Precache: app shell assets, locale bundles, fonts
 *   - Stale-while-revalidate: navigation to cached pages
 *   - Network-first with stale fallback: API GET requests
 *   - Never cache: mutations, auth, PDF render endpoints
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `school-os-static-${CACHE_VERSION}`;
const API_CACHE = `school-os-api-${CACHE_VERSION}`;
const PAGES_CACHE = `school-os-pages-${CACHE_VERSION}`;

/** Max age for stale API cache entries (5 minutes). */
const API_STALE_MAX_AGE_MS = 5 * 60 * 1000;

/** Assets to precache at install time. */
const PRECACHE_URLS = [
  '/manifest.json',
  '/offline.html',
  '/messages/en.json',
  '/messages/ar.json',
];

/** URL path prefixes for cacheable operational views. */
const CACHEABLE_PAGE_PREFIXES = [
  '/en/scheduling',
  '/ar/scheduling',
  '/en/classes',
  '/ar/classes',
  '/en/communications',
  '/ar/communications',
];

/** API GET paths eligible for offline caching. */
const CACHEABLE_API_PREFIXES = [
  '/api/v1/schedules/timetable',
  '/api/v1/classes',
  '/api/v1/announcements',
];

/** Paths that must never be cached. */
const NEVER_CACHE_PREFIXES = [
  '/api/v1/auth',
  '/api/v1/pdf',
];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              key !== STATIC_CACHE &&
              key !== API_CACHE &&
              key !== PAGES_CACHE,
          )
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Never cache auth or PDF endpoints
  if (NEVER_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return;
  }

  // API requests: network-first with stale fallback
  if (url.pathname.startsWith('/api/') && isCacheableApi(url.pathname)) {
    event.respondWith(networkFirstWithStale(request, API_CACHE));
    return;
  }

  // Navigation requests to cacheable pages: stale-while-revalidate
  if (
    request.mode === 'navigate' &&
    isCacheablePage(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(request, PAGES_CACHE));
    return;
  }

  // Static assets (_next/static): cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navigation fallback for non-cached pages when offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html')),
    );
    return;
  }
});

// ─── Caching strategies ───────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Revalidate in background
    networkPromise;
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  return caches.match('/offline.html');
}

async function networkFirstWithStale(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok) {
      // Store with timestamp header for staleness check
      const headers = new Headers(response.headers);
      headers.set('sw-cached-at', String(Date.now()));
      const timedResponse = new Response(await response.clone().blob(), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      cache.put(request, timedResponse);
    }
    return response;
  } catch {
    // Network failed — try cache with staleness check
    const cached = await cache.match(request);
    if (cached) {
      const cachedAt = Number(cached.headers.get('sw-cached-at') || 0);
      if (Date.now() - cachedAt < API_STALE_MAX_AGE_MS) {
        return cached;
      }
      // Stale but still better than nothing when offline
      return cached;
    }
    return new Response(JSON.stringify({ error: { code: 'OFFLINE', message: 'You are offline' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCacheablePage(pathname) {
  return CACHEABLE_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isCacheableApi(pathname) {
  return CACHEABLE_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
