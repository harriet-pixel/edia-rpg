import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTemplate, parseCsv, parseQuestionCsv, DEFAULT_MAX_IMAGE_BYTES } from '../js/systems/question-csv.js';
const headers = { choice: 'folder,prompt,answer,wrong1,wrong2,wrong3,wrong4', truefalse: 'folder,prompt,is_true', fill: 'folder,prompt,answer', image: 'folder,prompt,imageFile' };
const parse = (type, body, options) => parseQuestionCsv(`${headers[type]}\r\n${body}`, options);
const pic = { name: 'Cat.PNG', type: 'image/png', size: 123 };
test('four empty templates have exact headers, UTF-8 BOM and CRLF without example rows', () => {
  for (const [type, header] of Object.entries(headers)) {
    assert.equal(buildTemplate(type), `\uFEFF${header}\r\n`);
    assert.deepEqual([...Buffer.from(buildTemplate(type)).slice(0, 3)], [239, 187, 191]);
    assert.equal(parseCsv(buildTemplate(type)).length, 1);
  }
  assert.throws(() => buildTemplate('other'));
});
test('CSV parsing supports BOM, CRLF/LF, quotes, escaped quotes, commas, multiline and blank rows', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"hello, world","say ""yes"""\n"line1\r\nline2",end\r\n , \n'), [['a', 'b'], ['hello, world', 'say "yes"'], ['line1\nline2', 'end']]);
  assert.deepEqual(parseCsv('a,b,\n'), [['a', 'b', '']]);
  for (const text of ['"unclosed', 'bad"quote', '"closed"bad']) assert.throws(() => parseCsv(text), /引號/);
});
test('choice constructs answer-first options; invalid prompts, blanks and duplicate wrong answers reject rows', () => {
  const result = parse('choice', '英文/Unit1,Q,Yes,No,,,\n,Q2,A,B,C,D,E');
  assert.equal(result.rows.length, 2); assert.deepEqual(result.rows[0].question.options, ['Yes', 'No']); assert.equal(result.rows[1].question.options.length, 5);
  assert.equal(result.rows[0].folderPath, '英文/Unit1');
  const invalid = parse('choice', ',Q,A,,,,\n,,A,B,,,\n,Q,A,A,,,\n,Q,,B,,,');
  assert.equal(invalid.rows.length, 0); assert.equal(invalid.errors.length, 4);
});
test('truefalse is_true accepts all documented spellings ignoring case and whitespace', () => {
  const tokens = ['TRUE', 'FALSE', 't', 'f', '1', '0', '是', '否', '對', '錯', ' Tr Ue '];
  const result = parse('truefalse', tokens.map(s => `,Q,${s}`).join('\n'));
  assert.deepEqual(result.rows.map(r => r.question.answer), [true, false, true, false, true, false, true, false, true, false, true]);
  const bad = parse('truefalse', ',Q,yes\n,Q,\n,,TRUE'); assert.equal(bad.errors.length, 3);
  assert.equal(bad.errors[0].rowNumber, 2); assert.match(bad.errors[0].message, /is_true/);
});
test('fill keeps alternatives, rejects missing prompts/answers/empty alternatives; TRUE stays fill', () => {
  const result = parse('fill', ',Question,Hello|Hi\n,Q,TRUE\n,,Hi\n,Q,\n,Q,a||b');
  assert.equal(result.rows.length, 2); assert.equal(result.type, 'fill'); assert.equal(result.rows[1].question.answer, 'TRUE'); assert.equal(result.errors.length, 3);
});
test('image has optional prompt, matches case-insensitive filename and checks missing/non-image/oversize/ambiguous files', () => {
  const result = parse('image', ',,cat.png', { imageFiles: [pic] });
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].question.prompt, ''); assert.equal(result.rows[0].question.answer, null); assert.equal(result.rows[0].imageFile, pic);
  assert.match(parse('image', ',Q,missing.png', { imageFiles: [pic] }).errors[0].message, /找不到/);
  assert.match(parse('image', ',Q,cat.png', { imageFiles: [{ ...pic, type: 'text/plain' }] }).errors[0].message, /非支援的圖片/);
  for (const options of [{ imageFiles: [{ ...pic, size: DEFAULT_MAX_IMAGE_BYTES + 1 }] }, { imageFiles: [pic], maxImageBytes: 100 }]) assert.match(parse('image', ',Q,cat.png', options).errors[0].message, /大小限制/);
  assert.match(parse('image', ',Q,cat.png', { imageFiles: [pic, { ...pic, name: 'CAT.png' }] }).errors[0].message, /重複/);
});
test('folder paths over two levels, empty components, and long names are row errors', () => {
  const result = parse('fill', 'A/B/C,Q,A\nA/,Q,A\nA/B,Q,A\n,Q,A');
  assert.deepEqual(result.rows.map(r => r.rowNumber), [4, 5]); assert.equal(result.errors.length, 2); assert.match(result.errors[0].message, /兩層/);
});
test('headers strictly determine type; missing, extra, unknown and misleading quoted headers reject whole file', () => {
  for (const text of ['', 'prompt,answer\nQ,A', 'folder,prompt,is_true,extra\n,Q,TRUE,x', 'folder,prompt,wrong1\n,Q,B', '"folder,prompt",answer\nQ,A']) {
    const result = parseQuestionCsv(text); assert.equal(result.type, null); assert.equal(result.rows.length, 0); assert.match(result.errors[0].message, /可接受的標題/);
  }
});
test('2000 row limit is inclusive; overflow rejects the entire file', () => {
  assert.equal(parse('fill', Array(2000).fill(',Q,A').join('\n')).rows.length, 2000);
  const result = parse('fill', Array(2001).fill(',Q,A').join('\n')); assert.equal(result.rows.length, 0); assert.match(result.errors[0].message, /2000/);
});
test('physical error line numbers survive multiline quoted cells and blank rows; returns only valid rows', () => {
  const result = parse('fill', ',"line1\nline2",Yes\n\n,,MissingPrompt\n,Q,Good\n,Q,Too,many');
  assert.deepEqual(result.rows.map(r => r.rowNumber), [2, 6]); assert.deepEqual(result.errors.map(e => e.rowNumber), [5, 7]);
  assert.match(result.errors[0].message, /第 5 列/); assert.match(result.errors[1].message, /欄位數/);
});
