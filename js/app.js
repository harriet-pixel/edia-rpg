import { getStorage } from './core/storage.js';
import { getStore } from './core/store.js';
import { loadBalance } from './core/config.js';
import { mountCurrency } from './ui/currency.js';
import { toast } from './ui/toast.js';
import * as adventure from './pages/adventure.js';
import * as wardrobe from './pages/wardrobe.js';
import * as shop from './pages/shop.js';
import * as beasts from './pages/beasts.js';
import * as more from './pages/more.js';
import * as bank from './pages/bank.js';
import * as gems from './pages/gems.js';
import * as profile from './pages/profile.js';
import * as editor from './pages/editor.js';
import * as settings from './pages/settings.js';
const storage = getStorage(), store = getStore();
const pages = { adventure, wardrobe, shop, beasts, more, bank, gems, profile, editor, settings };
const tabs = [['adventure', '冒險', '♧'], ['wardrobe', '更衣室', '♙'], ['shop', '商店', '▱'], ['beasts', '神獸', '✧'], ['more', '更多', '☷']];
const titles = Object.fromEntries([...tabs, ...more.morePages].map(([path, title]) => [path, title]));
const nav = document.getElementById('main-nav');
for (const [path, title, icon] of tabs) {
  const link = document.createElement('a'); link.href = `#/${path}`; link.className = 'nav-link'; link.dataset.page = path;
  link.innerHTML = `<span class="nav-icon" aria-hidden="true">${icon}</span><span>${title}</span><span class="nav-arrow" aria-hidden="true">›</span>`; nav.append(link);
}
function refreshState() {
  document.documentElement.style.setProperty('--font-scale', store.get('settings.fontScale'));
  const notice = document.getElementById('storage-notice');
  notice.hidden = storage.mode !== 'memory'; notice.textContent = storage.notices.at(-1) ?? '';
}
refreshState(); store.subscribe(refreshState); mountCurrency(document.getElementById('currency'), store);
function route(focus = true) {
  let path = location.hash.replace(/^#\/?/, '') || 'adventure';
  if (!Object.hasOwn(pages, path)) { path = 'adventure'; history.replaceState(null, '', '#/adventure'); toast('找不到頁面，已返回冒險。'); }
  const currentTab = tabs.some(([name]) => name === path) ? path : 'more';
  for (const link of nav.children) { if (link.dataset.page === currentTab) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }
  const main = document.getElementById('content'); main.replaceChildren(pages[path].render({ store, storage }));
  document.title = `${titles[path]}｜伊迪亞大陸`;
  if (focus) { main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
}
document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); document.getElementById('content').focus(); });
window.addEventListener('hashchange', () => route()); route(false);
loadBalance().catch(error => toast(error.message, { type: 'error', duration: 0 }));
