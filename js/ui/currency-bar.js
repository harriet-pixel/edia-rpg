export function mountCurrencyBar(container, store, regionId) {
  function render(state = store.get()) {
    const region = typeof regionId === 'function' ? regionId(state) : regionId;
    container.textContent = `✦ 星星 ${state.stars}　${region ? `區域碎片 ${state.shards[region] ?? 0}` : '區域碎片 —'}`;
    container.setAttribute('aria-label', '持有資源');
  }
  render(); return store.subscribe(render);
}
