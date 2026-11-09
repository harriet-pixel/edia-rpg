import { toast } from '../ui/toast.js';
import { modal } from '../ui/modal.js';
export function render({ store, storage }) {
  const section = document.createElement('section');
  section.innerHTML = `
    <div class="page-heading"><p class="eyebrow">MAKE YOURSELF AT HOME</p><h1>設定</h1><p class="subtitle">調整閱讀方式，妥善收藏你的冒險紀錄。</p></div>
    <div class="settings-stack">
      <section class="paper settings-card" aria-labelledby="font-heading"><div class="card-title"><span aria-hidden="true">Aa</span><h2 id="font-heading">閱讀與字級</h2></div>
        <div class="setting-body"><p class="setting-label">選擇適合你的文字大小</p><p class="hint">設定會自動儲存，下次回來也會保留。</p>
          <div class="scale-options" role="group" aria-label="字級大小"></div><div class="font-preview"><small>閱讀預覽</small><p>準備好了嗎？讓星光引領下一段旅程。</p></div>
        </div>
      </section>
      <section class="paper settings-card" aria-labelledby="backup-heading"><div class="card-title"><span aria-hidden="true">▤</span><h2 id="backup-heading">存檔備份</h2></div>
        <div class="backup-row"><div><p class="setting-label">匯出冒險紀錄</p><p class="hint">下載 JSON 備份，將進度留在自己手上。</p></div><button class="button" id="export-save"><span aria-hidden="true">↓</span> 匯出存檔</button></div>
        <div class="backup-row"><div><p class="setting-label">從備份繼續旅程</p><p class="hint">選擇 JSON 存檔，匯入後取代目前的紀錄。</p></div><button class="button secondary" id="import-save"><span aria-hidden="true">↑</span> 匯入存檔</button><input id="save-file" type="file" accept=".json,application/json" hidden aria-label="選擇存檔 JSON"></div>
      </section>
    </div><p class="storage-caption"><span class="status-dot" aria-hidden="true"></span><span id="storage-mode"></span></p>`;
  const options = section.querySelector('.scale-options');
  const mode = section.querySelector('#storage-mode');
  const update = () => { for (const button of options.children) button.setAttribute('aria-pressed', String(Number(button.dataset.scale) === store.get('settings.fontScale'))); mode.textContent = storage.mode === 'memory' ? '目前使用記憶體存檔，離開前請匯出備份。' : '進度自動儲存在此瀏覽器，建議定期匯出備份。'; };
  for (const [label, value] of [['小', .875], ['標準', 1], ['大', 1.125], ['特大', 1.25]]) {
    const button = document.createElement('button'); button.textContent = label; button.className = 'scale-button'; button.dataset.scale = value;
    button.onclick = () => { store.set('settings.fontScale', value); update(); }; options.append(button);
  }
  update();
  section.querySelector('#export-save').onclick = () => {
    const url = URL.createObjectURL(new Blob([storage.exportSave()], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'edia-rpg-v1-save.json'; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已匯出存檔備份。');
  };
  const input = section.querySelector('#save-file');
  section.querySelector('#import-save').onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    try {
      const json = await file.text();
      // Parse and validate before asking to replace the current save.
      const { migrateSave } = await import('../core/storage.js'); migrateSave(JSON.parse(json));
      if (!await modal({ title: '匯入存檔', message: '格式驗證成功。匯入將取代目前紀錄，確定繼續嗎？', confirmLabel: '匯入並取代' })) return;
      store.importSave(json); update(); toast(storage.mode === 'memory' ? '存檔匯入成功，目前保留於記憶體，請另行匯出備份。' : '存檔匯入成功。');
    } catch (error) { toast(`匯入失敗：${error.message}。目前存檔未變更。`, { type: 'error' }); }
    finally { input.value = ''; }
  };
  return section;
}
