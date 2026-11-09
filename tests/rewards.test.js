import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSave, createStorage, SAVE_KEY, migrateSave } from '../js/core/storage.js';
import { createStore } from '../js/core/store.js';
import { grant, registerRewardHandler } from '../js/systems/rewards.js';
import { drawThree, createDrawEngine, drawAccessory } from '../js/systems/draw.js';
import { canUseVoucher, getInventory } from '../js/systems/inventory.js';
import { getUnownedGeneralItems } from '../js/systems/catalog.js';
import { createRng } from '../js/core/rng.js';
import { readFileSync } from 'node:fs';
const read = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
const items = read('items'), tables = read('draw-tables'), balance = read('balance');
function context(seed = 1) {
  const b = structuredClone(balance), t = structuredClone(tables);
  for (const id of Object.keys(t)) { b.drawTables.starAmounts[id] = 3; for (const [i, entry] of t[id].entries()) entry.amountOptions = [{ amount: id === 'pre_big' && i === 2 ? 2 : 1, weight: 1 }]; }
  b.drawTables.shardAmounts.post_big = 2; b.accessoryPool.typeWeights = { hair: 4, eyes: 4, outfit: 1, pet: 1 };
  return { balance: b, tables: t, items, regionId: 'forest', storyEnabled: true, rng: createRng(seed) };
}
function diskStore() {
  const data = new Map(); let writes = 0;
  const backend = { getItem: k => data.get(k), setItem: (k,v) => { writes++; data.set(k,v); } };
  return { data, backend, store: createStore(createStorage({backend})), get writes() { return writes; }, reload: () => createStore(createStorage({backend})) };
}
const bundle = (items, source = 'boss') => ({ items, meta: {source, regionId:'forest'} });
test('grant validates all items, is atomic on handler failure, and persists exactly once', () => {
  const state = createDefaultSave(); let writes = 0;
  const ctx = {grantId:'a', commit: () => writes++};
  const bad = grant(state, bundle([{type:'star',amount:5},{type:'exp',amount:-1}]),ctx);
  assert.equal(bad.ok,false); assert.equal(bad.state,state); assert.equal(state.stars,0); assert.equal(writes,0);
  const stop = registerRewardHandler('progress', draft => { draft.exp = 100; throw Error('failed'); });
  assert.equal(grant(state,bundle([{type:'star',amount:5},{type:'progress',amount:1}]),ctx).ok,false); stop();
  assert.equal(state.exp,0); assert.equal(writes,0);
  const result = grant(state,bundle([{type:'star',amount:5},{type:'exp',amount:4}]),ctx);
  assert.equal(result.ok,true); assert.equal(writes,1); assert.equal(result.state.exp,4);
  const repeated = grant(result.state,bundle([{type:'star',amount:5}]),ctx);
  assert.deepEqual(repeated.applied,[]); assert.equal(repeated.state.stars,5); assert.equal(writes,1);
});
test('all unregistered regional types reject the whole bundle', () => {
  for (const type of ['progress','taskItem','magicStone']) {
    const state = createDefaultSave(), result = grant(state,bundle([{type:'star',amount:3},{type,amount:1}]),{grantId:type});
    assert.equal(result.ok,false); assert.match(result.errors[0],/未註冊/); assert.deepEqual(result.state,createDefaultSave());
  }
});
test('modifiers only run for smallMonster/bigMonster', () => {
  for (const source of ['smallMonster','bigMonster','shop','exchange','boss','levelUp']) {
    let calls = 0;
    const result = grant(createDefaultSave(),bundle([{type:'star',amount:2}],source),{grantId:source,modifiers:[b => { calls++; b.items[0].amount *= 2; return b; }]});
    const active = ['smallMonster','bigMonster'].includes(source);
    assert.equal(result.state.stars,active ? 4 : 2); assert.equal(calls,active ? 1 : 0);
  }
});
test('core resource models, catalog, voucher preservation, and EXP monotonicity', () => {
  const result = grant(createDefaultSave(),bundle([{type:'shard',amount:2},{type:'gem',rarity:'rare',id:'ruby',amount:1},{type:'voucher',amount:1},{type:'ownedItem',itemId:items[0].id}]),{grantId:'core',items});
  assert.equal(result.ok,true); assert.equal(result.state.shards.forest,2); assert.equal(result.state.gems.rare.ruby,1);
  assert.equal(getInventory(items,result.state.ownedItems)[0].owned,true);
  assert.equal(canUseVoucher(result.state,items),true);
  for (const item of items.filter(i => i.type === 'outfit')) result.state.ownedItems[item.id] = true;
  assert.equal(canUseVoucher(result.state,items),false); assert.equal(result.state.vouchers,1);
  assert.equal(grant(result.state,bundle([{type:'exp',amount:-1}]),{grantId:'negative'}).ok,false);
  assert.equal(getUnownedGeneralItems([...items,{id:'set',type:'outfit',general:false}],{}).length,items.length);
});
test('four draw compositions, guaranteed pre-clear progress, story switch, shuffled positions', () => {
  const expected = {pre_small:['progress','progress','star'],pre_big:['progress','progress','star'],post_small:['star','star','taskItem'],post_big:['magicStone','shard','star']};
  for (const id of Object.keys(expected)) {
    const ctx = context(); ctx.balance.drawTables.post_big.magicStoneChance = 1; ctx.balance.drawTables.post_big.taskItemChance = 0;
    const result = drawThree(id,ctx); assert.equal(result.ok,true); assert.deepEqual(result.cards.map(c=>c.kind).sort(),expected[id]);
  }
  const ctx = context(); ctx.storyEnabled=false;
  assert.deepEqual(drawThree('pre_small',ctx).cards.map(c=>c.kind).sort(),['magicStone','magicStone','star']);
  assert.deepEqual(drawThree('pre_big',context()).cards.filter(c=>c.kind==='progress').map(c=>c.bundle.items[0].amount).sort(),[1,2]);
  const orders = new Set(Array.from({length:20},(_,i)=>drawThree('post_big',context(i)).cards.map(c=>c.kind).join(',')));
  assert.ok(orders.size>2);
});
test('post-big uses balance 60/40 and independent half amounts', () => {
  const ctx = context('distribution'), counts = {magicStone:0,taskItem:0,one:0};
  for (let i=0;i<4000;i++) { const card=drawThree('post_big',ctx).cards.find(c=>['magicStone','taskItem'].includes(c.kind)); counts[card.kind]++; if(card.bundle.items[0].amount===1) counts.one++; }
  assert.ok(counts.magicStone>2200 && counts.magicStone<2600); assert.ok(counts.one>1800 && counts.one<2200);
});
test('pending cards persist before reveal, survive reload and pick once with one write', () => {
  const disk=diskStore(), ctx=context(); let engine=createDrawEngine(disk.store,ctx);
  const pending=engine.begin('draw-1','post_small');
  assert.deepEqual(JSON.parse(disk.data.get(SAVE_KEY)).pendingDraw,pending);
  const store=disk.reload(); engine=createDrawEngine(store,{...context(),rng:()=>{throw Error('must not redraw');}});
  assert.deepEqual(engine.begin('draw-1','post_small'),pending);
  const index=pending.cards.findIndex(c=>c.kind==='star'), writes=disk.writes;
  assert.equal(engine.pickCard('draw-1',index).ok,true); assert.equal(disk.writes,writes+1);
  assert.equal(engine.pickCard('draw-1',index).ok,false);
  const reloaded=disk.reload(); assert.equal(reloaded.get('stars'),3);
  assert.deepEqual(createDrawEngine(reloaded,context()).restore().pickedIndex,index);
});
test('accessory only samples at click and persists result through refresh', () => {
  const disk=diskStore(); let calls=0; const ctx=context(); ctx.rng=()=>{ calls++; return 0; };
  let engine=createDrawEngine(disk.store,ctx); const pending=engine.begin('acc','accessory',{source:'levelUp'});
  assert.equal(calls,0); assert.deepEqual(pending.cards,[{},{},{}]);
  const result=engine.pickCard('acc',2); assert.equal(result.ok,true); assert.ok(calls>0);
  const store=disk.reload(); engine=createDrawEngine(store,{...ctx,rng:()=>{throw Error('no redraw');}});
  assert.equal(engine.restore().pickedIndex,2); assert.deepEqual(engine.restore().result,result.applied); assert.equal(engine.pickCard('acc',0).ok,false);
});
test('accessory excludes owned types, renormalizes remaining weights, excludes special items', () => {
  const state=createDefaultSave(), ctx=context();
  for(const item of items.filter(i=>['hair','eyes'].includes(i.type))) state.ownedItems[item.id]=true;
  const outcomes=new Set(); for(let i=0;i<100;i++) outcomes.add(drawAccessory(state,ctx).itemId);
  assert.ok([...outcomes].every(id=>/outfit|pet/.test(id))); assert.equal(outcomes.size,4);
  for(const item of items.filter(i=>i.type==='outfit')) state.ownedItems[item.id]=true;
  ctx.balance.accessoryPool.typeWeights={pet:1}; assert.match(drawAccessory(state,ctx).itemId,/pet/);
});
test('all collected skips cards, awards fallback once, ignores unset weights', () => {
  const disk=diskStore(), state=disk.store.get(); for(const item of items)state.ownedItems[item.id]=true;
  disk.store.importSave(JSON.stringify(state)); const ctx=context(); ctx.balance.accessoryPool.typeWeights=null;
  const engine=createDrawEngine(disk.store,ctx), result=engine.begin('full','accessory');
  assert.equal(result.resolved,true); assert.equal(result.pickedIndex,null); assert.equal(disk.store.get('stars'),30);
  engine.begin('full','accessory'); assert.equal(disk.store.get('stars'),30);
  assert.equal(disk.reload().get('stars'),30);
});
test('null configuration reports 待設定 without saving or granting', () => {
  const ctx=context(); ctx.balance=balance;
  for(const id of Object.keys(tables)) assert.deepEqual(drawThree(id,ctx).errors,['待設定']);
  assert.throws(()=>drawAccessory(createDefaultSave(),ctx),/待設定/);
  const disk=diskStore(), engine=createDrawEngine(disk.store,ctx), writes=disk.writes;
  assert.equal(engine.begin('unset','pre_small').ok,false); assert.equal(disk.writes,writes);
  assert.deepEqual(grant(createDefaultSave(),bundle([{type:'star',amount:null}]),{grantId:'null'}).errors,['待設定']);
});
test('v1 migration preserves old settings, stars and unknown future phase data', () => {
  const old={schemaVersion:1,settings:{fontScale:1.25},currencies:{stars:17},questions:{keep:true}};
  const next=migrateSave(old); assert.equal(next.schemaVersion,2); assert.equal(next.stars,17); assert.deepEqual(next.questions,old.questions); assert.equal(next.pendingDraw,null);
  const disk=diskStore(); disk.data.set(SAVE_KEY,JSON.stringify(old)); const store=disk.reload(); assert.equal(store.get('stars'),17);
  assert.equal(createDrawEngine(store,context()).begin('migrated','post_small').cards.length,3);
});
test('registered regional handler succeeds; failed pick preserves pending and every resource', () => {
  const disk=diskStore(), ctx=context(), engine=createDrawEngine(disk.store,ctx);
  const pending=engine.begin('regional','pre_small'), index=pending.cards.findIndex(card=>card.kind==='progress');
  const before=disk.store.get(), writes=disk.writes;
  assert.equal(engine.pickCard('regional',index).ok,false); assert.equal(disk.writes,writes); assert.deepEqual(disk.store.get(),before);
  const stop=registerRewardHandler('progress',(draft,item)=>{draft.regionTest={[item.regionId]:item.amount};});
  try {const result=engine.pickCard('regional',index); assert.equal(result.ok,true); assert.equal(result.state.regionTest.forest,1); assert.equal(disk.store.get('pendingDraw').resolved,true);} finally {stop();}
});
test('regional handler cannot lower cumulative EXP or persist malformed resources', () => {
  const state=createDefaultSave(); state.exp=10;
  const stop=registerRewardHandler('magicStone',draft=>{draft.exp=0;});
  try {assert.equal(grant(state,bundle([{type:'magicStone',amount:1}]),{grantId:'lower'}).ok,false);assert.equal(state.exp,10);} finally {stop();}
});
