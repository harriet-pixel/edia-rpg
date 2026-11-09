import { getStorage } from './storage.js';
const clone = value => structuredClone(value);
function keys(path) {
  if (typeof path !== 'string' || !path || path.split('.').some(key => !key || ['__proto__', 'prototype', 'constructor'].includes(key))) throw new Error('無效的狀態路徑');
  return path.split('.');
}
export function createStore(storage = getStorage()) {
  let state = storage.load();
  const listeners = new Set();
  const api = {
    get(path) { return clone(path === undefined ? state : keys(path).reduce((value, key) => value?.[key], state)); },
    set(path, value) {
      const next = clone(state), parts = keys(path), last = parts.pop();
      let target = next;
      for (const key of parts) { if (target[key] === undefined) target[key] = {}; if (!target[key] || typeof target[key] !== 'object') throw new Error('狀態路徑不是物件'); target = target[key]; }
      target[last] = clone(value);
      state = storage.save(next); // Synchronous persistence before notifying the UI.
      listeners.forEach(fn => fn(api.get(), path));
      return api.get(path);
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    importSave(json) { state = storage.importSave(json); listeners.forEach(fn => fn(api.get(), undefined)); return api.get(); },
  };
  return api;
}
let singleton;
export const getStore = () => singleton ??= createStore();
export const get = path => getStore().get(path);
export const set = (path, value) => getStore().set(path, value);
export const subscribe = fn => getStore().subscribe(fn);
