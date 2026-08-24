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

const gb18030 = Buffer.from('tdrSu9XCINPq0rkKy/vNxr+qw8WhowrH67XHwr13d3cucWlkaWFuLmNvbaOs1cK92rj8tuCjrNans9bX99Xfo6zWp7PW1f2w5tTEtsGjoQ==', 'base64');
const decoded = window.wwCorpusDecodeBytes(gb18030);
assert.equal(decoded.encoding, 'gb18030', 'downloaded GBK/GB18030 TXT must not be decoded as UTF-8 mojibake');
assert.ok(decoded.text.includes('第一章 雨夜'));

const dirtyChapter = index => [
  `第${index}章 雨夜（求月票）`,
  '',
  `第${index}章 雨夜`,
  '<!--adv2-->',
  '请登陆www.qidian.com，章节更多，支持作者，支持正版阅读！',
  '本章未完，请点击下一页继续阅读',
  ...Array.from({ length: 48 }, (_, line) => line % 3 === 0
    ? '“先别进去。”她按住门，听见走廊深处有水声。'
    : `他在第${index}个雨夜往前走了一步，门后的灯随即暗了。`)
].join('\n');
const dirtyNovel = Array.from({ length: 120 }, (_, index) => dirtyChapter(index + 1)).join('\n\n');
const dirtyProfile = window.wwCorpusAnalyzeText(dirtyNovel, { encoding: 'gb18030', confidence: 'strong' });
assert.equal(dirtyProfile.metrics.chapters, 120, 'duplicate download-list headings must not double the chapter count');
assert.ok(dirtyProfile.metrics.runes > 100000, 'the real-fiction regression fixture must exercise long text');
assert.ok(dirtyProfile.cleaning.removed_lines >= 480, 'ads, HTML and duplicate headings must be reported as removed');
assert.equal(dirtyProfile.cleaning.duplicate_heading_lines, 120);
assert.equal(dirtyProfile.cleaning.html_lines, 120);
assert.ok(dirtyProfile.cleaning.ad_lines >= 240);
assert.ok(!dirtyProfile.cleaned_text.includes('qidian.com') && !dirtyProfile.cleaned_text.includes('adv2'));
assert.ok(dirtyProfile.summary.includes('清洗'));

console.log(`Corpus analyzer OK: GB18030 decoded; ${dirtyProfile.metrics.runes.toLocaleString()} cleaned long-text runes; ${dirtyProfile.cleaning.removed_lines} contaminated lines removed.`);
