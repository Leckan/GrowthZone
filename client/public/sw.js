// Service Worker for Community Learning Platform
// Provides offline functionality and caching

const CACHE_NAME = 'community-learning-v1';
const STATIC_CACHE = 'static-v1';
const DYNAMIC_CACHE = 'dynamic-v1';

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.ico'
];

// API endpoints to cache
const API_CACHE_PATTERNS = [
  /\/api\/v1\/communities$/,
  /\/api\/v1\/users\/profile$/,
  /\/api\/v1\/communities\/[^\/]+$/
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle static assets
  if (request.destination === 'script' || 
      request.destination === 'style' || 
      request.destination === 'image') {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Default: try cache first, then network
  event.respondWith(
    caches.match(request)
      .then((response) => {
        return response || fetch(request);
      })
  );
});

// Handle API requests with cache-first strategy for specific endpoints
async function handleApiRequest(request) {
  const url = new URL(request.url);
  const shouldCache = API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));

  if (shouldCache) {
    // Cache-first strategy for cacheable API endpoints
    try {
      const cache = await caches.open(DYNAMIC_CACHE);
      const cachedResponse = await cache.match(request);
      
      if (cachedResponse) {
        // Return cached response and update in background
        updateCacheInBackground(request, cache);
        return cachedResponse;
      }
      
      // No cache, fetch from network
      const networkResponse = await fetch(request);
      
      if (networkResponse.ok) {
        // Cache successful responses
        cache.put(request, networkResponse.clone());
      }
      
      return networkResponse;
    } catch (error) {
      console.error('API request failed:', error);
      
      // Try to return cached version on network failure
      const cache = await caches.open(DYNAMIC_CACHE);
      const cachedResponse = await cache.match(request);
      
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Return offline response
      return new Response(
        JSON.stringify({ 
          error: 'Network unavailable', 
          offline: true 
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }

  // Network-first for non-cacheable API endpoints
  try {
    return await fetch(request);
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: 'Network unavailable', 
        offline: true 
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Handle static assets with cache-first strategy
async function handleStaticAsset(request) {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Static asset request failed:', error);
    
    // Try cache as fallback
    const cache = await caches.open(STATIC_CACHE);
    return await cache.match(request);
  }
}

// Handle navigation requests
async function handleNavigation(request) {
  try {
    // Try network first for navigation
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful navigation responses
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Navigation request failed:', error);
    
    // Fallback to cached version or offline page
    const cache = await caches.open(DYNAMIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return cached index.html for SPA routing
    return await cache.match('/');
  }
}

// Update cache in background
async function updateCacheInBackground(request, cache) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
  } catch (error) {
    console.error('Background cache update failed:', error);
  }
}

// Handle background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(handleBackgroundSync());
  }
});

async function handleBackgroundSync() {
  // Handle any queued offline actions
  console.log('Background sync triggered');
  
  // This could include:
  // - Sending queued API requests
  // - Uploading cached form data
  // - Syncing offline changes
}

// Handle push notifications
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: data.tag || 'notification',
      data: data.data || {},
      actions: data.actions || []
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const data = event.notification.data;
  
  event.waitUntil(
    clients.openWindow(data.url || '/')
  );
});

// Cache management utilities
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(clearAllCaches());
  }
});

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
  console.log('All caches cleared');
}