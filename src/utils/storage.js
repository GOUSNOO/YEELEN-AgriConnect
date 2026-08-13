import { flushOfflineQueue } from '../lib/api.js';

export async function storageGet(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export async function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (typeof window !== 'undefined' && !navigator.onLine) {
      const queue = JSON.parse(localStorage.getItem('agri-sync-queue') || '[]');
      queue.push({ key, value, timestamp: new Date().toISOString() });
      localStorage.setItem('agri-sync-queue', JSON.stringify(queue));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('agri-sync-status-changed'));
    }
  } catch (e) {
    console.error(e);
  }
}

export async function syncPendingChanges() {
  if (typeof window === 'undefined' || !navigator.onLine) {
    const raw = localStorage.getItem('agri-offline-queue') || '[]';
    const queue = JSON.parse(raw);
    return { pending: queue.length, synced: false };
  }
  try {
    const result = await flushOfflineQueue();
    return { pending: 0, synced: true, flushed: result.flushed };
  } catch {
    return { pending: 0, synced: false };
  }
}
