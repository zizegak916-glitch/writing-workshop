import assert from 'node:assert/strict';

await import('../web/static/js/project-context.js');
const context = globalThis.WWProjectContext;

const worldMarker = 'WORLD_RULE_FULL_READ_九津夜门只在第三遍钟声后开启';
const outlineMarker = 'OUTLINE_NODE_FULL_READ_此节点尚未发生且不得算作章节';
const tailMarker = 'FOUNDATION_TAIL_MARKER_必须抵达请求体末端';
const longWorld = `${worldMarker}\n${'地域规则与能力代价必须被完整保留。'.repeat(5000)}\n${tailMarker}`;
const bundle = {
  project: { name: '续人间', genre: '长篇', description: '项目事实包回归', world_setting: longWorld },
  outlines: [
    { id: 2, title: '第二卷', sort_order: 2, content: '后续规划' },
    { id: 1, title: '第一卷', sort_order: 1, content: outlineMarker }
  ],
  characters: [{ name: '陈亦', role: '主角', personality: '谨慎', background: '只知道亲眼确认的线索', skills: '能力会损耗记忆' }]
};

const packet = context.build(bundle);
assert.ok(packet.text.length > 50000, 'full project facts must not be silently truncated');
assert.match(packet.text, /世界观与硬设定（资料，不是正文章节）/);
assert.match(packet.text, /剧情大纲与规划节点（计划，不代表已经发生）/);
assert.ok(packet.text.includes(worldMarker));
assert.ok(packet.text.includes(outlineMarker));
assert.ok(packet.text.includes(tailMarker), 'the tail of a long world document must remain present');
assert.ok(packet.text.indexOf('第一卷') < packet.text.indexOf('第二卷'), 'outlines must follow sort order');
assert.match(packet.text, /背景与经历：只知道亲眼确认的线索/);
assert.match(packet.text, /能力与限制：能力会损耗记忆/);
assert.equal(packet.counts.outlines, 2);
assert.equal(packet.counts.characters, 1);
assert.equal(packet.counts.worldChars, longWorld.length);

const edited = context.build({ ...bundle, project: { ...bundle.project, world_setting: `${longWorld}\n新增规则` } });
assert.notEqual(edited.sourceHash, packet.sourceHash, 'world changes must alter the project-fact fingerprint');
const outlineEdited = context.build({ ...bundle, outlines: bundle.outlines.map(item => item.id === 1 ? { ...item, content: `${item.content}\n新增节点` } : item) });
assert.notEqual(outlineEdited.sourceHash, packet.sourceHash, 'outline changes must alter the project-fact fingerprint');

console.log(`Project context OK: ${packet.text.length.toLocaleString()} characters, full world/outlines/character cards retained and fingerprinted.`);
