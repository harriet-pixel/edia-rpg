import { contentDB } from '../core/storage.js';
import { validateQuestion } from './questions.js';
import { validateFolderName } from './question-folders.js';
export const isImageDataURL = value => typeof value === 'string' && /^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
function validateFolders(folders, { hierarchy = true } = {}) {
  if (!Array.isArray(folders)) throw new Error('folders 必須是陣列');
  const ids = new Set();
  if (folders.some(f => !f || typeof f.name !== 'string')) throw new Error('資料夾格式不正確');
  return folders.map(f => {
    if (!f || typeof f.id !== 'string' || !f.id.trim() || ids.has(f.id) ||
        !(f.parentId === null || typeof f.parentId === 'string') ||
        !Number.isSafeInteger(f.createdAt) || f.createdAt < 0 || !Number.isSafeInteger(f.updatedAt) || f.updatedAt < f.createdAt) throw new Error('資料夾格式不正確');
    ids.add(f.id);
    const valid = validateFolderName(f.name, folders.filter(other => other.id !== f.id && other.parentId === f.parentId));
    if (!valid.ok) throw new Error(valid.errors.join('；'));
    if (hierarchy && f.parentId !== null) {
      const parent = folders.find(other => other.id === f.parentId);
      if (!parent || parent.parentId !== null) throw new Error('資料夾最多兩層，且上層必須存在');
    }
    return { ...f, name: valid.name };
  });
}
export function parseQuestionImport(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || data.version !== 1 || !Array.isArray(data.questions) || !data.images || typeof data.images !== 'object' || Array.isArray(data.images)) throw new Error('題庫 JSON 格式不正確');
  const questions = data.questions.filter(q => validateQuestion(q).ok && (q.type !== 'image' || isImageDataURL(data.images[q.imageKey])));
  return { questions, images: data.images, folders: validateFolders(data.folders ?? [], { hierarchy: false }), skipped: data.questions.length - questions.length };
}
export function createQuestionRepo({ db = contentDB } = {}) {
  // A transaction includes questions, images and folders, so failed writes never leave half an import/deletion.
  async function transaction(mode, action) {
    const database = await db.open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['questions', 'images', 'folders'], mode);
      let result, failure;
      const request = (store, method, ...args) => new Promise((yes, no) => { const req = tx.objectStore(store)[method](...args); req.onsuccess = () => yes(req.result); req.onerror = () => { failure = req.error; no(req.error); }; });
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(failure ?? tx.error ?? new Error('題庫交易失敗'));
      Promise.resolve().then(() => action(request)).then(value => { result = value; }).catch(error => { failure = error; try { tx.abort(); } catch { /* already aborted */ } reject(error); });
    });
  }
  const list = () => transaction('readonly', r => r('questions', 'getAll'));
  const get = id => db.get('questions', id);
  const listFolders = () => transaction('readonly', r => r('folders', 'getAll'));
  async function move(r, ids, folderId) {
    if (folderId != null && !await r('folders', 'get', folderId)) throw new Error('目標資料夾不存在');
    for (const id of new Set(ids)) {
      const q = await r('questions', 'get', id);
      if (!q) throw new Error('題目不存在');
      await r('questions', 'put', { ...q, folderId: folderId ?? null, updatedAt: Math.max(Date.now(), q.updatedAt) }, id);
    }
  }
  async function write(r, q, images = {}) {
    const old = await r('questions', 'get', q.id);
    if (q.type === 'image' && !Object.hasOwn(images, q.imageKey) && !isImageDataURL(await r('images', 'get', q.imageKey))) throw new Error('圖片題必須有圖片');
    if (q.type === 'image' && Object.hasOwn(images, q.imageKey)) await r('images', 'put', images[q.imageKey], q.imageKey);
    await r('questions', 'put', q, q.id);
    if (old?.imageKey && old.imageKey !== q.imageKey) await cleanImage(r, old.imageKey);
  }
  async function cleanImage(r, key) {
    const all = await r('questions', 'getAll');
    if (!all.some(q => q.imageKey === key)) await r('images', 'delete', key);
  }
  return {
    list, get, listFolders,
    saveFolder: folder => transaction('readwrite', async r => {
      const all = await r('folders', 'getAll'), old = all.find(f => f.id === folder.id);
      // Existing folder identities/parents stay stable when renamed.
      const next = old ? { ...old, name: folder.name, updatedAt: Math.max(Date.now(), old.updatedAt) } : folder;
      const merged = validateFolders([...all.filter(f => f.id !== next.id), next]);
      const saved = merged.find(f => f.id === next.id);
      await r('folders', 'put', saved, saved.id); return saved;
    }),
    removeFolder: id => transaction('readwrite', async r => {
      const all = await r('folders', 'getAll'), folder = all.find(f => f.id === id);
      if (!folder) return;
      if (all.some(f => f.parentId === id)) throw new Error('請先處理子資料夾');
      const questions = await r('questions', 'getAll');
      await move(r, questions.filter(q => q.folderId === id).map(q => q.id), folder.parentId);
      await r('folders', 'delete', id);
    }),
    moveQuestions: (ids, folderId) => transaction('readwrite', r => move(r, ids, folderId)),
    getImage: key => db.get('images', key),
    async save(q, imageData) {
      const valid = validateQuestion(q); if (!valid.ok) throw new Error(valid.errors.join('；'));
      if (imageData !== undefined && (q.type !== 'image' || !isImageDataURL(imageData))) throw new Error('圖片格式不支援');
      await transaction('readwrite', r => write(r, q, imageData === undefined ? {} : { [q.imageKey]: imageData })); return q;
    },
    remove: id => transaction('readwrite', async r => { const old = await r('questions', 'get', id); await r('questions', 'delete', id); if (old?.imageKey) await cleanImage(r, old.imageKey); }),
    exportAll: () => transaction('readonly', async r => {
      const questions = await r('questions', 'getAll'), images = Object.create(null);
      for (const q of questions) if (q.type === 'image') { const data = await r('images', 'get', q.imageKey); if (isImageDataURL(data)) images[q.imageKey] = data; }
      return JSON.stringify({ version: 1, questions, images, folders: await r('folders', 'getAll') }, null, 2);
    }),
    async importAll(json) {
      const { questions, images, folders, skipped } = parseQuestionImport(json);
      await transaction('readwrite', async r => {
        const existing = await r('folders', 'getAll');
        const merged = validateFolders([...existing.filter(f => !folders.some(next => next.id === f.id)), ...folders]);
        for (const folder of merged) await r('folders', 'put', folder, folder.id);
        // Remap colliding keys to preserve unrelated existing questions' images.
        for (const original of questions) {
          const q = { ...original };
          if (q.type === 'image') {
            const all = await r('questions', 'getAll');
            if (all.some(item => item.id !== q.id && item.imageKey === q.imageKey)) {
              const key = `image-${globalThis.crypto.randomUUID()}`;
              await write(r, { ...q, imageKey: key }, { [key]: images[q.imageKey] }); continue;
            }
          }
          await write(r, q, images);
        }
      });
      return { imported: questions.length, skipped };
    },
  };
}
export const questionRepo = createQuestionRepo();
