export function toast(message, { type = 'info', duration = 6000 } = {}) {
  let host = document.getElementById('toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.className = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.append(host); }
  const element = document.createElement('div'); element.className = 'toast'; element.dataset.type = type; element.textContent = message;
  host.append(element);
  const close = () => element.remove();
  if (duration > 0) setTimeout(close, duration);
  return close;
}
