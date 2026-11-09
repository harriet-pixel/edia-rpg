import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionRepo, parseQuestionImport } from '../js/systems/question-repo.js';
// Minimal asynchronous IndexedDB fake: writes commit only on transaction completion.
function fakeDB() {
  let stores = { questions: new Map(), images: new Map(), folders: new Map() }, fail = 0;
  return {
    failNextWrite(n = 1) { fail = n; },
    async get(store, key) { return structuredClone(stores[store].get(key)); },
    async open() { return { transaction(names, mode) {
      const snapshot = structuredClone(stores); let pending = 0, aborted = false, timer;
      const finish = () => { clearImmediate(timer); timer = setImmediate(() => { if (pending || aborted) return; if (mode === 'readwrite') stores = snapshot; tx.oncomplete?.(); }); };
      const tx = { abort() { aborted = true; tx.onabort?.(); }, objectStore(name) {
        return Object.fromEntries(['get', 'getAll', 'put', 'delete'].map(method => [method, (...args) => {
          const req = {}; pending++;
          queueMicrotask(() => {
            if (aborted) return;
            if (fail && ['put', 'delete'].includes(method) && --fail === 0) { req.error = new Error('quota'); req.onerror?.(); tx.abort(); return; }
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

const folder = (id, name = id, parentId = null) => ({ id, name, parentId, createdAt: 1, updatedAt: 1 });
test('folder create/rename validates hierarchy and name; rename preserves questions and parent', async () => {
  const repo = createQuestionRepo({ db: fakeDB() });
  await repo.saveFolder(folder('a', ' A ')); await repo.saveFolder(folder('b', 'B', 'a'));
  await repo.save({ ...q, folderId: 'b' });
  const before = await repo.get('q'); await repo.saveFolder({ ...folder('b', 'renamed'), parentId: null });
  assert.deepEqual(await repo.get('q'), before); assert.equal((await repo.listFolders()).find(f => f.id === 'b').parentId, 'a');
  for (const f of [folder('dup', 'a'), folder('deep', 'Deep', 'b'), folder('bad', '/', null), folder('missing', 'm', 'absent')]) await assert.rejects(repo.saveFolder(f));
  assert.equal((await repo.listFolders()).length, 2);
});
test('delete folders moves questions to parent/unclassified and refuses nonempty hierarchy', async () => {
  const repo = createQuestionRepo({ db: fakeDB() });
  await repo.saveFolder(folder('a')); await repo.saveFolder(folder('b', 'b', 'a'));
  await repo.save({ ...q, folderId: 'b' }); await assert.rejects(repo.removeFolder('a'), /子資料夾/);
  await repo.removeFolder('b'); assert.equal((await repo.get('q')).folderId, 'a');
  await repo.removeFolder('a'); assert.equal((await repo.get('q')).folderId, null);
  assert.equal((await repo.list()).length, 1); assert.deepEqual(await repo.listFolders(), []);
});
test('failed second move or folder deletion rolls back ALL questions and folder', async () => {
  for (const nth of [2, 3]) {
    const db = fakeDB(), repo = createQuestionRepo({ db }); await repo.saveFolder(folder('a'));
    for (const id of ['q', 'q2']) await repo.save({ ...q, id, folderId: 'a' });
    const before = await repo.exportAll(); db.failNextWrite(nth);
    await assert.rejects(repo.removeFolder('a')); assert.equal(await repo.exportAll(), before);
  }
});
test('moveQuestions is atomic, handles duplicate IDs, and validates destination', async () => {
  const db = fakeDB(), repo = createQuestionRepo({ db }); await repo.saveFolder(folder('a'));
  for (const id of ['q', 'q2']) await repo.save({ ...q, id });
  const before = await repo.exportAll(); db.failNextWrite(2); await assert.rejects(repo.moveQuestions(['q', 'q2'], 'a')); assert.equal(await repo.exportAll(), before);
  await assert.rejects(repo.moveQuestions(['q'], 'missing'));
  await repo.moveQuestions(['q', 'q', 'q2'], 'a'); assert.ok((await repo.list()).every(q => q.folderId === 'a'));
  await repo.moveQuestions(['q'], null); assert.equal((await repo.get('q')).folderId, null);
});
test('folders and orphan IDs roundtrip; old backups merge without folders; matching folder IDs overwrite', async () => {
  const source = createQuestionRepo({ db: fakeDB() }), target = createQuestionRepo({ db: fakeDB() });
  await source.saveFolder(folder('a')); await source.saveFolder(folder('b', 'b', 'a'));
  await source.save({ ...q, folderId: 'b' }); await source.save({ ...q, id: 'orphan', folderId: 'absent' });
  const backup = await source.exportAll(); await target.importAll(backup); assert.equal(await target.exportAll(), backup);
  await target.saveFolder(folder('a', 'renamed')); await target.importAll(backup); assert.equal((await target.listFolders()).find(f => f.id === 'a').name, 'a');
  await target.importAll({ version: 1, questions: [{ ...q, id: 'legacy' }], images: {} });
  assert.equal((await target.list()).length, 3); assert.equal((await target.listFolders()).length, 2);
});
test('cannot save image without stored or supplied picture; empty prompt JSON stays compatible', async () => {
  const repo = createQuestionRepo({ db: fakeDB() }); await assert.rejects(repo.save(picture), /圖片/);
  const { prompt, ...noPrompt } = picture; await repo.save(noPrompt, image);
  const target = createQuestionRepo({ db: fakeDB() }); await target.importAll(await repo.exportAll()); assert.deepEqual(await target.get('pic'), noPrompt);
});

test('JSON folder merge validates against existing parents and rolls back invalid hierarchies', async () => {
  const repo = createQuestionRepo({ db: fakeDB() }); await repo.saveFolder(folder('a')); await repo.save(q);
  await repo.importAll({ version: 1, questions: [], images: {}, folders: [folder('b', 'Child', 'a')] });
  assert.equal((await repo.listFolders()).length, 2);
  const before = await repo.exportAll();
  await assert.rejects(repo.importAll({ version: 1, questions: [{ ...q, answer: 'changed' }], images: {}, folders: [folder('a', 'a', 'b')] }));
  assert.equal(await repo.exportAll(), before);
});
