/**
 * db.js - IndexedDB Offline Storage for Field Survey PWA
 */

const DB_NAME = 'FieldSurveyDB';
const DB_VERSION = 1;
const SURVEY_STORE = 'surveys';
const SETTING_STORE = 'settings';

let dbInstance = null;

export function initDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Survey records store
      if (!db.objectStoreNames.contains(SURVEY_STORE)) {
        const surveyStore = db.createObjectStore(SURVEY_STORE, { keyPath: 'id' });
        surveyStore.createIndex('timestamp', 'timestamp', { unique: false });
        surveyStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        surveyStore.createIndex('interviewer', 'interviewer', { unique: false });
      }

      // App settings store
      if (!db.objectStoreNames.contains(SETTING_STORE)) {
        db.createObjectStore(SETTING_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[IndexedDB] Database error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Add or update survey
export async function saveSurvey(survey) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SURVEY_STORE], 'readwrite');
    const store = transaction.objectStore(SURVEY_STORE);
    const request = store.put(survey);

    request.onsuccess = () => resolve(survey);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Get single survey by ID
export async function getSurvey(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SURVEY_STORE], 'readonly');
    const store = transaction.objectStore(SURVEY_STORE);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Get all surveys, newest first
export async function getAllSurveys() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SURVEY_STORE], 'readonly');
    const store = transaction.objectStore(SURVEY_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result || [];
      // Sort newest first
      results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      resolve(results);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

// Get pending surveys that need syncing
export async function getPendingSurveys() {
  const all = await getAllSurveys();
  return all.filter(s => s.syncStatus === 'pending');
}

// Delete survey
export async function deleteSurvey(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SURVEY_STORE], 'readwrite');
    const store = transaction.objectStore(SURVEY_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Settings management
export async function getSetting(key, defaultValue = null) {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([SETTING_STORE], 'readonly');
      const store = transaction.objectStore(SETTING_STORE);
      const request = store.get(key);

      request.onsuccess = () => {
        if (request.result && request.result.value !== undefined) {
          resolve(request.result.value);
        } else {
          // Check LocalStorage fallback
          const localVal = localStorage.getItem('field_survey_' + key);
          resolve(localVal !== null ? JSON.parse(localVal) : defaultValue);
        }
      };
      request.onerror = () => resolve(defaultValue);
    });
  } catch (err) {
    return defaultValue;
  }
}

export async function setSetting(key, value) {
  const db = await initDB();
  // Also save to localStorage as backup
  try {
    localStorage.setItem('field_survey_' + key, JSON.stringify(value));
  } catch (e) {
    console.warn('[Storage] LocalStorage error:', e);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SETTING_STORE], 'readwrite');
    const store = transaction.objectStore(SETTING_STORE);
    const request = store.put({ key, value });

    request.onsuccess = () => resolve(value);
    request.onerror = (e) => reject(e.target.error);
  });
}
