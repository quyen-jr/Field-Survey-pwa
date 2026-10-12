const CACHE_NAME = 'field-survey-v3-cache-first';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './google-apps-script-code.txt'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(STATIC_ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Cache-First: serve the local app immediately and only use the network on a cache miss.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.hostname.includes('script.google.com')) return;

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      if (response && response.ok && url.origin === self.location.origin) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});

// Background Sync drains the IndexedDB queue even after the PWA tab is closed.
self.addEventListener('sync', (event) => {
  if (event.tag === 'field-survey-sync') {
    event.waitUntil(syncPendingSurveys());
  }
});

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('FieldSurveyDB', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readStore(db, storeName, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeSurvey(db, survey) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('surveys', 'readwrite');
    transaction.objectStore('surveys').put(survey);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  clients.forEach((client) => client.postMessage(message));
}

async function syncPendingSurveys() {
  const db = await openDatabase();
  const setting = await readStore(db, 'settings', (store) => store.get('scriptUrl'));
  const scriptUrl = setting && setting.value;
  if (!scriptUrl) return;

  const surveys = await readStore(db, 'surveys', (store) => store.getAll());
  const pending = surveys.filter((survey) => survey.syncStatus === 'pending');
  let success = 0;

  for (const survey of pending) {
    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'addSurvey',
          id: survey.id,
          interviewer: survey.interviewer,
          content: survey.content,
          timestamp: survey.timestamp,
          timeFormatted: survey.timeFormatted,
          latitude: survey.location?.latitude || '',
          longitude: survey.location?.longitude || '',
          accuracy: survey.location?.accuracy || '',
          mapUrl: survey.location?.mapUrl || '',
          photoBase64: survey.photo?.dataUrl || '',
          photoName: `field_${survey.id}.jpg`
        })
      });
      const result = await response.json();
      if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || `HTTP ${response.status}`);
      }
      survey.syncStatus = 'synced';
      survey.syncedAt = new Date().toISOString();
      survey.driveUrl = result.driveUrl || '';
      survey.syncError = null;
      await writeSurvey(db, survey);
      success += 1;
    } catch (error) {
      survey.syncError = error.message;
      await writeSurvey(db, survey);
      throw error;
    }
  }

  if (success > 0) {
    await notifyClients({ type: 'BACKGROUND_SYNC_COMPLETE', count: success });
  }
}
