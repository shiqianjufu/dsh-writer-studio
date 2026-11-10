// lib/index.js — dsh-writer-studio 的 Node 半入口（cordis 插件）。
//
// 装配内容：
//   1. 6 个 writer_* 工具（写作模式 / 上下文包 / 落盘 / 检索 / 改设定 / 状态）；
//   2. 一段常驻系统提示，告诉模型什么时候加载写作技能；
//   3. 右侧栏面板的 REST 数据面；
//   4. writing-mode 技能（默认不进上下文，用户开启写作模式后才按需加载）。
//
// 数据全部落在 ~/.dsh/writer-studio/，面板与工具读写同一份 state.json。
import { defineWriterTools } from './tools.js';
import { registerServerApi } from './server.js';
import { WriterSkillPlugin } from './skill.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const name = '写作台';

// 根插件依赖 tools/systemPrompt；AI 生成还需要 agents+subagents。
// 这里显式声明后两者：cordis 只会把「已声明」的服务物化到 ctx 上，声明了
// 才能保证面板 AI 生成的父会话锚定与子代理路由可用（AI 服务缺席的 profile
// 整个插件会 pending，但 web profile 一定提供这两个服务）。
export const inject = ['tools', 'systemPrompt', 'agents', 'subagents'];

function bootLog(message) {
  try {
    const dir = process.env.DSH_WRITER_HOME || path.join(os.homedir(), '.dsh', 'writer-studio');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'boot.log'), `[${new Date().toISOString()}] ${message}\n`);
  } catch { /* 诊断日志写不进去不能影响插件 */ }
}

export function apply(ctx, config = {}) {
  const started = Date.now();
  bootLog('apply: start');
  const configuredAi = config?.ai && config.ai.provider && config.ai.model
    ? {
      provider: String(config.ai.provider),
      model: String(config.ai.model),
      ...(config.ai.reasoningEffort ? { reasoningEffort: String(config.ai.reasoningEffort) } : {}),
    }
    : null;
  try {
    // AI 生成用的服务单独声明：缺席时只有这条 fiber pending，不拖累工具与面板。
    let aiContext = null;
    try {
      ctx.inject(['agents', 'subagents'], (actx) => {
        aiContext = actx;
        bootLog('apply: ai services ready (agents+subagents)');
        if (typeof ctx.effect === 'function') {
          ctx.effect(() => () => { if (aiContext === actx) aiContext = null; }, 'writer-studio: ai services');
        }
      });
    } catch (error) {
      bootLog(`apply: ai services unavailable — ${error?.message ?? error}`);
    }

    ctx.systemPrompt.section({
      name: 'tool:writer-studio',
      order: 108,
      text: [
        '写作台（writer-studio）已安装：右侧栏有「写作台」面板，用于维护书名/类型、角色卡、世界观、重要地点、叙事分支与时间线、文风与每章字数。',
        '当用户要写小说、开启写作模式、续写、写下一章时：先加载 writing-mode 技能，然后调用 writer_start；动笔前必须调用 writer_context 拿磁盘上的上下文包，不凭记忆写。',
        '正文写完用 writer_save_chapter 落盘（分支/时间线、字数区间、梗概、重复度是硬校验）；不要用普通文件写入工具绕过它。',
      ].join('\n'),
    });

    const tools = defineWriterTools(ctx);
    for (const tool of tools) {
      ctx.tools.register(tool);
    }
    bootLog(`apply: tools registered (${tools.length})`);

    registerServerApi(ctx, {
      getAiContext: () => aiContext ?? ctx,
      // 显式设置优先；没设置时由 ai.js 读取当前对话的 requestHeader().config。
      getAiRoute: () => configuredAi,
    });

    // 技能注册放在独立子插件里（独立声明 ['skills']）：宿主没有 skills 服务时
    // 只有这条 fiber pending，不影响工具与面板。
    if (typeof ctx.plugin === 'function') ctx.plugin(WriterSkillPlugin);
    bootLog(`apply: ok in ${Date.now() - started}ms`);
  } catch (error) {
    bootLog(`apply: FAILED — ${error?.stack ?? error}`);
    throw error;
  }
}
