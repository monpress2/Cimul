// idb.js - simple IndexedDB helper for Lumic offline songs
(function(window){
  const DB_NAME = 'lumic-offline-v1';
  const STORE = 'songs';
  let dbPromise = null;

  function openDB(){
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'uid' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function initOfflineDB(){
    await openDB();
    return true;
  }

  async function putSong(uid, blob, meta = {}){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const item = { uid, blob, meta, created_at: new Date().toISOString() };
      const r = store.put(item);
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  }

  async function getSong(uid){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const r = store.get(uid);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }

  async function deleteSong(uid){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const r = store.delete(uid);
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  }

  async function listSongs(){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function getBlobUrl(uid){
    const rec = await getSong(uid);
    if (!rec || !rec.blob) return null;
    return URL.createObjectURL(rec.blob);
  }

  window.LumicIDB = {
    initOfflineDB,
    putSong,
    getSong,
    deleteSong,
    listSongs,
    getBlobUrl
  };
})(window);
