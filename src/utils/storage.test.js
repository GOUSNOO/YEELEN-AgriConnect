import { storageGet, storageSet, syncPendingChanges } from './storage.js';
import { flushOfflineQueue } from '../lib/api.js';

jest.mock('../lib/api.js', () => ({ flushOfflineQueue: jest.fn() }));

const setOnline = (v) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  setOnline(true);
});

describe('storageGet', () => {
  test('renvoie le fallback si la clé est absente', async () => {
    expect(await storageGet('absente', 'DEF')).toBe('DEF');
  });
  test('parse la valeur JSON stockée', async () => {
    localStorage.setItem('k', JSON.stringify({ a: 1, b: [2, 3] }));
    expect(await storageGet('k', null)).toEqual({ a: 1, b: [2, 3] });
  });
  test('JSON corrompu → fallback, pas d\'exception', async () => {
    localStorage.setItem('k', '{cassé');
    expect(await storageGet('k', 'DEF')).toBe('DEF');
  });
});

describe('storageSet', () => {
  test('écrit la valeur sérialisée et émet agri-sync-status-changed', async () => {
    const evt = jest.fn();
    window.addEventListener('agri-sync-status-changed', evt);
    await storageSet('k', { x: 42 });
    expect(JSON.parse(localStorage.getItem('k'))).toEqual({ x: 42 });
    expect(evt).toHaveBeenCalled();
    window.removeEventListener('agri-sync-status-changed', evt);
  });

  test('en ligne : ne touche pas agri-sync-queue', async () => {
    await storageSet('k', 1);
    expect(localStorage.getItem('agri-sync-queue')).toBeNull();
  });

  test('hors ligne : empile aussi dans agri-sync-queue', async () => {
    setOnline(false);
    await storageSet('recoltes', [{ id: 1 }]);
    const q = JSON.parse(localStorage.getItem('agri-sync-queue'));
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ key: 'recoltes', value: [{ id: 1 }] });
    expect(q[0].timestamp).toBeTruthy();
  });
});

describe('syncPendingChanges', () => {
  test('hors ligne → compte la file agri-offline-queue, synced:false', async () => {
    setOnline(false);
    localStorage.setItem('agri-offline-queue', JSON.stringify([{ path: '/a' }, { path: '/b' }]));
    expect(await syncPendingChanges()).toEqual({ pending: 2, synced: false });
    expect(flushOfflineQueue).not.toHaveBeenCalled();
  });

  test('en ligne → délègue à flushOfflineQueue', async () => {
    flushOfflineQueue.mockResolvedValue({ flushed: 3 });
    expect(await syncPendingChanges()).toEqual({ pending: 0, synced: true, flushed: 3 });
    expect(flushOfflineQueue).toHaveBeenCalledTimes(1);
  });

  test('en ligne mais flush jette → synced:false', async () => {
    flushOfflineQueue.mockRejectedValue(new Error('boom'));
    expect(await syncPendingChanges()).toEqual({ pending: 0, synced: false });
  });
});
