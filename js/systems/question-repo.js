import { contentDB } from '../core/storage.js';
import { validateQuestion } from './questions.js';
export const isImageDataURL = value => typeof value === 'string' && /^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
export function parseQuestionImport(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || data.version !== 1 || !Array.isArray(data.questions) || !data.images || typeof data.images !== 'object' || Array.isArray(data.images)) throw new Error('題庫 JSON 格式不正確');
  const questions = data.questions.filter(q => validateQuestion(q).ok && (q.type !== 'image' || isImageDataURL(data.images[q.imageKey])));
  return { questions, images: data.images, skipped: data.questions.length - questions.length };
}
export function createQuestionRepo({ db = contentDB } = {}) {
  // A transaction includes questions and images, so failed writes never leave half an import/deletion.
  async function transaction(mode, action) {
    const database = await db.open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['questions', 'images'], mode);
      let result;
      const request = (store, method, ...args) => new Promise((yes, no) => { const req = tx.objectStore(store)[method](...args); req.onsuccess = () => yes(req.result); req.onerror = () => no(req.error); });
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('題庫交易失敗'));
      Promise.resolve().then(() => action(request)).then(value => { result = value; }).catch(error => { try { tx.abort(); } catch { /* already aborted */ } reject(error); });
    });
  }
  const list = () => transaction('readonly', r => r('questions', 'getAll'));
  const get = id => db.get('questions', id);
  async function write(r, q, images = {}) {
    const old = await r('questions', 'get', q.id);
    if (q.type === 'image' && Object.hasOwn(images, q.imageKey)) await r('images', 'put', images[q.imageKey], q.imageKey);
    await r('questions', 'put', q, q.id);
    if (old?.imageKey && old.imageKey !== q.imageKey) await cleanImage(r, old.imageKey);
  }
  async function cleanImage(r, key) {
    const all = await r('questions', 'getAll');
    if (!all.some(q => q.imageKey === key)) await r('images', 'delete', key);
  }
  return {
    list, get,
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
      return JSON.stringify({ version: 1, questions, images }, null, 2);
    }),
    async importAll(json) {
      const { questions, images, skipped } = parseQuestionImport(json);
      await transaction('readwrite', async r => {
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
