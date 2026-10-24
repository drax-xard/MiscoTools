import { presetHash } from '../core/preset.js';

const DB_NAME = 'dilstout';
const DB_VERSION = 1;
const STORE_NAME = 'presets';
const FALLBACK_KEY = 'dilstout.presets.v1';

let dbPromise = null;
let memoryFallback = [];

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
  });
  return dbPromise;
}

function readFallback() {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return memoryFallback;
  }
}

function writeFallback(records) {
  memoryFallback = records;
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(records));
  } catch {
    return;
  }
}

function sortRecords(records) {
  return [...records].sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

export async function listSavedPresets() {
  try {
    const database = await openDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(sortRecords(request.result ?? []));
      request.onerror = () => reject(request.error);
    });
  } catch {
    return sortRecords(readFallback());
  }
}

export async function savePresetRecord(preset) {
  const record = {
    id: presetHash(preset),
    name: preset.name,
    preset,
    savedAt: new Date().toISOString(),
  };
  try {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    return record;
  } catch {
    const records = readFallback().filter((entry) => entry.id !== record.id);
    records.push(record);
    writeFallback(records);
    return record;
  }
}

export async function deleteSavedPreset(id) {
  try {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    writeFallback(readFallback().filter((entry) => entry.id !== id));
  }
}
