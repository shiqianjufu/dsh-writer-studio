// lib/define-tool.js — 不依赖宿主包的工具定义垫片。
//
// DSH 0.2.1 的 tools.register() 要求 definition.output = { schema, render }，
// 且 parameters 必须是 JSON Schema（不是「参数名 → spec」的映射）。直接把手写
// 对象塞进 register 会在 apply 阶段抛
//   TypeError: tool "writer_start" must declare output { schema, render, presentationMeta? }
// ——整个插件随后不再注册 REST 路由，面板就表现为「请求失败」。
//
// 这里自己编译参数表并补 output，保证在任何 profile 里都能装配。
export function compileParameters(spec = {}) {
  const properties = {};
  const required = [];
  for (const [name, raw] of Object.entries(spec)) {
    if (!raw || typeof raw !== 'object') continue;
    const { required: isRequired, ...rest } = raw;
    const property = { ...rest };
    if (property.enum !== undefined && property.type === undefined) property.type = 'string';
    properties[name] = property;
    if (isRequired === true) required.push(name);
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

/** 把工具结果渲染成模型能读的 content block。 */
export function textBlock(text) {
  return [{ type: 'text', text: String(text ?? '') }];
}

export function jsonText(value) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

/**
 * @param {object} options { name, description, parameters: spec-map, execute, render? }
 * @returns registry-ready tool definition
 */
export function definePortableTool(options) {
  const render = typeof options.render === 'function'
    ? options.render
    : (_args, value) => jsonText(value);
  return {
    name: options.name,
    description: options.description,
    parameters: compileParameters(options.parameters),
    output: {
      // 空 schema = 不约束的 JSON；我们的返回值都是普通对象。
      schema: {},
      render: (args, value) => textBlock(render(args, value)),
    },
    execute: options.execute,
  };
}
