import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, weightedPick, shuffle } from '../js/core/rng.js';
test('seeded RNG reproducible and bounded', () => {
  const sample = seed => { const rng = createRng(seed); return Array.from({ length: 1000 }, () => rng()); };
  assert.deepEqual(sample('edia'), sample('edia')); assert.notDeepEqual(sample(1), sample(2)); assert.ok(sample(0).every(n => n >= 0 && n < 1));
});
test('weighted selection follows distribution and rejects invalid tables', () => {
  const rng = createRng(42), entries = [{ value: 'stone', weight: .6 }, { value: 'item', weight: .4 }, { value: 'zero', weight: 0 }];
  let stones = 0; for (let i = 0; i < 20000; i++) { const value = weightedPick(entries, rng); assert.notEqual(value, 'zero'); if (value === 'stone') stones++; }
  assert.ok(stones / 20000 > .58 && stones / 20000 < .62);
  for (const table of [[], [{ weight: 0 }], [{ weight: -1 }], [{ weight: null }], [{ weight: Infinity }]]) assert.throws(() => weightedPick(table));
});
test('shuffle keeps duplicates and elements, does not mutate, reproducible', () => {
  const original = [1, 2, 2, 3, 4, 5], shuffled = shuffle(original, createRng(4));
  assert.deepEqual([...shuffled].sort(), original); assert.deepEqual(original, [1, 2, 2, 3, 4, 5]); assert.deepEqual(shuffled, shuffle(original, createRng(4))); assert.deepEqual(shuffle([]), []);
});
