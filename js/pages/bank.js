import { questionRepo, parseQuestionImport, isImageDataURL } from '../systems/question-repo.js';
import { getMonsterAvailability, validateQuestion } from '../systems/questions.js';
import { loadBalance } from '../core/config.js';
import { toast } from '../ui/toast.js';
import { modal } from '../ui/modal.js';
import { buildFolderTree, getFolderQuestions, resolveFolderPath } from '../systems/question-folders.js';
import { buildTemplate, parseQuestionCsv, validateImageFile, DEFAULT_MAX_IMAGE_BYTES } from '../systems/question-csv.js';
import { createImage } from '../ui/placeholder.js';
const ALL_FOLDERS = Symbol('all-folders');
const names = { image: '圖片題', choice: '選擇題', truefalse: '是非題', fill: '填充題' };
const readImage = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => isImageDataURL(reader.result) ? resolve(reader.result) : reject(new Error('請選擇 PNG、JPEG、GIF、WebP、AVIF 或 BMP 圖片')); reader.onerror = () => reject(new Error('圖片讀取失敗')); reader.readAsDataURL(file); });
export function render() {
  const section = document.createElement('section');
  section.innerHTML = `<style>
    .bank-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:1rem}.bank-folders{align-self:start;padding:1rem}.bank-folder-row{display:flex;align-items:center;gap:.3rem;flex-wrap:wrap;margin:.4rem 0}.bank-folder-row button{max-width:100%;overflow-wrap:anywhere}.bank-folder-row [aria-current="true"]{outline:3px solid #806127}.bank-folders details{margin-left:.5rem}.bank-folders input{width:100%;font:inherit}.bank-folder-edit{display:grid;gap:.5rem}.bank-main{min-width:0}dialog p{white-space:pre-wrap}@media(min-width:850px){.bank-layout{grid-template-columns:16rem minmax(0,1fr)}}.bank-stack{display:grid;gap:1rem}.bank-toolbar{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center}.bank-card{padding:1.2rem;overflow-wrap:anywhere}.bank-form label{display:grid;gap:.35rem;margin:.8rem 0}.bank-form input,.bank-form select,.bank-form textarea,.bank-filter{font:inherit;max-width:100%;width:100%;padding:.6rem;border:1px solid #a49579;border-radius:.3rem;background:#fffaf0;color:#302a20}.bank-form textarea{min-height:6rem}.bank-filter{width:auto}.bank-card .image-placeholder{max-width:20rem;margin:.7rem 0}.bank-card .image-placeholder img{max-height:14rem}.bank-card p{white-space:pre-wrap}.bank-form [hidden]{display:none}
    </style><div class="page-heading"><p class="eyebrow">YOUR QUESTION COLLECTION</p><h1>我的題庫</h1><p class="subtitle">收藏學習題目，為下一段旅程做好準備。</p></div>
    <div class="bank-layout"><aside class="paper bank-folders" aria-label="題庫資料夾"></aside><div class="bank-stack bank-main"><div class="paper bank-card"><p class="bank-counts" aria-live="polite">載入題庫中…</p><p class="bank-availability" role="status"></p><div class="bank-toolbar"><button class="button bank-new">新增題目</button><button class="button secondary bank-export">匯出 JSON 備份</button><button class="button secondary bank-import">匯入 JSON（合併）</button><input class="bank-file" type="file" accept=".json,application/json" aria-label="選擇題庫 JSON" hidden></div></div>
    <div class="paper bank-card bank-csv"><h2>CSV 範本與批次匯入</h2><p>每個範本只有標題列。folder 選填，以「英文/Unit1」指定最多兩層資料夾；空白為未分類。prompt 為題幹（圖片題選填）。</p><p>選擇題：answer 為正確選項，wrong1～4 至少填一個錯誤選項。是非題：is_true 接受 TRUE/FALSE、T/F、1/0、是/否、對/錯。填充題：answer 可用 | 分隔答案。圖片題：imageFile 填圖片檔名，匯入時請同時選取 CSV 與對應圖片（檔名忽略大小寫）。單檔最多 2000 列。</p><div class="bank-toolbar bank-templates"></div><p class="bank-image-limit"></p><button class="button secondary bank-csv-import">選取 CSV 與圖片，預覽匯入</button><input class="bank-csv-files" type="file" multiple accept=".csv,image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp" aria-label="選擇 CSV 與圖片檔" hidden><p class="bank-csv-preview" role="status"></p></div>
    <div class="bank-editor"></div><label>依題型篩選 <select class="bank-filter"><option value="">全部題型</option>${Object.entries(names).map(([type, name]) => `<option value="${type}">${name}</option>`).join('')}</select></label><div class="bank-toolbar"><label>移到資料夾 <select class="bank-move-target bank-filter"></select></label><button class="button secondary bank-move">移動勾選題目</button><span class="bank-selected"></span></div><div class="bank-list bank-stack" aria-live="polite"></div></div></div>`;
  const find = selector => section.querySelector(selector);
  const editor = find('.bank-editor'), list = find('.bank-list');
  let questions = [], folders = [], selectedFolder = ALL_FOLDERS, generation = 0;
  const selected = new Set(), collapsed = new Set();
  const config = loadBalance(); config.catch(() => {});
  async function refresh() {
    [questions, folders] = await Promise.all([questionRepo.list(), questionRepo.listFolders()]);
    for (const id of selected) if (!questions.some(q => q.id === id)) selected.delete(id);
    if (selectedFolder !== ALL_FOLDERS && selectedFolder !== null && !folders.some(f => f.id === selectedFolder)) selectedFolder = null;
    drawFolders();
    fillFolderSelect(find('.bank-move-target'));
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
    const inFolder = selectedFolder === ALL_FOLDERS ? questions : getFolderQuestions(selectedFolder, folders, questions);
    const shown = inFolder.filter(q => !find('.bank-filter').value || q.type === find('.bank-filter').value);
    updateSelection();
    if (!shown.length) { const empty = document.createElement('p'); empty.textContent = '目前沒有這類題目，點「新增題目」開始收藏。'; list.append(empty); }
    for (const q of shown) {
      const card = document.createElement('article'); card.className = 'paper bank-card';
      const title = document.createElement('h2'); title.textContent = names[q.type] ?? '未知題型';
      const prompt = document.createElement('p'); prompt.textContent = q.prompt?.trim() ? q.prompt : '（無題幹）';
      const checkLabel = document.createElement('label'), check = document.createElement('input');
      check.type = 'checkbox'; check.checked = selected.has(q.id); check.setAttribute('aria-label', `勾選 ${q.prompt || '（無題幹）'}`);
      check.onchange = () => { if (check.checked) selected.add(q.id); else selected.delete(q.id); updateSelection(); };
      checkLabel.append(check, ' 選取'); card.append(checkLabel, title, prompt);
      if (q.type === 'image') {
        const image = createImage({ alt: '圖片遺失，請編輯題目重新上傳' }); card.append(image);
        questionRepo.getImage(q.imageKey).then(src => { if (current === generation) image.replaceWith(createImage({ src: isImageDataURL(src) ? src : undefined, alt: '題目圖片（缺圖時請重新上傳）' })); }).catch(error => toast(error.message, { type: 'error' }));
      }
      const answer = document.createElement('p'); answer.textContent = q.type === 'image' ? '自評：答對了／下次再試' : `答案：${q.type === 'truefalse' ? (q.answer ? '是' : '否') : q.answer}${q.type === 'choice' ? `（選項：${q.options.join('、')}）` : ''}`; card.append(answer);
      const actions = document.createElement('div'); actions.className = 'bank-toolbar';
      const edit = document.createElement('button'); edit.className = 'button secondary'; edit.textContent = '編輯'; edit.onclick = () => openEditor(q);
      const remove = document.createElement('button'); remove.className = 'button secondary'; remove.textContent = '刪除'; remove.onclick = run(async () => { if (!await modal({ title: '刪除題目', message: `確定刪除「${q.prompt || '（無題幹）'}」及其圖片？`, confirmLabel: '刪除' })) return; await questionRepo.remove(q.id); if (editor.dataset.id === q.id) editor.replaceChildren(); await refresh(); toast('題目已刪除。'); });
      actions.append(edit, remove); card.append(actions); list.append(card);
    }
  }
  function updateSelection() { find('.bank-selected').textContent = `已勾選 ${selected.size} 題`; find('.bank-move').disabled = !selected.size; }
  function fillFolderSelect(select, value = select.value) {
    select.replaceChildren(new Option('未分類', ''));
    for (const node of buildFolderTree(folders, questions)) {
      select.add(new Option(node.name, node.id));
      for (const child of node.children) select.add(new Option(`${node.name} / ${child.name}`, child.id));
    }
    select.value = folders.some(f => f.id === value) ? value : '';
  }
  function drawFolders() {
    const pane = find('.bank-folders'); pane.replaceChildren();
    const title = document.createElement('h2'); title.textContent = '資料夾'; pane.append(title);
    function button(text, action, parent) { const b = document.createElement('button'); b.className = 'button secondary'; b.textContent = text; b.onclick = action; parent.append(b); return b; }
    function filter(label, id, count, parent) { const b = button(`${label}（${count}）`, () => { selectedFolder = id; drawFolders(); draw(); }, parent); b.setAttribute('aria-current', String(selectedFolder === id)); }
    filter('全部', ALL_FOLDERS, questions.length, pane); filter('未分類', null, getFolderQuestions(null, folders, questions).length, pane);
    button('新增頂層資料夾', () => folderForm(null), pane);
    const formHost = document.createElement('div'); pane.append(formHost);
    function folderForm(parentId, folder) {
      const form = document.createElement('form'); form.className = 'bank-folder-edit';
      const label = document.createElement('label'); label.textContent = folder ? '重新命名資料夾' : parentId ? '新增子資料夾' : '新增頂層資料夾';
      const input = document.createElement('input'); input.value = folder?.name ?? ''; input.required = true; input.setAttribute('aria-label', label.textContent); label.append(input);
      const save = document.createElement('button'); save.className = 'button'; save.textContent = '儲存資料夾';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消'; cancel.onclick = () => formHost.replaceChildren();
      form.append(label, save, cancel); formHost.replaceChildren(form); input.focus();
      form.onsubmit = event => { event.preventDefault(); run(async () => {
        save.disabled = true;
        try { const now = Date.now(); await questionRepo.saveFolder(folder ? { ...folder, name: input.value } : { id: crypto.randomUUID(), name: input.value, parentId, createdAt: now, updatedAt: now }); await refresh(); toast('資料夾已儲存。'); }
        finally { save.disabled = false; }
      })(); };
    }
    function row(node, parent) {
      const line = document.createElement('div'); line.className = 'bank-folder-row'; parent.append(line);
      filter(node.name, node.id, node.count, line);
      button('改名', () => folderForm(node.parentId, node), line);
      if (node.parentId === null) button('新增子層', () => folderForm(node.id), line);
      button('刪除', run(async () => {
        if (node.children.length) throw new Error('請先處理子資料夾');
        const count = questions.filter(q => q.folderId === node.id).length;
        const destination = folders.find(f => f.id === node.parentId)?.name ?? '未分類';
        if (!await modal({ title: '刪除資料夾', message: `資料夾「${node.name}」有 ${count} 題。確認後題目會移到「${destination}」，題目不會刪除。`, confirmLabel: '移動題目並刪除資料夾' })) return;
        await questionRepo.removeFolder(node.id); await refresh(); toast('資料夾已刪除，題目已保留。');
      }), line);
      if (node.children.length) {
        const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = '子資料夾'; details.open = !collapsed.has(node.id);
        details.ontoggle = () => { if (details.open) collapsed.delete(node.id); else collapsed.add(node.id); };
        details.append(summary); parent.append(details); node.children.forEach(child => row(child, details));
      }
    }
    buildFolderTree(folders, questions).forEach(node => row(node, pane));
  }
  function openEditor(q) {
    editor.dataset.id = q?.id ?? '';
    const form = document.createElement('form'); form.className = 'paper bank-card bank-form';
    form.innerHTML = `<h2>${q ? '編輯' : '新增'}題目</h2><label>題型<select name="type">${Object.entries(names).map(([type, name]) => `<option value="${type}">${name}</option>`).join('')}</select></label><label><span class="bank-prompt-label">題幹（必填）</span><textarea name="prompt" required></textarea></label><label>資料夾<select name="folderId"></select></label><label data-field="choice">選項（每行一個，至少兩個）<textarea name="options"></textarea></label><label data-field="text">答案<input name="answer"><span class="hint">選擇題填寫其中一個選項；填充題可用 | 分隔多個答案。</span></label><label data-field="truefalse">答案<select name="boolean"><option value="true">是</option><option value="false">否</option></select></label><label data-field="image">圖片<input name="image" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"><span class="hint">無標準答案，出題後自評「答對了／下次再試」。編輯時不選檔案則保留原圖。</span><div class="bank-image-preview"></div></label><div class="bank-toolbar"><button class="button" type="submit">儲存題目</button><button class="button secondary bank-cancel" type="button">取消</button></div>`;
    const field = name => form.elements.namedItem(name);
    fillFolderSelect(field('folderId'), q ? q.folderId : selectedFolder === ALL_FOLDERS ? null : selectedFolder);
    field('type').value = q?.type ?? 'choice'; field('prompt').value = q?.prompt ?? ''; field('options').value = q?.options?.join('\n') ?? ''; field('answer').value = typeof q?.answer === 'string' ? q.answer : ''; field('boolean').value = String(q?.answer ?? true);
    function update() { const type = field('type').value; field('prompt').required = type !== 'image'; form.querySelector('.bank-prompt-label').textContent = type === 'image' ? '題幹（選填）' : '題幹（必填）'; for (const label of form.querySelectorAll('[data-field]')) label.hidden = !(label.dataset.field === type || label.dataset.field === 'text' && ['choice', 'fill'].includes(type)); }
    const imagePreview = form.querySelector('.bank-image-preview');
    let previewGeneration = 0;
    async function previewImage() {
      const current = ++previewGeneration;
      if (field('type').value !== 'image') return;
      try {
        const file = field('image').files[0];
        let src;
        if (file) { validateImageFile(file, (await config).getBalance('questions.maxImageBytes')); src = await readImage(file); }
        else if (q?.imageKey) src = await questionRepo.getImage(q.imageKey);
        if (current !== previewGeneration) return;
        const caption = document.createElement('p'); caption.textContent = field('prompt').value.trim() || '（無題幹）';
        imagePreview.replaceChildren(createImage({ src: isImageDataURL(src) ? src : undefined, alt: '題目圖片預覽' }), caption);
      } catch (error) { if (current === previewGeneration) { imagePreview.replaceChildren(); toast(error.message, { type: 'error' }); } }
    }
    field('type').onchange = () => { update(); previewImage(); }; update(); previewImage();
    field('prompt').oninput = () => { const caption = imagePreview.querySelector('p'); if (caption) caption.textContent = field('prompt').value.trim() || '（無題幹）'; };
    field('image').onchange = previewImage;
    form.querySelector('.bank-cancel').onclick = () => editor.replaceChildren();
    form.onsubmit = async event => {
      event.preventDefault(); const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
      try {
        const type = field('type').value, now = Date.now();
        const next = { id: q?.id ?? crypto.randomUUID(), type, prompt: field('prompt').value.trim(), answer: type === 'image' ? null : type === 'truefalse' ? field('boolean').value === 'true' : field('answer').value.trim(), createdAt: q?.createdAt ?? now, updatedAt: now };
        next.folderId = field('folderId').value || null;
        let image;
        if (type === 'choice') next.options = field('options').value.split('\n').map(s => s.trim()).filter(Boolean);
        if (type === 'image') { const file = field('image').files[0]; if (file) { validateImageFile(file, (await config).getBalance('questions.maxImageBytes')); image = await readImage(file); } next.imageKey = image ? `image-${crypto.randomUUID()}` : q?.imageKey; }
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
  find('.bank-move').onclick = run(async () => { await questionRepo.moveQuestions([...selected], find('.bank-move-target').value || null); selected.clear(); await refresh(); toast('題目已移動。'); });
  for (const [type, name] of Object.entries(names)) {
    const button = document.createElement('button'); button.className = 'button secondary'; button.textContent = `下載${name}範本`;
    button.onclick = run(async () => {
      const url = URL.createObjectURL(new Blob([buildTemplate(type)], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `questions-${type}-template.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }); find('.bank-templates').append(button);
  }
  config.then(c => { const limit = c.getBalance('questions.maxImageBytes') ?? DEFAULT_MAX_IMAGE_BYTES; find('.bank-image-limit').textContent = `圖片限 PNG、JPEG、GIF、WebP、AVIF、BMP，每張上限 ${limit} bytes。`; }).catch(() => {});
  const csvFiles = find('.bank-csv-files'); find('.bank-csv-import').onclick = () => csvFiles.click();
  csvFiles.onchange = run(async () => {
    let imported = 0, writing = false;
    try {
      const files = Array.from(csvFiles.files); if (!files.length) return;
      const csv = files.filter(file => /\.csv$/i.test(file.name));
      if (csv.length !== 1) throw new Error('請選擇一份 CSV（圖片題請同時選取圖片）');
      const preview = parseQuestionCsv(await csv[0].text(), { imageFiles: files.filter(file => file !== csv[0]), maxImageBytes: (await config).getBalance('questions.maxImageBytes') });
      const message = `有效 ${preview.rows.length} 列、錯誤 ${preview.errors.length} 列。` + (preview.errors.length ? '\n' + preview.errors.slice(0, 20).map(e => e.message).join('\n') : '') + (preview.errors.length > 20 ? '\n僅列出前 20 筆錯誤。' : '');
      find('.bank-csv-preview').textContent = message;
      if (!preview.rows.length) { await modal({ title: 'CSV 匯入預覽', message, confirmLabel: '關閉', cancelLabel: null }); return; }
      if (!await modal({ title: 'CSV 匯入預覽', message: message + '\n匯入一律新增題目，不覆蓋既有題目。', confirmLabel: '匯入有效列' })) return;
      writing = true;
      // All reads/parsing precede confirmation; only this block may write.
      for (const row of preview.rows) {
        let resolved = resolveFolderPath(row.folderPath, folders);
        while (resolved.missing.length) {
          const next = resolved.missing[0], now = Date.now();
          const folder = await questionRepo.saveFolder({ id: crypto.randomUUID(), name: next.name, parentId: next.parentId, createdAt: now, updatedAt: now });
          folders.push(folder); resolved = resolveFolderPath(row.folderPath, folders);
        }
        const now = Date.now(), q = { ...row.question, id: crypto.randomUUID(), folderId: resolved.folderId, createdAt: now, updatedAt: now };
        let image;
        if (row.imageFile) { image = await readImage(row.imageFile); q.imageKey = `image-${crypto.randomUUID()}`; }
        await questionRepo.save(q, image); imported++;
      }
      await refresh(); toast(`CSV 已新增 ${imported} 題。`);
    } catch (error) {
      toast(writing ? `匯入停止：已成功 ${imported} 題；${error.message}` : error.message, { type: 'error' });
      if (writing) await refresh().catch(e => toast(e.message, { type: 'error' }));
    } finally { csvFiles.value = ''; }
  });
  refresh().catch(error => { find('.bank-counts').textContent = '題庫讀取失敗，請重新進入此頁再試。'; toast(error.message, { type: 'error' }); });
  return section;
}
