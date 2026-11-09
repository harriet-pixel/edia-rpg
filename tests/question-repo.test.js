import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionRepo, parseQuestionImport } from '../js/systems/question-repo.js';
// Minimal asynchronous IndexedDB fake: writes commit only on transaction completion.
function fakeDB() {
  let stores = { questions: new Map(), images: new Map() }, fail = false;
  return {
    failNextWrite() { fail = true; },
    async get(store, key) { return structuredClone(stores[store].get(key)); },
    async open() { return { transaction(names, mode) {
      const snapshot = structuredClone(stores); let pending = 0, aborted = false, timer;
      const finish = () => { clearImmediate(timer); timer = setImmediate(() => { if (pending || aborted) return; if (mode === 'readwrite') stores = snapshot; tx.oncomplete?.(); }); };
      const tx = { abort() { aborted = true; tx.onabort?.(); }, objectStore(name) {
        return Object.fromEntries(['get', 'getAll', 'put', 'delete'].map(method => [method, (...args) => {
          const req = {}; pending++;
          queueMicrotask(() => {
            if (aborted) return;
            if (fail && ['put', 'delete'].includes(method)) { fail = false; req.error = new Error('quota'); req.onerror?.(); tx.abort(); return; }
            const store = snapshot[name];
            req.result = structuredClone(method === 'get' ? store.get(args[0]) : method === 'getAll' ? [...store.values()] : method === 'put' ? (store.set(args[1], structuredClone(args[0])), args[1]) : store.delete(args[0]));
            pending--; req.onsuccess?.(); finish();
          }); return req;
        }]));
      } }; finish(); return tx;
    } }; },
  };
}
const image = 'data:image/png;base64,aGVsbG8=';
const q = { id: 'q', type: 'fill', prompt: 'hello', answer: 'Hello|Hi', createdAt: 1, updatedAt: 1 };
const picture = { ...q, id: 'pic', type: 'image', imageKey: 'img', answer: null };
test('repository save/get/list/update/remove and image deletion', async () => {
  const repo = createQuestionRepo({ db: fakeDB() });
  await repo.save(q); assert.deepEqual(await repo.get('q'), q); assert.deepEqual(await repo.list(), [q]);
  await repo.save({ ...q, answer: 'world' }); assert.equal((await repo.get('q')).answer, 'world');
  await repo.save(picture, image); assert.equal(await repo.getImage('img'), image);
  await repo.remove('pic'); assert.equal(await repo.getImage('img'), undefined);
  await repo.remove('q'); await repo.remove('missing'); assert.deepEqual(await repo.list(), []);
});
test('replacement cleans old image; shared image survives until last reference removed', async () => {
  const repo = createQuestionRepo({ db: fakeDB() });
  await repo.save(picture, image); await repo.save({ ...picture, id: 'other' });
  await repo.remove('pic'); assert.equal(await repo.getImage('img'), image);
  await repo.save({ ...q, id: 'other' }); assert.equal(await repo.getImage('img'), undefined);
});
test('JSON export/import roundtrip includes images and merges matching ids', async () => {
  const source = createQuestionRepo({ db: fakeDB() }), target = createQuestionRepo({ db: fakeDB() });
  await source.save(q); await source.save(picture, image); const json = await source.exportAll();
  assert.equal(JSON.parse(json).images.img, image);
  assert.deepEqual(await target.importAll(json), { imported: 2, skipped: 0 });
  assert.deepEqual(JSON.parse(await target.exportAll()), JSON.parse(json));
  await target.save({ ...q, id: 'keep' }); await target.save({ ...q, answer: 'old' }); await target.importAll(json);
  assert.equal((await target.list()).length, 3); assert.equal((await target.get('q')).answer, q.answer);
});
test('invalid questions skipped and counted; malformed envelopes rejected without writing', async () => {
  const repo = createQuestionRepo({ db: fakeDB() }); await repo.save(q);
  const data = { version: 1, questions: [q, null, {}, { ...q, id: 'bad', answer: 4 }, picture], images: {} };
  assert.deepEqual(await repo.importAll(JSON.stringify(data)), { imported: 1, skipped: 4 });
  for (const json of ['bad', '{}', '[]', JSON.stringify({ ...data, version: 2 }), JSON.stringify({ ...data, images: [] })]) await assert.rejects(repo.importAll(json));
  assert.deepEqual(await repo.list(), [q]); assert.throws(() => parseQuestionImport('{}'));
  await assert.rejects(repo.save({ ...q, answer: '' })); await assert.rejects(repo.save(picture, 'data:text/html;base64,YQ=='));
});
test('failed transactions reject and roll back image/question writes', async () => {
  const db = fakeDB(), repo = createQuestionRepo({ db }); await repo.save(q); await repo.save(picture, image);
  const before = await repo.exportAll(); db.failNextWrite(); await assert.rejects(repo.remove('pic')); assert.equal(await repo.exportAll(), before);
  db.failNextWrite(); await assert.rejects(repo.save({ ...picture, imageKey: 'new' }, image)); assert.equal(await repo.exportAll(), before);
  db.failNextWrite(); await assert.rejects(repo.importAll(JSON.stringify({ version: 1, questions: [{ ...q, answer: 'new' }], images: {} }))); assert.equal(await repo.exportAll(), before);
});
test('import image key collisions preserve unrelated images', async () => {
  const repo = createQuestionRepo({ db: fakeDB() }); await repo.save(picture, image);
  const otherImage = 'data:image/png;base64,b3RoZXI=';
  await repo.importAll(JSON.stringify({ version: 1, questions: [{ ...picture, id: 'other' }], images: { img: otherImage } }));
  assert.equal(await repo.getImage('img'), image);
  const imported = await repo.get('other'); assert.notEqual(imported.imageKey, 'img'); assert.equal(await repo.getImage(imported.imageKey), otherImage);
});
