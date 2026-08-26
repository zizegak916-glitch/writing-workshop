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
const foundationText = [
  '【世界观】九大地域的通行规则不得被正文临时改写；关键能力每次使用都必须付出记忆代价。',
  ...Array.from({ length: 1500 }, (_, index) => `【大纲节点${index + 1}】这是尚未发生的规划节点，必须保持顺序，不得当作正文既成事实。`),
  '【人物卡】陈亦只知道自己亲眼见过的痕迹，不知道幕后组织的正式名称。'
].join('\n');
const foundation = { sourceText: foundationText, sourceHash: memory.fingerprint(foundationText), label: '世界观、大纲与人物卡' };
assert.ok(foundationText.length > 50000, 'project foundation fixture must require bounded reading');

const calls = [];
const summarize = async request => {
  calls.push(request);
  if (request.phase === 'foundation_chunk') {
    assert.ok(request.prompt.includes('【项目资料块】'));
    assert.ok(request.prompt.includes('大纲是计划路线而非已经发生的正文'));
    return `项目资料分块${request.chunkIndex + 1}/${request.chunkCount}；规则、大纲规划与人物知识边界均已记录。`;
  }
  if (request.phase === 'foundation_merge') return `项目资料完整记忆；全部${request.summaries.length}块已合并，并区分规划与既成事实。`;
  if (request.phase === 'chapter_chunk') {
    assert.ok(request.prompt.includes(request.chapter.title));
    assert.ok(request.prompt.includes('【原文块】'));
    return `覆盖${request.chapter.title}分块${request.chunkIndex + 1}/${request.chunkCount}；事件与人物状态均已记录。`;
  }
  if (request.phase === 'chapter_merge') return `${request.chapter.title}完整章节记忆；全部${request.summaries.length}块已合并。`;
  if (request.phase === 'arc') return `阶段${request.arcIndex + 1}记忆；覆盖${request.chapters.length}章。`;
  if (request.phase === 'book_merge') return `多级全书记忆合并；覆盖输入中的全部连续阶段。`;
  if (request.phase === 'book') return `全书记忆；完整覆盖${request.chapters.length}章，保留时间轴、人物状态、规则、伏笔与未决问题。`;
  throw new Error(`unexpected phase: ${request.phase}`);
};

const first = await memory.build({ chapters, foundation, summarize, chunkChars: 6000, arcSize: 6 });
assert.equal(first.stats.chapterCount, chapters.length);
assert.equal(first.foundationMemory.source_hash, foundation.sourceHash);
assert.ok(first.stats.analyzedFoundationChunks > 1, 'long world and outline documents must be read in bounded chunks');
assert.equal(first.stats.reusedChapters, 0);
assert.equal(first.chapterMemories.length, chapters.length);
assert.equal(first.arcMemories.length, 4);
assert.equal(first.digestMemory.chapter_count, chapters.length);
assert.deepEqual(first.digestMemory.covered_chapter_ids, chapters.map(chapter => chapter.id));
assert.ok(first.stats.analyzedChunks > chapters.length, 'long chapters must be read in multiple requests');
assert.equal(calls.filter(call => call.phase === 'chapter_chunk').length, first.stats.analyzedChunks);
assert.equal(new Set(calls.filter(call => call.phase === 'chapter_chunk').map(call => call.chapter.id)).size, chapters.length, 'every chapter must be read');
assert.ok(calls.filter(call => call.phase === 'chapter_merge' && call.chapter.id === chapters[0].id).length >= 2, 'a very long chapter must be merged through more than one bounded level');
assert.equal(first.stats.requestCount, calls.length, 'request count must record every compression and merge call');
assert.equal(memory.estimateRequests({ chapters, foundation, chunkChars: 6000, arcSize: 6 }), first.stats.requestCount, 'confirmation estimate must match the planned hierarchy');

const firstCalls = calls.length;
const existingMemories = [first.foundationMemory, ...first.chapterMemories, ...first.arcMemories, first.digestMemory];
const second = await memory.build({ chapters, foundation, existingMemories, summarize, chunkChars: 6000, arcSize: 6 });
assert.equal(second.stats.reusedChapters, chapters.length);
assert.equal(second.stats.reusedFoundation, true);
assert.equal(second.stats.analyzedChunks, 0);
assert.equal(memory.estimateRequests({ chapters, foundation, existingMemories, chunkChars: 6000, arcSize: 6 }), second.stats.requestCount, 'cached project facts and chapters must be reflected in the confirmation estimate');
assert.equal(calls.slice(firstCalls).filter(call => call.phase === 'chapter_chunk').length, 0, 'unchanged chapters must not be sent again');
assert.equal(calls.slice(firstCalls).filter(call => call.phase === 'arc').length, 4, 'stage and book memory must still be refreshed from cached chapter facts');

const edited = chapters.map(chapter => ({ ...chapter }));
edited[10].content += '\n\n新增事件改变了人物状态。';
const thirdStart = calls.length;
const third = await memory.build({ chapters: edited, foundation, existingMemories, summarize, chunkChars: 6000, arcSize: 6 });
assert.equal(third.stats.reusedChapters, chapters.length - 1);
assert.equal(new Set(calls.slice(thirdStart).filter(call => call.phase === 'chapter_chunk').map(call => call.chapter.id)).size, 1, 'only the edited chapter should be reread');

const changedFoundationText = `${foundationText}\n【世界观修订】旧渠在月蚀期间禁止通行。`;
const changedFoundation = { sourceText: changedFoundationText, sourceHash: memory.fingerprint(changedFoundationText), label: foundation.label };
const foundationChangeStart = calls.length;
const fourth = await memory.build({ chapters, foundation: changedFoundation, existingMemories, summarize, chunkChars: 6000, arcSize: 6 });
assert.equal(fourth.stats.reusedFoundation, false, 'changed world or outline content must invalidate the project-fact memory');
assert.equal(fourth.stats.reusedChapters, chapters.length, 'changing project facts must not reread unchanged prose chapters');
assert.ok(calls.slice(foundationChangeStart).some(call => call.phase === 'foundation_chunk'), 'changed project facts must be reread');
assert.equal(calls.slice(foundationChangeStart).filter(call => call.phase === 'chapter_chunk').length, 0);
assert.equal(fourth.digestMemory.foundation_hash, changedFoundation.sourceHash, 'book memory must record which project facts it reconciled against');

const foundationOnlyStart = calls.length;
const foundationOnly = await memory.build({ chapters: [], foundation, summarize, chunkChars: 6000 });
assert.equal(foundationOnly.chapterMemories.length, 0);
assert.equal(foundationOnly.digestMemory, null, 'a project without prose should build project-fact memory without inventing a zero-chapter book digest');
assert.ok(foundationOnly.foundationMemory.content);
assert.equal(memory.estimateRequests({ chapters: [], foundation, chunkChars: 6000 }), foundationOnly.stats.requestCount);
assert.ok(calls.slice(foundationOnlyStart).every(call => call.phase.startsWith('foundation_')), 'foundation-only projects must not manufacture chapter or book requests');

const giantChapter = [{
  id: 'giant',
  title: '超长单章兼容验收',
  sort_order: 0,
  content: '这一连续段落必须经过有界分块和多级合并，不能把所有中间摘要塞回单次请求。\n'.repeat(20000)
}];
const giantStart = calls.length;
const giant = await memory.build({ chapters: giantChapter, summarize, chunkChars: 6000 });
const giantCalls = calls.slice(giantStart);
assert.ok(giant.stats.sourceChars > 600000, 'giant chapter fixture must exceed 600k chars');
assert.ok(giant.stats.analyzedChunks > 100, 'giant chapter must be split into many contiguous chunks');
assert.ok(giantCalls.filter(call => call.phase === 'chapter_merge').length > 40, 'giant chapter must use a multi-level merge tree');
assert.ok(giantCalls.filter(call => call.phase === 'chapter_merge').every(call => call.summaries.length <= memory.DEFAULT_MERGE_FAN_IN), 'no chapter merge request may receive an unbounded summary list');
assert.ok(giantCalls.filter(call => call.phase === 'book').every(call => call.nodes.length <= memory.DEFAULT_MERGE_FAN_IN), 'final book merge must remain bounded');
assert.equal(memory.estimateRequests({ chapters: giantChapter, chunkChars: 6000 }), giant.stats.requestCount);

console.log(`Long-book memory OK: project facts plus ${chapters.length} chapters and ${giant.stats.sourceChars.toLocaleString()}-char giant chapter, every chunk read, bounded hierarchy, stale facts invalidated.`);
