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
for (const marker of ['EVIDENCE_CONTRACT', 'TRANSFORM_PROTOCOL', 'GENERATE_PROTOCOL', 'ANALYSIS_PROTOCOL', 'PLANNING_PROTOCOL', 'RESEARCH_PROTOCOL']) {
  assert(promptSource.includes(`const ${marker}`), `missing layered Prompt Skill protocol: ${marker}`);
}
assert(promptSource.includes('先判断用户提出的问题是否成立'), 'analysis skills must verify criticism before accepting it');
assert(promptSource.includes('结构信号、指导卡与已确认总结') && promptSource.includes('可迁移指导'), 'real-fiction analysis must support reusable guidance, not statistics alone');
assert(promptSource.includes('不是情节来源、作者身份或硬配额'), 'corpus guidance must remain evidence, not mechanical imitation');

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
const systemPromptLookups = workbenchSource.match(/wwSystemPrompt/g)?.length || 0;
assert(systemPromptLookups >= 4, `expected repository system prompt in desktop, mobile and alternate generation paths, found ${systemPromptLookups}`);
assert(appHtml.includes('js/ai-mode-icons.js') && appHtml.includes('js/prompt-skills.js'), 'workbench must load icon and Prompt Skill scripts');
assert(appHtml.includes('js/corpus-lab.js') && appHtml.includes('css/corpus-lab.css'), 'workbench must load corpus calibration UI');
assert(appHtml.includes('v0.3.0 · 2026-08-22'), 'workbench release label is stale');
assert(appHtml.includes('js/api-adapter.js'), 'workbench must load the shared API adapter');
assert(appHtml.indexOf('js/api-adapter.js') < appHtml.indexOf('js/workbench.js'), 'API adapter must load before workbench');
assert(appHtml.includes('js/longbook-memory.js') && appHtml.indexOf('js/longbook-memory.js') < appHtml.indexOf('js/workbench.js'), 'long-book memory engine must load before workbench');
assert(appHtml.includes('js/project-context.js') && appHtml.indexOf('js/project-context.js') < appHtml.indexOf('js/workbench.js'), 'canonical project facts must load before workbench');
assert(appHtml.includes('js/ai-task-contract.js'), 'workbench must load the AI task contract');
assert(appHtml.indexOf('js/ai-task-contract.js') < appHtml.indexOf('js/corpus-lab.js') && appHtml.indexOf('js/ai-task-contract.js') < appHtml.indexOf('js/workbench.js'), 'AI task contract must load before AI feature modules');
assert(appHtml.includes('css/main.css') && appHtml.includes('js/workbench.js'), 'workbench must load its canonical CSS and JavaScript entrypoints');
assert(!/<style[\s>]/i.test(appHtml), 'workbench must not contain inline style blocks');
assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(appHtml), 'workbench must not contain inline script blocks');
assert(workbenchSource.includes("DB_VER=5") && workbenchSource.includes("'notes'") && workbenchSource.includes("ensureIndex(st,'project_id','project_id')"), 'v5 browser database must include project-scoped notes and AI history');
assert(workbenchSource.includes('flushActiveDocument') && workbenchSource.includes('importProjectBundleAtomic'), 'transactional editor switching and project import guards are missing');
assert(workbenchSource.includes('version:6') && workbenchSource.includes('wwCorpusExport') && workbenchSource.includes('wwCorpusImport'), 'v6 project backups must carry corpus calibration profiles');
for (const marker of ['classifyImportDocument', 'buildImportDataFromSources', 'setPendingImportSourceType', '文件内类型标记', 'Only the local parser and explicit project JSON']) {
  assert(workbenchSource.includes(marker), `type-aware project import is missing: ${marker}`);
}
assert(workbenchSource.includes("chapters:[]") && workbenchSource.includes('不得输出 chapters 字段'), 'AI import analysis must be unable to manufacture prose chapters');
assert(appHtml.includes('只补人物和缺失大纲，不创建或改写章节'), 'import preview must explain the AI chapter boundary');
assert(workbenchSource.includes('function loadStoredApiConfig()'), 'browser API configuration loader is missing');
assert(workbenchSource.includes('function loadSlot(n)'), 'multi-model slots must use the canonical scrubbed loader');
assert(workbenchSource.includes('WW_BROWSER_API_MODE') && workbenchSource.includes("?'browser':'backend'"), 'Pages browser API mode is missing');
assert(workbenchSource.includes('function persistApiConfig('), 'dual-mode API persistence is missing');
assert(appHtml.includes('id="serviceConsoleBtn" hidden') && appHtml.includes('title="本地服务控制台"'), 'self-hosted service entry must be hidden by default');
assert(workbenchSource.includes("['serviceConsoleBtn','workflowServiceLink']") && workbenchSource.includes('element.hidden=WW_BROWSER_API_MODE'), 'service entries must follow detected runtime mode');
assert(workbenchSource.includes('WWApiAdapter.request') && workbenchSource.includes('WWApiAdapter.stream'), 'browser-direct request and stream adapters are missing');
assert(workbenchSource.includes("'/api/ai/stream'"), 'self-hosted AI must use the streaming endpoint');
const corpusSource = read('web/static/js/corpus-lab.js');
assert(corpusSource.includes("fetch('/api/corpus'") && corpusSource.includes('usesBrowser()'), 'corpus lab must use the Go API when self-hosted and browser analysis on Pages');
for (const marker of ['wwCorpusGuidanceForSkill', 'AI 深度分析', '本地完整分析', '修改现有指导块', '整段替换提示词', 'guidance_cards', 'counterexample']) {
  assert(corpusSource.includes(marker), `corpus guidance lab is missing: ${marker}`);
}
assert(corpusSource.includes('text_stored: false') && corpusSource.includes('rollback'), 'corpus lab must avoid source retention and support reversible Prompt Skill changes');
for (const marker of ['gb18030', 'big5', 'utf-16le', 'cleanCorpusText', 'duplicate_heading_lines', 'ad_lines', 'garbled_lines', 'encoding_confidence']) {
  assert(corpusSource.includes(marker), `downloaded fiction cleaning is missing: ${marker}`);
}
const taskContractSource = read('web/static/js/ai-task-contract.js');
const registeredSkills = [...taskContractSource.matchAll(/'([^']+)'/g)].map(match => match[1]).filter(name => expectedPromptSkills.includes(name));
for (const name of expectedPromptSkills) assert(registeredSkills.includes(name), `AI long-text registry is missing Prompt Skill: ${name}`);
for (const taskId of ['import.analysis', 'api.connection', 'multi.desktop', 'multi.mobile', 'analysis.deep-check', 'humanize.smart', 'continuation.suggest', 'style.learn', 'quick.proofread', 'quick.title', 'quick.inspiration', 'quick.research', 'quick.humanize', 'quick.detect', 'corpus.deep-analysis', 'corpus.prompt-rewrite', 'memory.foundation-compress', 'memory.foundation-merge', 'memory.chapter-compress', 'memory.chapter-merge', 'memory.arc-compress', 'memory.book-compress', 'recursive.plan', 'recursive.design', 'recursive.write', 'workflow.run']) {
  assert(taskContractSource.includes(`'${taskId}'`), `AI long-text registry is missing feature: ${taskId}`);
}
assert((workbenchSource.match(/\bcallAI\(/g) || []).length === 2, 'AI features must use callAITask instead of bypassing the task registry');
assert((workbenchSource.match(/\bcallAIStream\(/g) || []).length === 2, 'streaming AI features must use callAITaskStream instead of bypassing the task registry');
assert(corpusSource.includes("callAITask('corpus.deep-analysis'") && corpusSource.includes("callAITask('corpus.prompt-rewrite'"), 'corpus AI features must use registered task calls');
assert(workbenchSource.includes('window.wwRemember=remember') && workbenchSource.includes("source:options.source"), 'unified browser memory intake is missing');
const adapterSource = read('web/static/js/api-adapter.js');
for (const protocol of ['openai-chat', 'openai-responses', 'anthropic', 'ollama']) {
  assert(adapterSource.includes(protocol), `API adapter protocol is missing: ${protocol}`);
}
for (const marker of ['parseCustomHeaders', 'parseBodyOverrides', 'normalizeEndpoint', 'normalizeModelsEndpoint', 'normalizeBridgeEndpoint', 'routeEndpoint', 'X-WW-Bridge-Token', 'listModels', 'inspectRequest', '请求未获得 HTTP 响应']) {
  assert(adapterSource.includes(marker), `API request compatibility or diagnostics are missing: ${marker}`);
}
for (const id of ['apiExactEndpoint', 'apiBodyOverrides', 'apiBridgeUrl', 'apiBridgeToken', 'apiDiagnostic', 'apiModelList', 'sApiExactEndpoint', 'sApiBodyOverrides', 'sApiBridgeUrl', 'sApiBridgeToken', 'sApiDiagnostic', 'sApiModelList']) {
  assert(appHtml.includes(`id="${id}"`), `API request inspection control is missing: #${id}`);
}
const bridgeSource = read('internal/web/http_bridge.go');
for (const marker of ['WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS', 'WRITING_WORKSHOP_HTTP_BRIDGE_TOKEN', 'WRITING_WORKSHOP_HTTP_BRIDGE_MAX_BYTES', 'httpBridgeRoutePrefix', 'defaultHTTPBridgeMaxConcurrent', 'X-WW-Bridge-Token']) {
  assert(bridgeSource.includes(marker), `HTTP compatibility bridge is missing: ${marker}`);
}
const bridgeDocs = read('docs/HTTP_BRIDGE.md');
for (const marker of ['WRITING_WORKSHOP_ALLOWED_ORIGINS', 'reverse_proxy 127.0.0.1:8080', 'flush_interval -1', 'Go 1.21', 'Go 1.25', '/api/http-bridge/cpa']) {
  assert(bridgeDocs.includes(marker), `HTTP compatibility bridge documentation is missing: ${marker}`);
}
assert(!/slotKey|placeholder="API Key" value="'\+\(s\.key/.test(workbenchSource), 'multi-model slots must not render or persist browser API keys');
for (const coreFunction of ['renderCharList', 'countWords', 'escapeHtml']) {
  const declarations = workbenchSource.match(new RegExp(`function\\s+${coreFunction}\\s*\\(`, 'g')) || [];
  assert(declarations.length === 1, `expected one ${coreFunction} implementation, found ${declarations.length}`);
}

const contextLayoutIds = [
  'aiRequestDock', 'desktopContextMeter', 'ctxText', 'ctxBar', 'ctxPercent', 'ctxModel',
  'mobileContextMeter', 'mpCtxText', 'mpCtxBar', 'mpCtxPercent', 'mpCtxModel',
  'aiContextMode', 'mpAiContextMode', 'longBookMemoryStatus', 'longBookMemoryAuditList'
];
for (const id of contextLayoutIds) {
  const matches = appHtml.match(new RegExp(`id=["']${id}["']`, 'g')) || [];
  assert(matches.length === 1, `expected one #${id}, found ${matches.length}`);
}
assert(!/function updateContextBar\(\)\s*\{[\s\S]{0,160}if\(!aiHasConfig\(ac\)\)return;/.test(workbenchSource), 'context estimate must not require an API configuration');
const longBookSource = read('web/static/js/longbook-memory.js');
const projectContextSource = read('web/static/js/project-context.js');
for (const marker of ['buildAIWritingContext', 'updateLongBookMemory', 'longBookMemoryFreshness', '全书原文模式需要先在 API 设置中填写模型上下文上限']) {
  assert(workbenchSource.includes(marker), `long-form writing context is missing: ${marker}`);
}
for (const marker of ['WWProjectContext', '项目正式事实包', '世界观与硬设定（资料，不是正文章节）', '剧情大纲与规划节点（计划，不代表已经发生）', '人物卡与知识边界']) {
  assert(projectContextSource.includes(marker), `canonical project facts are missing: ${marker}`);
}
for (const marker of ['buildProjectAIContext', 'projectFactPacket', 'loadWorldContent', "S.active.type==='world'", 'foundation_hash']) {
  assert(workbenchSource.includes(marker), `Pages project-fact integration is missing: ${marker}`);
}
for (const marker of ['memory.foundation-compress', 'memory.foundation-merge', 'memory.chapter-compress', 'memory.chapter-merge', 'memory.arc-compress', 'memory.book-compress', 'foundation_hash', 'source_hash']) {
  assert(longBookSource.includes(marker), `long-book memory engine is missing: ${marker}`);
}
const extensionCss = read('web/static/css/product-extensions.css');
assert(extensionCss.includes('.ai-request-dock') && extensionCss.includes('.ai-context-meter'), 'missing persistent context-dock layout styles');
const workflowSource = read('web/static/js/workflows.js');
assert(workflowSource.includes("getElementById('aiRequestDock')"), 'workflow tab must coordinate the persistent request dock');
assert(workflowSource.includes('id="workflowServiceLink" hidden') && workflowSource.includes('wwSyncServiceEntryVisibility'), 'workflow service management link must be hidden until runtime detection completes');

const publicPages = ['index.html', 'privacy.html', 'app.html'];
for (const file of publicPages) {
  const source = read(`web/static/${file}`);
  assert(!source.includes('linux.do'), `${file} must not present an external forum as product navigation or support`);
}
const docsHtml = read('web/static/docs.html');
assert(docsHtml.includes('id="community-video"') && docsHtml.includes('不是 Writing Workshop 的视频功能'), 'docs must distinguish community video resources from product capabilities');
const indexHtml = read('web/static/index.html');
assert(!indexHtml.includes('admin.html'), 'landing page must not expose the optional service console as public navigation');
assert(!indexHtml.includes('点一颗 Star') && !indexHtml.includes('您的支持是我们最大的动力'), 'landing page must ask for reproducible feedback instead of stars');
assert(indexHtml.includes('提交 Issue'), 'landing page must provide the canonical feedback route');
const aboutHtml = read('web/static/about.html');
assert(aboutHtml.includes('LINUX DO 佬友公益资源') && aboutHtml.includes('视频公益站与开源工具'), 'about page must describe LINUX DO links as community-run public-interest resources');
assert(aboutHtml.includes('不能绕过作者确认') && aboutHtml.includes('优秀模型、引擎和工具'), 'about page must preserve the open engine-adapter position');
const adminHtml = read('web/static/admin.html');
assert(adminHtml.includes('Writing Workshop 本地服务控制台'), 'admin page must be named as the local service console');
assert((adminHtml.match(/data-requires-service/g) || []).length >= 7, 'server-only console tabs must declare their runtime requirement');
assert(adminHtml.includes("querySelectorAll('[data-requires-service]')") && adminHtml.includes('element.hidden=true'), 'static console must hide server-only tabs');
assert(adminHtml.includes('Go 后台记忆') && adminHtml.includes("api('/api/memories'"), 'service console must manage backend memories');

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
for (const file of ['UPDATE_TIMELINE.md', 'RELEASE_EVIDENCE.json', 'PRODUCT_BOUNDARY.md', 'CAPABILITY_PROTOCOL.md', 'UI_DESIGN_SYSTEM.md', 'HTTP_BRIDGE.md']) {
  assert(docsIndex.includes(file), `documentation map does not include ${file}`);
}

console.log(`Static contract OK: ${promptNames.length} Prompt Skills, ${iconMap.size} icon mappings, ${symbolIds.size} SVG symbols, ${htmlFiles.length} HTML pages, ${inlineScriptCount} inline scripts.`);
