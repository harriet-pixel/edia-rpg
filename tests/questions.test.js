import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuestion, checkAnswer, getPool, getMonsterAvailability, createQuestionPicker } from '../js/systems/questions.js';
import { createRng } from '../js/core/rng.js';
const base = { id: 'q', prompt: 'Question?', createdAt: 1, updatedAt: 2 };
const samples = [ { ...base, type: 'image', imageKey: 'img', answer: null }, { ...base, type: 'choice', options: ['A', 'B'], answer: 'A' }, { ...base, type: 'truefalse', answer: false }, { ...base, type: 'fill', answer: 'New York | NYC' } ];
for (const q of samples) test(`validate ${q.type}: valid and invalid`, () => {
  assert.equal(validateQuestion(q).ok, true);
  for (const patch of [{ id: '' }, { prompt: ' ' }, { createdAt: 'yesterday' }, { updatedAt: -1 }, { type: 'other' }, { answer: undefined }]) assert.equal(validateQuestion({ ...q, ...patch }).ok, false);
});
test('validation rejects malformed options, answers, image references and containers', () => {
  for (const value of [null, undefined, [], 'q', {}, { ...samples[0], imageKey: '' }, { ...samples[1], options: ['A'] }, { ...samples[1], answer: 'C' }, { ...samples[1], options: ['A', 'A'] }, { ...samples[2], answer: 'true' }, { ...samples[3], answer: 'a||b' }, { ...base, type: 'fill', answer: 7 }]) assert.equal(validateQuestion(value).ok, false);
});
test('answer normalization, alternatives, exact punctuation and non-string input', () => {
  for (const value of [' new YORK ', 'NEW    york', 'nyc', '\tnew\nyork ']) assert.equal(checkAnswer(samples[3], value), true);
  for (const value of ['new-york', 'new york!', 'newyork', '', null, true, 123, {}, ['NYC']]) assert.equal(checkAnswer(samples[3], value), false);
  assert.equal(checkAnswer(samples[1], 'A'), true); assert.equal(checkAnswer(samples[1], 'a'), false);
  assert.equal(checkAnswer(samples[2], false), true); assert.equal(checkAnswer(samples[2], 'false'), false);
  assert.equal(checkAnswer(samples[0], true), true); assert.equal(checkAnswer(samples[0], false), false);
  assert.equal(checkAnswer(null, 'a'), false);
});
test('pool excludes all image questions for monsters without mutating input', () => {
  assert.deepEqual(getPool(samples, 'journey'), samples);
  assert.deepEqual(getPool(samples, 'monster'), samples.slice(1));
  assert.deepEqual(getPool(samples, 'unknown'), []);
  assert.equal(getPool([...samples, {}], 'monster').length, 3);
});
test('monster availability below, at threshold, null and injected getter', () => {
  const availability = min => getMonsterAvailability(samples, { questions: { monsterMinPool: min } });
  assert.deepEqual(availability(4), { available: false, count: 3, min: 4 });
  assert.deepEqual(availability(3), { available: true, count: 3, min: 3 });
  assert.deepEqual(availability(null), { available: false, count: 3, min: null, reason: 'unconfigured' });
  assert.equal(getMonsterAvailability(samples, { getBalance: path => { assert.equal(path, 'questions.monsterMinPool'); return 3; } }).available, true);
});
const pool = Array.from({ length: 8 }, (_, id) => ({ id }));
test('picker seed reproducibility and recent avoidance', () => {
  const sequence = () => { const picker = createQuestionPicker({ rng: createRng('seed'), recentWindow: 3 }); return Array.from({ length: 50 }, () => picker.pick(pool).id); };
  const result = sequence(); assert.deepEqual(result, sequence());
  result.forEach((id, i) => assert.ok(!result.slice(Math.max(0, i - 3), i).includes(id)));
});
test('pickMany unique ids, exhausted/small pools and no consecutive repeats', () => {
  const picker = createQuestionPicker({ rng: createRng(2), recentWindow: 20 });
  assert.equal(picker.pick([]), undefined); assert.deepEqual(picker.pickMany([], 20), []);
  assert.equal(picker.pickMany([...pool, pool[0]], 20).length, 8);
  assert.deepEqual(picker.pickMany(pool, 0), []); assert.deepEqual(picker.pickMany(pool, Infinity), []);
  assert.equal(picker.pick([pool[0]]), pool[0]); assert.equal(picker.pick([pool[0]]), pool[0]);
  const ids = Array.from({ length: 30 }, () => picker.pick(pool.slice(0, 2)).id);
  ids.slice(1).forEach((id, i) => assert.notEqual(id, ids[i]));
  assert.equal(picker.pickMany(pool, 4).length, 4);
});
test('null and zero windows do not crash or consecutively repeat when avoidable', () => {
  for (const recentWindow of [null, 0]) { const picker = createQuestionPicker({ recentWindow, rng: createRng(3) }); let last; for (let i = 0; i < 10; i++) { const q = picker.pick(pool); assert.notEqual(q.id, last); last = q.id; } }
});
