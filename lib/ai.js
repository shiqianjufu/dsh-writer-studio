// lib/ai.js — 面板「AI 生成 / 修改」的模型桥。
//
// 走宿主的 subagents 服务（web profile 里 root ctx 拿不到 llm），锚定当前会话的
// agent 作为父会话，起一个不带工具的一次性子代理，只收文本结果。任何一层不可用
// 都返回人话错误，不静默失败。
import {
  buildContextPack, styleToText, resolveBranch,
  TONE_LABELS, FOCUS_LABELS, CHAR_FOCUS_LABELS, PERSON_LABELS,
  ADHERENCE_LABELS, PACING_LABELS, SENTENCE_LABELS,
} from './store.js';

function readService(ctx, prop) {
  try {
    const direct = ctx?.[prop];
    if (direct !== undefined && direct !== null) return direct;
    if (typeof ctx?.get === 'function') return ctx.get(prop);
  } catch { /* cordis 未 inject 的属性访问会抛，视为缺失 */ }
  return null;
}

function outputText(result) {
  const out = result?.output;
  if (typeof out === 'string') return out;
  if (Array.isArray(out)) {
    return out.map((b) => (typeof b === 'string' ? b : (b?.text ?? ''))).join('');
  }
  if (out && typeof out === 'object') {
    if (typeof out.text === 'string') return out.text;
    if (Array.isArray(out.content)) {
      return out.content.map((b) => (typeof b === 'string' ? b : (b?.text ?? ''))).join('');
    }
  }
  if (typeof result?.text === 'string') return result.text;
  return '';
}

function getParent(ctx, sessionId) {
  const agents = readService(ctx, 'agents');
  if (!agents) return null;
  try {
    if (sessionId && typeof agents.get === 'function') {
      const a = agents.get(sessionId);
      if (a) return a;
    }
  } catch { /* 注册表懒注册，落到 currentInitiator */ }
  try {
    if (typeof agents.currentInitiator === 'function') return agents.currentInitiator() ?? null;
  } catch { /* ignore */ }
  return null;
}

function normalizeRoute(route) {
  if (!route || typeof route !== 'object') return null;
  const provider = typeof route.provider === 'string' ? route.provider.trim() : '';
  const model = typeof route.model === 'string' ? route.model.trim() : '';
  if (!provider || !model) return null;
  return {
    provider,
    model,
    ...(typeof route.reasoningEffort === 'string' && route.reasoningEffort
      ? { reasoningEffort: route.reasoningEffort }
      : {}),
  };
}

/**
 * 读取「当前对话正在用的模型」。
 * 显式设置缺失时，面板 AI 生成的子代理必须落到这个路由上，而不是宿主的默认模型：
 *   · requestHeader().config 是会话最近一次请求真正使用的 provider/model；
 *   · 尚未发过请求时退回 agent 创建时的 options。
 */
export function conversationRoute(parent) {
  try {
    const config = parent?.session?.requestHeader?.()?.config;
    const route = normalizeRoute(config);
    if (route) return route;
  } catch { /* 不同宿主版本字段可能缺失 */ }
  try {
    return normalizeRoute(parent?.options);
  } catch { /* ignore */ }
  return null;
}

/**
 * 生成一段文本。
 * @returns {Promise<string>}
 */
export async function generateText(ctx, { sessionId, system, prompt, maxTokens = 0, timeoutMs = 180000, aiRoute = null }) {
  const subagents = readService(ctx, 'subagents');
  if (!subagents || typeof subagents.start !== 'function') {
    throw new Error('当前宿主没有 subagents 服务，面板 AI 生成不可用。可以改用对话让 AI 生成后粘贴进来。');
  }
  const parent = getParent(ctx, sessionId);
  if (!parent) {
    throw new Error('找不到可锚定的父会话。请先在这个会话里发一条消息，或直接刷新页面重试。');
  }
  // 优先级：插件显式设置 > 对话当前模型 > 宿主继承（不传 provider/model）。
  const route = normalizeRoute(aiRoute) ?? conversationRoute(parent);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('AI 生成超时')), Math.max(30000, Math.min(timeoutMs, 600000)));
  let handle = null;
  try {
    handle = await subagents.start('spawn', {
      label: 'writer-studio:generate',
      parent,
      prompt: [{ type: 'text', text: prompt }],
      ...(system ? { persona: system } : {}),
      maxDepth: 1,
      toolFilter: { allow: [] },
      signal: controller.signal,
      agentOptions: {
        ...(route ? { provider: route.provider, model: route.model } : {}),
        ...(route?.reasoningEffort ? { reasoningEffort: route.reasoningEffort } : {}),
        ...(Number.isInteger(maxTokens) && maxTokens > 0 ? { maxTokens } : {}),
      },
    });
    const result = await Promise.race([
      handle.result,
      new Promise((_, reject) => {
        if (controller.signal.aborted) reject(new Error('AI 生成超时'));
        else controller.signal.addEventListener('abort', () => reject(new Error('AI 生成超时')), { once: true });
      }),
    ]);
    if (result?.stopReason && result.stopReason !== 'completed') {
      throw new Error(`子代理未完成（stopReason=${result.stopReason}）。请重试；若反复出现，缩短要求后再试。`);
    }
    const text = outputText(result).trim();
    if (!text) throw new Error('模型返回了空内容，请重试。');
    return text;
  } finally {
    clearTimeout(timer);
    try { handle?.dispose?.(); } catch { /* ignore */ }
  }
}

function stripFence(text) {
  const t = String(text ?? '').trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  return m ? m[1].trim() : t;
}

export function parseJsonLoose(text) {
  const raw = stripFence(text);
  try { return JSON.parse(raw); } catch { /* 尝试截取第一个对象/数组 */ }
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error('模型没有返回可解析的 JSON');
  const opener = raw[start];
  const closer = opener === '{' ? '}' : ']';
  const end = raw.lastIndexOf(closer);
  if (end <= start) throw new Error('模型返回的 JSON 不完整');
  try { return JSON.parse(raw.slice(start, end + 1)); } catch (error) {
    throw new Error(`模型返回的 JSON 无法解析：${error.message}`);
  }
}

const JSON_SYSTEM = '你是中文长篇小说的设定编辑。只输出合法 JSON，不要 Markdown 代码围栏，不要任何解释、前言或后记。所有内容使用简体中文。';
const PROSE_SYSTEM = '你是中文长篇小说的写作助手。严格遵守给定设定，不自行发明会与前文冲突的硬规则。不要输出解释、前言或 Markdown 代码围栏，只输出要求的内容。';

function bookBrief(book, { includeSynopsis = true } = {}) {
  const lines = [
    `书名：《${book.title}》`,
    book.genre ? `题材：${book.genre}` : '',
    book.logline ? `一句话立意：${book.logline}` : '',
    includeSynopsis && book.synopsis ? `故事梗概：${book.synopsis.slice(0, 1200)}` : '',
    book.worldview ? `世界观（节选）：${book.worldview.slice(0, 1600)}` : '',
  ].filter(Boolean);
  if (book.characters.length > 0) {
    lines.push('现有角色：');
    for (const c of book.characters) {
      lines.push(`- ${c.name}（${c.role || '角色'}${c.gender ? ` · ${c.gender}` : ''}）${c.identity ? `：${c.identity}` : ''}${c.personality ? `；性格：${c.personality}` : ''}`);
    }
  }
  if (Array.isArray(book.locations) && book.locations.length > 0) {
    const byId = new Map(book.locations.map((loc) => [loc.id, loc]));
    lines.push('现有地点：');
    for (const loc of book.locations) {
      const parent = loc.parentId ? byId.get(loc.parentId)?.name : '';
      lines.push(`- ${loc.name}（${loc.type}）${parent ? `，包含于：${parent}` : ''}${loc.description ? `；${loc.description.slice(0, 80)}` : ''}`);
    }
  }
  lines.push(`文风：\n${styleToText(book.style)}`);
  return lines.join('\n');
}

/**
 * @param {object} book
 * @param {{kind:string, instruction?:string, target?:object, chapter?:number}} req
 * @returns {{system:string, prompt:string}}
 */
export function buildAiPrompt(book, req = {}) {
  const kind = req.kind;
  const instruction = String(req.instruction ?? '').trim();

  if (kind === 'title') {
    return {
      system: JSON_SYSTEM,
      prompt: [
        bookBrief(book),
        instruction ? `用户对书名的要求：${instruction}` : '',
        '请给出 8 个适合这本书的中文书名。要求：有记忆点、不撞常见套路、贴合题材与基调；每个附一句不超过 30 字的理由。',
        '输出 JSON 数组：[{"title":"书名","reason":"理由"}]',
      ].filter(Boolean).join('\n\n'),
    };
  }

  if (kind === 'character') {
    const base = req.target && typeof req.target === 'object' ? req.target : {};
    const isEdit = Boolean(base.name || base.id);
    return {
      system: JSON_SYSTEM,
      prompt: [
        bookBrief(book),
        instruction ? `用户的要求：${instruction}` : '',
        isEdit
          ? `请修改以下角色设定，保留未被要求改动的内容，使它更具体、更有戏剧张力，且不与已有角色重复：\n${JSON.stringify(base, null, 2)}`
          : '请设计一个新角色。要求：与现有角色不重名、功能不重复；性格要有缺陷与欲望，不要完美人设；身份要能直接推动剧情。',
        '输出一个 JSON 对象，字段：name（姓名）, gender（性别：男/女/其他，也可自定义）, age（年龄，可为「不详」）, appearance（外貌，80–150字）, personality（性格，80–150字）, identity（身份/职业/立场）, role（故事定位：主角/女主角/配角/反派/导师/对手/路人）, speech（说话习惯与口头禅）, notes（与主角的关系、可用于什么剧情，80字内）。',
      ].filter(Boolean).join('\n\n'),
    };
  }

  if (kind === 'world') {
    return {
      system: PROSE_SYSTEM,
      prompt: [
        bookBrief(book),
        instruction ? `用户的要求：${instruction}` : '',
        '请补全/改写这本书的世界观设定，用 Markdown 小标题组织，包含：时代与地点、世界运行规则（力量/科技/社会）、主要势力与矛盾、日常生活质感、禁忌与代价。',
        '要求 500–900 字，具体、可执行，避免空泛的形容词堆砌；不要写剧情梗概。',
      ].filter(Boolean).join('\n\n'),
    };
  }

  if (kind === 'style') {
    return {
      system: JSON_SYSTEM,
      prompt: [
        bookBrief(book),
        instruction ? `用户对文风的要求：${instruction}` : '',
        '请为这本书给出一套可执行的文风方案。',
        `tone 取值：${Object.entries(TONE_LABELS).map(([k, v]) => `${k}=${v}`).join('；')}`,
        `focus 取值：${Object.entries(FOCUS_LABELS).map(([k, v]) => `${k}=${v}`).join('；')}`,
        `charFocus 取值（数组，可多选）：${Object.entries(CHAR_FOCUS_LABELS).map(([k, v]) => `${k}=${v}`).join('；')}`,
        `person 取值：${Object.entries(PERSON_LABELS).map(([k, v]) => `${k}=${v}`).join('；')}`,
        `adherence 取值：${Object.entries(ADHERENCE_LABELS).map(([k, v]) => `${k}=${v}`).join('；')}`,
        `pacing 取值：${Object.entries(PACING_LABELS).map(([k, v]) => `${k}=${v}`).join('；')}`,
        `sentence 取值：${Object.entries(SENTENCE_LABELS).map(([k, v]) => `${k}=${v}`).join('；')}`,
        '输出 JSON 对象：{"tone":"...","focus":"...","charFocus":["..."],"person":"...","adherence":"...","pacing":"...","sentence":"...","custom":"给写作者的额外文风约束，80字内","sample":"一段 80–150 字的原创示范语感，不要抄任何已有作品"}',
      ].filter(Boolean).join('\n'),
    };
  }

  if (kind === 'location') {
    const base = req.target && typeof req.target === 'object' ? req.target : {};
    const isEdit = Boolean(base.name || base.id);
    const byId = new Map(book.locations.map((loc) => [loc.id, loc]));
    const currentParent = base.parentId ? byId.get(base.parentId)?.name ?? '' : '';
    const currentLinks = Array.isArray(base.links)
      ? base.links.map((id) => byId.get(id)?.name).filter(Boolean)
      : [];
    const existing = book.locations.length > 0
      ? book.locations.map((loc) => `- ${loc.name}（${loc.type}）${loc.parentId ? `，包含于：${byId.get(loc.parentId)?.name ?? ''}` : ''}`).join('\n')
      : '（暂无）';
    return {
      system: JSON_SYSTEM,
      prompt: [
        bookBrief(book),
        `现有地点清单：\n${existing}`,
        instruction ? `用户的要求：${instruction}` : '',
        isEdit
          ? `请修改以下地点条目，保留未被要求改动的内容。当前条目：\n${JSON.stringify({ ...base, parentName: currentParent, linkNames: currentLinks }, null, 2)}`
          : '请设计一个对剧情有用的重要地点。要求：与现有地点不重名；有具体的空间质感与生活细节；能提供至少一个冲突或秘密；如果是子地点，明确它包含于哪个上级地点。',
        '字段说明：name（名称）, type（城市/城镇/村庄/建筑/区域/秘境/遗迹/据点/其他）, parentName（包含于哪个现有地点，顶级留空字符串）, linkNames（与哪些现有地点串联/关联，数组，可空）, description（80–180字，看得见的空间）, atmosphere（氛围，30–80字）, rules（此地特有的规则或禁忌，30–80字）, secrets（隐藏的秘密/剧情钩子，50–120字）, notes（备注，50字内）。',
        '只输出一个 JSON 对象，不要解释。',
      ].filter(Boolean).join('\n\n'),
    };
  }

  if (kind === 'synopsis') {
    return {
      system: PROSE_SYSTEM,
      prompt: [
        bookBrief(book, { includeSynopsis: false }),
        instruction ? `用户对简介的要求：${instruction}` : '',
        '请根据以上书名、题材、世界观、重要地点与角色，写一段 250–400 字的故事简介。',
        '要求：开篇一句话抓住读者；交代主角是谁、想要什么、最大的阻碍是什么；保留核心悬念，不剧透结局；不要分点、不要小标题、不要“本书讲述了”这种套话；只输出简介正文。',
      ].filter(Boolean).join('\n\n'),
    };
  }

  if (kind === 'logline') {
    return {
      system: PROSE_SYSTEM,
      prompt: [
        bookBrief(book),
        instruction ? `用户对一句话立意的要求：${instruction}` : '',
        '用一句 30–60 字的中文概括这本书的核心冲突：谁、想要什么、被什么阻碍。只输出这一句，不要解释。',
      ].filter(Boolean).join('\n\n'),
    };
  }

  if (kind === 'chapter') {
    const chapter = Number(req.chapter) || (book.chapters.reduce((m, ch) => Math.max(m, ch.no), 0) + 1);
    const branch = resolveBranch(book, req.branch);
    const branchChaps = (book.chapters ?? []).filter((ch) => ch.branchId === branch?.id);
    const seq = branchChaps.reduce((m, ch) => Math.max(m, ch.seq ?? 0), 0) + 1;
    return {
      system: PROSE_SYSTEM,
      prompt: [
        buildContextPack(book, { chapter, branch: branch?.id }),
        instruction ? `\n用户对本章的额外要求：${instruction}` : '',
        `\n现在直接写「${branch?.name ?? '主线'}」第 ${seq} 章（时间线：${branch?.timeline || '按上下文包确定'}）。只输出正文，不要标题、不要章节号、不要任何解释。目标 ${book.chars.target} 字，必须落在 ${book.chars.min}–${book.chars.max} 字之间。写完只输出正文。`,
      ].filter(Boolean).join('\n'),
    };
  }

  throw new Error(`未知的 AI 生成类型：${kind}`);
}

export async function runAi(ctx, book, req, { sessionId, aiRoute = null } = {}) {
  const { system, prompt } = buildAiPrompt(book, req);
  const kind = req.kind;
  const text = await generateText(ctx, {
    sessionId,
    system,
    prompt,
    maxTokens: 0,
    timeoutMs: kind === 'chapter' ? 600000 : 180000,
    aiRoute,
  });
  if (kind === 'character' || kind === 'style' || kind === 'title' || kind === 'location') {
    return { text, data: parseJsonLoose(text) };
  }
  return { text };
}
