(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WWLongBookMemory = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  const DEFAULT_CHUNK_CHARS = 12000;
  const DEFAULT_ARC_SIZE = 8;
  const DEFAULT_MERGE_FAN_IN = 3;
  const SUMMARY_CHAR_LIMITS = Object.freeze({ chunk: 3000, chapter: 4000, arc: 6000, book: 10000 });

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

  function batches(items, size) {
    const result = [];
    for (let start = 0; start < items.length; start += size) result.push(items.slice(start, start + size));
    return result;
  }

  function reductionCalls(count, fanIn, stopAt = 1) {
    let calls = 0;
    let remaining = Math.max(0, Number(count) || 0);
    while (remaining > stopAt) {
      const full = Math.floor(remaining / fanIn);
      const rest = remaining % fanIn;
      calls += full + (rest >= 2 ? 1 : 0);
      remaining = full + (rest ? 1 : 0);
    }
    return calls;
  }

  async function compactSummary(summarize, request, maxChars, label) {
    let content = normalizeText(await summarize(request));
    if (!content) throw new Error(`${label}没有得到有效记忆`);
    for (let attempt = 0; content.length > maxChars && attempt < 2; attempt += 1) {
      content = normalizeText(await summarize({
        ...request,
        phase: `${request.phase}_recompress`,
        prompt: `把下面的${label}重新压缩到 ${maxChars} 字以内。必须保留因果、人物状态与知识边界、规则约束、伏笔和未决事项；禁止截断句子、删除关键事实或补写剧情。只输出压缩结果。\n\n${content}`
      }));
      if (!content) throw new Error(`${label}二次压缩失败`);
    }
    if (content.length > maxChars) throw new Error(`${label}超过 ${maxChars} 字，模型未按压缩要求返回；已停止以避免后续合并静默丢失`);
    return content;
  }

  function chapterPrompt(chapter, chunk, chunkIndex, chunkCount) {
    return `你正在为长篇小说建立可追溯记忆。这是《${chapter.title}》的第 ${chunkIndex + 1}/${chunkCount} 个连续原文块。\n\n` +
      '只依据原文压缩事实，不评价文风，不补设定，不把推测写成事实。保留：事件因果、人物已知信息与状态变化、时间地点、物品/能力约束、承诺与伏笔、尚未解决的问题。忽略广告和章节外说明。\n' +
      `用紧凑分项文本输出，并明确本块覆盖范围；不要复述长段原句，控制在 ${SUMMARY_CHAR_LIMITS.chunk} 字以内。\n\n【原文块】\n` + chunk;
  }

  function mergeChapterPrompt(chapter, summaries, level) {
    return `分层合并《${chapter.title}》第 ${level} 级的 ${summaries.length} 份连续记忆。去重但不得丢失因果、人物状态、信息揭示、约束、伏笔和未决事项；不得添加输入中没有的事实。结果控制在 ${SUMMARY_CHAR_LIMITS.chapter} 字以内。\n\n` + summaries.map((summary, index) => `【连续记忆 ${index + 1}】\n${summary}`).join('\n\n');
  }

  function arcPrompt(chapters, summaries, index) {
    return `把第 ${index + 1} 组连续章节压缩为阶段记忆。覆盖章节：${chapters.map(chapter => chapter.title).join('、')}。\n` +
      `按时间顺序保留主线推进、人物关系和状态变化、规则约束、伏笔兑现/新增、仍未解决的问题。冲突信息必须并列标出，不擅自裁决；结果控制在 ${SUMMARY_CHAR_LIMITS.arc} 字以内。\n\n` +
      summaries.map((summary, position) => `【${chapters[position].title}】\n${summary}`).join('\n\n');
  }

  function mergeBookPrompt(nodes, level, groupIndex) {
    return `分层合并全书记忆第 ${level} 级第 ${groupIndex + 1} 组连续阶段。按时间顺序去重，保留主线因果、人物状态与知识边界、规则约束、伏笔、矛盾和未决事项；不得补写。结果控制在 ${SUMMARY_CHAR_LIMITS.arc} 字以内。\n\n` +
      nodes.map((node, index) => `【连续阶段 ${index + 1} · ${node.label}】\n${node.content}`).join('\n\n');
  }

  function bookPrompt(nodes, chapterCount) {
    return `以下阶段记忆完整覆盖全书现有 ${chapterCount} 章。请生成供后续写作使用的全书记忆，不得声称读过未覆盖内容。\n` +
      `输出必须包含：1. 主线时间轴；2. 主要人物当前状态、知识边界与关系；3. 世界规则和不可违背约束；4. 已兑现与未兑现伏笔；5. 当前悬而未决的问题；6. 最近阶段的叙事落点。保留矛盾和不确定项，不自行补全，控制在 ${SUMMARY_CHAR_LIMITS.book} 字以内。\n\n` +
      nodes.map((node, index) => `【阶段汇总 ${index + 1} · ${node.label}】\n${node.content}`).join('\n\n');
  }

  function estimateRequests(options) {
    const chapters = normalizeChapters(options?.chapters);
    if (!chapters.length) return 0;
    const chunkChars = Math.max(2000, Number(options?.chunkChars) || DEFAULT_CHUNK_CHARS);
    const arcSize = Math.max(2, Number(options?.arcSize) || DEFAULT_ARC_SIZE);
    const fanIn = Math.max(2, Number(options?.mergeFanIn) || DEFAULT_MERGE_FAN_IN);
    const cached = existingChapterMap(options?.existingMemories);
    let calls = 0;
    for (const chapter of chapters) {
      const sourceHash = fingerprint(`${chapter.title}\n${chapter.content}`);
      if (cached.get(String(chapter.id))?.source_hash === sourceHash) continue;
      const chunkCount = Math.max(1, splitText(chapter.content, chunkChars).length);
      calls += chunkCount + reductionCalls(chunkCount, fanIn);
    }
    const arcCount = Math.ceil(chapters.length / arcSize);
    calls += arcCount + reductionCalls(arcCount, fanIn, fanIn) + 1;
    return calls;
  }

  async function build(options) {
    const chapters = normalizeChapters(options?.chapters);
    const summarize = options?.summarize;
    if (typeof summarize !== 'function') throw new Error('缺少长篇记忆总结器');
    if (!chapters.length) throw new Error('当前项目没有可读取的正文章节');
    const chunkChars = Math.max(2000, Number(options.chunkChars) || DEFAULT_CHUNK_CHARS);
    const arcSize = Math.max(2, Number(options.arcSize) || DEFAULT_ARC_SIZE);
    const mergeFanIn = Math.max(2, Number(options.mergeFanIn) || DEFAULT_MERGE_FAN_IN);
    const cached = existingChapterMap(options.existingMemories);
    const chapterMemories = [];
    let reusedChapters = 0;
    let analyzedChunks = 0;
    let requestCount = 0;
    const totalSourceChars = chapters.reduce((sum, chapter) => sum + chapter.content.length, 0);
    const trackedSummarize = async request => {
      requestCount += 1;
      return summarize(request);
    };

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
      let summaries = [];
      for (let chunkIndex = 0; chunkIndex < Math.max(1, chunks.length); chunkIndex += 1) {
        const chunk = chunks[chunkIndex] || '（本章正文为空）';
        const summary = await compactSummary(trackedSummarize, {
          taskId: 'memory.chapter-compress',
          phase: 'chapter_chunk',
          prompt: chapterPrompt(chapter, chunk, chunkIndex, Math.max(1, chunks.length)),
          chapter,
          chapterIndex,
          chunkIndex,
          chunkCount: Math.max(1, chunks.length)
        }, SUMMARY_CHAR_LIMITS.chunk, `《${chapter.title}》第 ${chunkIndex + 1} 块记忆`);
        summaries.push(summary);
        analyzedChunks += 1;
      }
      for (let level = 1; summaries.length > 1; level += 1) {
        const next = [];
        for (const group of batches(summaries, mergeFanIn)) {
          if (group.length === 1) { next.push(group[0]); continue; }
          next.push(await compactSummary(trackedSummarize, {
            taskId: 'memory.chapter-merge',
            phase: 'chapter_merge',
            prompt: mergeChapterPrompt(chapter, group, level),
            chapter,
            chapterIndex,
            level,
            summaries: group
          }, SUMMARY_CHAR_LIMITS.chapter, `《${chapter.title}》第 ${level} 级章节记忆`));
        }
        summaries = next;
      }
      const content = summaries[0];
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
      const content = await compactSummary(trackedSummarize, {
        taskId: 'memory.arc-compress',
        phase: 'arc',
        prompt: arcPrompt(arcChapters, arcSummaries, arcIndex),
        arcIndex,
        chapters: arcChapters,
        summaries: arcSummaries
      }, SUMMARY_CHAR_LIMITS.arc, `阶段 ${arcIndex + 1} 记忆`);
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

    let bookNodes = arcMemories.map((memory, index) => ({ content: memory.content, label: `${index + 1} · ${memory.title}` }));
    for (let level = 1; bookNodes.length > mergeFanIn; level += 1) {
      const next = [];
      for (const [groupIndex, group] of batches(bookNodes, mergeFanIn).entries()) {
        if (group.length === 1) { next.push(group[0]); continue; }
        const content = await compactSummary(trackedSummarize, {
          taskId: 'memory.book-compress',
          phase: 'book_merge',
          prompt: mergeBookPrompt(group, level, groupIndex),
          level,
          groupIndex,
          nodes: group
        }, SUMMARY_CHAR_LIMITS.arc, `全书第 ${level} 级阶段记忆`);
        next.push({ content, label: `第 ${level} 级汇总 ${groupIndex + 1}` });
      }
      bookNodes = next;
    }
    options?.onProgress?.({ phase: 'book', chapterCount: chapters.length, arcCount: arcMemories.length });
    const digest = await compactSummary(trackedSummarize, {
      taskId: 'memory.book-compress',
      phase: 'book',
      prompt: bookPrompt(bookNodes, chapters.length),
      chapters,
      arcs: arcMemories,
      nodes: bookNodes
    }, SUMMARY_CHAR_LIMITS.book, '全书记忆');
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
        digestChars: digest.length,
        requestCount
      }
    };
  }

  return {
    DEFAULT_CHUNK_CHARS,
    DEFAULT_ARC_SIZE,
    DEFAULT_MERGE_FAN_IN,
    fingerprint,
    splitText,
    normalizeChapters,
    estimateRequests,
    build
  };
});
