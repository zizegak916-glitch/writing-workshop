import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const fail = message => { throw new Error(`static contract: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

const expectedPromptSkills = [
  '润色', '扩写', '缩写', '改写', '续写', '补写',
  '对话', '心理', '环境', '战斗',
  '古风', '现代', '幽默', '悬疑', '唯美', '霸气',
  '分析', '校对', '节奏', '情感',
  '大纲', '人物', '伏笔', '转折', '结局',
  '翻译', '总结', '标题', '降AI', '查AI',
  '实时灵感', '资料搜索'
];

const promptSource = read('web/static/js/prompt-skills.js');
const promptNames = [...promptSource.matchAll(/\bname:\s*'([^']+)',\s*group:/g)].map(match => match[1]);
assert(promptNames.length === expectedPromptSkills.length, `expected 32 Prompt Skills, found ${promptNames.length}`);
assert(new Set(promptNames).size === promptNames.length, 'Prompt Skill names must be unique');
for (const name of expectedPromptSkills) assert(promptNames.includes(name), `missing Prompt Skill: ${name}`);

const iconSource = read('web/static/js/ai-mode-icons.js');
const iconMap = new Map([...iconSource.matchAll(/'([^']+)':\s*'(mode-[^']+)'/g)].map(match => [match[1], match[2]]));
const iconSvg = read('web/static/icons/ai-mode-icons.svg');
const symbolIds = new Set([...iconSvg.matchAll(/<symbol\s+id="([^"]+)"/g)].map(match => match[1]));
assert(symbolIds.has('mode-workshop'), 'missing AI workbench symbol');
for (const name of expectedPromptSkills) {
  assert(iconMap.has(name), `missing icon mapping: ${name}`);
  assert(symbolIds.has(iconMap.get(name)), `missing SVG symbol ${iconMap.get(name)} for ${name}`);
}

const appHtml = read('web/static/app.html');
const promptLookups = appHtml.match(/wwPromptText\(/g)?.length || 0;
assert(promptLookups >= 6, `expected Prompt Skill injection in at least 6 request paths, found ${promptLookups}`);
assert(appHtml.includes('js/ai-mode-icons.js') && appHtml.includes('js/prompt-skills.js'), 'workbench must load icon and Prompt Skill scripts');

const contextLayoutIds = [
  'aiRequestDock', 'desktopContextMeter', 'ctxText', 'ctxBar', 'ctxPercent', 'ctxModel',
  'mobileContextMeter', 'mpCtxText', 'mpCtxBar', 'mpCtxPercent', 'mpCtxModel'
];
for (const id of contextLayoutIds) {
  const matches = appHtml.match(new RegExp(`id=["']${id}["']`, 'g')) || [];
  assert(matches.length === 1, `expected one #${id}, found ${matches.length}`);
}
assert(!/function updateContextBar\(\)\s*\{[\s\S]{0,160}if\(!aiHasConfig\(ac\)\)return;/.test(appHtml), 'context estimate must not require an API configuration');
const extensionCss = read('web/static/css/product-extensions.css');
assert(extensionCss.includes('.ai-request-dock') && extensionCss.includes('.ai-context-meter'), 'missing persistent context-dock layout styles');
const workflowSource = read('web/static/js/workflows.js');
assert(workflowSource.includes("getElementById('aiRequestDock')"), 'workflow tab must coordinate the persistent request dock');

const htmlFiles = fs.readdirSync(path.join(root, 'web/static'))
  .filter(file => file.endsWith('.html'))
  .map(file => `web/static/${file}`);

let inlineScriptCount = 0;
for (const file of htmlFiles) {
  const source = read(file);
  for (const match of source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    inlineScriptCount += 1;
    try {
      Function(match[1]);
    } catch (error) {
      fail(`${file} inline script does not parse: ${error.message}`);
    }
  }
  for (const match of source.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const target = match[1].split('#')[0].split('?')[0];
    if (!target || target.startsWith('/') || /^(?:https?:|data:|mailto:|javascript:)/i.test(target)) continue;
    const resolved = path.resolve(root, path.dirname(file), target);
    assert(fs.existsSync(resolved), `${file} references missing local target: ${target}`);
  }
}

const evidence = JSON.parse(read('docs/RELEASE_EVIDENCE.json'));
assert(evidence.schema === 'writing-workshop/release-evidence', 'unexpected release-evidence schema');
assert(Array.isArray(evidence.verified_releases) && evidence.verified_releases.length > 0, 'release evidence has no verified releases');

const docsIndex = read('docs/README.md');
for (const file of ['UPDATE_TIMELINE.md', 'RELEASE_EVIDENCE.json', 'CAPABILITY_PROTOCOL.md', 'UI_DESIGN_SYSTEM.md']) {
  assert(docsIndex.includes(file), `documentation map does not include ${file}`);
}

console.log(`Static contract OK: ${promptNames.length} Prompt Skills, ${iconMap.size} icon mappings, ${symbolIds.size} SVG symbols, ${htmlFiles.length} HTML pages, ${inlineScriptCount} inline scripts.`);
