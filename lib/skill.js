// lib/skill.js — 把写作模式技能注册进宿主技能目录。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SKILL_PATH = join(fileURLToPath(new URL('../skills/writing-mode/', import.meta.url)), 'SKILL.md');

function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { attrs: {}, body: raw };
  const attrs = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^([\w][\w-]*):\s*(.*)$/.exec(line.trim());
    if (m) attrs[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return { attrs, body: raw.slice(match[0].length).replace(/^\r?\n/, '') };
}

export function writerSkillDefinition() {
  const raw = readFileSync(SKILL_PATH, 'utf8');
  const { attrs, body } = parseFrontmatter(raw);
  return {
    name: attrs.name ?? 'writing-mode',
    description: (attrs.description ?? '写作模式：写小说/续写/写下一章时启用，按角色卡、世界观、文风与字数目标写作。').slice(0, 300),
    content: body,
    source: 'plugin:dsh-writer-studio',
    path: SKILL_PATH,
  };
}

export const WriterSkillPlugin = {
  name: 'dsh-writer-studio-skill',
  inject: ['skills'],
  apply(ctx) {
    try {
      if (typeof ctx?.skills?.register !== 'function') return;
      ctx.skills.register(writerSkillDefinition());
    } catch (error) {
      const warn = ctx?.logger?.warn ?? console.warn;
      warn('[writer-studio] writing-mode 技能注册失败（不影响工具与面板）：', error?.message ?? error);
    }
  },
};
