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
const workbenchSource = read('web/static/js/workbench.js');
const promptLookups = workbenchSource.match(/wwPromptText\(/g)?.length || 0;
assert(promptLookups >= 6, `expected Prompt Skill injection in at least 6 request paths, found ${promptLookups}`);
assert(appHtml.includes('js/ai-mode-icons.js') && appHtml.includes('js/prompt-skills.js'), 'workbench must load icon and Prompt Skill scripts');
assert(appHtml.includes('css/main.css') && appHtml.includes('js/workbench.js'), 'workbench must load its canonical CSS and JavaScript entrypoints');
assert(!/<style[\s>]/i.test(appHtml), 'workbench must not contain inline style blocks');
assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(appHtml), 'workbench must not contain inline script blocks');
assert(workbenchSource.includes("DB_VER=4") && workbenchSource.includes("'notes'"), 'project notes store must be part of the v4 browser database');
assert(workbenchSource.includes('function loadStoredApiConfig()'), 'legacy browser API keys must have a migration scrubber');
assert(workbenchSource.includes('function loadSlot(n)'), 'multi-model slots must use the canonical scrubbed loader');
assert(!workbenchSource.includes("localStorage.setItem('ww_api',JSON.stringify(c));") || workbenchSource.includes("key:'backend'"), 'browser API metadata must use the backend marker');
assert(!/slotKey|placeholder="API Key" value="'\+\(s\.key/.test(workbenchSource), 'multi-model slots must not render or persist browser API keys');
for (const coreFunction of ['renderCharList', 'countWords', 'escapeHtml']) {
  const declarations = workbenchSource.match(new RegExp(`function\\s+${coreFunction}\\s*\\(`, 'g')) || [];
  assert(declarations.length === 1, `expected one ${coreFunction} implementation, found ${declarations.length}`);
}

const contextLayoutIds = [
  'aiRequestDock', 'desktopContextMeter', 'ctxText', 'ctxBar', 'ctxPercent', 'ctxModel',
  'mobileContextMeter', 'mpCtxText', 'mpCtxBar', 'mpCtxPercent', 'mpCtxModel'
];
for (const id of contextLayoutIds) {
  const matches = appHtml.match(new RegExp(`id=["']${id}["']`, 'g')) || [];
  assert(matches.length === 1, `expected one #${id}, found ${matches.length}`);
}
assert(!/function updateContextBar\(\)\s*\{[\s\S]{0,160}if\(!aiHasConfig\(ac\)\)return;/.test(workbenchSource), 'context estimate must not require an API configuration');
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

const combinedHtml = htmlFiles.map(read).join('\n');
for (const folder of ['js', 'css']) {
  const extension = folder === 'js' ? '.js' : '.css';
  for (const file of fs.readdirSync(path.join(root, 'web/static', folder))) {
    if (!file.endsWith(extension)) continue;
    assert(combinedHtml.includes(`${folder}/${file}`), `orphaned ${folder} asset is not loaded by any page: ${file}`);
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
