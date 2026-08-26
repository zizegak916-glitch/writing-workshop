(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WWProjectContext = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  function text(value) {
    return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim();
  }

  function fingerprint(value) {
    const source = String(value || '');
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let index = 0; index < source.length; index += 1) {
      const code = source.charCodeAt(index);
      h1 ^= code;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= code + index;
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}:${source.length}`;
  }

  function ordered(items) {
    return (Array.isArray(items) ? items : []).map((item, index) => ({ ...item, _index: index }))
      .sort((a, b) => Number(a.sort_order ?? a._index) - Number(b.sort_order ?? b._index) || a._index - b._index);
  }

  function outlineText(outlines) {
    return ordered(outlines).map((outline, index) => {
      const title = text(outline.title) || `大纲 ${index + 1}`;
      return `【大纲 ${index + 1} · ${title}】\n${text(outline.content) || '（内容为空）'}`;
    }).join('\n\n');
  }

  function characterText(characters) {
    return ordered(characters).map((character, index) => [
      `【人物 ${index + 1} · ${text(character.name) || '未命名'}】`,
      text(character.role) && `定位：${text(character.role)}`,
      text(character.personality) && `性格：${text(character.personality)}`,
      text(character.background) && `背景与经历：${text(character.background)}`,
      text(character.appearance) && `外貌：${text(character.appearance)}`,
      text(character.skills) && `能力与限制：${text(character.skills)}`
    ].filter(Boolean).join('\n')).join('\n\n');
  }

  function build(bundle, options = {}) {
    const source = bundle || {};
    const project = source.project || {};
    const include = {
      project: options.project !== false,
      world: options.world !== false,
      outlines: options.outlines !== false,
      characters: options.characters !== false
    };
    const sections = [];
    if (include.project) {
      const metadata = [
        text(project.name) && `作品：《${text(project.name)}》`,
        text(project.genre) && `类型：${text(project.genre)}`,
        text(project.description) && `简介：${text(project.description)}`
      ].filter(Boolean).join('\n');
      if (metadata) sections.push({ key: 'project', label: '项目元信息', text: metadata });
    }
    if (include.world && text(project.world_setting)) {
      sections.push({ key: 'world', label: '世界观与硬设定（资料，不是正文章节）', text: text(project.world_setting) });
    }
    const outlines = include.outlines ? outlineText(source.outlines) : '';
    if (outlines) sections.push({ key: 'outlines', label: '剧情大纲与规划节点（计划，不代表已经发生）', text: outlines });
    const characters = include.characters ? characterText(source.characters) : '';
    if (characters) sections.push({ key: 'characters', label: '人物卡与知识边界', text: characters });

    const body = sections.map(section => `【${section.label}】\n${section.text}`).join('\n\n');
    const value = body
      ? `【项目正式事实包】\n以下内容必须在写作、续写、改写、分析和校准时实际核对。世界观是规则资料，大纲是未来规划；不得把二者当作已经发生的正文章节。若它们与正文冲突，明确指出冲突，不得静默忽略或擅自调和。\n\n${body}\n【/项目正式事实包】`
      : '';
    return {
      text: value,
      sourceText: body,
      sourceHash: fingerprint(body),
      chars: value.length,
      sections,
      counts: {
        outlines: Array.isArray(source.outlines) ? source.outlines.length : 0,
        characters: Array.isArray(source.characters) ? source.characters.length : 0,
        worldChars: text(project.world_setting).length
      }
    };
  }

  return { build, fingerprint, outlineText, characterText };
});
