/* ==========================================================================
   db.js — camada de armazenamento local (IndexedDB)
   Guarda 3 coisas por captura: a imagem completa (Blob), a miniatura (Blob)
   e metadados. Nada é enviado para servidores.
   ========================================================================== */

const PrintFacilDB = (() => {
  const DB_NAME = 'printfacil';
  const DB_VERSION = 1;
  const STORE = 'shots';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB indisponível neste navegador.'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
        void event;
      };

      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };

      req.onerror = () => reject(req.error || new Error('Falha ao abrir o banco local.'));
      req.onblocked = () => reject(new Error('O banco local está bloqueado por outra aba.'));
    });

    return dbPromise;
  }

  function tx(mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const store = transaction.objectStore(STORE);
      let result;
      try {
        result = fn(store);
      } catch (err) {
        reject(err);
        return;
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Transação cancelada.'));
    }));
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** Adiciona uma captura. `record` deve conter blob + thumb Blob. */
  async function add(record) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).add(record);
      transaction.oncomplete = () => resolve(record);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /** Todas as capturas, mais recentes primeiro. */
  async function all() {
    const db = await open();
    const items = await reqToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }

  async function get(id) {
    const db = await open();
    return reqToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).get(id));
  }

  async function remove(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function removeMany(ids) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      ids.forEach((id) => store.delete(id));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function clear() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).clear();
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function count() {
    const items = await all();
    return items.length;
  }

  async function totalBytes() {
    const items = await all();
    return items.reduce((sum, item) => sum + (item.bytes || 0) + (item.thumbBytes || 0), 0);
  }

  return { open, add, all, get, remove, removeMany, clear, count, totalBytes, STORE, DB_NAME };
})();

window.PrintFacilDB = PrintFacilDB;
