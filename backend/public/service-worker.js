// NOXA Music Service Worker v1.4 - WebP playlist images
const CACHE_VERSION = 'noxa-v1.5';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const AUDIO_CACHE = `${CACHE_VERSION}-audio`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/images/default-artwork.jpg',
  '/images/default-artwork.svg',
  '/images/default-artist.jpg',
  '/images/default-artist.svg',
  // Pre-cache generated playlist artwork (WebP for smaller size)
  '/images/playlists/daily-mix.webp',
  '/images/playlists/recommended.webp',
  '/images/playlists/best-of-rock.webp',
  '/images/playlists/best-of-alternative.webp',
  '/images/playlists/best-of-metal.webp',
  '/images/playlists/best-of-edm.webp',
  '/images/playlists/best-of-dubstep.webp',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.error('[SW] Cache install failed:', err))
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys.filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => {
              console.log('[SW] Removing old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle audio files - cache for offline playback
  if (url.pathname.includes('/api/library/stream/')) {
    event.respondWith(handleAudioRequest(request));
    return;
  }

  // Handle images - cache first, long-term storage
  if (isImageRequest(url)) {
    event.respondWith(handleImageRequest(request));
    return;
  }

  // Handle API requests - network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle static assets - cache first
  event.respondWith(handleStaticRequest(request));
});

// Check if request is for an image
function isImageRequest(url) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico'];
  const imagePaths = ['/images/', '/music_lib/', '/artwork_cache/', '/icons/'];
  
  // Check by extension
  if (imageExtensions.some(ext => url.pathname.toLowerCase().endsWith(ext))) {
    return true;
  }
  
  // Check by path
  if (imagePaths.some(path => url.pathname.includes(path))) {
    return true;
  }
  
  return false;
}

// Handle image requests - cache first for performance
async function handleImageRequest(request) {
  const cache = await caches.open(IMAGE_CACHE);
  
  // Check cache first (images rarely change)
  const cached = await cache.match(request);
  if (cached) {
    // Return cached and update in background (stale-while-revalidate)
    // Only revalidate if cached more than 1 day ago
    return cached;
  }

  // Fetch from network
  try {
    const response = await fetch(request);
    
    // Cache successful image responses
    if (response.ok) {
      const cloned = response.clone();
      cache.put(request, cloned);
      console.log('[SW] Cached image:', request.url);
    }
    
    return response;
  } catch (error) {
    console.error('[SW] Image fetch failed:', error);
    
    // Return default artwork for album/playlist images
    if (request.url.includes('playlist') || request.url.includes('album') || request.url.includes('artwork')) {
      const defaultCached = await caches.match('/images/default-artwork.jpg');
      if (defaultCached) return defaultCached;
    }
    
    return new Response(null, { status: 503, statusText: 'Service Unavailable' });
  }
}

// Handle audio streaming requests
async function handleAudioRequest(request) {
  const cache = await caches.open(AUDIO_CACHE);
  
  // Check if cached
  const cached = await cache.match(request);
  if (cached) {
    console.log('[SW] Serving audio from cache:', request.url);
    return cached;
  }

  // Fetch from network
  try {
    const response = await fetch(request);
    
    // Only cache full responses (200), NOT partial responses (206)
    // Cache API doesn't support 206 Partial Content responses
    if (response.status === 200) {
      const cloned = response.clone();
      cache.put(request, cloned);
      console.log('[SW] Cached audio:', request.url);
    }
    
    return response;
  } catch (error) {
    console.error('[SW] Audio fetch failed:', error);
    // Return empty response if offline and not cached
    return new Response(null, { status: 503, statusText: 'Service Unavailable' });
  }
}

// Handle API requests - network first with cache fallback
async function handleApiRequest(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  
  try {
    // Try network first
    const response = await fetch(request);
    
    // Cache successful GET responses
    if (response.ok) {
      const cloned = response.clone();
      cache.put(request, cloned);
    }
    
    return response;
  } catch (error) {
    // Network failed, try cache
    console.log('[SW] Network failed, trying cache for:', request.url);
    const cached = await cache.match(request);
    
    if (cached) {
      return cached;
    }
    
    // Return offline error
    return new Response(
      JSON.stringify({ error: 'Offline', message: 'You appear to be offline' }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Handle static requests - cache first with network fallback
async function handleStaticRequest(request) {
  const cache = await caches.open(STATIC_CACHE);
  
  // Check cache first
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  // Fetch from network
  try {
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.ok) {
      const cloned = response.clone();
      cache.put(request, cloned);
    }
    
    return response;
  } catch (error) {
    // For navigation requests, return the cached index.html
    if (request.mode === 'navigate') {
      return cache.match('/index.html');
    }
    
    return new Response(null, { status: 503, statusText: 'Service Unavailable' });
  }
}

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CACHE_AUDIO') {
    cacheAudioFile(event.data.url);
  }
  
  if (event.data.type === 'REMOVE_AUDIO') {
    removeAudioFromCache(event.data.url);
  }
});

// Cache an audio file on demand
async function cacheAudioFile(url) {
  const cache = await caches.open(AUDIO_CACHE);
  
  try {
    const response = await fetch(url);
    if (response.ok) {
      await cache.put(url, response);
      console.log('[SW] Cached audio on demand:', url);
    }
  } catch (error) {
    console.error('[SW] Failed to cache audio:', error);
  }
}

// Remove audio file from cache
async function removeAudioFromCache(url) {
  const cache = await caches.open(AUDIO_CACHE);
  await cache.delete(url);
  console.log('[SW] Removed audio from cache:', url);
}

console.log('[SW] Service Worker loaded');


