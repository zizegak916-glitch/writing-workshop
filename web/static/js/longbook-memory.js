(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WWLongBookMemory = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  const DEFAULT_CHUNK_CHARS = 12000;
  const DEFAULT_ARC_SIZE = 8;

  function normalizeText(value) {
    return String(value || '').replace(/\r\n?/g, '\n').trim();
  }

  function fingerprint(value) {
    const text = String(value || '');
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      h1 ^= code;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= code + i;
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}:${text.length}`;
  }

  function splitText(value, maxChars = DEFAULT_CHUNK_CHARS) {
    const text = normalizeText(value);
    const limit = Math.max(2000, Number(maxChars) || DEFAULT_CHUNK_CHARS);
    if (!text) return [];
    if (text.length <= limit) return [text];
    const chunks = [];
    let rest = text;
    while (rest.length > limit) {
      const window = rest.slice(0, limit);
      const floor = Math.floor(limit * 0.58);
      const candidates = [window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf('。'), window.lastIndexOf('！'), window.lastIndexOf('？')];
      const cut = Math.max(...candidates.filter(index => index >= floor));
      const end = cut >= floor ? cut + 1 : limit;
      chunks.push(rest.slice(0, end).trim());
      rest = rest.slice(end).trimStart();
    }
    if (rest) chunks.push(rest);
    return chunks.filter(Boolean);
  }

  function normalizeChapters(chapters) {
    return (Array.isArray(chapters) ? chapters : []).map((chapter, index) => ({
      id: chapter.id == null ? `index-${index}` : chapter.id,
      title: normalizeText(chapter.title) || `第 ${index + 1} 章`,
      content: normalizeText(chapter.content),
      sort_order: Number.isFinite(Number(chapter.sort_order)) ? Number(chapter.sort_order) : index
    })).sort((a, b) => a.sort_order - b.sort_order || String(a.id).localeCompare(String(b.id)));
  }

  function existingChapterMap(memories) {
    const map = new Map();
    for (const memory of Array.isArray(memories) ? memories : []) {
      if (memory?.source === 'longbook' && memory.kind === 'chapter_summary' && memory.chapter_id != null) {
        map.set(String(memory.chapter_id), memory);
      }
    }
    return map;
  }

  function chapterPrompt(chapter, chunk, chunkIndex, chunkCount) {
    return `你正在为长篇小说建立可追溯记忆。这是《${chapter.title}》的第 ${chunkIndex + 1}/${chunkCount} 个连续原文块。\n\n` +
      '只依据原文压缩事实，不评价文风，不补设定，不把推测写成事实。保留：事件因果、人物已知信息与状态变化、时间地点、物品/能力约束、承诺与伏笔、尚未解决的问题。忽略广告和章节外说明。\n' +
      '用紧凑分项文本输出，并明确本块覆盖范围；不要复述长段原句。\n\n【原文块】\n' + chunk;
  }

  function mergeChapterPrompt(chapter, summaries) {
    return `合并《${chapter.title}》的 ${summaries.length} 个连续分块记忆。去重但不得丢失因果、人物状态、信息揭示、约束、伏笔和未决事项；不得添加分块中没有的事实。\n\n` + summaries.map((summary, index) => `【分块 ${index + 1}】\n${summary}`).join('\n\n');
  }

  function arcPrompt(chapters, summaries, index) {
    return `把第 ${index + 1} 组连续章节压缩为阶段记忆。覆盖章节：${chapters.map(chapter => chapter.title).join('、')}。\n` +
      '按时间顺序保留主线推进、人物关系和状态变化、规则约束、伏笔兑现/新增、仍未解决的问题。冲突信息必须并列标出，不擅自裁决。\n\n' +
      summaries.map((summary, position) => `【${chapters[position].title}】\n${summary}`).join('\n\n');
  }

  function bookPrompt(arcs, chapterCount) {
    return `以下阶段记忆完整覆盖全书现有 ${chapterCount} 章。请生成供后续写作使用的全书记忆，不得声称读过未覆盖内容。\n` +
      '输出必须包含：1. 主线时间轴；2. 主要人物当前状态、知识边界与关系；3. 世界规则和不可违背约束；4. 已兑现与未兑现伏笔；5. 当前悬而未决的问题；6. 最近阶段的叙事落点。保留矛盾和不确定项，不自行补全。\n\n' +
      arcs.map((arc, index) => `【阶段 ${index + 1}】\n${arc}`).join('\n\n');
  }

  async function build(options) {
    const chapters = normalizeChapters(options?.chapters);
    const summarize = options?.summarize;
    if (typeof summarize !== 'function') throw new Error('缺少长篇记忆总结器');
    if (!chapters.length) throw new Error('当前项目没有可读取的正文章节');
    const chunkChars = Math.max(2000, Number(options.chunkChars) || DEFAULT_CHUNK_CHARS);
    const arcSize = Math.max(2, Number(options.arcSize) || DEFAULT_ARC_SIZE);
    const cached = existingChapterMap(options.existingMemories);
    const chapterMemories = [];
    let reusedChapters = 0;
    let analyzedChunks = 0;
    const totalSourceChars = chapters.reduce((sum, chapter) => sum + chapter.content.length, 0);

    for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex += 1) {
      const chapter = chapters[chapterIndex];
      const sourceHash = fingerprint(`${chapter.title}\n${chapter.content}`);
      const previous = cached.get(String(chapter.id));
      options?.onProgress?.({ phase: 'chapter', chapterIndex, chapterCount: chapters.length, title: chapter.title, reused: previous?.source_hash === sourceHash });
      if (previous?.source_hash === sourceHash && normalizeText(previous.content)) {
        chapterMemories.push({ ...previous, sort_order: chapter.sort_order, coverage_index: chapterIndex });
        reusedChapters += 1;
        continue;
      }
      const chunks = splitText(chapter.content, chunkChars);
      const summaries = [];
      for (let chunkIndex = 0; chunkIndex < Math.max(1, chunks.length); chunkIndex += 1) {
        const chunk = chunks[chunkIndex] || '（本章正文为空）';
        const summary = normalizeText(await summarize({
          taskId: 'memory.chapter-compress',
          phase: 'chapter_chunk',
          prompt: chapterPrompt(chapter, chunk, chunkIndex, Math.max(1, chunks.length)),
          chapter,
          chapterIndex,
          chunkIndex,
          chunkCount: Math.max(1, chunks.length)
        }));
        if (!summary) throw new Error(`《${chapter.title}》第 ${chunkIndex + 1} 块没有得到有效记忆`);
        summaries.push(summary);
        analyzedChunks += 1;
      }
      const content = summaries.length === 1 ? summaries[0] : normalizeText(await summarize({
        taskId: 'memory.chapter-merge',
        phase: 'chapter_merge',
        prompt: mergeChapterPrompt(chapter, summaries),
        chapter,
        chapterIndex,
        summaries
      }));
      if (!content) throw new Error(`《${chapter.title}》分块记忆合并失败`);
      chapterMemories.push({
        longbook_key: `chapter:${chapter.id}`,
        source: 'longbook',
        kind: 'chapter_summary',
        category: 'plot',
        title: `章节记忆 · ${chapter.title}`,
        content,
        chapter_id: chapter.id,
        chapter_title: chapter.title,
        source_hash: sourceHash,
        source_chars: chapter.content.length,
        chunks: Math.max(1, chunks.length),
        sort_order: chapter.sort_order,
        coverage_index: chapterIndex,
        auto_inject: false,
        enabled: true
      });
    }

    const arcMemories = [];
    for (let start = 0, arcIndex = 0; start < chapters.length; start += arcSize, arcIndex += 1) {
      const arcChapters = chapters.slice(start, start + arcSize);
      const arcSummaries = chapterMemories.slice(start, start + arcSize).map(memory => memory.content);
      options?.onProgress?.({ phase: 'arc', arcIndex, arcCount: Math.ceil(chapters.length / arcSize), start, end: start + arcChapters.length - 1 });
      const content = normalizeText(await summarize({
        taskId: 'memory.arc-compress',
        phase: 'arc',
        prompt: arcPrompt(arcChapters, arcSummaries, arcIndex),
        arcIndex,
        chapters: arcChapters,
        summaries: arcSummaries
      }));
      if (!content) throw new Error(`阶段 ${arcIndex + 1} 记忆压缩失败`);
      arcMemories.push({
        longbook_key: `arc:${arcIndex}`,
        source: 'longbook',
        kind: 'arc_summary',
        category: 'plot',
        title: `阶段记忆 · ${arcChapters[0].title}—${arcChapters[arcChapters.length - 1].title}`,
        content,
        covered_chapter_ids: arcChapters.map(chapter => chapter.id),
        covered_titles: arcChapters.map(chapter => chapter.title),
        coverage_start: start,
        coverage_end: start + arcChapters.length - 1,
        auto_inject: false,
        enabled: true
      });
    }

    options?.onProgress?.({ phase: 'book', chapterCount: chapters.length, arcCount: arcMemories.length });
    const digest = normalizeText(await summarize({
      taskId: 'memory.book-compress',
      phase: 'book',
      prompt: bookPrompt(arcMemories.map(memory => memory.content), chapters.length),
      chapters,
      arcs: arcMemories
    }));
    if (!digest) throw new Error('全书记忆合并失败');
    const now = Date.now();
    const digestMemory = {
      longbook_key: 'book',
      source: 'longbook',
      kind: 'book_digest',
      category: 'plot',
      title: `全书记忆 · 覆盖 ${chapters.length} 章`,
      content: digest,
      covered_chapter_ids: chapters.map(chapter => chapter.id),
      covered_titles: chapters.map(chapter => chapter.title),
      coverage_hash: fingerprint(chapterMemories.map(memory => memory.source_hash).join('|')),
      source_chars: totalSourceChars,
      compressed_chars: digest.length,
      chapter_count: chapters.length,
      arc_count: arcMemories.length,
      built_at: now,
      auto_inject: true,
      enabled: true
    };

    return {
      chapterMemories,
      arcMemories,
      digestMemory,
      stats: {
        chapterCount: chapters.length,
        reusedChapters,
        analyzedChapters: chapters.length - reusedChapters,
        analyzedChunks,
        arcCount: arcMemories.length,
        sourceChars: totalSourceChars,
        digestChars: digest.length
      }
    };
  }

  return {
    DEFAULT_CHUNK_CHARS,
    DEFAULT_ARC_SIZE,
    fingerprint,
    splitText,
    normalizeChapters,
    build
  };
});
