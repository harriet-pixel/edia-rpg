// Folder helpers never read storage or mutate their inputs.
export function validateFolderName(name, siblings = []) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const errors = [];
  if (!trimmed || [...trimmed].length > 30) errors.push('資料夾名稱須為 1～30 字');
  if (trimmed.includes('/')) errors.push('資料夾名稱不可含 /');
  if (siblings.some(f => f.name.trim().toLowerCase() === trimmed.toLowerCase())) errors.push('同一層不可有同名資料夾（忽略大小寫）');
  return { ok: !errors.length, name: trimmed, errors };
}
export function getFolderQuestions(folderId, folders, questions) {
  const ids = new Set(folders.map(f => f.id));
  if (folderId == null || !ids.has(folderId)) return questions.filter(q => !ids.has(q.folderId));
  const included = new Set([folderId, ...folders.filter(f => f.parentId === folderId).map(f => f.id)]);
  return questions.filter(q => included.has(q.folderId));
}
export function buildFolderTree(folders, questions) {
  const node = f => ({ ...f, directCount: questions.filter(q => q.folderId === f.id).length,
    count: getFolderQuestions(f.id, folders, questions).length,
    children: folders.filter(child => child.parentId === f.id).map(child => ({ ...child,
      directCount: questions.filter(q => q.folderId === child.id).length,
      count: questions.filter(q => q.folderId === child.id).length, children: [] })) });
  return folders.filter(f => f.parentId == null).map(node);
}
export function resolveFolderPath(path, folders) {
  if (typeof path !== 'string') return { ok: false, errors: ['folder 路徑必須是文字'] };
  if (!path.trim()) return { ok: true, folderId: null, missing: [] };
  const parts = path.split('/').map(part => part.trim());
  if (parts.length > 2) return { ok: false, errors: ['資料夾最多兩層'] };
  let parentId = null;
  const missing = [];
  for (let i = 0; i < parts.length; i++) {
    const valid = validateFolderName(parts[i]);
    if (!valid.ok) return { ok: false, errors: valid.errors };
    const existing = !missing.length && folders.find(f => (f.parentId ?? null) === parentId && f.name.toLowerCase() === valid.name.toLowerCase());
    if (existing) parentId = existing.id;
    else missing.push({ name: valid.name, path: parts.slice(0, i + 1).join('/'), parentId: missing.length ? null : parentId });
  }
  return { ok: true, folderId: missing.length ? null : parentId, missing };
}
