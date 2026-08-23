import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.location = { hostname: 'example.test' };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.document = { readyState: 'loading', addEventListener: () => {} };

await import('../web/static/js/corpus-lab.js');

const text = [
  '001、雨夜',
  '他推开门，她在身后说：“先别进去。”',
  '风从走廊尽头压过来。',
  '第二章 灯下',
  '“你看见了吗？”他停住脚步。',
  '她没有回答。',
  'Chapter 3 Return',
  '门忽然自己开了！',
  ...Array.from({ length: 80 }, (_, index) => index % 2 ? '他往前走了一步。' : '她望着门后，没有立刻回答。')
].join('\n');

const profile = window.wwCorpusAnalyzeText(text);
assert.equal(profile.metrics.chapters, 3, 'common numeric, Chinese and English headings must all be recognized');
assert.ok(profile.metrics.dialogue_turns >= 2, 'inline and paragraph dialogue must be counted');
assert.ok(profile.metrics.dialogue_ratio > 0, 'dialogue ratio must not collapse to zero when speech follows narration');
assert.ok(profile.metrics.median_paragraph_runes > 0 && profile.metrics.p90_paragraph_runes >= profile.metrics.median_paragraph_runes);
assert.ok(profile.summary.includes('3 章'));
assert.ok(profile.guidance_cards.length >= 5);
for (const card of profile.guidance_cards) {
  assert.ok(card.scope && card.instruction && card.evidence && card.counterexample, `incomplete guidance card: ${card.title}`);
}

console.log(`Corpus analyzer OK: ${profile.metrics.chapters} chapters, ${profile.metrics.dialogue_turns} dialogue turns, ${profile.guidance_cards.length} guidance cards.`);
