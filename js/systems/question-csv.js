import { validateQuestion } from './questions.js';
import { resolveFolderPath } from './question-folders.js';
export const CSV_HEADERS = Object.freeze({
  choice: 'folder,prompt,answer,wrong1,wrong2,wrong3,wrong4',
  truefalse: 'folder,prompt,is_true',
  fill: 'folder,prompt,answer',
  image: 'folder,prompt,imageFile',
});
export const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export function buildTemplate(type) {
  if (!Object.hasOwn(CSV_HEADERS, type)) throw new Error('未知題型');
  return `\uFEFF${CSV_HEADERS[type]}\r\n`;
}
export function validateImageFile(file, maxImageBytes = null) {
  if (!file) throw new Error('找不到對應圖片檔');
  if (!/^image\/(png|jpeg|gif|webp|avif|bmp)$/i.test(file.type)) throw new Error('檔案非支援的圖片（PNG、JPEG、GIF、WebP、AVIF、BMP）');
  const limit = maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  if (file.size > limit) throw new Error(`圖片超過大小限制（${limit} bytes）`);
}
export function parseCsv(text) {
  if (typeof text !== 'string') throw new Error('CSV 必須是文字');
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], value = '', quoted = false, closed = false, line = 1, start = 1;
  function cell() { row.push(value); value = ''; closed = false; }
  function finish() {
    cell();
    if (row.some(s => s.trim())) { Object.defineProperty(row, 'rowNumber', { value: start }); rows.push(row); }
    row = [];
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; } }
      else if (ch === '\r' || ch === '\n') { if (ch === '\r' && text[i + 1] === '\n') i++; value += '\n'; line++; }
      else value += ch;
    } else if (ch === ',') cell();
    else if (ch === '\r' || ch === '\n') { if (ch === '\r' && text[i + 1] === '\n') i++; finish(); line++; start = line; }
    else if (ch === '"' && !value && !closed) quoted = true;
    else if (closed || ch === '"') throw new Error(`第 ${line} 列：CSV 引號格式不正確`);
    else value += ch;
  }
  if (quoted) throw new Error(`第 ${start} 列：CSV 引號未關閉`);
  finish(); return rows;
}
export function parseQuestionCsv(text, { imageFiles = [], maxImageBytes = null } = {}) {
  const reject = (message, rowNumber = 1) => ({ type: null, rows: [], errors: [{ rowNumber, message }] });
  let data;
  try { data = parseCsv(text); } catch (error) { return reject(error.message, Number(error.message.match(/第 (\d+) 列/)?.[1] ?? 1)); }
  const header = data.shift();
  const type = Object.keys(CSV_HEADERS).find(t => header?.length === CSV_HEADERS[t].split(',').length && header.every((key, i) => key === CSV_HEADERS[t].split(',')[i]));
  if (!type) return reject(`標題不符。可接受的標題：${Object.values(CSV_HEADERS).join('；')}`);
  if (data.length > 2000) return reject('單檔最多 2000 列題目，整份未匯入');
  const rows = [], errors = [], files = Array.from(imageFiles);
  for (const cells of data) {
    const rowNumber = cells.rowNumber;
    try {
      if (cells.length !== header.length) throw new Error(`欄位數應為 ${header.length}，實際為 ${cells.length}`);
      const record = Object.fromEntries(header.map((key, i) => [key, cells[i].trim()]));
      const folder = resolveFolderPath(record.folder, []);
      if (!folder.ok) throw new Error(folder.errors.join('；'));
      const question = { id: `csv-${rowNumber}`, type, prompt: record.prompt, answer: record.answer, createdAt: 0, updatedAt: 0 };
      let imageFile;
      if (type === 'choice') question.options = [record.answer, ...[1, 2, 3, 4].map(n => record[`wrong${n}`]).filter(Boolean)];
      if (type === 'truefalse') {
        const token = record.is_true.replace(/\s/g, '').toLowerCase();
        if (!['true', 'false', 't', 'f', '1', '0', '是', '否', '對', '錯'].includes(token)) throw new Error('is_true 須為 TRUE/FALSE、T/F、1/0、是/否、對/錯');
        question.answer = ['true', 't', '1', '是', '對'].includes(token);
      }
      if (type === 'image') {
        const matches = files.filter(file => file.name.toLowerCase() === record.imageFile.toLowerCase());
        if (matches.length > 1) throw new Error(`圖片檔名重複：${record.imageFile}`);
        imageFile = matches[0]; validateImageFile(imageFile, maxImageBytes);
        question.imageKey = `csv-image-${rowNumber}`; question.answer = null;
      }
      const valid = validateQuestion(question);
      if (!valid.ok) throw new Error(valid.errors.join('；'));
      rows.push({ rowNumber, question, folderPath: record.folder, ...(imageFile ? { imageFile } : {}) });
    } catch (error) { errors.push({ rowNumber, message: `第 ${rowNumber} 列：${error.message}` }); }
  }
  return { type, rows, errors };
}
