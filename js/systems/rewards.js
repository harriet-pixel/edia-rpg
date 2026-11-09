import { validateSave } from '../core/storage.js';
const handlers = new Map();
const regional = new Set(['progress', 'taskItem', 'magicStone']);
const key = value => typeof value === 'string' && value.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(value);
const count = value => { if (value === null) throw new Error('待設定'); if (!Number.isSafeInteger(value) || value < 0) throw new Error('獎勵數量必須為非負整數'); };
export function registerRewardHandler(type, fn) {
  if (!regional.has(type) || typeof fn !== 'function') throw new Error('無效的區域處理器');
  if (handlers.has(type)) throw new Error('處理器已註冊');
  handlers.set(type, fn); return () => { if (handlers.get(type) === fn) handlers.delete(type); };
}
// Pure unless a commit callback is supplied. Handlers only receive an isolated draft.
export function grant(state, bundle, ctx = {}) {
  const fail = error => ({ ok: false, state, applied: [], errors: [error.message] });
  try {
    if (!key(ctx.grantId)) throw new Error('缺少 grantId');
    if (state.grantedIds.includes(ctx.grantId)) return { ok: true, state, applied: [], errors: [] };
    let reward = structuredClone(bundle);
    const source = reward?.meta?.source;
    if (!key(source)) throw new Error('缺少獎勵來源');
    if (['smallMonster', 'bigMonster'].includes(source)) {
      for (const modifier of ctx.modifiers ?? []) reward = modifier(structuredClone(reward));
    }
    if (!Array.isArray(reward?.items) || reward?.meta?.source !== source) throw new Error('獎勵包格式不正確');
    // Validate the entire bundle before invoking any handler.
    for (const item of reward.items) {
      if (!item || !key(item.type)) throw new Error('獎勵格式不正確');
      if (regional.has(item.type)) {
        if (!handlers.has(item.type)) throw new Error(`未註冊處理器：${item.type}`);
        if (!key(item.regionId ?? reward.meta.regionId)) throw new Error('缺少 regionId');
        count(item.amount);
      } else if (['star', 'shard', 'exp', 'voucher', 'gem'].includes(item.type)) {
        count(item.amount);
        if (item.type === 'shard' && !key(item.regionId ?? reward.meta.regionId)) throw new Error('缺少 regionId');
        if (item.type === 'gem' && (!['common', 'rare', 'legendary'].includes(item.rarity) || !key(item.id))) throw new Error('寶石格式不正確');
      } else if (item.type === 'ownedItem') {
        if (!key(item.itemId) || !ctx.items?.some(entry => entry.id === item.itemId)) throw new Error('找不到物品');
      } else throw new Error(`未知獎勵：${item.type}`);
    }
    let next = structuredClone(state);
    for (const item of reward.items) {
      const regionId = item.regionId ?? reward.meta.regionId;
      if (regional.has(item.type)) {
        const result = handlers.get(item.type)(next, { ...item, regionId }, structuredClone(reward.meta));
        if (result?.then) throw new Error('處理器必須同步');
        if (result !== undefined) next = result;
      } else if (item.type === 'star') next.stars += item.amount;
      else if (item.type === 'exp') next.exp += item.amount;
      else if (item.type === 'voucher') next.vouchers += item.amount;
      else if (item.type === 'shard') next.shards[regionId] = (next.shards[regionId] ?? 0) + item.amount;
      else if (item.type === 'gem') { next.gems[item.rarity] ??= {}; next.gems[item.rarity][item.id] = (next.gems[item.rarity][item.id] ?? 0) + item.amount; }
      else next.ownedItems[item.itemId] = true;
    }
    if (next.exp < state.exp) throw new Error('EXP 不可減少');
    next.grantedIds.push(ctx.grantId);
    next.currencies.stars = next.stars; // Legacy display compatibility.
    validateSave(next);
    const applied = structuredClone(reward.items);
    if (ctx.commit) ctx.commit(structuredClone(next));
    return { ok: true, state: next, applied, errors: [] };
  } catch (error) { return fail(error); }
}
