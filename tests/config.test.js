import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createConfig, loadBalance, getBalance } from '../js/core/config.js';
const data = JSON.parse(await readFile(new URL('../data/balance.json', import.meta.url), 'utf8'));
test('real config known values, null returns and warns once per path', () => {
  const calls = [], config = createConfig(data, { warn: path => calls.push(path) });
  assert.equal(config.getBalance('exp.adventure'), 5); assert.equal(config.getBalance('leveling.base'), 20); assert.equal(config.getBalance('draw.postClearBig.magicStone'), .6);
  assert.equal(config.getBalance('questions.small'), null); assert.equal(config.getBalance('questions.small'), null); assert.equal(calls.length, 1);
  config.getBalance('questions.big'); assert.equal(calls.length, 2);
  assert.throws(() => config.getBalance('missing')); assert.throws(() => config.getBalance('exp.missing')); assert.throws(() => config.getBalance(''));
});
test('_note is unreadable, excluded from parent result and validation', () => {
  const config = createConfig({ _note: { invalid: true }, nested: { _note: false, number: 3 } });
  assert.throws(() => config.getBalance('_note')); assert.throws(() => config.getBalance('nested._note'));
  assert.deepEqual(config.getBalance('nested'), { number: 3 }); const copy = config.getBalance('nested'); copy.number = 8; assert.equal(config.getBalance('nested.number'), 3);
  assert.throws(() => createConfig({ invalid: 'not numeric' })); assert.throws(() => createConfig({ invalid: -1 }));
});
test('loadBalance uses injected fetch; missing config or HTTP failure reports clearly', async () => {
  assert.throws(() => getBalance('exp.adventure'), /尚未載入/);
  await assert.rejects(loadBalance({ fetcher: async () => ({ ok: false, status: 404 }) }), /404/);
  await loadBalance({ fetcher: async () => ({ ok: true, json: async () => data }) }); assert.equal(getBalance('leveling.increment'), 10);
});
