import { questionRepo, parseQuestionImport, isImageDataURL } from '../systems/question-repo.js';
import { getMonsterAvailability, validateQuestion } from '../systems/questions.js';
import { loadBalance } from '../core/config.js';
import { toast } from '../ui/toast.js';
import { modal } from '../ui/modal.js';
import { createImage } from '../ui/placeholder.js';
const names = { image: '圖片題', choice: '選擇題', truefalse: '是非題', fill: '填充題' };
const readImage = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => isImageDataURL(reader.result) ? resolve(reader.result) : reject(new Error('請選擇 PNG、JPEG、GIF、WebP、AVIF 或 BMP 圖片')); reader.onerror = () => reject(new Error('圖片讀取失敗')); reader.readAsDataURL(file); });
export function render() {
  const section = document.createElement('section');
  section.innerHTML = `<style>
    .bank-stack{display:grid;gap:1rem}.bank-toolbar{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center}.bank-card{padding:1.2rem;overflow-wrap:anywhere}.bank-form label{display:grid;gap:.35rem;margin:.8rem 0}.bank-form input,.bank-form select,.bank-form textarea,.bank-filter{font:inherit;max-width:100%;width:100%;padding:.6rem;border:1px solid #a49579;border-radius:.3rem;background:#fffaf0;color:#302a20}.bank-form textarea{min-height:6rem}.bank-filter{width:auto}.bank-card .image-placeholder{max-width:20rem;margin:.7rem 0}.bank-card .image-placeholder img{max-height:14rem}.bank-card p{white-space:pre-wrap}.bank-form [hidden]{display:none}
    </style><div class="page-heading"><p class="eyebrow">YOUR QUESTION COLLECTION</p><h1>我的題庫</h1><p class="subtitle">收藏學習題目，為下一段旅程做好準備。</p></div>
    <div class="bank-stack"><div class="paper bank-card"><p class="bank-counts" aria-live="polite">載入題庫中…</p><p class="bank-availability" role="status"></p><div class="bank-toolbar"><button class="button bank-new">新增題目</button><button class="button secondary bank-export">匯出題庫</button><button class="button secondary bank-import">匯入 JSON（合併）</button><input class="bank-file" type="file" accept=".json,application/json" aria-label="選擇題庫 JSON" hidden></div></div>
    <div class="bank-editor"></div><label>依題型篩選 <select class="bank-filter"><option value="">全部題型</option>${Object.entries(names).map(([type, name]) => `<option value="${type}">${name}</option>`).join('')}</select></label><div class="bank-list bank-stack" aria-live="polite"></div></div>`;
  const find = selector => section.querySelector(selector);
  const editor = find('.bank-editor'), list = find('.bank-list');
  let questions = [], generation = 0;
  const config = loadBalance(); config.catch(() => {});
  async function refresh() {
    questions = await questionRepo.list();
    find('.bank-counts').textContent = Object.entries(names).map(([type, name]) => `${name} ${questions.filter(q => q.type === type).length}`).join(' ／ ');
    try {
      const state = getMonsterAvailability(questions, await config);
      find('.bank-availability').textContent = `怪物可用題數：${state.count}。${state.reason === 'unconfigured' ? '怪物題數門檻待設定，目前不可進行怪物遭遇。' : state.available ? `已達門檻 ${state.min} 題。` : `至少需要 ${state.min} 題，請先新增選擇、是非或填充題。`}`;
    } catch { find('.bank-availability').textContent = '設定載入失敗，怪物題數門檻暫時無法確認。'; }
    draw();
  }
  function run(action) { return async event => { const button = event?.currentTarget; if (button?.tagName === 'BUTTON') button.disabled = true; try { await action(); } catch (error) { toast(error.message, { type: 'error' }); } finally { if (button) button.disabled = false; } }; }
  function draw() {
    const current = ++generation;
    list.replaceChildren();
    const shown = questions.filter(q => !find('.bank-filter').value || q.type === find('.bank-filter').value);
    if (!shown.length) { const empty = document.createElement('p'); empty.textContent = '目前沒有這類題目，點「新增題目」開始收藏。'; list.append(empty); }
    for (const q of shown) {
      const card = document.createElement('article'); card.className = 'paper bank-card';
      const title = document.createElement('h2'); title.textContent = names[q.type] ?? '未知題型';
      const prompt = document.createElement('p'); prompt.textContent = q.prompt;
      card.append(title, prompt);
      if (q.type === 'image') {
        const image = createImage({ alt: '圖片遺失，請編輯題目重新上傳' }); card.append(image);
        questionRepo.getImage(q.imageKey).then(src => { if (current === generation) image.replaceWith(createImage({ src: isImageDataURL(src) ? src : undefined, alt: '題目圖片（缺圖時請重新上傳）' })); }).catch(error => toast(error.message, { type: 'error' }));
      }
      const answer = document.createElement('p'); answer.textContent = q.type === 'image' ? '自評：答對了／下次再試' : `答案：${q.type === 'truefalse' ? (q.answer ? '是' : '否') : q.answer}${q.type === 'choice' ? `（選項：${q.options.join('、')}）` : ''}`; card.append(answer);
      const actions = document.createElement('div'); actions.className = 'bank-toolbar';
      const edit = document.createElement('button'); edit.className = 'button secondary'; edit.textContent = '編輯'; edit.onclick = () => openEditor(q);
      const remove = document.createElement('button'); remove.className = 'button secondary'; remove.textContent = '刪除'; remove.onclick = run(async () => { if (!await modal({ title: '刪除題目', message: `確定刪除「${q.prompt}」及其圖片？`, confirmLabel: '刪除' })) return; await questionRepo.remove(q.id); if (editor.dataset.id === q.id) editor.replaceChildren(); await refresh(); toast('題目已刪除。'); });
      actions.append(edit, remove); card.append(actions); list.append(card);
    }
  }
  function openEditor(q) {
    editor.dataset.id = q?.id ?? '';
    const form = document.createElement('form'); form.className = 'paper bank-card bank-form';
    form.innerHTML = `<h2>${q ? '編輯' : '新增'}題目</h2><label>題型<select name="type">${Object.entries(names).map(([type, name]) => `<option value="${type}">${name}</option>`).join('')}</select></label><label>題幹<textarea name="prompt" required></textarea></label><label data-field="choice">選項（每行一個，至少兩個）<textarea name="options"></textarea></label><label data-field="text">答案<input name="answer"><span class="hint">選擇題填寫其中一個選項；填充題可用 | 分隔多個答案。</span></label><label data-field="truefalse">答案<select name="boolean"><option value="true">是</option><option value="false">否</option></select></label><label data-field="image">圖片<input name="image" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"><span class="hint">無標準答案，出題後自評「答對了／下次再試」。編輯時不選檔案則保留原圖。</span></label><div class="bank-toolbar"><button class="button" type="submit">儲存題目</button><button class="button secondary bank-cancel" type="button">取消</button></div>`;
    const field = name => form.elements.namedItem(name);
    field('type').value = q?.type ?? 'choice'; field('prompt').value = q?.prompt ?? ''; field('options').value = q?.options?.join('\n') ?? ''; field('answer').value = typeof q?.answer === 'string' ? q.answer : ''; field('boolean').value = String(q?.answer ?? true);
    function update() { const type = field('type').value; for (const label of form.querySelectorAll('[data-field]')) label.hidden = !(label.dataset.field === type || label.dataset.field === 'text' && ['choice', 'fill'].includes(type)); }
    field('type').onchange = update; update();
    form.querySelector('.bank-cancel').onclick = () => editor.replaceChildren();
    form.onsubmit = async event => {
      event.preventDefault(); const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
      try {
        const type = field('type').value, now = Date.now();
        const next = { id: q?.id ?? crypto.randomUUID(), type, prompt: field('prompt').value.trim(), answer: type === 'image' ? null : type === 'truefalse' ? field('boolean').value === 'true' : field('answer').value.trim(), createdAt: q?.createdAt ?? now, updatedAt: now };
        let image;
        if (type === 'choice') next.options = field('options').value.split('\n').map(s => s.trim()).filter(Boolean);
        if (type === 'image') { const file = field('image').files[0]; if (file) image = await readImage(file); next.imageKey = image ? `image-${crypto.randomUUID()}` : q?.imageKey; }
        const valid = validateQuestion(next); if (!valid.ok) throw new Error(valid.errors.join('；'));
        await questionRepo.save(next, image); editor.replaceChildren(); await refresh(); toast('題目已儲存。');
      } catch (error) { toast(`儲存失敗：${error.message}`, { type: 'error' }); }
      finally { submit.disabled = false; }
    };
    editor.replaceChildren(form); field('prompt').focus();
  }
  find('.bank-new').onclick = () => openEditor(); find('.bank-filter').onchange = draw;
  find('.bank-export').onclick = run(async () => {
    const json = await questionRepo.exportAll(), url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'edia-rpg-v1-questions.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('題庫已匯出（含可用圖片）。');
  });
  const input = find('.bank-file'); find('.bank-import').onclick = () => input.click();
  input.onchange = run(async () => {
    try {
      const file = input.files[0]; if (!file) return;
      const json = await file.text(), preview = parseQuestionImport(json);
      if (!await modal({ title: '合併匯入題庫', message: `有效 ${preview.questions.length} 題，無效 ${preview.skipped} 題將略過。相同 id 的題目將覆蓋，其他題目保留。確定匯入？`, confirmLabel: '合併匯入' })) return;
      const result = await questionRepo.importAll(json); await refresh(); toast(`已匯入 ${result.imported} 題，略過 ${result.skipped} 題。`);
    } finally { input.value = ''; }
  });
  refresh().catch(error => { find('.bank-counts').textContent = '題庫讀取失敗，請重新進入此頁再試。'; toast(error.message, { type: 'error' }); });
  return section;
}
