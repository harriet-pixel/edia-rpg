export function createEventBus() {
  const listeners = new Map();
  const off = (event, fn) => { listeners.get(event)?.delete(fn); if (!listeners.get(event)?.size) listeners.delete(event); };
  return { on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); return () => off(event, fn); },
    off, emit(event, payload) { for (const fn of [...(listeners.get(event) ?? [])]) fn(payload); } };
}
export const events = createEventBus();
export const { on, off, emit } = events;
