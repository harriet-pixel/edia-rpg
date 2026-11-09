import { getBalance } from '../core/config.js';
import { shuffle } from '../core/rng.js';
const types = ['image', 'choice', 'truefalse', 'fill'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const normalize = value => value.trim().toLowerCase().replace(/\s+/g, ' ');
export function validateQuestion(q) {
  const errors = [];
  if (!q || typeof q !== 'object' || Array.isArray(q)) return { ok: false, errors: ['題目必須是物件'] };
  if (!text(q.id)) errors.push('缺少 id');
  if (!types.includes(q.type)) errors.push('未知題型');
  if (!text(q.prompt)) errors.push('題幹不可空白');
  for (const key of ['createdAt', 'updatedAt']) if (!Number.isSafeInteger(q[key]) || q[key] < 0) errors.push(`${key} 必須是非負毫秒時間戳`);
  if (q.updatedAt < q.createdAt) errors.push('更新時間不可早於建立時間');
  if (q.type === 'choice' && (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(text) || new Set(q.options).size !== q.options.length || !q.options.includes(q.answer))) errors.push('選項至少兩個且不重複，答案須為其中之一');
  if (q.type === 'truefalse' && typeof q.answer !== 'boolean') errors.push('是非答案必須是 boolean');
  if (q.type === 'fill' && (!text(q.answer) || !q.answer.split('|').every(text))) errors.push('填充答案不可空白');
  if (q.type === 'image' && (!text(q.imageKey) || q.answer !== null)) errors.push('圖片題須有 imageKey，answer 為 null（自評）');
  return { ok: errors.length === 0, errors };
}
export function checkAnswer(q, input) {
  if (!validateQuestion(q).ok) return false;
  if (q.type === 'image') return input === true;
  if (q.type === 'fill') return typeof input === 'string' && q.answer.split('|').some(answer => normalize(answer) === normalize(input));
  return q.answer === input;
}
export function getPool(questions, mode) {
  if (!['journey', 'monster'].includes(mode)) return [];
  return questions.filter(q => validateQuestion(q).ok && (mode === 'journey' || q.type !== 'image'));
}
export function getMonsterAvailability(questions, config = { getBalance }) {
  const count = getPool(questions, 'monster').length;
  const min = typeof config.getBalance === 'function' ? config.getBalance('questions.monsterMinPool') : config.questions?.monsterMinPool;
  if (!Number.isSafeInteger(min) || min < 0) return { available: false, count, min: min ?? null, reason: 'unconfigured' };
  return { available: count >= min, count, min };
}
export function createQuestionPicker({ rng = Math.random, recentWindow = getBalance('questions.recentWindow') } = {}) {
  // null means the window has not been configured; retain only last id to avoid consecutive repeats.
  const size = Number.isSafeInteger(recentWindow) && recentWindow >= 0 ? recentWindow : 0;
  const recent = [];
  let last;
  function pick(pool) {
    if (!pool.length) return undefined;
    let candidates = pool.filter(q => !recent.includes(q.id) && q.id !== last);
    if (!candidates.length) candidates = pool.filter(q => q.id !== last);
    if (!candidates.length) candidates = pool;
    const q = shuffle(candidates, rng)[0];
    last = q.id;
    recent.push(q.id); while (recent.length > size) recent.shift();
    return q;
  }
  return { pick, pickMany(pool, n) {
    const remaining = [...new Map(pool.map(q => [q.id, q])).values()], result = [];
    if (!Number.isSafeInteger(n) || n < 0) return result;
    while (remaining.length && result.length < n) { const q = pick(remaining); result.push(q); remaining.splice(remaining.findIndex(item => item.id === q.id), 1); }
    return result;
  } };
}
