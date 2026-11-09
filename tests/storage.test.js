import test from 'node:test';
import assert from 'node:assert/strict';
import { PREFIX, SAVE_KEY, createStorage, createDefaultSave, migrateSave, createIndexedDB } from '../js/core/storage.js';
export function backend() { const data = new Map(); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; }
test('prefix and synchronous read/write roundtrip', () => {
  const disk = backend(), save = createStorage({ backend: disk });
  const state = save.load(); state.currencies.stars = 12; save.save(state);
  assert.equal(JSON.parse(disk.data.get(SAVE_KEY)).currencies.stars, 12);
  assert.equal(createStorage({ backend: disk }).load().currencies.stars, 12);
  assert.ok([...disk.data.keys()].every(key => key.startsWith(PREFIX)));
});
test('corrupt JSON is backed up verbatim before memory reset', () => {
  const disk = backend(), notices = []; disk.data.set(SAVE_KEY, '{broken');
  const save = createStorage({ backend: disk, notify: message => notices.push(message) });
  assert.equal(save.mode, 'memory'); assert.deepEqual(save.load(), createDefaultSave());
  const key = save.backupKeys()[0]; assert.ok(key.startsWith(PREFIX));
  assert.equal(disk.data.get(key), '{broken'); assert.equal(save.getMemoryBackup(key), '{broken'); assert.equal(disk.data.get(SAVE_KEY), '{broken'); assert.equal(notices.length, 1);
});
test('unavailable/read failure/write failure all downgrade and keep memory changes', () => {
  for (const disk of [null, { getItem() { throw Error(); } }, { getItem: () => null, setItem() { throw Error(); } }]) {
    const notices = [], save = createStorage({ backend: disk, notify: message => notices.push(message) });
    const state = save.load(); state.currencies.stars = 9; save.save(state);
    assert.equal(save.mode, 'memory'); assert.equal(save.load().currencies.stars, 9); assert.ok(notices.length);
  }
});
test('corruption backup survives even when persistent backup write fails', () => {
  const save = createStorage({ backend: { getItem: () => 'raw', setItem() { throw Error(); } } });
  assert.equal(save.getMemoryBackup(save.backupKeys()[0]), 'raw');
});
test('fake v0 to v1 migration runs on load and import and persists v1', () => {
  const disk = backend(); disk.data.set(SAVE_KEY, JSON.stringify({ schemaVersion: 0, stars: 7 }));
  const steps = [{ from: 0, to: 1, migrate: old => ({ ...createDefaultSave(), currencies: { stars: old.stars } }) }];
  const save = createStorage({ backend: disk, migrationSteps: steps }); assert.equal(save.load().currencies.stars, 7);
  assert.equal(JSON.parse(disk.data.get(SAVE_KEY)).schemaVersion, 1);
  save.importSave('{"schemaVersion":0,"stars":4}'); assert.equal(save.load().currencies.stars, 4);
  assert.throws(() => migrateSave({ schemaVersion: 0 }));
  assert.throws(() => migrateSave({ schemaVersion: 0 }, [{ from: 0, to: 1, migrate: s => s }]));
});
test('export/import roundtrip; invalid imports never overwrite disk or memory', () => {
  const disk = backend(), save = createStorage({ backend: disk }), state = save.load(); state.settings.fontScale = 1.25; state.currencies.stars = 100; save.save(state);
  const exported = save.exportSave(), other = createStorage({ backend: backend() }); other.importSave(exported); assert.equal(other.exportSave(), exported);
  for (const raw of ['x', 'null', '{}', '[]', '{"schemaVersion":99}', JSON.stringify({ ...state, settings: { fontScale: 99 } }), JSON.stringify({ ...state, currencies: { stars: -1 } }), '{"schemaVersion":1,"__proto__":{}}']) {
    const original = disk.data.get(SAVE_KEY); assert.throws(() => save.importSave(raw)); assert.equal(save.exportSave(), exported); assert.equal(disk.data.get(SAVE_KEY), original);
  }
  const copy = save.load(); copy.currencies.stars = 0; assert.equal(save.load().currencies.stars, 100);
});
test('IndexedDB wrapper rejects unsupported backend without crashing import', async () => { await assert.rejects(createIndexedDB({ indexedDB: null }).open(), /不可用/); });
test('throwing localStorage getter falls back without a white screen', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    const save = createStorage(); assert.equal(save.mode, 'memory'); assert.deepEqual(save.load(), createDefaultSave());
  } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
});
test('future-version saves remain backed up and invalid schema values cannot be saved', () => {
  const disk = backend(), raw = '{"schemaVersion":999,"futureData":"keep"}'; disk.data.set(SAVE_KEY, raw);
  const save = createStorage({ backend: disk }); assert.equal(save.mode, 'memory'); assert.equal(disk.data.get(save.backupKeys()[0]), raw);
  for (const value of [new Date(), new Map(), Symbol('bad'), NaN, Infinity, undefined]) {
    const state = save.load(); state.extra = value; assert.throws(() => save.save(state));
  }
});
