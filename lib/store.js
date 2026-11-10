// lib/store.js — 写作台的唯一数据层。
//
// 设计目标（对应「杜绝遗忘 / 看不见前文 / 设定冲突」）：
//   1. 设定与正文落盘，不靠模型记忆；每次写作都从磁盘重新组装上下文包。
//   2. 章节元数据（梗概、出场人物、字数）与正文分开存，长书也不会把索引撑爆。
//   3. 字数区间在开书时定死，saveChapter 强制校验——先定字数，再动笔。
//   4. 所有写操作串行化，避免面板与对话工具同时写 state.json 丢更新。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const DATA_DIR = process.env.DSH_WRITER_HOME
  ? path.resolve(process.env.DSH_WRITER_HOME)
  : path.join(os.homedir(), '.dsh', 'writer-studio');
export const STATE_PATH = path.join(DATA_DIR, 'state.json');
const BOOKS_DIR = path.join(DATA_DIR, 'books');

const STYLE_DEFAULTS = Object.freeze({
  tone: 'standard',
  focus: 'balanced',
  charFocus: ['dialogue', 'action'],
  person: 'third',
  adherence: 'standard',
  pacing: 'direct',
  sentence: 'medium',
  custom: '',
  sample: '',
});

export const TONE_LABELS = {
  plain: '直白粗俗',
  casual: '口语自然',
  standard: '标准叙事',
  elegant: '优雅细腻',
  literary: '文学性强',
};
export const FOCUS_LABELS = { character: '侧重人物', balanced: '人物与景物各半', scene: '侧重景物' };
export const CHAR_FOCUS_LABELS = { dialogue: '语言', action: '动作', appearance: '外貌', inner: '心理' };
export const PERSON_LABELS = { first: '第一人称', third: '第三人称限知', omniscient: '第三人称全知' };
export const ADHERENCE_LABELS = { strict: '完全按要求', standard: '标准', free: '自由发挥' };
export const PACING_LABELS = { direct: '直入正题', build: '层层铺垫', suspense: '悬念先行' };
export const SENTENCE_LABELS = { short: '短句为主', medium: '长短交错', long: '长句为主' };
export const ROLE_PRESETS = ['主角', '女主角', '配角', '反派', '导师', '对手', '路人', '群像'];

let queue = Promise.resolve();

/** 串行执行写操作（同一进程内）。fn 的返回值原样透传。 */
export function withLock(fn) {
  const run = queue.then(() => fn(), () => fn());
  queue = run.then(() => undefined, () => undefined);
  return run;
}

function now() {
  return new Date().toISOString();
}

function freshState() {
  return { version: 1, activeBookId: null, books: {}, sessions: {} };
}

function stateShapeOk(value) {
  return value !== null
    && typeof value === 'object'
    && value.books !== null
    && typeof value.books === 'object'
    && !Array.isArray(value.books);
}

/** 读 state.json；损坏时备份后返回空状态，绝不因一个坏文件让面板白屏。 */
export function readStateSync() {
  try {
    if (!fs.existsSync(STATE_PATH)) return freshState();
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!stateShapeOk(parsed)) throw new Error('state shape invalid');
    parsed.version = 1;
    parsed.activeBookId = parsed.activeBookId ?? null;
    parsed.sessions = parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {};
    for (const book of Object.values(parsed.books)) normalizeBook(book);
    return parsed;
  } catch {
    try {
      if (fs.existsSync(STATE_PATH)) {
        fs.copyFileSync(STATE_PATH, `${STATE_PATH}.broken-${Date.now()}`);
      }
    } catch { /* 备份失败也不能抛 */ }
    return freshState();
  }
}

export async function readState() {
  return readStateSync();
}

function atomicWriteJsonSync(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch {
    // Windows 上偶尔不能直接覆盖已存在文件：退化为复制 + 删除。
    fs.copyFileSync(tmp, file);
    fs.unlinkSync(tmp);
  }
}

export async function writeState(state) {
  await withLock(async () => {
    atomicWriteJsonSync(STATE_PATH, state);
  });
}

export function countChars(text) {
  if (typeof text !== 'string') return 0;
  const cleaned = text
    .replace(/\u200b|\ufeff/g, '')
    .replace(/\s+/g, '');
  return Array.from(cleaned).length;
}

function clampText(value, max) {
  if (typeof value !== 'string') return '';
  const s = value.trim();
  return s.length > max ? s.slice(0, max) : s;
}

export function validateCharsSpec(spec) {
  const raw = spec ?? {};
  const min = Number(raw.min);
  const max = Number(raw.max);
  const target = Number(raw.target);
  if (!Number.isInteger(min) || !Number.isInteger(max) || !Number.isInteger(target)) {
    throw new Error('字数区间必须是整数：min / max / target');
  }
  if (min < 300 || max > 50000) throw new Error('字数区间超出合理范围（300–50000）');
  if (min >= max) throw new Error('字数下限必须小于上限');
  if (target < min || target > max) throw new Error('目标字数必须落在下限与上限之间');
  return { min, max, target };
}

export function normalizeBook(book) {
  if (!book || typeof book !== 'object') return book;
  book.id = typeof book.id === 'string' ? book.id : `b-${Date.now().toString(36)}`;
  book.title = typeof book.title === 'string' && book.title.trim() ? book.title.trim() : '未命名作品';
  book.genre = typeof book.genre === 'string' ? book.genre : '';
  book.logline = typeof book.logline === 'string' ? book.logline : '';
  book.synopsis = typeof book.synopsis === 'string' ? book.synopsis : '';
  book.worldview = typeof book.worldview === 'string' ? book.worldview : '';
  book.characters = Array.isArray(book.characters) ? book.characters : [];
  for (const c of book.characters) {
    if (!c || typeof c !== 'object') continue;
    c.id = typeof c.id === 'string' && c.id ? c.id : `c-${Math.random().toString(36).slice(2, 10)}`;
    c.name = typeof c.name === 'string' && c.name.trim() ? c.name.trim() : '未命名角色';
    for (const key of ['gender', 'age', 'appearance', 'personality', 'identity', 'role', 'speech', 'notes']) {
      c[key] = typeof c[key] === 'string' ? c[key] : '';
    }
  }
  book.locations = Array.isArray(book.locations) ? book.locations : [];
  for (const loc of book.locations) {
    if (!loc || typeof loc !== 'object') continue;
    loc.id = typeof loc.id === 'string' && loc.id ? loc.id : `l-${Math.random().toString(36).slice(2, 10)}`;
    loc.name = typeof loc.name === 'string' && loc.name.trim() ? loc.name.trim() : '未命名地点';
    loc.type = typeof loc.type === 'string' && loc.type.trim() ? loc.type.trim() : '地点';
    loc.parentId = typeof loc.parentId === 'string' ? loc.parentId : '';
    loc.links = Array.isArray(loc.links) ? loc.links.filter((x) => typeof x === 'string') : [];
    for (const key of ['description', 'atmosphere', 'rules', 'secrets', 'notes']) {
      loc[key] = typeof loc[key] === 'string' ? loc[key] : '';
    }
  }
  const locationIds = new Set(book.locations.map((loc) => loc.id));
  for (const loc of book.locations) {
    if (loc.parentId === loc.id || !locationIds.has(loc.parentId)) loc.parentId = '';
    loc.links = loc.links.filter((id) => id !== loc.id && locationIds.has(id));
  }
  book.branches = Array.isArray(book.branches) ? book.branches : [];
  for (const branch of book.branches) {
    if (!branch || typeof branch !== 'object') continue;
    branch.id = typeof branch.id === 'string' && branch.id ? branch.id : `br-${Math.random().toString(36).slice(2, 8)}`;
    branch.name = typeof branch.name === 'string' && branch.name.trim() ? branch.name.trim() : '未命名分支';
    branch.kind = typeof branch.kind === 'string' && branch.kind.trim() ? branch.kind.trim() : 'other';
    branch.timeline = typeof branch.timeline === 'string' ? branch.timeline : '';
    branch.description = typeof branch.description === 'string' ? branch.description : '';
  }
  if (!book.branches.some((branch) => branch.id === DEFAULT_BRANCH_ID)) {
    book.branches.unshift({ id: DEFAULT_BRANCH_ID, name: '主线', kind: 'main', timeline: '', description: '' });
  }
  const mainBranch = book.branches.find((branch) => branch.id === DEFAULT_BRANCH_ID);
  if (mainBranch) mainBranch.kind = 'main';
  const branchIds = new Set(book.branches.map((branch) => branch.id));
  const style = book.style && typeof book.style === 'object' ? book.style : {};
  book.style = {
    ...STYLE_DEFAULTS,
    ...style,
    charFocus: Array.isArray(style.charFocus) && style.charFocus.length > 0
      ? style.charFocus.filter((x) => typeof x === 'string')
      : [...STYLE_DEFAULTS.charFocus],
  };
  const chars = book.chars && typeof book.chars === 'object' ? book.chars : {};
  book.chars = {
    min: Number.isInteger(chars.min) ? chars.min : 2000,
    max: Number.isInteger(chars.max) ? chars.max : 4000,
    target: Number.isInteger(chars.target) ? chars.target : 3000,
  };
  book.facts = Array.isArray(book.facts) ? book.facts : [];
  for (const fact of book.facts) {
    if (fact && typeof fact === 'object') fact.branchId = typeof fact.branchId === 'string' ? fact.branchId : '';
  }
  book.chapters = Array.isArray(book.chapters) ? book.chapters : [];
  for (const ch of book.chapters) {
    ch.no = Number(ch.no) || 0;
    ch.title = typeof ch.title === 'string' ? ch.title : '';
    ch.summary = typeof ch.summary === 'string' ? ch.summary : '';
    ch.words = Number(ch.words) || 0;
    ch.characters = Array.isArray(ch.characters) ? ch.characters.filter((x) => typeof x === 'string') : [];
    ch.createdAt = typeof ch.createdAt === 'string' ? ch.createdAt : now();
  }
  const branchSeq = new Map();
  const branchSeen = new Map();
  for (const ch of book.chapters) {
    ch.branchId = typeof ch.branchId === 'string' && branchIds.has(ch.branchId) ? ch.branchId : DEFAULT_BRANCH_ID;
    const seen = branchSeen.get(ch.branchId) ?? new Set();
    const last = branchSeq.get(ch.branchId) ?? 0;
    let seq = Number.isInteger(ch.seq) && ch.seq > 0 ? ch.seq : last + 1;
    if (seen.has(seq)) seq = last + 1;
    ch.seq = seq;
    ch.timeline = typeof ch.timeline === 'string' ? ch.timeline : '';
    seen.add(seq);
    branchSeen.set(ch.branchId, seen);
    branchSeq.set(ch.branchId, Math.max(last, seq));
  }
  book.chapters.sort((a, b) => a.no - b.no);
  book.createdAt = typeof book.createdAt === 'string' ? book.createdAt : now();
  book.updatedAt = typeof book.updatedAt === 'string' ? book.updatedAt : now();
  return book;
}

export function listBooks(state, sessionId) {
  const session = sessionId ? state.sessions[sessionId] : null;
  return Object.values(state.books).map((book) => {
    const words = book.chapters.reduce((n, ch) => n + (Number(ch.words) || 0), 0);
    return {
      id: book.id,
      title: book.title,
      genre: book.genre,
      logline: book.logline,
      chapters: book.chapters.length,
      words,
      target: book.chars.target,
      updatedAt: book.updatedAt,
      active: (session?.bookId === book.id) || (!session?.bookId && state.activeBookId === book.id),
    };
  }).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function findBook(state, ref) {
  if (!ref) return null;
  if (typeof ref === 'object' && state.books[ref.id]) return state.books[ref.id];
  const s = String(ref).trim();
  if (!s) return null;
  if (state.books[s]) return state.books[s];
  return Object.values(state.books).find((b) => b.title === s) ?? null;
}

export function resolveBook(state, ref, sessionId) {
  const session = sessionId ? state.sessions[sessionId] : null;
  return findBook(state, ref)
    ?? findBook(state, session?.bookId)
    ?? findBook(state, state.activeBookId)
    ?? Object.values(state.books).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0]
    ?? null;
}

export function publicBook(book, { withChapterText = false } = {}) {
  if (!book) return null;
  return {
    id: book.id,
    title: book.title,
    genre: book.genre,
    logline: book.logline,
    synopsis: book.synopsis,
    worldview: book.worldview,
    characters: book.characters,
    locations: book.locations,
    branches: book.branches,
    style: book.style,
    chars: book.chars,
    facts: book.facts,
    chapters: book.chapters.map((ch) => ({ ...ch })),
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
    ...(withChapterText
      ? {
        chapterTexts: Object.fromEntries(book.chapters.map((ch) => [ch.no, readChapterSync(book.id, ch.no)])),
      }
      : {}),
  };
}

export async function createBook(input = {}) {
  const title = clampText(input.title, 120);
  if (!title) throw new Error('书名不能为空');
  const chars = validateCharsSpec(input.chars ?? { min: 2000, max: 4000, target: 3000 });
  return withLock(async () => {
    const state = readStateSync();
    const id = `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const book = normalizeBook({
      id,
      title,
      genre: clampText(input.genre, 40),
      logline: clampText(input.logline, 400),
      synopsis: clampText(input.synopsis, 4000),
      chars,
      createdAt: now(),
      updatedAt: now(),
    });
    state.books[id] = book;
    state.activeBookId = id;
    fs.mkdirSync(path.join(BOOKS_DIR, id, 'chapters'), { recursive: true });
    atomicWriteJsonSync(STATE_PATH, state);
    return publicBook(book);
  });
}

const PATCH_FIELDS = ['title', 'genre', 'logline', 'synopsis', 'worldview'];

export async function updateBook(bookId, patch = {}) {
  return withLock(async () => {
    const state = readStateSync();
    const book = state.books[bookId];
    if (!book) throw new Error('作品不存在（可能已被删除）');
    for (const key of PATCH_FIELDS) {
      if (patch[key] !== undefined) book[key] = clampText(patch[key], key === 'synopsis' ? 20000 : 4000);
    }
    if (patch.chars !== undefined) book.chars = validateCharsSpec(patch.chars);
    if (patch.style !== undefined && patch.style && typeof patch.style === 'object') {
      const style = { ...book.style, ...patch.style };
      style.charFocus = Array.isArray(style.charFocus) ? style.charFocus : book.style.charFocus;
      book.style = style;
    }
    if (typeof book.title !== 'string' || !book.title.trim()) book.title = '未命名作品';
    book.updatedAt = now();
    atomicWriteJsonSync(STATE_PATH, state);
    return publicBook(book);
  });
}

/** 把某本书设为全局活跃作品（面板在无会话 id 时也能切换）。 */
export async function activateBook(bookId) {
  return withLock(async () => {
    const state = readStateSync();
    if (!state.books[bookId]) throw new Error('作品不存在');
    state.activeBookId = bookId;
    atomicWriteJsonSync(STATE_PATH, state);
    return { activeBookId: bookId };
  });
}

export async function deleteBook(bookId) {
  return withLock(async () => {
    const state = readStateSync();
    if (!state.books[bookId]) throw new Error('作品不存在');
    delete state.books[bookId];
    if (state.activeBookId === bookId) state.activeBookId = Object.keys(state.books)[0] ?? null;
    for (const sid of Object.keys(state.sessions)) {
      if (state.sessions[sid]?.bookId === bookId) delete state.sessions[sid];
    }
    atomicWriteJsonSync(STATE_PATH, state);
    try {
      await fsp.rm(path.join(BOOKS_DIR, bookId), { recursive: true, force: true });
    } catch { /* 索引已删，磁盘残留不影响读取 */ }
    return { deleted: true, id: bookId };
  });
}

function characterId() {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function upsertCharacter(bookId, input = {}) {
  return withLock(async () => {
    const state = readStateSync();
    const book = state.books[bookId];
    if (!book) throw new Error('作品不存在');
    const name = clampText(input.name, 60);
    if (!name) throw new Error('角色姓名不能为空');
    const fields = {
      name,
      gender: clampText(input.gender, 30),
      age: clampText(input.age, 40),
      appearance: clampText(input.appearance, 2000),
      personality: clampText(input.personality, 2000),
      identity: clampText(input.identity, 1000),
      role: clampText(input.role, 40) || '配角',
      speech: clampText(input.speech, 1000),
      notes: clampText(input.notes, 2000),
    };
    let character = input.id ? book.characters.find((c) => c.id === input.id) : null;
    if (!character) character = book.characters.find((c) => c.name === name);
    if (character) {
      Object.assign(character, fields);
    } else {
      character = normalizeBook({ characters: [{ id: characterId(), ...fields }] }).characters[0];
      book.characters.push(character);
    }
    book.updatedAt = now();
    atomicWriteJsonSync(STATE_PATH, state);
    return character;
  });
}

export async function deleteCharacter(bookId, characterIdValue) {
  return withLock(async () => {
    const state = readStateSync();
    const book = state.books[bookId];
    if (!book) throw new Error('作品不存在');
    const before = book.characters.length;
    book.characters = book.characters.filter((c) => c.id !== characterIdValue);
    if (book.characters.length === before) throw new Error('角色不存在');
    book.updatedAt = now();
    atomicWriteJsonSync(STATE_PATH, state);
    return { deleted: true, id: characterIdValue };
  });
}

export const LOCATION_TYPES = ['城市', '城镇', '村庄', '建筑', '区域', '秘境', '遗迹', '据点', '其他'];
export const DEFAULT_BRANCH_ID = 'main';
export const BRANCH_KINDS = [
  ['main', '主线'],
  ['if', 'if线'],
  ['prequel', '前传'],
  ['sequel', '后传'],
  ['side', '外传'],
  ['extra', '番外'],
  ['other', '其他'],
];

function locationId() {
  return `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 防止「包含」关系成环：新 parent 不能是自己或自己的后代。 */
function assertNoLocationCycle(book, id, parentId) {
  if (!parentId) return;
  if (parentId === id) throw new Error('地点不能包含自己');
  const byId = new Map(book.locations.map((loc) => [loc.id, loc]));
  const seen = new Set();
  let cursor = parentId;
  while (cursor) {
    if (cursor === id) throw new Error('地点包含关系不能成环（不能把自己的上级设为下级）');
    if (seen.has(cursor)) break;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId || '';
  }
}

export async function upsertLocation(bookId, input = {}) {
  return withLock(async () => {
    const state = readStateSync();
    const book = state.books[bookId];
    if (!book) throw new Error('作品不存在');
    const name = clampText(input.name, 80);
    if (!name) throw new Error('地点名称不能为空');
    let location = input.id ? book.locations.find((loc) => loc.id === input.id) : null;
    if (!location) location = book.locations.find((loc) => loc.name === name);
    const id = location?.id ?? input.id ?? locationId();
    const parentId = clampText(input.parentId, 80);
    if (parentId && !book.locations.some((loc) => loc.id === parentId)) {
      throw new Error('要归属的上级地点不存在');
    }
    assertNoLocationCycle(book, id, parentId);
    const validIds = new Set(book.locations.map((loc) => loc.id));
    const links = Array.isArray(input.links)
      ? [...new Set(input.links.map((x) => String(x)))]
        .filter((linkId) => linkId !== id && validIds.has(linkId))
      : [];
    const fields = {
      name,
      type: clampText(input.type, 40) || '地点',
      parentId,
      links,
      description: clampText(input.description, 3000),
      atmosphere: clampText(input.atmosphere, 1000),
      rules: clampText(input.rules, 1000),
      secrets: clampText(input.secrets, 2000),
      notes: clampText(input.notes, 2000),
    };
    if (location) Object.assign(location, fields);
    else {
      location = { id, ...fields };
      book.locations.push(location);
    }
    book.updatedAt = now();
    atomicWriteJsonSync(STATE_PATH, state);
    return location;
  });
}

export async function deleteLocation(bookId, locationIdValue) {
  return withLock(async () => {
    const state = readStateSync();
    const book = state.books[bookId];
    if (!book) throw new Error('作品不存在');
    const before = book.locations.length;
    book.locations = book.locations.filter((loc) => loc.id !== locationIdValue);
    if (book.locations.length === before) throw new Error('地点不存在');
    for (const loc of book.locations) {
      if (loc.parentId === locationIdValue) loc.parentId = '';
      loc.links = (loc.links || []).filter((id) => id !== locationIdValue);
    }
    book.updatedAt = now();
    atomicWriteJsonSync(STATE_PATH, state);
    return { deleted: true, id: locationIdValue };
  });
}

/**
 * 解析叙事分支：接受 id 或名称；省略时回主线。
 * 分支是章节的「线路」标签：主线 / if线 / 前传 / 后传 / 外传 / 番外。
 */
export function resolveBranch(book, ref) {
  const branches = book?.branches ?? [];
  const value = typeof ref === 'string' ? ref.trim() : '';
  if (value) {
    const found = branches.find((branch) => branch.id === value || branch.name === value);
    if (found) return found;
  }
  return branches.find((branch) => branch.id === DEFAULT_BRANCH_ID) ?? branches[0] ?? null;
}

export function branchChapters(book, branchIdValue) {
  return (book?.chapters ?? [])
    .filter((ch) => ch.branchId === branchIdValue)
    .sort((a, b) => (a.seq ?? a.no) - (b.seq ?? b.no));
}

/** 下一章在存储层（全局 no）与分支层（seq）的位置。 */
export function nextChapterSlot(book, branchRef) {
  const branch = resolveBranch(book, branchRef);
  const branchIdValue = branch?.id ?? DEFAULT_BRANCH_ID;
  const chapters = branchChapters(book, branchIdValue);
  return {
    branch,
    no: (book.chapters ?? []).reduce((max, ch) => Math.max(max, ch.no), 0) + 1,
    seq: chapters.reduce((max, ch) => Math.max(max, ch.seq ?? 0), 0) + 1,
  };
}

function newBranchId() {
  return `br-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 新增/修改分支。时间线是硬要求：没有时间线的分支不允许写章。 */
export async function upsertBranch(bookId, input = {}) {
  return withLock(async () => {
    const state = readStateSync();
    const book = state.books[bookId];
    if (!book) throw new Error('作品不存在');
    const name = clampText(input.name, 80);
    if (!name) throw new Error('分支名称不能为空');
    const timeline = clampText(input.timeline, 300);
    if (!timeline) throw new Error('必须填写该分支的时间线（例如「正传第 1–12 章之间」「三年前的冬天」）。');
    let branch = input.id ? book.branches.find((item) => item.id === input.id) : null;
    if (!branch) branch = book.branches.find((item) => item.name === name);
    const id = branch?.id ?? input.id ?? newBranchId();
    const fields = {
      name,
      kind: id === DEFAULT_BRANCH_ID ? 'main' : (clampText(input.kind, 30) || 'other'),
      timeline,
      description: clampText(input.description, 2000),
    };
    if (branch) Object.assign(branch, fields);
    else {
      branch = { id, ...fields };
      book.branches.push(branch);
    }
    book.updatedAt = now();
    atomicWriteJsonSync(STATE_PATH, state);
    return branch;
  });
}

/** 删除分支：主线不可删；其余分支的章节迁回主线并接到主线末尾。 */
export async function deleteBranch(bookId, branchIdValue) {
  if (branchIdValue === DEFAULT_BRANCH_ID) throw new Error('主线分支不能删除');
  return withLock(async () => {
    const state = readStateSync();
    const book = state.books[bookId];
    if (!book) throw new Error('作品不存在');
    if (!book.branches.some((branch) => branch.id === branchIdValue)) throw new Error('分支不存在');
    const main = book.branches.find((branch) => branch.id === DEFAULT_BRANCH_ID) ?? book.branches[0];
    let nextSeq = branchChapters(book, main.id).reduce((max, ch) => Math.max(max, ch.seq ?? 0), 0) + 1;
    for (const ch of book.chapters) {
      if (ch.branchId === branchIdValue) {
        ch.branchId = main.id;
        ch.seq = nextSeq++;
      }
    }
    for (const fact of book.facts) {
      if (fact.branchId === branchIdValue) fact.branchId = main.id;
    }
    book.branches = book.branches.filter((branch) => branch.id !== branchIdValue);
    book.updatedAt = now();
    atomicWriteJsonSync(STATE_PATH, state);
    return { deleted: true, id: branchIdValue, movedTo: main.id };
  });
}

export function chapterPath(bookId, no) {
  return path.join(BOOKS_DIR, bookId, 'chapters', `${String(no).padStart(4, '0')}.md`);
}

export function readChapterSync(bookId, no) {
  try {
    return fs.readFileSync(chapterPath(bookId, no), 'utf8');
  } catch {
    return '';
  }
}

export async function readChapter(bookId, no) {
  return readChapterSync(bookId, no);
}

function shingleSet(text, size = 8) {
  const s = String(text).replace(/\s+/g, '');
  const set = new Set();
  for (let i = 0; i + size <= s.length; i += 1) set.add(s.slice(i, i + size));
  return set;
}

function overlapRatio(a, b) {
  const sa = shingleSet(a);
  const sb = shingleSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const x of sa) if (sb.has(x)) shared += 1;
  return shared / Math.min(sa.size, sb.size);
}

/**
 * 保存一章。硬规则：
 *   · 必须先确定分支与时间线；
 *   · 字数必须落在本书区间内（先定字数再动笔）；
 *   · 必须有梗概（没有梗概的章节等于给后文挖坑）；
 *   · 不允许整段复刻同分支上一章（Jaccard > 0.35 直接拒绝）。
 */
export async function saveChapter(bookId, input = {}) {
  const content = String(input.content ?? '');
  const words = countChars(content);
  if (words === 0) throw new Error('正文为空，无法保存');
  return withLock(async () => {
    const state = readStateSync();
    const book = state.books[bookId];
    if (!book) throw new Error('作品不存在');
    const { min, max, target } = book.chars;
    if (words < min || words > max) {
      const direction = words < min ? `还差 ${min - words} 字` : `超出 ${words - max} 字`;
      throw new Error(`字数不符合本书设定：本次 ${words} 字，区间 ${min}–${max}（目标 ${target}），${direction}。请按区间重写后再保存——字数必须在动笔前定好。`);
    }

    const requestedNo = Number(input.no);
    const existing = requestedNo > 0 ? book.chapters.find((ch) => ch.no === requestedNo) : null;
    const branch = resolveBranch(book, input.branch || existing?.branchId);
    if (!branch) throw new Error('没有可用的叙事分支');
    const branchChaps = branchChapters(book, branch.id);
    const maxSeq = branchChaps.reduce((m, ch) => Math.max(m, ch.seq ?? 0), 0);
    const requestedSeq = Number(input.seq);
    const seq = requestedSeq > 0 ? requestedSeq : (existing?.seq ?? maxSeq + 1);
    if (!Number.isInteger(seq) || seq < 1) throw new Error('分支内章序必须是正整数');
    const duplicateSeq = branchChaps.find((ch) => ch.seq === seq && ch.no !== requestedNo);
    if (duplicateSeq) {
      throw new Error(`分支「${branch.name}」里第 ${seq} 章已存在。换一个章序，或先删除旧章。`);
    }
    const timeline = clampText(input.timeline, 300) || clampText(existing?.timeline, 300) || branch.timeline;
    if (!timeline) {
      throw new Error(`分支「${branch.name}」还没有时间线。先填写分支时间线或本章时间线，再动笔。`);
    }

    const no = requestedNo > 0 ? requestedNo : (book.chapters.reduce((m, ch) => Math.max(m, ch.no), 0) + 1);
    if (!Number.isInteger(no) || no < 1) throw new Error('章节存储号必须是正整数');
    if (existing && input.overwrite !== true) {
      throw new Error(`第 ${no} 章已存在。若要覆盖请显式传 overwrite=true（旧文件会被替换）。`);
    }
    const summary = clampText(input.summary, 800);
    if (!summary) throw new Error('必须提供本章梗概 summary（1–3 句），否则后续章节会失去上下文。');

    const previous = branchChaps
      .filter((ch) => (ch.seq ?? 0) < seq && ch.no !== requestedNo)
      .sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0))[0];
    if (previous) {
      const ratio = overlapRatio(content, readChapterSync(bookId, previous.no));
      if (ratio > 0.35) {
        throw new Error(`本章与分支内上一章（第 ${previous.seq} 章）正文重复度过高（${Math.round(ratio * 100)}%），疑似复制旧章。请重写。`);
      }
    }

    const title = clampText(input.title, 80) || `第${seq}章`;
    const characters = Array.isArray(input.characters)
      ? input.characters.map((x) => String(x).trim()).filter(Boolean)
      : [];
    const file = chapterPath(bookId, no);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
    const meta = {
      no,
      seq,
      branchId: branch.id,
      timeline,
      title,
      summary,
      words,
      characters,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
    };
    if (existing) Object.assign(existing, meta);
    else book.chapters.push(meta);
    book.chapters.sort((a, b) => a.no - b.no);
    if (typeof input.facts === 'string' && input.facts.trim()) {
      for (const line of input.facts.split(/\r?\n/)) {
        const text = line.replace(/^[-*]\s*/, '').trim();
        if (text) book.facts.push({ chapter: no, branchId: branch.id, text, createdAt: now() });
      }
    }
    book.updatedAt = now();
    atomicWriteJsonSync(STATE_PATH, state);
    return {
      chapter: meta,
      branch: { id: branch.id, name: branch.name, kind: branch.kind, timeline: branch.timeline },
      bookId,
      totalWords: book.chapters.reduce((n, ch) => n + ch.words, 0),
    };
  });
}

export async function deleteChapter(bookId, no) {
  return withLock(async () => {
    const state = readStateSync();
    const book = state.books[bookId];
    if (!book) throw new Error('作品不存在');
    const before = book.chapters.length;
    book.chapters = book.chapters.filter((ch) => ch.no !== no);
    if (book.chapters.length === before) throw new Error('章节不存在');
    book.updatedAt = now();
    atomicWriteJsonSync(STATE_PATH, state);
    try { await fsp.rm(chapterPath(bookId, no), { force: true }); } catch { /* 文件删不掉不影响索引 */ }
    return { deleted: true, no };
  });
}

/**
 * 修改已有章节的「关系」与元信息：所属分支、分支内章序、时间线、标题、梗概、出场人物。
 * 改分支/章序时自动顺延相邻章节，不重写正文文件。
 */
export async function updateChapterMeta(bookId, no, patch = {}) {
  return withLock(async () => {
    const state = readStateSync();
    const book = state.books[bookId];
    if (!book) throw new Error('作品不存在');
    const chapter = book.chapters.find((ch) => ch.no === Number(no));
    if (!chapter) throw new Error('章节不存在');
    const targetBranch = resolveBranch(book, patch.branch || chapter.branchId);
    if (!targetBranch) throw new Error('目标分支不存在');
    const timeline = clampText(patch.timeline, 300) || chapter.timeline || targetBranch.timeline;
    if (!timeline) throw new Error(`分支「${targetBranch.name}」还没有时间线，请先填写本章时间线。`);

    const oldBranchId = chapter.branchId;
    const oldSeq = chapter.seq ?? 1;
    const oldBranchChapters = book.chapters.filter((ch) => ch.branchId === oldBranchId && ch.no !== chapter.no);
    const targetChapters = book.chapters.filter((ch) => ch.branchId === targetBranch.id && ch.no !== chapter.no);
    const targetMax = targetChapters.reduce((max, ch) => Math.max(max, ch.seq ?? 0), 0);
    const requestedSeq = Number(patch.seq);
    let targetSeq = requestedSeq > 0 ? requestedSeq : (oldBranchId === targetBranch.id ? oldSeq : targetMax + 1);
    if (targetSeq > targetMax + 1) targetSeq = targetMax + 1;
    if (!Number.isInteger(targetSeq) || targetSeq < 1) throw new Error('分支内章序必须是正整数');

    if (oldBranchId !== targetBranch.id) {
      for (const ch of oldBranchChapters) {
        if ((ch.seq ?? 0) > oldSeq) ch.seq = (ch.seq ?? 0) - 1;
      }
      for (const ch of targetChapters) {
        if ((ch.seq ?? 0) >= targetSeq) ch.seq = (ch.seq ?? 0) + 1;
      }
    } else if (targetSeq !== oldSeq) {
      if (targetSeq > oldSeq) {
        for (const ch of targetChapters) {
          const seq = ch.seq ?? 0;
          if (seq > oldSeq && seq <= targetSeq) ch.seq = seq - 1;
        }
      } else {
        for (const ch of targetChapters) {
          const seq = ch.seq ?? 0;
          if (seq >= targetSeq && seq < oldSeq) ch.seq = seq + 1;
        }
      }
    }

    chapter.branchId = targetBranch.id;
    chapter.seq = targetSeq;
    chapter.timeline = timeline;
    chapter.title = clampText(patch.title, 80) || chapter.title;
    chapter.summary = clampText(patch.summary, 800) || chapter.summary;
    if (Array.isArray(patch.characters)) {
      chapter.characters = patch.characters.map((x) => String(x).trim()).filter(Boolean);
    } else if (typeof patch.characters === 'string') {
      chapter.characters = patch.characters.split(/[,，、\n]+/).map((x) => x.trim()).filter(Boolean);
    }
    chapter.updatedAt = now();
    for (const fact of book.facts) {
      if (fact.chapter === chapter.no) fact.branchId = targetBranch.id;
    }
    book.updatedAt = now();
    atomicWriteJsonSync(STATE_PATH, state);
    return {
      chapter: { ...chapter },
      branch: { id: targetBranch.id, name: targetBranch.name, kind: targetBranch.kind, timeline: targetBranch.timeline },
    };
  });
}

export async function appendFact(bookId, text, chapter, branchRef) {
  const value = clampText(text, 2000);
  if (!value) throw new Error('要记录的设定/事实不能为空');
  return withLock(async () => {
    const state = readStateSync();
    const book = state.books[bookId];
    if (!book) throw new Error('作品不存在');
    const branch = resolveBranch(book, branchRef);
    const item = {
      chapter: Number(chapter) || book.chapters.length,
      branchId: branch?.id ?? DEFAULT_BRANCH_ID,
      text: value,
      createdAt: now(),
    };
    book.facts.push(item);
    book.updatedAt = now();
    atomicWriteJsonSync(STATE_PATH, state);
    return item;
  });
}

export function getSession(state, sessionId) {
  if (!sessionId) return null;
  const s = state.sessions[sessionId];
  return s && typeof s === 'object' ? s : null;
}

export async function setSession(sessionId, patch = {}) {
  if (!sessionId) throw new Error('缺少会话 id（面板不在会话里时无法绑定写作模式）');
  return withLock(async () => {
    const state = readStateSync();
    const current = state.sessions[sessionId] ?? {};
    const next = { ...current, ...patch, updatedAt: now() };
    if (patch.mode !== undefined) next.mode = Boolean(patch.mode);
    if (patch.bookId !== undefined) {
      if (patch.bookId && !state.books[patch.bookId]) throw new Error('要绑定的作品不存在');
      next.bookId = patch.bookId || null;
      if (patch.bookId) state.activeBookId = patch.bookId;
    }
    state.sessions[sessionId] = next;
    atomicWriteJsonSync(STATE_PATH, state);
    return next;
  });
}

export function styleToText(style) {
  const s = { ...STYLE_DEFAULTS, ...(style ?? {}) };
  const lines = [];
  lines.push(`- 基调：${TONE_LABELS[s.tone] ?? s.tone}`);
  lines.push(`- 描写重心：${FOCUS_LABELS[s.focus] ?? s.focus}`);
  if (s.focus === 'character' || s.focus === 'balanced') {
    const list = (s.charFocus ?? []).map((x) => CHAR_FOCUS_LABELS[x]).filter(Boolean);
    if (list.length > 0) lines.push(`- 人物描写侧重：${list.join('、')}`);
  }
  lines.push(`- 视角：${PERSON_LABELS[s.person] ?? s.person}`);
  lines.push(`- 遵循程度：${ADHERENCE_LABELS[s.adherence] ?? s.adherence}`);
  lines.push(`- 叙事节奏：${PACING_LABELS[s.pacing] ?? s.pacing}`);
  lines.push(`- 句长：${SENTENCE_LABELS[s.sentence] ?? s.sentence}`);
  if (s.custom && String(s.custom).trim()) lines.push(`- 额外要求：${String(s.custom).trim()}`);
  if (s.sample && String(s.sample).trim()) {
    lines.push(`- 语感参考（只模仿节奏与味道，绝不照抄句子）：\n${String(s.sample).trim().slice(0, 1200)}`);
  }
  return lines.join('\n');
}

export function describeCharacter(c) {
  const rows = [
    `### ${c.name}${c.role ? `（${c.role}）` : ''}`,
    c.gender ? `- 性别：${c.gender}` : '',
    c.age ? `- 年龄：${c.age}` : '',
    c.identity ? `- 身份：${c.identity}` : '',
    c.appearance ? `- 外貌：${c.appearance}` : '',
    c.personality ? `- 性格：${c.personality}` : '',
    c.speech ? `- 语言特征：${c.speech}` : '',
    c.notes ? `- 补充：${c.notes}` : '',
  ].filter(Boolean);
  return rows.join('\n');
}

/** 把地点按「包含」关系渲染成缩进树；关联地点以名字列出。 */
export function locationTreeLines(book) {
  if (!book.locations || book.locations.length === 0) return '';
  const byId = new Map(book.locations.map((loc) => [loc.id, loc]));
  const children = new Map();
  for (const loc of book.locations) {
    const key = loc.parentId && byId.has(loc.parentId) ? loc.parentId : '';
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(loc);
  }
  const lines = [];
  const visited = new Set();
  const render = (parentId, depth) => {
    for (const loc of children.get(parentId) ?? []) {
      if (visited.has(loc.id)) continue;
      visited.add(loc.id);
      const indent = '  '.repeat(depth);
      const linkNames = (loc.links ?? [])
        .map((id) => byId.get(id)?.name)
        .filter(Boolean);
      lines.push(`${indent}- **${loc.name}**（${loc.type}）${linkNames.length ? ` 关联：${linkNames.join('、')}` : ''}`);
      if (loc.description) lines.push(`${indent}  - 描述：${loc.description.slice(0, 600)}`);
      if (loc.atmosphere) lines.push(`${indent}  - 氛围：${loc.atmosphere.slice(0, 300)}`);
      if (loc.rules) lines.push(`${indent}  - 规则/禁忌：${loc.rules.slice(0, 300)}`);
      if (loc.secrets) lines.push(`${indent}  - 秘密/剧情钩子：${loc.secrets.slice(0, 400)}`);
      if (loc.notes) lines.push(`${indent}  - 备注：${loc.notes.slice(0, 300)}`);
      render(loc.id, depth + 1);
    }
  };
  render('', 0);
  // 异常数据（父级丢失/成环）兜底：未访问到的地点平铺，避免上下文漏设定。
  for (const loc of book.locations) {
    if (visited.has(loc.id)) continue;
    visited.add(loc.id);
    lines.push(`- **${loc.name}**（${loc.type}）${loc.description ? `：${loc.description.slice(0, 300)}` : ''}`);
  }
  return lines.join('\n');
}

/**
 * 组装上下文包——这是「看不见前文」的正解：
 *   所有设定从磁盘现读，章节梗概按时间倒序取最近 30 章，上一章附结尾原文。
 */
export function buildContextPack(book, { chapter, branch } = {}) {
  const targetBranch = resolveBranch(book, branch);
  if (!targetBranch) throw new Error('没有可用的叙事分支');
  const targetChapters = branchChapters(book, targetBranch.id);
  const nextNo = chapter && Number.isInteger(Number(chapter))
    ? Number(chapter)
    : (book.chapters.reduce((m, ch) => Math.max(m, ch.no), 0) + 1);
  const existing = book.chapters.find((ch) => ch.no === nextNo);
  const nextSeq = existing ? (existing.seq ?? targetChapters.length) : (targetChapters.reduce((m, ch) => Math.max(m, ch.seq ?? 0), 0) + 1);
  const visible = targetChapters.filter((ch) => ch.no < nextNo || ch.no === nextNo);
  const recent = visible.slice(-30);
  const older = visible.slice(0, -30);
  const last = visible.slice(-1)[0];
  const tail = last ? readChapterSync(book.id, last.no).slice(-1400) : '';
  const { min, max, target } = book.chars;
  const facts = book.facts
    .filter((fact) => !fact.branchId || fact.branchId === targetBranch.id)
    .slice(-40);
  const otherBranches = book.branches
    .filter((item) => item.id !== targetBranch.id)
    .map((item) => ({ branch: item, count: branchChapters(book, item.id).length }))
    .filter((item) => item.count > 0);

  const parts = [];
  parts.push(`# 《${book.title}》写作上下文包`);
  parts.push(`> 目标：分支「${targetBranch.name}」第 ${nextSeq} 章（存储号 ${nextNo}） ｜ 生成时间：${now()}`);
  parts.push('');
  parts.push('## 一、硬性字数（动笔前已确定，落盘时强制校验）');
  parts.push(`本章必须写 **${min}–${max} 字**，目标 **${target} 字**。低于 ${min} 或高于 ${max} 都会被拒绝保存。`);
  parts.push('');
  parts.push('## 二、作品档案');
  parts.push(`- 书名：${book.title}`);
  if (book.genre) parts.push(`- 类型：${book.genre}`);
  if (book.logline) parts.push(`- 一句话立意：${book.logline}`);
  if (book.synopsis) parts.push(`- 简介：\n${book.synopsis}`);
  parts.push('');
  parts.push('## 三、叙事分支与时间线（写作前必须锁定）');
  for (const item of book.branches) {
    parts.push(`- ${item.id === targetBranch.id ? '**【当前分支】** ' : ''}${item.name}（${item.kind}）· 时间线：${item.timeline || '（未填写）'}${item.description ? ` · ${item.description}` : ''}`);
  }
  if (!targetBranch.timeline) {
    parts.push('');
    parts.push(`> ⚠️ 当前分支「${targetBranch.name}」的时间线尚未填写。动笔前必须先让用户确定时间线（或在本章保存时填写本章时间线），否则拒绝落盘。`);
  }
  parts.push('');
  parts.push('## 四、写作风格卡');
  parts.push(styleToText(book.style));
  parts.push('');
  parts.push('## 五、世界观 / 时代背景');
  parts.push(book.worldview?.trim() ? book.worldview.trim() : '（尚未填写——写作前应先向用户确认世界观，或按已有设定保守发挥，不要凭空发明会冲突的硬规则。）');
  parts.push('');
  parts.push('## 六、重要地点');
  parts.push(book.locations.length > 0
    ? `共 ${book.locations.length} 处，按「包含」关系缩进；「关联」是地点之间的串联关系：\n${locationTreeLines(book)}`
    : '（尚未建立地点条目——写作前应确认故事发生在哪些城市/场所，避免临场发明与后文冲突的地点。）');
  parts.push('');
  parts.push(`## 七、角色卡（共 ${book.characters.length} 人）`);
  parts.push(book.characters.length > 0
    ? book.characters.map(describeCharacter).join('\n\n')
    : '（尚未建立角色卡——写作前应先向用户确认主要角色。）');
  parts.push('');
  parts.push(`## 八、前文梗概（分支：${targetBranch.name} · 时间线：${targetBranch.timeline || '未填写'}）`);
  if (older.length > 0) {
    parts.push(`（更早的 ${older.length} 章：${older.map((ch) => `第${ch.seq}章《${ch.title}》`).join('、')}）`);
  }
  if (recent.length === 0) {
    parts.push('（本分支尚未开始正文，本章是该分支的第一章。）');
  } else {
    for (const ch of recent) {
      parts.push(`- 第${ch.seq}章《${ch.title}》（${ch.words}字，时间线：${ch.timeline || targetBranch.timeline || '未填写'}）：${ch.summary}`);
    }
  }
  parts.push('');
  if (otherBranches.length > 0) {
    parts.push('## 九、其他分支（只作时间线参照；**不要引用或混入它们的具体剧情**）');
    for (const { branch: item, count } of otherBranches) {
      parts.push(`- ${item.name}（${item.kind}）· 时间线：${item.timeline || '未填写'} · 已写 ${count} 章（剧情不注入本章上下文）`);
    }
    parts.push('');
  }
  if (tail) {
    parts.push(`## 十、本分支上一章结尾原文（${targetBranch.name} · 第 ${last.seq} 章，用于接续语气与场景）`);
    parts.push('```text');
    parts.push(tail);
    parts.push('```');
    parts.push('');
  }
  parts.push('## 十一、连续性账本（当前分支已确认的事实，不得违背）');
  parts.push(facts.length > 0
    ? facts.map((f) => `- 第${f.chapter}章：${f.text}`).join('\n')
    : '（暂无。写完一章后，把新出现的硬事实用 writer_save_chapter 的 facts 或 writer_update 记进来。）');
  parts.push('');
  parts.push('## 十二、写作纪律');
  parts.push('1. 只写这一章，不擅自连写下一章；写完立即停笔汇报。');
  parts.push('2. 本章属于哪个分支、时间线是什么，以上文为准；不得把其他分支的剧情混进来。');
  parts.push('3. 人物姓名、年龄、身份、外貌、关系、世界观硬规则，一律以上文字为准；上文没写的，不得临场发明成硬设定。');
  parts.push('4. 与前文冲突时，以已写正文和连续性账本为准；确实需要改动，先向用户说明。');
  parts.push('5. 本章写完必须调用 writer_save_chapter 保存，并附上分支、时间线、1–3 句梗概、出场人物与新增硬事实。');
  parts.push('6. 对话要符合角色卡的语言特征，不要所有角色一个腔调。');
  return parts.join('\n');
}

/** 关键词检索已写章节；返回分支、章序 + 片段。长篇“找回来”不靠记忆。 */
export function searchChapters(book, query, limit = 8, { branch } = {}) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  const targetBranch = branch ? resolveBranch(book, branch) : null;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 1 && q.length >= 4) {
    for (let i = 0; i + 2 <= q.length; i += 2) tokens.push(q.slice(i, i + 2));
  }
  const hits = [];
  const branches = new Map((book.branches ?? []).map((item) => [item.id, item]));
  for (const ch of book.chapters) {
    if (targetBranch && ch.branchId !== targetBranch.id) continue;
    const text = readChapterSync(book.id, ch.no);
    if (!text) continue;
    let score = 0;
    let first = -1;
    for (const token of tokens) {
      let idx = text.indexOf(token);
      let count = 0;
      while (idx !== -1 && count < 20) {
        count += 1;
        if (first === -1 || idx < first) first = idx;
        idx = text.indexOf(token, idx + token.length);
      }
      score += count;
    }
    if (score > 0) {
      const start = Math.max(0, (first === -1 ? 0 : first) - 60);
      hits.push({
        no: ch.no,
        seq: ch.seq ?? ch.no,
        branchId: ch.branchId ?? DEFAULT_BRANCH_ID,
        branchName: branches.get(ch.branchId)?.name ?? '主线',
        title: ch.title,
        score,
        snippet: text.slice(start, start + 220).replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(20, limit)));
}
