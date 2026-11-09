import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, SAVE_KEY } from '../js/core/storage.js';
import { createStore } from '../js/core/store.js';
test('store get/set/subscribe persists before notification, unsubscribe and defensive copies', () => {
  const data = new Map(), storage = createStorage({ backend: { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) } });
  const store = createStore(storage), calls = [];
  const stop = store.subscribe((state, path) => { assert.equal(JSON.parse(data.get(SAVE_KEY)).currencies.stars, state.currencies.stars); calls.push(path); });
  assert.equal(store.get('currencies.stars'), 0); store.set('currencies.stars', 10); assert.equal(store.get('currencies.stars'), 10); assert.deepEqual(calls, ['currencies.stars']);
  const copy = store.get(); copy.settings.fontScale = 99; assert.equal(store.get('settings.fontScale'), 1);
  assert.throws(() => store.set('__proto__.polluted', true)); assert.throws(() => store.set('settings.fontScale', 9)); assert.equal(store.get('settings.fontScale'), 1);
  stop(); store.set('settings.fontScale', 1.25); assert.equal(calls.length, 1);
});
test('store import replaces state and notifies; failed import preserves state', () => {
  const store = createStore(createStorage({ backend: null })); let calls = 0; store.subscribe(() => calls++);
  const state = store.get(); state.currencies.stars = 5; store.importSave(JSON.stringify(state)); assert.equal(store.get('currencies.stars'), 5); assert.equal(calls, 1);
  assert.throws(() => store.importSave('{}')); assert.equal(calls, 1); assert.equal(store.get('currencies.stars'), 5);
});
