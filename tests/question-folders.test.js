import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFolderName, buildFolderTree, resolveFolderPath, getFolderQuestions } from '../js/systems/question-folders.js';
const folders = [{ id: 'a', name: '英文', parentId: null }, { id: 'b', name: 'Unit1', parentId: 'a' }, { id: 'c', name: 'Other', parentId: null }];
const questions = [{ id: 1, folderId: 'a' }, { id: 2, folderId: 'b' }, { id: 3 }, { id: 4, folderId: null }, { id: 5, folderId: 'orphan' }, { id: 6, folderId: 'c' }];
test('folder names trim, bound length, reject slash and case-insensitive siblings', () => {
  assert.equal(validateFolderName('  Hello  ').name, 'Hello');
  for (const name of ['', '  ', 'a'.repeat(31), 'a/b', null]) assert.equal(validateFolderName(name).ok, false);
  assert.equal(validateFolderName('a'.repeat(30)).ok, true);
  assert.equal(validateFolderName(' unit1 ', folders.filter(f => f.parentId === 'a')).ok, false);
  assert.equal(validateFolderName('Unit1', folders.filter(f => f.parentId === null)).ok, true);
});
test('tree includes direct/subtree counts and parent query includes children; orphans unclassified', () => {
  const before = structuredClone({ folders, questions });
  const tree = buildFolderTree(folders, questions); assert.equal(tree.length, 2);
  assert.equal(tree[0].count, 2); assert.equal(tree[0].directCount, 1); assert.equal(tree[0].children[0].count, 1);
  assert.deepEqual(getFolderQuestions('a', folders, questions).map(q => q.id), [1, 2]);
  assert.deepEqual(getFolderQuestions('b', folders, questions).map(q => q.id), [2]);
  assert.deepEqual(getFolderQuestions(null, folders, questions).map(q => q.id), [3, 4, 5]);
  assert.deepEqual(getFolderQuestions('absent', folders, questions).map(q => q.id), [3, 4, 5]);
  assert.deepEqual({ folders, questions }, before);
});
test('paths match existing case-insensitively, return only missing nodes and enforce two levels', () => {
  assert.deepEqual(resolveFolderPath(' 英文 / unit1 ', folders), { ok: true, folderId: 'b', missing: [] });
  assert.deepEqual(resolveFolderPath('', folders), { ok: true, folderId: null, missing: [] });
  assert.deepEqual(resolveFolderPath('英文/Unit2', folders).missing, [{ name: 'Unit2', path: '英文/Unit2', parentId: 'a' }]);
  assert.equal(resolveFolderPath('New/Child', folders).missing.length, 2);
  for (const path of ['A/B/C', 'A/', '/B', 'A//B', 'x'.repeat(31)]) assert.equal(resolveFolderPath(path, folders).ok, false);
});
