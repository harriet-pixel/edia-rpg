import { getUnownedGeneralItems } from './catalog.js';
export function canUseVoucher(state, items) {
  return state.vouchers > 0 && getUnownedGeneralItems(items, state.ownedItems, item => item.type === 'outfit').length > 0;
}
export function getInventory(items, owned) {
  return items.map(item => ({ ...item, owned: owned[item.id] === true }));
}
