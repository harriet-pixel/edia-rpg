const types = new Set(['hair', 'eyes', 'outfit', 'pet']);
export function getUnownedGeneralItems(items, owned, filter = () => true) {
  return items.filter(item => item.general === true && types.has(item.type) && owned[item.id] !== true && filter(item));
}
export async function loadCatalog(fetcher = globalThis.fetch) {
  const response = await fetcher(new URL('../../data/items.json', import.meta.url));
  if (!response.ok) throw new Error('物品目錄載入失敗');
  return response.json();
}
