export function createRng(seed) {
  if (seed === undefined) return Math.random;
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => { state = (state + 0x6D2B79F5) | 0; let n = state; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}
export function shuffle(items, rng = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function weightedPick(entries, rng = Math.random) {
  if (!entries.length || entries.some(entry => !Number.isFinite(entry.weight) || entry.weight < 0)) throw new Error('權重必須為非負有限數字');
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('總權重必須大於零');
  let point = rng() * total;
  for (const entry of entries) { point -= entry.weight; if (point < 0) return entry.value; }
  return entries.findLast(entry => entry.weight > 0).value;
}
