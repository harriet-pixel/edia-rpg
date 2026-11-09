export const PREFIX = 'edia-rpg-v1';
export const SAVE_KEY = `${PREFIX}:save`;
export const SCHEMA_VERSION = 1;
export const migrations = []; // Entries: { from, to, migrate(save) }; append when adding v2.
export const createDefaultSave = () => ({ schemaVersion: 1, settings: { fontScale: 1 }, currencies: { stars: 0 } });
const clone = value => structuredClone(value);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function safeTree(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('存檔含無效數字');
  if (value === undefined || ['function', 'bigint', 'symbol'].includes(typeof value) || (value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new Error('存檔含無效資料');
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('存檔含不安全欄位');
    safeTree(child);
  }
}
export function validateSave(save) {
  safeTree(save);
  if (!plain(save) || save.schemaVersion !== SCHEMA_VERSION || !plain(save.settings) ||
      ![0.875, 1, 1.125, 1.25].includes(save.settings.fontScale) || !plain(save.currencies) ||
      !Number.isSafeInteger(save.currencies.stars) || save.currencies.stars < 0) throw new Error('存檔格式不正確');
  return save;
}
export function migrateSave(input, steps = migrations) {
  let save = clone(input);
  if (!plain(save) || !Number.isInteger(save.schemaVersion) || save.schemaVersion < 0 || save.schemaVersion > SCHEMA_VERSION) throw new Error('不支援的存檔版本');
  safeTree(save);
  while (save.schemaVersion < SCHEMA_VERSION) {
    const step = steps.find(item => item.from === save.schemaVersion);
    if (!step || step.to <= step.from || step.to > SCHEMA_VERSION) throw new Error('缺少存檔遷移程序');
    save = step.migrate(clone(save));
    if (!plain(save) || save.schemaVersion !== step.to) throw new Error('遷移版本不正確');
  }
  return validateSave(save);
}
export function createStorage({ backend, notify = () => {}, migrationSteps = migrations } = {}) {
  let persistent = true;
  let state = createDefaultSave();
  const memory = new Map();
  const notices = [];
  function fallback(message) { persistent = false; notices.push(message); notify(message); }
  try { if (backend === undefined) backend = globalThis.localStorage; if (!backend) throw new Error(); }
  catch { fallback('瀏覽器儲存空間不可用，目前使用記憶體存檔，離開前請匯出備份。'); }
  function persist() {
    const raw = JSON.stringify(state);
    memory.set(SAVE_KEY, raw);
    if (persistent) try { backend.setItem(SAVE_KEY, raw); }
    catch { fallback('存檔寫入失敗，已改用記憶體存檔，請匯出備份。'); }
  }
  if (persistent) {
    let raw;
    try { raw = backend.getItem(SAVE_KEY); }
    catch { fallback('存檔讀取失敗，已改用記憶體存檔，請匯出備份。'); }
    if (raw != null) {
      try { state = migrateSave(JSON.parse(raw), migrationSteps); }
      catch {
        const key = `${PREFIX}:corrupt:${Date.now()}`;
        memory.set(key, raw);
        try { backend.setItem(key, raw); } catch { /* Original remains untouched on disk. */ }
        fallback('存檔損毀或版本不支援，原始內容已保留備份，已使用新的記憶體存檔。');
      }
    }
  }
  persist();
  return {
    load: () => clone(state),
    save(value) { const valid = migrateSave(value, migrationSteps); state = valid; persist(); return clone(state); },
    exportSave: () => JSON.stringify(state, null, 2),
    importSave(json) { const valid = migrateSave(JSON.parse(json), migrationSteps); state = valid; persist(); return clone(state); },
    get mode() { return persistent ? 'localStorage' : 'memory'; },
    get notices() { return [...notices]; },
    getMemoryBackup: key => memory.get(key),
    backupKeys: () => [...memory.keys()].filter(key => key.includes(':corrupt:')),
  };
}
let defaultStorage;
export const getStorage = () => defaultStorage ??= createStorage();
export const exportSave = () => getStorage().exportSave();
export const importSave = json => getStorage().importSave(json);

export function createIndexedDB({ indexedDB = globalThis.indexedDB } = {}) {
  let opening;
  function open() {
    if (!indexedDB) return Promise.reject(new Error('IndexedDB 不可用'));
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(`${PREFIX}:content`, 1);
      request.onupgradeneeded = () => {
        for (const name of ['questions', 'images']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
      };
      request.onerror = () => { opening = undefined; reject(request.error); };
      request.onblocked = () => { opening = undefined; reject(new Error('IndexedDB 升級被其他分頁阻擋')); };
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); opening = undefined; }; resolve(db); };
    });
    return opening;
  }
  async function run(store, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = action(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? request.error ?? new Error('IndexedDB 交易失敗'));
    });
  }
  return { open, get: (store, key) => run(store, 'readonly', s => s.get(key)),
    put: (store, key, value) => run(store, 'readwrite', s => s.put(value, key)),
    delete: (store, key) => run(store, 'readwrite', s => s.delete(key)) };
}
export const contentDB = createIndexedDB();
