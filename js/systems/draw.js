import { shuffle, weightedPick } from '../core/rng.js';
import { getUnownedGeneralItems } from './catalog.js';
import { grant } from './rewards.js';
const ready = value => { if (value == null) throw new Error('待設定'); return value; };
function choose(options, rng) {
  return weightedPick(options.map(option => ({ value: ready(option.amount), weight: ready(option.weight) })), rng);
}
export async function loadDrawTables(fetcher = globalThis.fetch) {
  const response = await fetcher(new URL('../../data/draw-tables.json', import.meta.url));
  if (!response.ok) throw new Error('抽牌表載入失敗');
  return response.json();
}
// All data and RNG are injected: this function never fetches or writes state.
export function drawThree(tableId, ctx) {
  try {
    const table = ctx.tables[tableId], rng = ctx.rng;
    if (!Array.isArray(table) || table.length !== 3 || typeof rng !== 'function') throw new Error('抽牌設定不正確');
    const cards = table.map(entry => {
      let kind = entry.kind, amount;
      if (kind === 'regional') {
        const config = ctx.balance.drawTables.post_big;
        kind = weightedPick([{ value: 'magicStone', weight: ready(config.magicStoneChance) }, { value: 'taskItem', weight: ready(config.taskItemChance) }], rng);
        amount = weightedPick(Object.entries(config.amountWeights).map(([value, weight]) => ({ value: Number(value), weight: ready(weight) })), rng);
      } else if (kind === 'star' || kind === 'shard') {
        const configured = ctx.balance.drawTables[kind === 'star' ? 'starAmounts' : 'shardAmounts'][tableId];
        amount = Array.isArray(configured) ? choose(configured, rng) : ready(configured);
      } else amount = choose(entry.amountOptions, rng);
      if (kind === 'progress' && ctx.storyEnabled === false) kind = 'magicStone';
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('抽牌數量不正確');
      return { kind, bundle: { items: [{ type: kind, amount, ...(['star', 'exp', 'voucher'].includes(kind) ? {} : { regionId: ctx.regionId }) }], meta: { source: tableId.endsWith('small') ? 'smallMonster' : 'bigMonster', regionId: ctx.regionId } } };
    });
    return { ok: true, cards: shuffle(cards, rng), errors: [] };
  } catch (error) { return { ok: false, cards: [], errors: [error.message] }; }
}
export function drawAccessory(state, ctx) {
  const pool = getUnownedGeneralItems(ctx.items, state.ownedItems);
  if (!pool.length) return { type: 'star', amount: ready(ctx.balance.accessoryFallbackStars) };
  const weights = ready(ctx.balance.accessoryPool.typeWeights);
  const types = [...new Set(pool.map(item => item.type))];
  const type = weightedPick(types.map(value => ({ value, weight: ready(weights[value]) })), ctx.rng);
  const candidates = pool.filter(item => item.type === type);
  return { type: 'ownedItem', itemId: candidates[Math.floor(ctx.rng() * candidates.length)].id };
}
// This adapter persists complete snapshots through the existing store in one write.
export function createDrawEngine(store, ctx) {
  const commit = state => store.importSave(JSON.stringify(state));
  function begin(drawId, tableId, options = {}) {
    if (typeof drawId !== 'string' || !drawId.trim()) throw new Error('缺少 drawId');
    const state = store.get();
    if (state.pendingDraw?.drawId === drawId || state.pendingDraw && !state.pendingDraw.resolved) return state.pendingDraw;
    if (state.grantedIds.includes(`draw:${drawId}`)) throw new Error('抽牌已領取');
    let pending;
    if (tableId === 'accessory') {
      const meta = { source: options.source ?? 'boss' };
      if (!['boss', 'levelUp'].includes(meta.source)) throw new Error('配件抽卡來源不正確');
      if (!getUnownedGeneralItems(ctx.items, state.ownedItems).length) {
        const result = grant(state, { items: [drawAccessory(state, ctx)], meta }, { ...ctx, grantId: `draw:${drawId}` });
        if (!result.ok) return result;
        pending = { drawId, cards: [{}, {}, {}], pickedIndex: null, resolved: true, result: result.applied, mode: 'accessory', meta };
        result.state.pendingDraw = pending; commit(result.state); return pending;
      }
      pending = { drawId, cards: [{}, {}, {}], pickedIndex: null, resolved: false, mode: 'accessory', meta };
    } else {
      const result = drawThree(tableId, { ...ctx, ...options });
      if (!result.ok) return result;
      pending = { drawId, cards: result.cards, pickedIndex: null, resolved: false, mode: 'reward' };
    }
    state.pendingDraw = pending; commit(state); return pending;
  }
  function pickCard(drawId, index) {
    const state = store.get(), pending = state.pendingDraw;
    if (!pending || pending.drawId !== drawId || pending.resolved || ![0, 1, 2].includes(index)) return { ok: false, state, applied: [], errors: ['無效或已完成的選擇'] };
    try {
      const bundle = pending.mode === 'accessory' ? { items: [drawAccessory(state, ctx)], meta: pending.meta } : pending.cards[index].bundle;
      const result = grant(state, bundle, { ...ctx, grantId: `draw:${drawId}` });
      if (!result.ok) return result;
      result.state.pendingDraw = { ...pending, pickedIndex: index, resolved: true, result: result.applied };
      commit(result.state); return result;
    } catch (error) { return { ok: false, state, applied: [], errors: [error.message] }; }
  }
  return { begin, pickCard, restore: () => store.get('pendingDraw') };
}
