export function createImage({ src, alt = '圖片待補', className = '' } = {}) {
  const wrapper = document.createElement('div'); wrapper.className = `image-placeholder ${className}`;
  const fallback = () => { wrapper.replaceChildren(); wrapper.textContent = alt; wrapper.setAttribute('role', 'img'); wrapper.setAttribute('aria-label', alt); };
  fallback();
  if (src) { const img = new Image(); img.alt = alt; img.onload = () => { wrapper.removeAttribute('role'); wrapper.removeAttribute('aria-label'); wrapper.replaceChildren(img); }; img.onerror = fallback; img.src = src; }
  return wrapper;
}
