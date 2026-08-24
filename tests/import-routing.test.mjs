import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/static/js/workbench.js', import.meta.url), 'utf8');
const routingStart = source.indexOf('const IMPORT_TYPE_LABELS=');
const routingEnd = source.indexOf('// ═══ Import Preview & Confirm ═══');
assert.ok(routingStart >= 0 && routingEnd > routingStart, 'cannot locate import routing functions');

const routingContext = {
  countWords: text => String(text || '').replace(/\s/g, '').length
};
vm.createContext(routingContext);
vm.runInContext(`${source.slice(routingStart, routingEnd)}
globalThis.routing = {
  parseImportHint, stripImportEnvelope, classifyImportDocument, importFileBase,
  cleanImportedTitle, chapterTitleFromLine, splitIntoChapters,
  inferImportProjectName, buildImportDataFromSources
};`, routingContext);

const { routing } = routingContext;
const outlineText = `[WRITING_WORKSHOP_IMPORT_HINT_V1]
project=续人间
document_type=outline
target=outlines
must_not_create_chapters=true
[END_IMPORT_HINT]

[OUTLINE_CONTENT_BEGIN]
《续人间》项目大纲
总主线
第23章之后，调查由追线转为破局。
第一卷后半冲突进入巨楔争夺。
[OUTLINE_CONTENT_END]`;
const worldText = `《续人间》世界地域空间母本
一、权威口径
九大地域固定，地域颜色不表示主权。`;
const bodyText = `序章 白日之后

陈亦醒来时，左手腕上刻着两个已经结痂的字。这里的人把容易忘掉的事情刻在木桩和门板上。

第一章 尾水

他在旧渠尾水醒来，先确认勒痕、车辙和草席留下的搬运痕迹。

第二章 肉车

肉车沿着城门前的桥进入九津，查验的人只看见一个浑身泥血的活人。

第三章　空盒

住处的暗槽已经空了，留下的一长一短两道压痕还没有消失。`;

const rawSources = [
  ['续人间_01_项目大纲_仅作大纲_禁止计入章节.txt', outlineText],
  ['续人间_02_世界观母本_仅作设定_禁止计入章节.txt', worldText],
  ['续人间_03_重写正文_序章至第三章.txt', bodyText]
];
const sources = rawSources.map(([fileName, text]) => {
  const classification = routing.classifyImportDocument(fileName, text);
  return {
    fileName,
    fileBase: routing.importFileBase(fileName),
    title: routing.cleanImportedTitle(fileName),
    content: routing.stripImportEnvelope(text),
    type: classification.type,
    reason: classification.reason,
    projectName: classification.projectName
  };
});
const imported = routing.buildImportDataFromSources(sources);
assert.equal(imported.name, '续人间');
assert.deepEqual([...imported.sources.map(item => item.type)], ['outline', 'world_setting', 'manuscript']);
assert.deepEqual([...imported.chapters.map(item => item.title)], ['序章 白日之后', '第一章 尾水', '第二章 肉车', '第三章　空盒']);
assert.equal(imported.outlines.length, 1);
assert.equal(imported.world_setting_sources, 1);
assert.match(imported.world_setting, /九大地域固定/);
assert.doesNotMatch(imported.outlines[0].content, /WRITING_WORKSHOP_IMPORT_HINT/);
assert.equal(routing.chapterTitleFromLine('第23章之后，调查由追线转为破局。'), '');
assert.equal(routing.chapterTitleFromLine('第一卷后半冲突进入巨楔争夺。'), '');

const applyStart = source.indexOf('async function applyImportAnalysis(');
const applyEnd = source.indexOf('async function autoAnalyzeImportedProject(', applyStart);
assert.ok(applyStart >= 0 && applyEnd > applyStart, 'cannot locate AI import guard');
const stores = {
  outlines: [{ id: 1, project_id: 7, title: '现有大纲', content: '已经导入的大纲' }],
  characters: [],
  chapters: [{ id: 2, project_id: 7, title: '第一章 尾水', content: '完整正文内容应当保留。' }]
};
const aiContext = {
  Date,
  t: key => key,
  dbByIndex: async (store, _index, projectId) => stores[store].filter(item => item.project_id === projectId),
  dbPut: async (store, item) => {
    stores[store].push({ ...item, id: stores[store].length + 10 });
    return stores[store].length + 9;
  }
};
vm.createContext(aiContext);
vm.runInContext(`${source.slice(applyStart, applyEnd)}
globalThis.applyImportAnalysisForTest = applyImportAnalysis;`, aiContext);
const added = await aiContext.applyImportAnalysisForTest(7, {
  outlines: [{ title: 'AI 重复大纲', content: '不应写入' }],
  characters: [{ name: '陈亦', role: '主角' }],
  chapters: [{ title: '第一章', summary: '几十字摘要不应成为新章节' }]
});
assert.equal(added, 1);
assert.deepEqual(stores.outlines.map(item => item.title), ['现有大纲']);
assert.deepEqual(stores.characters.map(item => item.name), ['陈亦']);
assert.deepEqual(stores.chapters.map(item => item.title), ['第一章 尾水']);

console.log('Import routing OK: outline/world stay out of chapters, 4 prose chapters parsed, AI chapter summaries ignored.');
