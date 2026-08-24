import assert from 'node:assert/strict';

await import('../web/static/js/longbook-memory.js');
const memory = globalThis.WWLongBookMemory;

const chapters = Array.from({ length: 24 }, (_, chapterIndex) => ({
  id: chapterIndex + 1,
  title: `第${chapterIndex + 1}章 长篇回归`,
  sort_order: chapterIndex,
  content: Array.from({ length: 520 }, (_, paragraphIndex) => `第${chapterIndex + 1}章第${paragraphIndex + 1}段：人物核对已知事实、行动后果和未决线索；这一段必须进入分块阅读范围。`).join('\n\n')
}));

assert.ok(chapters.reduce((sum, chapter) => sum + chapter.content.length, 0) > 500000, 'fixture must be a real long-form manuscript');

const calls = [];
const summarize = async request => {
  calls.push(request);
  if (request.phase === 'chapter_chunk') {
    assert.ok(request.prompt.includes(request.chapter.title));
    assert.ok(request.prompt.includes('【原文块】'));
    return `覆盖${request.chapter.title}分块${request.chunkIndex + 1}/${request.chunkCount}；事件与人物状态均已记录。`;
  }
  if (request.phase === 'chapter_merge') return `${request.chapter.title}完整章节记忆；全部${request.summaries.length}块已合并。`;
  if (request.phase === 'arc') return `阶段${request.arcIndex + 1}记忆；覆盖${request.chapters.length}章。`;
  if (request.phase === 'book') return `全书记忆；完整覆盖${request.chapters.length}章，保留时间轴、人物状态、规则、伏笔与未决问题。`;
  throw new Error(`unexpected phase: ${request.phase}`);
};

const first = await memory.build({ chapters, summarize, chunkChars: 6000, arcSize: 6 });
assert.equal(first.stats.chapterCount, chapters.length);
assert.equal(first.stats.reusedChapters, 0);
assert.equal(first.chapterMemories.length, chapters.length);
assert.equal(first.arcMemories.length, 4);
assert.equal(first.digestMemory.chapter_count, chapters.length);
assert.deepEqual(first.digestMemory.covered_chapter_ids, chapters.map(chapter => chapter.id));
assert.ok(first.stats.analyzedChunks > chapters.length, 'long chapters must be read in multiple requests');
assert.equal(calls.filter(call => call.phase === 'chapter_chunk').length, first.stats.analyzedChunks);
assert.equal(new Set(calls.filter(call => call.phase === 'chapter_chunk').map(call => call.chapter.id)).size, chapters.length, 'every chapter must be read');

const firstCalls = calls.length;
const existingMemories = [...first.chapterMemories, ...first.arcMemories, first.digestMemory];
const second = await memory.build({ chapters, existingMemories, summarize, chunkChars: 6000, arcSize: 6 });
assert.equal(second.stats.reusedChapters, chapters.length);
assert.equal(second.stats.analyzedChunks, 0);
assert.equal(calls.slice(firstCalls).filter(call => call.phase === 'chapter_chunk').length, 0, 'unchanged chapters must not be sent again');
assert.equal(calls.slice(firstCalls).filter(call => call.phase === 'arc').length, 4, 'stage and book memory must still be refreshed from cached chapter facts');

const edited = chapters.map(chapter => ({ ...chapter }));
edited[10].content += '\n\n新增事件改变了人物状态。';
const thirdStart = calls.length;
const third = await memory.build({ chapters: edited, existingMemories, summarize, chunkChars: 6000, arcSize: 6 });
assert.equal(third.stats.reusedChapters, chapters.length - 1);
assert.equal(new Set(calls.slice(thirdStart).filter(call => call.phase === 'chapter_chunk').map(call => call.chapter.id)).size, 1, 'only the edited chapter should be reread');

console.log(`Long-book memory OK: ${chapters.length} chapters, ${first.stats.sourceChars.toLocaleString()} chars, every chunk read, unchanged chapters reused.`);
