import {
  getToken, setToken, clearToken,
  getMe, createContactTag,
  flushOfflineQueue,
} from './api.js';

const okResponse = (data = {}, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(data),
});

const setOnline = (v) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
  global.fetch = jest.fn();
  setOnline(true);
});

describe('token', () => {
  test('set / get / clear via localStorage (clé agri-token)', () => {
    expect(getToken()).toBeNull();
    setToken('abc.def');
    expect(getToken()).toBe('abc.def');
    expect(localStorage.getItem('agri-token')).toBe('abc.def');
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe('request (via getMe)', () => {
  test('joint le bearer token quand il existe', async () => {
    setToken('jwt-123');
    fetch.mockResolvedValue(okResponse({ user: { id: 1 } }));
    await getMe();
    const [, opts] = fetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer jwt-123');
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  test('échec réseau → message convivial', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getMe()).rejects.toThrow(/Impossible de contacter le serveur/);
  });

  test('401 → vide le token, émet agri-auth-expired et jette', async () => {
    setToken('expired');
    fetch.mockResolvedValue(okResponse({ error: 'Session expirée.' }, 401));
    const listener = jest.fn();
    window.addEventListener('agri-auth-expired', listener);

    await expect(getMe()).rejects.toThrow(/expirée/i);
    expect(getToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('agri-auth-expired', listener);
  });

  test('réponse non-ok (4xx/5xx) → jette le message d\'erreur du serveur', async () => {
    fetch.mockResolvedValue(okResponse({ error: 'Champ requis manquant.' }, 400));
    await expect(getMe()).rejects.toThrow('Champ requis manquant.');
  });
});

describe('safeRequest (via createContactTag)', () => {
  test('erreur réseau → opération mise en file agri-offline-queue, renvoie null', async () => {
    fetch.mockRejectedValue(new TypeError('offline'));
    const evt = jest.fn();
    window.addEventListener('agri-sync-status-changed', evt);

    const res = await createContactTag({ nom: 'VIP' });
    expect(res).toBeNull();

    const queue = JSON.parse(localStorage.getItem('agri-offline-queue'));
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ path: '/contact-tags', method: 'POST', body: { nom: 'VIP' } });
    expect(evt).toHaveBeenCalled();
    window.removeEventListener('agri-sync-status-changed', evt);
  });

  test('vraie erreur serveur (400) → rethrow, RIEN mis en file', async () => {
    fetch.mockResolvedValue(okResponse({ error: 'Ce tag existe déjà.' }, 409));
    await expect(createContactTag({ nom: 'VIP' })).rejects.toThrow('Ce tag existe déjà.');
    expect(localStorage.getItem('agri-offline-queue')).toBeNull();
  });
});

describe('flushOfflineQueue', () => {
  const seed = (ops) => localStorage.setItem('agri-offline-queue', JSON.stringify(ops));

  test('hors ligne → no-op { flushed: 0 }', async () => {
    setOnline(false);
    seed([{ path: '/x', method: 'POST', body: { a: 1 } }]);
    expect(await flushOfflineQueue()).toEqual({ flushed: 0 });
    expect(localStorage.getItem('agri-offline-queue')).not.toBeNull(); // rien consommé
  });

  test('en ligne, tout réussit → file vidée, agri-last-sync posé', async () => {
    seed([
      { path: '/contact-tags', method: 'POST', body: { nom: 'A' } },
      { path: '/contact-tags', method: 'POST', body: { nom: 'B' } },
    ]);
    fetch.mockResolvedValue(okResponse({ ok: true }, 201));

    const res = await flushOfflineQueue();
    expect(res).toEqual({ flushed: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('agri-offline-queue')).toBeNull();
    expect(localStorage.getItem('agri-last-sync')).toBeTruthy();
  });

  test('un échec est conservé pour la prochaine passe', async () => {
    seed([
      { path: '/ok', method: 'POST', body: { n: 1 } },
      { path: '/ko', method: 'POST', body: { n: 2 } },
    ]);
    fetch
      .mockResolvedValueOnce(okResponse({}, 200))       // /ok
      .mockRejectedValueOnce(new TypeError('offline')); // /ko

    const res = await flushOfflineQueue();
    expect(res).toEqual({ flushed: 1 });
    const remaining = JSON.parse(localStorage.getItem('agri-offline-queue'));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].path).toBe('/ko');
  });

  test('file absente ou JSON corrompu → { flushed: 0 } sans jeter', async () => {
    expect(await flushOfflineQueue()).toEqual({ flushed: 0 });
    localStorage.setItem('agri-offline-queue', '{pas du json');
    expect(await flushOfflineQueue()).toEqual({ flushed: 0 });
    expect(localStorage.getItem('agri-offline-queue')).toBeNull(); // nettoyé
  });
});
