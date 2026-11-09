export const morePages = [['bank', '我的題庫', '▤'], ['gems', '寶石圖鑑', '◇'], ['profile', '冒險者檔案', '♙'], ['editor', '配件編輯室', '✎'], ['settings', '設定', '⚙']];
export function render() {
  const section = document.createElement('section');
  section.innerHTML = '<div class="page-heading"><p class="eyebrow">YOUR JOURNAL</p><h1>更多</h1></div><div class="more-list"></div>';
  for (const [path, title, icon] of morePages) {
    const link = document.createElement('a'); link.href = `#/${path}`; link.className = 'menu-item';
    link.innerHTML = `<span class="nav-icon" aria-hidden="true">${icon}</span><span>${title}</span><span class="nav-arrow" aria-hidden="true">↗</span>`;
    section.querySelector('.more-list').append(link);
  }
  return section;
}
