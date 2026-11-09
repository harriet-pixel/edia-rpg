export function createConfig(data, { warn = console.warn } = {}) {
  const warned = new Set();
  function validate(value, path = '') {
    if (value === null) return;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return;
    if (Array.isArray(value)) { value.forEach((child, i) => validate(child, `${path}.${i}`)); return; }
    if (value && typeof value === 'object') { Object.entries(value).filter(([key]) => !key.startsWith('_')).forEach(([key, child]) => validate(child, `${path}.${key}`)); return; }
    throw new Error(`設定格式不正確：${path}`);
  }
  validate(data);
  function clean(value) { if (Array.isArray(value)) return value.map(clean); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('_')).map(([key, child]) => [key, clean(child)])); return value; }
  return { getBalance(path) {
    if (typeof path !== 'string' || !path) throw new Error('設定路徑不可空白');
    let value = data;
    for (const key of path.split('.')) {
      if (key.startsWith('_') || !value || !Object.hasOwn(value, key)) throw new Error(`找不到設定：${path}`);
      value = value[key];
    }
    if (value === null && !warned.has(path)) { warned.add(path); warn(`設定待填：${path}`); }
    return clean(value);
  } };
}
let config;
export async function loadBalance({ fetcher = globalThis.fetch, url = new URL('../../data/balance.json', import.meta.url) } = {}) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`設定載入失敗：${response.status}`);
  config = createConfig(await response.json());
  return config;
}
export function getBalance(path) { if (!config) throw new Error('尚未載入 balance.json'); return config.getBalance(path); }
