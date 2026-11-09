export function mountCurrency(container, store) {
  function render() {
    container.replaceChildren();
    const bar = document.createElement('div'); bar.className = 'currency';
    const stars = document.createElement('span'); stars.className = 'currency-stars';
    const icon = document.createElement('b'); icon.textContent = '✦'; icon.setAttribute('aria-hidden', 'true');
    stars.append(icon, `星星 ${store.get('currencies.stars')}`);
    const placeholder = document.createElement('span'); placeholder.className = 'currency-placeholder'; placeholder.textContent = '—'; placeholder.setAttribute('aria-label', '其他資源尚未開放');
    bar.append(stars, placeholder); container.append(bar);
  }
  render(); return store.subscribe(render);
}
