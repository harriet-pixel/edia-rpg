import test from 'node:test';
import assert from 'node:assert/strict';
import { createIndexedDB, CONTENT_DB_VERSION, CONTENT_DB_STORES, PREFIX } from '../js/core/storage.js';
test('contentDB version upgrade only creates missing stores and preserves existing data', async () => {
  for (const existing of [[], ['questions', 'images'], [...CONTENT_DB_STORES], ['questions', 'images', 'future-store']]) {
    const stores = new Map(existing.map(name => [name, new Map([['keep', { name }]])]));
    const snapshot = structuredClone(stores), created = [];
    const database = { objectStoreNames: { contains: name => stores.has(name) },
      createObjectStore(name) { assert.equal(stores.has(name), false); created.push(name); stores.set(name, new Map()); },
      deleteObjectStore() { assert.fail('upgrade must never delete a store'); }, close() {} };
    const indexedDB = { open(name, version) {
      assert.equal(name, `${PREFIX}:content`); assert.equal(version, CONTENT_DB_VERSION); assert.equal(version, 2);
      const request = { result: database };
      queueMicrotask(() => { request.onupgradeneeded(); request.onsuccess(); }); return request;
    } };
    assert.equal(await createIndexedDB({ indexedDB }).open(), database);
    assert.deepEqual(created, CONTENT_DB_STORES.filter(name => !existing.includes(name)));
    for (const [name, data] of snapshot) assert.deepEqual(stores.get(name), data);
    assert.deepEqual([...stores.keys()].sort(), [...new Set([...existing, ...CONTENT_DB_STORES])].sort());
  }
});
