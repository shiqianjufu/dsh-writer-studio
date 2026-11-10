// lib/tools.js — 写作台暴露给模型的工具。
//
// 这些工具本身就是“防遗忘”的流程：writer_start 激活写作模式 → writer_context
// 每次从磁盘重新组装上下文 → writer_save_chapter 强制字数/梗概/重复度校验并落盘
// → writer_recall 在几十章后把具体段落找回来。
import {
  readState, createBook, updateBook, findBook, resolveBook, publicBook,
  saveChapter, readChapter, appendFact, upsertCharacter, deleteCharacter,
  updateChapterMeta,
  upsertLocation, deleteLocation,
  upsertBranch, deleteBranch, resolveBranch, nextChapterSlot, branchChapters,
  DEFAULT_BRANCH_ID, BRANCH_KINDS,
  setSession, getSession, buildContextPack, searchChapters, countChars,
  validateCharsSpec, styleToText, TONE_LABELS, FOCUS_LABELS, CHAR_FOCUS_LABELS,
  PERSON_LABELS, ADHERENCE_LABELS, PACING_LABELS, SENTENCE_LABELS,
} from './store.js';
import { definePortableTool, jsonText } from './define-tool.js';

const RULES = [
  '写作模式已开启。以下规则在本会话内持续有效：',
  '1. 一次只写一章。写完立即停笔，向用户汇报本章要点与下一章建议，等用户决定是否继续。',
  '2. 动笔前必须先调用 writer_context 拿上下文包；人物、世界观、文风、字数目标都以它为准，不靠记忆。',
  '3. 字数在动笔前已由设定锁定；写完必须调用 writer_save_chapter 落盘，字数不在区间内会被拒绝。',
  '4. 每章保存必须附 1–3 句梗概与出场人物；本章产生的新硬事实（谁得到什么、谁去了哪、谁和谁翻脸）一并写进 facts。',
  '5. 不得违背已写正文与连续性账本；需要改动设定时，先向用户说明再改。',
  '6. 对话要符合角色卡的语言特征；不同角色不能一个腔调。',
  '7. 写到后面记不清前文时，用 writer_recall 检索原文，不要凭印象编。',
  '8. 分支与时间线：每章必须明确属于哪条分支（主线/if线/前传/后传等）和什么时间线；不同分支的剧情不得混写。',
].join('\n');

const STATE_TEXT = '写作台状态：返回当前作品、章节进度、角色与字数设定。';

function sessionIdOf(exec) {
  const id = exec?.agent?.session?.header?.id ?? exec?.sessionId;
  return typeof id === 'string' && id !== '' ? id : null;
}

function ok(value) {
  return { ok: true, ...value };
}

function fail(message, extra = {}) {
  return { ok: false, error: String(message ?? '未知错误'), ...extra };
}

async function requireMode(exec) {
  const sessionId = sessionIdOf(exec);
  if (!sessionId) return { sessionId: null, session: null };
  const state = await readState();
  const session = getSession(state, sessionId);
  if (!session?.mode) {
    throw new Error('写作模式尚未开启。先调用 writer_start（用户说「开启写作模式」时也应这样做），再写正文。');
  }
  return { sessionId, session };
}

async function currentBook(exec, ref) {
  const state = await readState();
  const sessionId = sessionIdOf(exec);
  const book = resolveBook(state, ref, sessionId);
  if (!book) {
    throw new Error('还没有任何作品。请先让用户打开右侧「写作台」新建作品，或在对话里用 writer_update action=book 建书。');
  }
  return book;
}

function tool(name, description, parameters, execute) {
  const render = (args, value) => {
    if (value && value.ok === false) return `错误：${value.error ?? '未知错误'}`;
    if (name === 'writer_start') {
      return [value.rules, value.context, value.next].filter(Boolean).join('\n\n');
    }
    if (name === 'writer_context') return value.context;
    if (name === 'writer_save_chapter') {
      const ch = value.chapter ?? {};
      return `${value.next ?? '已保存'}\n\n第 ${ch.no} 章《${ch.title}》 · ${ch.words} 字 · 全书累计 ${value.totalWords} 字`;
    }
    if (name === 'writer_recall') {
      if (!Array.isArray(value.hits) || value.hits.length === 0) return `${value.note ?? '没有命中。'}`;
      return [
        `检索「${value.query}」命中 ${value.hits.length} 处：`,
        ...value.hits.map((hit) => `- ${hit.branchName ?? '主线'} 第${hit.seq ?? hit.no}章《${hit.title}》（${hit.score}）：${hit.snippet}`),
        value.note ?? '',
      ].filter(Boolean).join('\n');
    }
    return jsonText(value);
  };
  return definePortableTool({ name, description, parameters, execute, render });
}

export function defineWriterTools(ctx) {
  return [
    tool(
      'writer_start',
      '开启写作模式（本会话级，随时可再次调用以切换作品）。不写正文，只做三件事：把当前会话标记为写作模式、绑定作品、返回写作纪律与完整上下文包。用户说「开启写作模式 / 写小说 / 继续写 / 写下一章」时先调用它。',
      {
        book: { type: 'string', description: '可选：作品名或 id；省略则使用本会话绑定的作品/最近更新的作品。' },
        branch: { type: 'string', description: '可选：叙事分支名或 id（主线 / if线 / 前传 / 后传…）；省略用本会话上次的分支或主线。' },
        chapter: { type: 'integer', description: '可选：本章在存储层的章号；省略则自动取下一章。' },
      },
      async (args, exec) => {
        try {
          const state = await readState();
          const sessionId = sessionIdOf(exec);
          const session = sessionId ? getSession(state, sessionId) : null;
          const book = resolveBook(state, args?.book, sessionId);
          if (!book) {
            return fail('还没有作品。请先在右侧「写作台」新建作品（书名、类型、每章字数），再开启写作模式。', { code: 'NO_BOOK' });
          }
          const branch = resolveBranch(book, args?.branch || session?.branchId);
          const slot = nextChapterSlot(book, branch?.id);
          if (sessionId) {
            await setSession(sessionId, { mode: true, bookId: book.id, branchId: slot.branch.id, title: book.title });
          }
          const chapter = args?.chapter;
          return ok({
            mode: 'writing',
            activeBook: {
              id: book.id,
              title: book.title,
              chapters: book.chapters.length,
              chars: book.chars,
              branches: book.branches.map((item) => ({ id: item.id, name: item.name, kind: item.kind, timeline: item.timeline })),
            },
            branch: slot.branch,
            rules: RULES,
            context: buildContextPack(book, { chapter, branch: slot.branch.id }),
            next: `先读上下文包，然后直接写「${slot.branch.name}」第 ${chapter ?? slot.seq} 章（${book.chars.min}–${book.chars.max} 字，目标 ${book.chars.target}）。写完调用 writer_save_chapter，带上 branch="${slot.branch.name}" 与 timeline。`,
          });
        } catch (error) {
          return fail(error?.message ?? error);
        }
      },
    ),

    tool(
      'writer_context',
      '取某一分支下一章的完整写作上下文包：作品档案、分支与时间线、文风卡、世界观、重要地点（含包含/串联关系）、全部角色卡、本分支最近 30 章梗概、本分支上一章结尾原文、连续性账本、字数目标。每次动笔前必调；它从磁盘现读，不依赖模型记忆。',
      {
        chapter: { type: 'integer', description: '要写的章号（存储层）；省略则自动取下一章。' },
        branch: { type: 'string', description: '可选：叙事分支名或 id；省略用本会话上次的分支。' },
        book: { type: 'string', description: '可选：作品名或 id；省略用本会话绑定的作品。' },
      },
      async (args, exec) => {
        try {
          const { session } = await requireMode(exec);
          const book = await currentBook(exec, args?.book);
          const branch = resolveBranch(book, args?.branch || session?.branchId);
          return ok({
            activeBook: { id: book.id, title: book.title, chars: book.chars },
            branch: branch ? { id: branch.id, name: branch.name, kind: branch.kind, timeline: branch.timeline } : null,
            context: buildContextPack(book, { chapter: args?.chapter, branch: branch?.id }),
          });
        } catch (error) {
          return fail(error?.message ?? error, { code: 'NOT_READY' });
        }
      },
    ),

    tool(
      'writer_save_chapter',
      '保存一章正文到磁盘（版本化覆盖由 overwrite 控制）。硬校验：必须确定分支与时间线、字数必须落在本书区间内、必须有本章梗概、不得整段复刻本分支上一章。保存后本章梗概与账本会进入后续 writer_context。',
      {
        branch: { type: 'string', description: '本章所属分支（主线 / if线 / 前传 / 后传 / 外传 / 番外，或自定义名）；省略用本会话上次的分支。' },
        timeline: { type: 'string', description: '本章时间线（例如「正传第 3 章之后」「三年前的冬天」）；省略用分支时间线。' },
        seq: { type: 'integer', description: '分支内章序；省略则自动取本分支下一章。' },
        no: { type: 'integer', description: '存储层章号（一般不用填）；省略自动分配。' },
        title: { type: 'string', description: '本章标题（省略为「第N章」，N 是分支内章序）。' },
        content: { type: 'string', required: true, description: '本章正文全文。' },
        summary: { type: 'string', required: true, description: '1–3 句本章梗概，供后续上下文包使用。' },
        characters: { type: 'string', description: '本章出场人物，逗号分隔。' },
        facts: { type: 'string', description: '本章新产生的硬事实，多行；每行一条（如「林澈得到青铜钥匙」「苏晚与主角决裂」）。' },
        overwrite: { type: 'boolean', description: 'true=覆盖同一存储章号已存在的版本。' },
        book: { type: 'string', description: '可选：作品名或 id。' },
      },
      async (args, exec) => {
        try {
          const { session } = await requireMode(exec);
          const book = await currentBook(exec, args?.book);
          const result = await saveChapter(book.id, {
            no: args?.no,
            branch: args?.branch || session?.branchId || DEFAULT_BRANCH_ID,
            timeline: args?.timeline,
            seq: args?.seq,
            title: args?.title,
            content: args?.content,
            summary: args?.summary,
            characters: typeof args?.characters === 'string'
              ? args.characters.split(/[,，、\n]+/).map((x) => x.trim()).filter(Boolean)
              : [],
            facts: args?.facts,
            overwrite: args?.overwrite === true,
          });
          return ok({
            saved: true,
            book: book.title,
            branch: result.branch,
            chapter: result.chapter,
            totalWords: result.totalWords,
            next: `「${result.branch.name}」第 ${result.chapter.seq} 章已落盘（${result.chapter.words} 字，时间线：${result.chapter.timeline}）。停笔汇报，等用户决定是否继续。`,
          });
        } catch (error) {
          return fail(error?.message ?? error, { code: 'SAVE_REJECTED' });
        }
      },
    ),

    tool(
      'writer_recall',
      '在已写章节里按关键词检索原文，返回分支、章序、标题与片段。写到几十章后记不清前文时用它，不要凭记忆编。',
      {
        query: { type: 'string', required: true, description: '检索词：人名、地名、物件、事件片段。' },
        limit: { type: 'integer', description: '最多返回条数，默认 8。' },
        branch: { type: 'string', description: '可选：只检索某条分支；省略检索全部分支。' },
        book: { type: 'string', description: '可选：作品名或 id。' },
      },
      async (args, exec) => {
        try {
          const book = await currentBook(exec, args?.book);
          const hits = searchChapters(book, args?.query, args?.limit ?? 8, { branch: args?.branch });
          return ok({ query: args?.query, branch: args?.branch || '全部分支', hits, note: hits.length === 0 ? '没有命中。换更短的词，或确认这段是否已经写过。' : '只把命中片段当证据，不要扩写不存在的情节。' });
        } catch (error) {
          return fail(error?.message ?? error);
        }
      },
    ),

    tool(
      'writer_update',
      '修改写作台里的设定（与面板同步，同一份数据）。action=book 改书名/类型/立意/简介/字数区间/文风；action=world 改世界观；action=style 改文风；action=character 新增或更新角色；action=character_delete 删角色；action=location 新增或更新重要地点（支持 parentName 包含关系、linkNames 串联关系）；action=location_delete 删地点；action=branch 新增或更新叙事分支（名称/类型/时间线/说明）；action=branch_delete 删分支（章节迁回主线）；action=chapter 修改已有章节的分支/章序/时间线/标题/梗概/出场人物（自动顺延相邻章节）；action=facts 追加连续性事实。',
      {
        action: { type: 'string', required: true, enum: ['book', 'world', 'style', 'character', 'character_delete', 'location', 'location_delete', 'branch', 'branch_delete', 'chapter', 'facts'], description: '要改哪类设定。' },
        payload: { type: 'string', required: true, description: 'book/style/character/location/branch/chapter 传 JSON；world/facts 传纯文本；character_delete/location_delete/branch_delete 传名称或 id。' },
        chapter: { type: 'integer', description: 'action=facts 时，这条事实归属的章号。' },
        branch: { type: 'string', description: 'action=facts 时，这条事实归属的分支；省略用主线。' },
        book: { type: 'string', description: '可选：作品名或 id。' },
      },
      async (args, exec) => {
        try {
          const book = await currentBook(exec, args?.book);
          const action = args?.action;
          const payload = String(args?.payload ?? '').trim();
          if (action === 'world') {
            const updated = await updateBook(book.id, { worldview: payload });
            return ok({ updated: 'world', worldview: updated.worldview });
          }
          if (action === 'book') {
            let data;
            try { data = JSON.parse(payload); } catch { throw new Error('action=book 的 payload 必须是 JSON'); }
            const patch = {};
            for (const key of ['title', 'genre', 'logline', 'synopsis']) {
              if (typeof data[key] === 'string') patch[key] = data[key];
            }
            if (data.chars !== undefined) {
              const spec = typeof data.chars === 'string' ? parseCharsSpec(data.chars) : data.chars;
              patch.chars = validateCharsSpec(spec);
            }
            if (data.style !== undefined) patch.style = data.style;
            const updated = await updateBook(book.id, patch);
            return ok({ updated: 'book', book: publicBook(updated) });
          }
          if (action === 'style') {
            let data;
            try { data = JSON.parse(payload); } catch { throw new Error('action=style 的 payload 必须是 JSON'); }
            const updated = await updateBook(book.id, { style: data });
            return ok({ updated: 'style', style: updated.style, styleText: styleToText(updated.style) });
          }
          if (action === 'character') {
            let data;
            try { data = JSON.parse(payload); } catch { throw new Error('action=character 的 payload 必须是 JSON（对象或数组）'); }
            const list = Array.isArray(data) ? data : [data];
            const saved = [];
            for (const item of list) saved.push(await upsertCharacter(book.id, item));
            return ok({ updated: 'character', characters: saved });
          }
          if (action === 'character_delete') {
            const state = await readState();
            const fresh = state.books[book.id];
            const target = fresh?.characters.find((c) => c.id === payload || c.name === payload);
            if (!target) throw new Error(`找不到角色「${payload}」`);
            await deleteCharacter(book.id, target.id);
            return ok({ updated: 'character_delete', name: target.name });
          }
          if (action === 'location') {
            let data;
            try { data = JSON.parse(payload); } catch { throw new Error('action=location 的 payload 必须是 JSON（对象或数组）'); }
            const list = Array.isArray(data) ? data : [data];
            const saved = [];
            for (const raw of list) {
              const freshState = await readState();
              const freshBook = freshState.books[book.id];
              const locations = freshBook?.locations ?? [];
              let parentId = typeof raw.parentId === 'string' ? raw.parentId : '';
              if (!parentId && raw.parentName) {
                parentId = locations.find((loc) => loc.name === String(raw.parentName))?.id ?? '';
              }
              let links = Array.isArray(raw.links) ? raw.links : null;
              if ((!links || links.length === 0) && Array.isArray(raw.linkNames)) {
                links = raw.linkNames
                  .map((name) => locations.find((loc) => loc.name === String(name))?.id)
                  .filter(Boolean);
              }
              saved.push(await upsertLocation(book.id, {
                ...raw,
                parentId,
                ...(links ? { links } : {}),
              }));
            }
            return ok({ updated: 'location', locations: saved });
          }
          if (action === 'location_delete') {
            const state = await readState();
            const fresh = state.books[book.id];
            const target = fresh?.locations.find((loc) => loc.id === payload || loc.name === payload);
            if (!target) throw new Error(`找不到地点「${payload}」`);
            await deleteLocation(book.id, target.id);
            return ok({ updated: 'location_delete', name: target.name });
          }
          if (action === 'branch') {
            let data;
            try { data = JSON.parse(payload); } catch { throw new Error('action=branch 的 payload 必须是 JSON（对象或数组）'); }
            const list = Array.isArray(data) ? data : [data];
            const saved = [];
            for (const item of list) saved.push(await upsertBranch(book.id, item));
            return ok({ updated: 'branch', branches: saved });
          }
          if (action === 'branch_delete') {
            const state = await readState();
            const fresh = state.books[book.id];
            const target = fresh?.branches.find((item) => item.id === payload || item.name === payload);
            if (!target) throw new Error(`找不到分支「${payload}」`);
            const result = await deleteBranch(book.id, target.id);
            return ok({ updated: 'branch_delete', name: target.name, ...result });
          }
          if (action === 'chapter') {
            let data;
            try { data = JSON.parse(payload); } catch { throw new Error('action=chapter 的 payload 必须是 JSON（对象或数组）'); }
            const list = Array.isArray(data) ? data : [data];
            const saved = [];
            for (const item of list) {
              const no = Number(item?.no);
              if (!Number.isInteger(no) || no < 1) throw new Error('action=chapter 需要提供存储层章号 no');
              saved.push(await updateChapterMeta(book.id, no, item));
            }
            return ok({ updated: 'chapter', chapters: saved });
          }
          if (action === 'facts') {
            const item = await appendFact(book.id, payload, args?.chapter, args?.branch);
            return ok({ updated: 'facts', fact: item });
          }
          throw new Error(`未知 action：${action}`);
        } catch (error) {
          return fail(error?.message ?? error);
        }
      },
    ),

    tool(
      'writer_status',
      '查看写作台状态：所有作品、当前作品的角色/章节/字数区间、写作模式是否开启。',
      {},
      async () => {
        try {
          const state = await readState();
          const books = Object.values(state.books).map((b) => ({
            id: b.id,
            title: b.title,
            genre: b.genre,
            chapters: b.chapters.length,
            words: b.chapters.reduce((n, ch) => n + ch.words, 0),
            chars: b.chars,
            characters: b.characters.length,
            locations: (b.locations ?? []).length,
            branches: (b.branches ?? []).map((item) => ({ id: item.id, name: item.name, kind: item.kind, timeline: item.timeline, chapters: branchChapters(b, item.id).length })),
          }));
          return ok({
            dataDir: '（本机 ~/.dsh/writer-studio）',
            activeBookId: state.activeBookId,
            books,
            branchKinds: BRANCH_KINDS,
            labels: {
              tone: TONE_LABELS, focus: FOCUS_LABELS, charFocus: CHAR_FOCUS_LABELS,
              person: PERSON_LABELS, adherence: ADHERENCE_LABELS, pacing: PACING_LABELS,
              sentence: SENTENCE_LABELS,
            },
          });
        } catch (error) {
          return fail(error?.message ?? error);
        }
      },
    ),
  ];
}

/** "2500-3500" / "2500~3500" → {min,max,target}；target 默认中位。 */
export function parseCharsSpec(text) {
  const m = /^\s*(\d{3,5})\s*[-~—–、/到至]\s*(\d{3,5})\s*$/.exec(String(text ?? ''));
  if (!m) throw new Error('字数区间格式应为「下限-上限」，例如 2500-3500');
  const min = Number(m[1]);
  const max = Number(m[2]);
  return { min, max, target: Math.round((min + max) / 2) };
}

export { countChars, readChapter, findBook, publicBook, styleToText };
