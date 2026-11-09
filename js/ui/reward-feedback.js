import { toast } from './toast.js';
const labels = { star: '星星', shard: '區域碎片', exp: 'EXP', voucher: '服裝兌換券', gem: '寶石', ownedItem: '物品', progress: '進度', taskItem: '任務道具', magicStone: '魔法石' };
export function presentGrant(result) {
  if (!result.ok) return toast(result.errors.join('、'), { type: 'error' });
  if (!result.applied.length) return toast('此獎勵已領取');
  return toast(result.applied.map(item => `${labels[item.type] ?? item.type} ${item.itemId ?? item.id ?? `×${item.amount}`}`).join('、'));
}
