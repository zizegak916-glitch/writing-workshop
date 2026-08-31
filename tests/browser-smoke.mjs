import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const baseURL = process.env.WW_TEST_BASE_URL || 'http://127.0.0.1:8080';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: process.env.CI
    ? []
    : ['--disable-crash-reporter', '--disable-crashpad', '--no-zygote', '--single-process']
});

async function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function startCorsMock() {
  const state = { preflights: 0, modelRequests: 0, requests: [] };
  const server = createServer((request, response) => {
    const corsHeaders = {
      'Access-Control-Allow-Origin': request.headers.origin || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': request.headers['access-control-request-headers'] || 'Content-Type, Authorization, X-Route',
      'Access-Control-Expose-Headers': 'x-request-id',
      Vary: 'Origin'
    };
    if (request.method === 'OPTIONS') {
      state.preflights += 1;
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }
    if (request.method === 'GET' && request.url === '/v1/models') {
      state.modelRequests += 1;
      response.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'test-model' }, { id: 'gpt-5.6-luna' }] }));
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'method not allowed' } }));
      return;
    }
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      state.requests.push({
        path: request.url,
        authorization: request.headers.authorization,
        route: request.headers['x-route'],
        bridgeToken: request.headers['x-ww-bridge-token'],
        body: JSON.parse(raw || '{}')
      });
      response.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': 'cors-smoke' });
      response.end(JSON.stringify({
        choices: [{ message: { content: 'OK' } }],
        usage: { prompt_tokens: 8, completion_tokens: 1 }
      }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(process.env.WW_TEST_UPSTREAM_PORT || 0), '127.0.0.1', resolve);
  });
  server.unref();
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    state,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  const page = await desktop.newPage();
  const errors = await collectErrors(page);
  await page.goto(`${baseURL}/app.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('ww_cookie_consent', '1');
    document.getElementById('cookieBanner')?.classList.remove('show');
  });
  await page.waitForFunction(() => document.getElementById('app')?.classList.contains('visible'));
  await page.waitForFunction(() => document.getElementById('serviceConsoleBtn')?.hidden === false);
  assert.equal(await page.locator('#serviceConsoleBtn').isVisible(), true, 'self-hosted workbench must expose the local service console');
  await page.waitForFunction(() => document.getElementById('workflowServiceLink'));
  assert.equal(await page.locator('#workflowServiceLink').getAttribute('hidden'), null, 'self-hosted workflow may link to the local service console');

  const aiAndDirtyTextContract = await page.evaluate(() => {
    const raw = atob('tdrSu9XCINPq0rkKy/vNxr+qw8WhowrH67XHwr13d3cucWlkaWFuLmNvbaOs1cK92rj8tuCjrNans9bX99Xfo6zWp7PW1f2w5tTEtsGjoQ==');
    const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
    const decoded = wwCorpusDecodeBytes(bytes);
    const dirty = '第一章 雨夜（求月票）\n\n第一章 雨夜\n<!--adv2-->\n请登陆www.qidian.com，章节更多，支持作者，支持正版阅读！\n' + '他推开门。\n'.repeat(80);
    const profile = wwCorpusAnalyzeText(dirty, decoded);
    return {
      taskCount: WWAITaskContract.list().length,
      skillTaskCount: WWAITaskContract.list().filter(task => task.id.startsWith('skill.')).length,
      encoding: decoded.encoding,
      decodedHeading: decoded.text.includes('第一章 雨夜'),
      chapters: profile.metrics.chapters,
      cleaning: profile.cleaning,
      polluted: profile.cleaned_text.includes('qidian.com') || profile.cleaned_text.includes('adv2') || profile.cleaned_text.includes('求月票')
    };
  });
  assert.equal(aiAndDirtyTextContract.taskCount, 58);
  assert.equal(aiAndDirtyTextContract.skillTaskCount, 32);
  assert.equal(aiAndDirtyTextContract.encoding, 'gb18030');
  assert.equal(aiAndDirtyTextContract.decodedHeading, true);
  assert.equal(aiAndDirtyTextContract.chapters, 1);
  assert.equal(aiAndDirtyTextContract.cleaning.duplicate_heading_lines, 1);
  assert.equal(aiAndDirtyTextContract.cleaning.html_lines, 1);
  assert.ok(aiAndDirtyTextContract.cleaning.ad_lines >= 1);
  assert.equal(aiAndDirtyTextContract.polluted, false);

  const longBookContract = await page.evaluate(async () => {
    const chapters = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      title: `第${index + 1}章 浏览器长篇验收`,
      sort_order: index,
      content: `${index + 1}章事实。`.repeat(900)
    }));
    const foundationText = `【世界观】BROWSER_WORLD_MEMORY_MARKER\n${'规则资料。'.repeat(1600)}\n【大纲】BROWSER_OUTLINE_MEMORY_MARKER 尚未发生。`;
    const foundation = { sourceText: foundationText, sourceHash: WWLongBookMemory.fingerprint(foundationText), label: '浏览器项目事实' };
    const calls = [];
    const result = await WWLongBookMemory.build({
      chapters,
      foundation,
      chunkChars: 2000,
      arcSize: 2,
      summarize: async request => {
        calls.push(request);
        if (request.phase === 'foundation_chunk') return `项目事实第${request.chunkIndex + 1}块，保留世界规则和大纲规划`;
        if (request.phase === 'foundation_merge') return '项目事实完整记忆，规划尚未发生';
        if (request.phase === 'chapter_chunk') return `${request.chapter.title} 第${request.chunkIndex + 1}块事实`;
        if (request.phase === 'chapter_merge') return `${request.chapter.title} 完整章节记忆`;
        if (request.phase === 'arc') return `阶段${request.arcIndex + 1}记忆`;
        return `完整覆盖${request.chapters.length}章的全书记忆`;
      }
    });
    return {
      desktopOptions: [...document.getElementById('aiContextMode').options].map(option => option.value),
      mobileOptions: [...document.getElementById('mpAiContextMode').options].map(option => option.value),
      defaultMode: getAIContextMode(),
      chapters: result.chapterMemories.length,
      arcs: result.arcMemories.length,
      covered: result.digestMemory.covered_chapter_ids.length,
      foundationHash: result.digestMemory.foundation_hash,
      expectedFoundationHash: foundation.sourceHash,
      foundationChunks: calls.filter(call => call.phase === 'foundation_chunk').length,
      chunkedChapters: new Set(calls.filter(call => call.phase === 'chapter_chunk').map(call => call.chapter.id)).size
    };
  });
  assert.deepEqual(longBookContract.desktopOptions, ['smart', 'current', 'selection', 'full']);
  assert.deepEqual(longBookContract.mobileOptions, ['smart', 'current', 'selection', 'full']);
  assert.equal(longBookContract.defaultMode, 'smart');
  assert.equal(longBookContract.chapters, 5);
  assert.equal(longBookContract.arcs, 3);
  assert.equal(longBookContract.covered, 5);
  assert.equal(longBookContract.foundationHash, longBookContract.expectedFoundationHash);
  assert.ok(longBookContract.foundationChunks >= 2, 'browser long-book engine must fully chunk project facts');
  assert.equal(longBookContract.chunkedChapters, 5, 'browser long-book engine must read every chapter');

  const longBookPersistenceGuards = await page.evaluate(async () => {
    // A fresh browser profile legitimately starts without a project. Keep the
    // regression self-contained instead of assuming startup created one.
    const originalProjectId = S.proj?.project?.id ?? null;
    const now = Date.now();
    const oldChapterIds = [701, 702, 703];
    const staleProjectId = await importProjectBundleAtomic({
      version: 6,
      project: { name: '过期记忆与导入映射验收', world_setting: '当前世界规则', created_at: now, updated_at: now },
      outlines: [], characters: [], notes: [], history: [], categories: [],
      chapters: oldChapterIds.map((id, index) => ({ id, title: `第${index + 1}章`, content: `当前正文${index + 1}`, sort_order: index, created_at: now })),
      memories: [
        ...oldChapterIds.map((id, index) => ({ id: 900 + index, source: 'longbook', kind: 'chapter_summary', longbook_key: `chapter:${id}`, chapter_id: id, coverage_index: index, source_hash: 'stale-source', content: index === 1 ? 'STALE_NEIGHBOR_MARKER' : `旧摘要${index + 1}`, enabled: true })),
        { id: 999, source: 'longbook', kind: 'book_digest', longbook_key: 'book', covered_chapter_ids: oldChapterIds, content: 'STALE_BOOK_MARKER', enabled: true }
      ]
    });
    await loadProject(staleProjectId);
    const importedChapters = await dbByIndex('chapters', 'project_id', staleProjectId);
    const importedMemories = await dbByIndex('aiMemories', 'project_id', staleProjectId);
    const chapterIds = importedChapters.sort((a, b) => a.sort_order - b.sort_order).map(chapter => chapter.id);
    const summaryIds = importedMemories.filter(memory => memory.kind === 'chapter_summary').sort((a, b) => a.coverage_index - b.coverage_index).map(memory => memory.chapter_id);
    const digestIds = importedMemories.find(memory => memory.kind === 'book_digest').covered_chapter_ids;
    const contextText = buildAIWritingContext('smart').text;

    const beforeRollback = importedMemories.map(memory => ({ id: memory.id, content: memory.content })).sort((a, b) => a.id - b.id);
    let rollbackRejected = false;
    try {
      await replaceLongBookMemories([
        { ...importedMemories[0], content: 'MUTATED_SHOULD_ROLLBACK' },
        { ...importedMemories[1], id: () => 'invalid-indexeddb-key' }
      ], importedMemories);
    } catch (_) {
      rollbackRejected = true;
    }
    const afterRollback = (await dbByIndex('aiMemories', 'project_id', staleProjectId)).map(memory => ({ id: memory.id, content: memory.content })).sort((a, b) => a.id - b.id);

    const projectA = await importProjectBundleAtomic({ version: 6, project: { name: '更新竞态 A', world_setting: 'PROJECT_A_SOURCE_RULE', created_at: now }, outlines: [], characters: [], chapters: [], notes: [], memories: [], history: [], categories: [] });
    const projectB = await importProjectBundleAtomic({ version: 6, project: { name: '更新竞态 B', world_setting: 'PROJECT_B_SOURCE_RULE', created_at: now }, outlines: [], characters: [], chapters: [], notes: [], memories: [], history: [], categories: [] });
    await loadProject(projectA);
    const originalBuild = WWLongBookMemory.build;
    const originalConfirm = window.confirm;
    const originalConfig = S.apiConfig;
    let releaseBuild;
    let announceBuild;
    const buildStarted = new Promise(resolve => { announceBuild = resolve; });
    WWLongBookMemory.build = () => {
      announceBuild();
      return new Promise(resolve => { releaseBuild = resolve; });
    };
    window.confirm = () => true;
    S.apiConfig = { provider: 'test-provider' };
    const updateTask = updateLongBookMemory();
    await Promise.race([
      buildStarted,
      new Promise((_, reject) => setTimeout(() => reject(new Error('long-book update did not enter the build phase')), 3000))
    ]);
    if (!S.longBookMemoryRun || !releaseBuild) throw new Error('long-book update did not publish its run guard');
    await loadProject(projectB);
    releaseBuild({
      foundationMemory: { source: 'longbook', kind: 'foundation_digest', longbook_key: 'foundation', content: 'PROJECT_A_PINNED_RESULT', enabled: true },
      chapterMemories: [], arcMemories: [], digestMemory: null,
      stats: { foundationChars: 0, chapterCount: 0, analyzedChapters: 0, reusedChapters: 0 }
    });
    await updateTask;
    const rowsA = await dbByIndex('aiMemories', 'project_id', projectA);
    const rowsB = await dbByIndex('aiMemories', 'project_id', projectB);
    WWLongBookMemory.build = originalBuild;
    window.confirm = originalConfirm;
    S.apiConfig = originalConfig;

    for (const projectId of [staleProjectId, projectA, projectB]) {
      for (const store of ['outlines', 'characters', 'chapters', 'notes', 'aiMemories', 'aiHistory']) {
        for (const row of await dbByIndex(store, 'project_id', projectId)) await dbDel(store, row.id);
      }
      await dbDel('projects', projectId);
    }
    if (originalProjectId != null) {
      await loadProject(originalProjectId);
    } else {
      S.proj = null;
      S.active = null;
      S.aiMemories = [];
    }
    await loadProjects();
    return {
      chapterIds, summaryIds, digestIds,
      staleBookInjected: contextText.includes('STALE_BOOK_MARKER'),
      staleNeighborInjected: contextText.includes('STALE_NEIGHBOR_MARKER'),
      rollbackRejected,
      rollbackPreserved: JSON.stringify(beforeRollback) === JSON.stringify(afterRollback),
      projectARows: rowsA.map(row => row.content),
      projectBRows: rowsB.map(row => row.content)
    };
  });
  assert.deepEqual(longBookPersistenceGuards.summaryIds, longBookPersistenceGuards.chapterIds, 'imported chapter summaries must follow remapped chapter IDs');
  assert.deepEqual(longBookPersistenceGuards.digestIds, longBookPersistenceGuards.chapterIds, 'imported book coverage must follow remapped chapter IDs');
  assert.equal(longBookPersistenceGuards.staleBookInjected, false, 'stale book digests must not enter smart writing context');
  assert.equal(longBookPersistenceGuards.staleNeighborInjected, false, 'stale adjacent summaries must not enter smart writing context');
  assert.equal(longBookPersistenceGuards.rollbackRejected, true, 'invalid long-book replacement must reject');
  assert.equal(longBookPersistenceGuards.rollbackPreserved, true, 'failed long-book replacement must roll back every row');
  assert.deepEqual(longBookPersistenceGuards.projectARows, ['PROJECT_A_PINNED_RESULT'], 'an in-flight update must stay pinned to its starting project');
  assert.deepEqual(longBookPersistenceGuards.projectBRows, [], 'switching projects during an update must not contaminate the new project');

  const importRouting = await page.evaluate(() => {
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
      const classification = classifyImportDocument(fileName, text);
      return {
        fileName,
        fileBase: importFileBase(fileName),
        title: cleanImportedTitle(fileName),
        content: stripImportEnvelope(text),
        type: classification.type,
        reason: classification.reason,
        projectName: classification.projectName
      };
    });
    const result = buildImportDataFromSources(sources);
    return {
      name: result.name,
      sourceTypes: result.sources.map(source => source.type),
      chapters: result.chapters.map(chapter => chapter.title),
      outlines: result.outlines.length,
      worldSources: result.world_setting_sources,
      worldContains: result.world_setting.includes('九大地域固定'),
      outlineContainsHint: result.outlines[0].content.includes('WRITING_WORKSHOP_IMPORT_HINT'),
      falseHeadings: [chapterTitleFromLine('第23章之后，调查由追线转为破局。'), chapterTitleFromLine('第一卷后半冲突进入巨楔争夺。')]
    };
  });
  assert.equal(importRouting.name, '续人间');
  assert.deepEqual(importRouting.sourceTypes, ['outline', 'world_setting', 'manuscript']);
  assert.deepEqual(importRouting.chapters, ['序章 白日之后', '第一章 尾水', '第二章 肉车', '第三章　空盒']);
  assert.equal(importRouting.outlines, 1);
  assert.equal(importRouting.worldSources, 1);
  assert.equal(importRouting.worldContains, true);
  assert.equal(importRouting.outlineContainsHint, false, 'machine import hints must not pollute stored outline content');
  assert.deepEqual(importRouting.falseHeadings, ['', ''], 'outline prose and volume descriptions must not become chapter headings');

  const importAiGuard = await page.evaluate(async () => {
    const now = Date.now();
    const projectId = await importProjectBundleAtomic({
      version: 6,
      project: { name: '导入 AI 防重复验收', created_at: now },
      outlines: [{ title: '现有大纲', content: '已经导入的大纲' }],
      characters: [],
      chapters: [{ title: '第一章 尾水', content: '完整正文内容应当保留。' }],
      notes: [], memories: [], history: [], categories: []
    });
    const added = await applyImportAnalysis(projectId, {
      outlines: [{ title: 'AI 重复大纲', content: '不应写入' }],
      characters: [{ name: '陈亦', role: '主角' }],
      chapters: [{ title: '第一章', summary: '几十字摘要不应成为新章节' }]
    });
    const result = {
      added,
      outlines: (await dbByIndex('outlines', 'project_id', projectId)).map(item => item.title),
      characters: (await dbByIndex('characters', 'project_id', projectId)).map(item => item.name),
      chapters: (await dbByIndex('chapters', 'project_id', projectId)).map(item => item.title)
    };
    for (const store of ['outlines', 'characters', 'chapters', 'notes', 'aiMemories', 'aiHistory']) {
      for (const row of await dbByIndex(store, 'project_id', projectId)) await dbDel(store, row.id);
    }
    await dbDel('projects', projectId);
    return result;
  });
  assert.equal(importAiGuard.added, 1);
  assert.deepEqual(importAiGuard.outlines, ['现有大纲']);
  assert.deepEqual(importAiGuard.characters, ['陈亦']);
  assert.deepEqual(importAiGuard.chapters, ['第一章 尾水'], 'AI summaries must never create duplicate prose chapters');

  await page.evaluate(() => {
    localStorage.setItem('ww_api', JSON.stringify({ provider: 'openai', model: 'legacy-model', key: 'legacy-secret', baseUrl: 'https://example.invalid/v1' }));
    localStorage.setItem('ww_slot1', JSON.stringify({ enabled: true, preset: 'openai', model: 'legacy-model', key: 'legacy-slot-secret', url: 'https://example.invalid/v1' }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.getElementById('app')?.classList.contains('visible'));
  await page.evaluate(() => renderMultiSlots());
  const scrubbedSecrets = await page.evaluate(() => ({
    api: JSON.parse(localStorage.getItem('ww_api') || '{}'),
    slot: JSON.parse(localStorage.getItem('ww_slot1') || '{}')
  }));
  assert.equal(scrubbedSecrets.api.key, 'backend');
  assert.equal(scrubbedSecrets.api.baseUrl, '');
  assert.equal('key' in scrubbedSecrets.slot, false);
  assert.equal('url' in scrubbedSecrets.slot, false);

  await page.evaluate(() => openModal('newProjectModal'));
  await page.locator('#newProjectName').fill('浏览器验收项目');
  await page.locator('#newProjectDesc').fill('用于验证项目、笔记和导出链路');
  await page.locator('#newProjectModal .btn-confirm').click();
  await page.waitForFunction(() => document.getElementById('currentProjectName')?.textContent === '浏览器验收项目');

  const memoryProjectId = await page.evaluate(() => S.proj.project.id);
  await page.locator('.ai-tab', { hasText: '记忆' }).click();
  await page.locator('#aiTab-memory button', { hasText: '＋ 添加' }).click();
  await page.locator('#memCatGrid .genre-chip', { hasText: '世界观' }).click();
  await page.locator('#memTitle').fill('世界规则·初版');
  await page.locator('#memContent').fill('验收城每天凌晨会倒退十分钟。');
  await page.locator('#memoryModal .btn-confirm').click();
  await page.waitForFunction(() => document.querySelector('#memoryList')?.textContent.includes('验收城每天凌晨会倒退十分钟'));
  let localMemory = await page.evaluate(async projectId => (await dbByIndex('aiMemories', 'project_id', projectId)).find(memory => memory.title === '世界规则·初版'), memoryProjectId);
  assert.equal(localMemory.category, 'world', 'built-in memory categories must retain their exact category id');

  let localMemoryCard = page.locator('#memoryList [data-memory-id]', { hasText: '世界规则·初版' });
  assert.equal(await localMemoryCard.getByRole('button', { name: '编辑' }).isVisible(), true, 'memory edit must remain available on touch devices without hover');
  await localMemoryCard.getByRole('button', { name: '编辑' }).click();
  await page.locator('#memCatGrid .genre-chip', { hasText: '规则' }).click();
  await page.locator('#memTitle').fill('');
  await page.locator('#memContent').fill('验收城每天凌晨会倒退十二分钟。');
  await page.locator('#memoryModal .btn-confirm').click();
  await page.waitForFunction(() => document.querySelector('#memoryList')?.textContent.includes('倒退十二分钟'));
  let localMemories = await page.evaluate(projectId => dbByIndex('aiMemories', 'project_id', projectId), memoryProjectId);
  assert.equal(localMemories.length, 1, 'editing a memory must update the same IndexedDB row');
  assert.equal(localMemories[0].category, 'rule');
  assert.equal(localMemories[0].title, '', 'memory title must be clearable');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.getElementById('currentProjectName')?.textContent === '浏览器验收项目');
  await page.locator('.ai-tab', { hasText: '记忆' }).click();
  assert.match(await page.locator('#memoryList').innerText(), /倒退十二分钟/, 'memory update must survive a full page reload');

  const isolatedProjectId = await page.evaluate(async () => {
    const now = Date.now();
    const id = await importProjectBundleAtomic({ version: 6, project: { name: '记忆隔离验收项目', created_at: now }, outlines: [], characters: [], chapters: [], notes: [], memories: [], history: [], categories: [] });
    await loadProjects();
    await loadProject(id);
    return id;
  });
  assert.match(await page.locator('#memoryList').innerText(), /暂无记忆条目/, 'switching projects must immediately rerender the scoped memory list');
  await page.evaluate(async projectId => { await loadProject(projectId); }, memoryProjectId);
  assert.match(await page.locator('#memoryList').innerText(), /倒退十二分钟/, 'switching back must restore only that project\'s memory cards');
  await page.evaluate(async projectId => {
    for (const store of ['outlines', 'characters', 'chapters', 'notes', 'aiMemories', 'aiHistory']) {
      for (const row of await dbByIndex(store, 'project_id', projectId)) await dbDel(store, row.id);
    }
    await dbDel('projects', projectId);
    await loadProjects();
  }, isolatedProjectId);

  await page.locator('#aiTab-memory button', { hasText: '＋ 添加' }).click();
  await page.locator('#memTitle').fill('前后台联动验收');
  await page.locator('#memContent').fill('后台联动第一版。');
  await page.locator('#memBackend').check();
  await page.locator('#memoryModal .btn-confirm').click();
  await page.waitForFunction(() => document.querySelector('#memoryList')?.textContent.includes('后台已关联'));
  const linkedMemory = await page.evaluate(async projectId => (await dbByIndex('aiMemories', 'project_id', projectId)).find(memory => memory.title === '前后台联动验收'), memoryProjectId);
  assert.ok(linkedMemory.backend_id, 'dual-write memory must retain its backend id locally');
  assert.equal(linkedMemory.backend_sync_status, 'synced');

  let linkedCard = page.locator('#memoryList [data-memory-id]', { hasText: '前后台联动验收' });
  await linkedCard.getByRole('button', { name: '编辑' }).click();
  assert.equal(await page.locator('#memBackend').isChecked(), true, 'editing a linked memory should default to updating the backend record');
  await page.locator('#memContent').fill('后台联动第二版。');
  await page.locator('#memoryModal .btn-confirm').click();
  await page.waitForFunction(() => document.querySelector('#memoryList')?.textContent.includes('后台联动第二版'));
  const backendAfterUpdate = await page.evaluate(project => fetch('/api/memories?project=' + encodeURIComponent(project)).then(response => response.json()), '浏览器验收项目');
  const linkedRows = backendAfterUpdate.memories.filter(memory => memory.id === linkedMemory.backend_id);
  assert.equal(linkedRows.length, 1, 'linked edits must update, not duplicate, the Go backend memory');
  assert.equal(linkedRows[0].content, '后台联动第二版。');

  linkedCard = page.locator('#memoryList [data-memory-id]', { hasText: '前后台联动验收' });
  page.once('dialog', dialog => dialog.accept());
  await linkedCard.getByRole('button', { name: '删除' }).click();
  await page.waitForFunction(id => !S.aiMemories.some(memory => memory.id === id), linkedMemory.id);
  const backendAfterDelete = await page.evaluate(project => fetch('/api/memories?project=' + encodeURIComponent(project)).then(response => response.json()), '浏览器验收项目');
  assert.equal(backendAfterDelete.memories.some(memory => memory.id === linkedMemory.backend_id), false, 'deleting a linked memory must delete its Go backend counterpart');

  await page.locator('.nav-tab', { hasText: '笔记' }).click();
  await page.locator('#tab-notes .add-item-btn').click();
  await page.waitForFunction(() => S.active?.type === 'note' && document.querySelector('#noteList .oi-text')?.textContent === '新笔记');
  await page.locator('#chapterTitle').fill('设定核对');
  await page.locator('#mainEditor').fill('这里记录一条不会混入正文的项目笔记。');
  await page.locator('#saveBtn').click();
  await page.waitForFunction(() => document.querySelector('#noteList .oi-text')?.textContent === '设定核对');

  await page.locator('#mainEditor').fill('并发保存只应写入一次最新内容。');
  await page.evaluate(async () => {
    const originalPut = window.dbPut;
    window.__savePutCount = 0;
    window.dbPut = async (...args) => {
      window.__savePutCount += 1;
      await new Promise(resolve => setTimeout(resolve, 25));
      return originalPut(...args);
    };
    await Promise.all([saveDoc({ silent: true }), saveDoc({ silent: true })]);
    window.dbPut = originalPut;
  });
  assert.equal(await page.evaluate(() => window.__savePutCount), 2, 'concurrent saves should perform one document write and one project write');
  assert.equal(await page.evaluate(() => S.unsaved), false);

  const bundle = await page.evaluate(async () => {
    const project = S.proj.project;
    return {
      version: 6,
      project,
      notes: await dbByIndex('notes', 'project_id', project.id)
    };
  });
  assert.equal(bundle.notes.length, 1);
  assert.equal(bundle.notes[0].title, '设定核对');

  const saveRace = await page.evaluate(async () => {
    const originalPut = dbPut;
    dbPut = async (store, value) => {
      if (store === 'notes') await new Promise(resolve => setTimeout(resolve, 60));
      return originalPut(store, value);
    };
    document.getElementById('mainEditor').value = '较早的保存快照';
    onEditorInput();
    const pending = saveDoc({ silent: true });
    await new Promise(resolve => setTimeout(resolve, 10));
    document.getElementById('mainEditor').value = '保存期间继续输入的最新内容';
    onEditorInput();
    const firstWasCurrent = await pending;
    const remainedDirty = S.unsaved;
    dbPut = originalPut;
    await saveDoc({ silent: true });
    const stored = await dbGet('notes', S.active.id);
    return { firstWasCurrent, remainedDirty, content: stored.content, finalDirty: S.unsaved };
  });
  assert.equal(saveRace.firstWasCurrent, false, 'an older async save must not clear a newer dirty revision');
  assert.equal(saveRace.remainedDirty, true);
  assert.equal(saveRace.content, '保存期间继续输入的最新内容');
  assert.equal(saveRace.finalDirty, false);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.getElementById('currentProjectName')?.textContent === '浏览器验收项目');
  await page.locator('.nav-tab', { hasText: '笔记' }).click();
  await page.waitForFunction(() => document.querySelector('#noteList .oi-text')?.textContent === '设定核对');
  await page.locator('#noteList .outline-item', { hasText: '设定核对' }).click();

  await page.locator('#chapterTitle').fill('未手动保存的设定核对');
  await page.locator('#mainEditor').fill('切换资料前必须先完成 IndexedDB 事务，不能等待三秒防抖。');
  await page.keyboard.press('Escape');
  assert.match(await page.locator('#mainEditor').inputValue(), /不能等待三秒防抖/, 'Esc outside focus mode must not overwrite the editor');
  await page.locator('.nav-tab', { hasText: '大纲' }).click();
  await page.locator('#outlineList .outline-item').nth(1).click();
  await page.waitForFunction(() => S.active?.type === 'outline');
  await page.locator('.nav-tab', { hasText: '笔记' }).click();
  await page.locator('#noteList .outline-item', { hasText: '未手动保存的设定核对' }).click();
  assert.equal(await page.locator('#chapterTitle').inputValue(), '未手动保存的设定核对');
  assert.match(await page.locator('#mainEditor').inputValue(), /不能等待三秒防抖/);

  await page.locator('.nav-tab', { hasText: '人物' }).click();
  await page.locator('#tab-chars .add-item-btn').click();
  await page.locator('#charName').fill('事务测试人物');
  await page.locator('#charPers').fill('谨慎');
  await page.locator('#charModal .btn-confirm').click();
  await page.waitForFunction(() => document.querySelector('#charList .char-card')?.textContent.includes('事务测试人物'));
  await page.locator('.nav-tab', { hasText: '人物' }).click();
  await page.locator('#charList .char-card', { hasText: '事务测试人物' }).click();
  await page.locator('#chapterTitle').fill('事务测试人物·修订');
  await page.locator('#mainEditor').fill('【主角】事务测试人物·修订\n\n性格：克制而敏锐\n\n背景：用于验证中央编辑器写回\n\n外貌：黑发\n\n技能：识别未保存切换');
  await page.locator('.nav-tab', { hasText: '大纲' }).click();
  await page.locator('#outlineList .outline-item').nth(1).click();
  await page.locator('.nav-tab', { hasText: '人物' }).click();
  await page.locator('#charList .char-card', { hasText: '事务测试人物·修订' }).click();
  assert.match(await page.locator('#mainEditor').inputValue(), /识别未保存切换/);
  const persistedCharacter = await page.evaluate(async () => (await dbByIndex('characters', 'project_id', S.proj.project.id)).find(item => item.name === '事务测试人物·修订'));
  assert.equal(persistedCharacter.skills, '识别未保存切换');

  await page.locator('#mainEditor').fill('【主角】事务测试人物·修订\n\n性格：克制而敏锐\n\n背景：用于验证中央编辑器写回\n\n外貌：黑发\n\n技能：导出前即时保存');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.topbar button[title="导出"]').click();
  const download = await downloadPromise;
  const exportedBundle = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exportedBundle.version, 6);
  assert.equal(exportedBundle.characters.find(item => item.name === '事务测试人物·修订')?.skills, '导出前即时保存');

  const migrations = await page.evaluate(() => {
    const fixtures = [
      { version: 1, project: { name: 'v1' }, chapters: [{ title: '旧章', content: '旧正文' }] },
      { version: 2, project: { name: 'v2' }, aiMemories: [{ content: '旧记忆' }] },
      {
        version: 3,
        project: { name: 'v3', category_ids: ['history'] },
        custom_categories: [{ id: 'history', name: '考据' }],
        promptSkills: { overrides: { '润色': { prompt: '保留事实' } } }
      },
      { version: 4, project: { name: 'v4' }, notes: [{ title: '旧笔记' }], aiHistory: [{ mode: '旧候选', text: '保留' }] },
      { version: 5, project: { name: 'v5' }, notes: [{ title: '上一版笔记' }] }
    ];
    return fixtures.map(fixture => {
      const migrated = validateProjectBundle(fixture);
      return {
        version: migrated.version,
        sourceVersion: migrated.source_version,
        chapters: migrated.chapters.length,
        memories: migrated.memories.length,
        categories: migrated.categories.length,
        prompt: migrated.prompt_skills?.overrides?.['润色']?.prompt || '',
        notes: migrated.notes.length,
        history: migrated.history.length
      };
    });
  });
  assert.deepEqual(migrations, [
    { version: 6, sourceVersion: 1, chapters: 1, memories: 0, categories: 0, prompt: '', notes: 0, history: 0 },
    { version: 6, sourceVersion: 2, chapters: 0, memories: 1, categories: 0, prompt: '', notes: 0, history: 0 },
    { version: 6, sourceVersion: 3, chapters: 0, memories: 0, categories: 1, prompt: '保留事实', notes: 0, history: 0 },
    { version: 6, sourceVersion: 4, chapters: 0, memories: 0, categories: 0, prompt: '', notes: 1, history: 1 },
    { version: 6, sourceVersion: 5, chapters: 0, memories: 0, categories: 0, prompt: '', notes: 1, history: 0 }
  ]);
  const remappedImport = await page.evaluate(async () => {
    const projectId = await importProjectBundleAtomic({
      version: 5,
      project: { name: 'ID 映射验收' },
      outlines: [],
      characters: [],
      chapters: [],
      notes: [{ id: 777, title: '来源笔记', content: '正文' }],
      memories: [],
      history: [{ id: 888, mode: '来源候选', text: '候选', active_type: 'note', active_id: 777 }],
      categories: []
    });
    const note = (await dbByIndex('notes', 'project_id', projectId))[0];
    const history = (await dbByIndex('aiHistory', 'project_id', projectId))[0];
    for (const store of ['outlines', 'characters', 'chapters', 'notes', 'aiMemories', 'aiHistory']) {
      for (const row of await dbByIndex(store, 'project_id', projectId)) await dbDel(store, row.id);
    }
    await dbDel('projects', projectId);
    return { oldId: 777, noteId: note.id, activeId: history.active_id };
  });
  assert.notEqual(remappedImport.noteId, remappedImport.oldId);
  assert.equal(remappedImport.activeId, remappedImport.noteId, 'imported recovery snapshots must target remapped document IDs');

  const promptBeforeCorpus = await page.evaluate(() => wwPromptSkill('润色').prompt);
  await page.evaluate(() => wwOpenCorpusLab());
  await page.locator('#corpusFiles').setInputFiles({
    name: 'authorized-reference.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(`第一章 雨夜\n${'他推开门，看见雨线压过长街。\n“先进去。”她说。\n他没有回答，只把伞递了过去。\n'.repeat(60)}`)
  });
  await page.locator('#corpusConsent').check();
  await page.locator('#corpusAnalyze').click();
  await page.waitForFunction(() => document.querySelector('#corpusProfiles')?.textContent.includes('authorized-reference.txt'));
  const corpusArchive = await page.evaluate(() => fetch('/api/corpus').then(response => response.json()));
  assert.equal(corpusArchive.profiles[0].source.text_stored, false);
  assert.equal('text' in corpusArchive.profiles[0].source, false, 'Go corpus archive must not persist source text');
  await page.locator('#corpusBuild').click();
  await page.waitForFunction(() => document.getElementById('corpusPreview')?.value.includes('本地语料校准候选'));
  await page.locator('#corpusApply').click();
  assert.match(await page.evaluate(() => wwPromptSkill('润色').prompt), /本地语料校准候选/);
  await page.locator('#corpusHistory [data-rollback]').first().click();
  assert.equal(await page.evaluate(() => wwPromptSkill('润色').prompt), promptBeforeCorpus, 'Prompt Skill rollback must restore the exact previous value');
  await page.locator('[data-corpus-close]').click();

  await page.locator('.nav-tab', { hasText: '笔记' }).click();
  await page.locator('#noteList .outline-item', { hasText: '设定核对' }).click();
  await page.locator('.workflow-tab').click();
  await page.waitForFunction(() => document.getElementById('workflowStatus')?.textContent === '后端已连接');
  await page.locator('#workflowTaskType').selectOption('echo');
  await page.locator('#workflowTaskPrompt').fill('验证候选必须先审阅，再由用户确认写入。');
  await page.locator('#workflowRunBtn').click();
  await page.waitForFunction(() => document.getElementById('workflowStatus')?.textContent === '候选已生成');
  const candidateText = await page.locator('#workflowCandidate').textContent();
  assert.match(candidateText, /验证候选必须先审阅/);

  await page.locator('.nav-tab', { hasText: '大纲' }).click();
  await page.locator('#outlineList .outline-item').nth(1).click();
  const outlineBeforeWrongApply = await page.locator('#mainEditor').inputValue();
  await page.locator('#workflowApplyMode').selectOption('append');
  await page.locator('#workflowApplyBtn').click();
  assert.equal(await page.locator('#mainEditor').inputValue(), outlineBeforeWrongApply, 'candidate must not write into another document');

  await page.locator('.nav-tab', { hasText: '笔记' }).click();
  await page.locator('#noteList .outline-item', { hasText: '设定核对' }).click();
  const noteBeforeApply = await page.locator('#mainEditor').inputValue();
  await page.locator('#workflowApplyBtn').click();
  await page.waitForFunction(before => document.getElementById('mainEditor')?.value !== before, noteBeforeApply);
  assert.match(await page.locator('#mainEditor').inputValue(), /验证候选必须先审阅/);
  await page.locator('#saveBtn').click();

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.getElementById('currentProjectName')?.textContent === '浏览器验收项目');
  await page.locator('.nav-tab', { hasText: '笔记' }).click();
  await page.locator('#noteList .outline-item', { hasText: '设定核对' }).click();
  await page.locator('.workflow-tab').click();
  await page.waitForFunction(() => document.querySelector('#workflowHistory .workflow-history-item'));
  await page.locator('#workflowHistory .workflow-history-item', { hasText: '流程 · echo' }).first().getByRole('button', { name: '查看候选' }).click();
  await page.waitForFunction(() => document.getElementById('workflowCandidateMeta')?.textContent.includes('已定位原文档'));
  assert.match(await page.locator('#workflowCandidate').textContent(), /验证候选必须先审阅/);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#workflowHistory .workflow-history-item', { hasText: '流程 · echo' }).first().getByRole('button', { name: '恢复写入前' }).click();
  await page.waitForFunction(before => document.getElementById('mainEditor')?.value === before, noteBeforeApply);
  assert.equal(await page.locator('#mainEditor').inputValue(), noteBeforeApply);

  await page.evaluate(() => showImportPreview({
    name: '安全预览',
    chapters: [{ title: '<img src=x onerror=window.__importXss=1>', content: '测试', word_count: 2 }]
  }));
  assert.equal(await page.evaluate(() => window.__importXss || 0), 0);
  assert.equal(await page.locator('#importPreviewContent img').count(), 0);
  await page.evaluate(() => closeModal('importPreviewModal'));

  await page.locator('.ai-tab', { hasText: '助手' }).click();
  await page.waitForFunction(() => document.getElementById('desktopContextMeter')?.offsetParent !== null);
  assert.match(await page.locator('#ctxText').textContent(), /tokens/);
  assert.match(await page.locator('#ctxText').textContent(), /上限未知/, 'unknown model must not claim a fabricated context limit');
  await page.locator('.ai-tab', { hasText: '对比' }).click();
  await page.evaluate(() => {
    S.multiRunSnapshot = makeEditorSnapshot();
    const failed = document.getElementById('slotResult1');
    failed.textContent = '✕ 模拟网络失败';
    failed.dataset.state = 'error';
    failed.classList.remove('has-content');
  });
  const beforeFailedApply = await page.locator('#mainEditor').inputValue();
  await page.evaluate(() => applySlotToEditor(1));
  assert.equal(await page.locator('#mainEditor').inputValue(), beforeFailedApply, 'failed multi-model output must not be insertable');
  assert.deepEqual(errors, [], `desktop browser errors:\n${errors.join('\n')}`);

  const adminPage = await desktop.newPage();
  const adminErrors = await collectErrors(adminPage);
  await adminPage.goto(`${baseURL}/admin.html`, { waitUntil: 'networkidle' });
  await adminPage.waitForFunction(() => document.getElementById('apiStatus')?.textContent === '本地服务已连接');
  await adminPage.getByRole('button', { name: '外部能力目录' }).click();
  await adminPage.waitForFunction(() => document.querySelectorAll('#externalCatalogList .list-item').length >= 8);
  const filesystemSource = adminPage.locator('#externalCatalogList .list-item', { hasText: 'MCP Filesystem' });
  await filesystemSource.getByRole('button', { name: '登记元数据' }).click();
  await adminPage.waitForFunction(() => document.getElementById('externalMsg')?.textContent.includes('没有下载或执行'));
  const externalCapability = await adminPage.evaluate(async () => {
    const data = await fetch('/api/capabilities').then(response => response.json());
    return data.capabilities.find(item => item.id === 'external-mcp-filesystem');
  });
  assert.equal(externalCapability.enabled, false);
  assert.equal(externalCapability.entry, 'external:mcp-server');
  assert.deepEqual(adminErrors, [], `admin browser errors:\n${adminErrors.join('\n')}`);

  const pagesContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pagesPage = await pagesContext.newPage();
  const pagesErrors = await collectErrors(pagesPage);
  const corsMock = await startCorsMock();
  let configPosts = 0;
  pagesPage.on('request', request => {
    if (request.url().endsWith('/api/config') && request.method() === 'POST') configPosts += 1;
  });
  await pagesPage.goto(`${baseURL}/app.html?api_mode=browser`, { waitUntil: 'networkidle' });
  await pagesPage.waitForFunction(() => WW_BROWSER_API_MODE === true);
  assert.equal(await pagesPage.locator('#serviceConsoleBtn').isHidden(), true, 'Pages workbench must not expose the local service console');
  assert.notEqual(await pagesPage.locator('#workflowServiceLink').getAttribute('hidden'), null, 'Pages workflow must hide the local service console link');
  await pagesPage.evaluate(() => {
    localStorage.setItem('ww_cookie_consent', '1');
    openModal('apiModal');
    const custom = document.querySelector('#providerGrid .provider-chip[onclick*="custom"]');
    selectProvider(custom, 'custom');
  });
  await pagesPage.locator('#apiBaseUrl').fill(`${corsMock.origin}/v1`);
  await pagesPage.locator('#apiKey').fill('browser-test-key');
  await pagesPage.locator('#apiModel').fill('test-model');
  await pagesPage.locator('#apiModal .api-advanced > summary').click();
  await pagesPage.locator('#apiContextLimit').fill('32768');
  await pagesPage.locator('#apiHeaders').fill('{"X-Route":"pages"}');
  await pagesPage.getByRole('button', { name: '获取模型' }).first().click();
  await pagesPage.waitForFunction(() => document.getElementById('testResult')?.textContent.includes('已读取 2 个模型'));
  assert.equal(corsMock.state.modelRequests, 1, 'Pages must read the real cross-origin model endpoint');
  assert.deepEqual(await pagesPage.locator('#apiModelList option').evaluateAll(options => options.map(option => option.value)), ['test-model', 'gpt-5.6-luna']);
  assert.equal(
    await pagesPage.locator('#apiModal .btn-confirm').getAttribute('onclick'),
    'saveApi()',
    'Pages API modal save button should invoke saveApi()',
  );
  const preparedPagesConfig = await pagesPage.evaluate(() => apiFormConfig());
  assert.equal(preparedPagesConfig.provider, 'custom');
  assert.equal(preparedPagesConfig.transport, 'browser');
  assert.equal(preparedPagesConfig.baseUrl, `${corsMock.origin}/v1`);
  assert.equal(preparedPagesConfig.model, 'test-model');
  await pagesPage.evaluate(() => saveApi());
  assert.equal(
    await pagesPage.locator('#apiModal').evaluate((element) => element.classList.contains('show')),
    false,
    'Pages API modal should close after saving browser-local config',
  );
  const browserConfig = await pagesPage.evaluate(() => JSON.parse(localStorage.getItem('ww_api') || '{}'));
  assert.deepEqual(browserConfig, {
    provider: 'custom',
    key: 'browser-test-key',
    model: 'test-model',
    baseUrl: `${corsMock.origin}/v1`,
    type: 'openai',
    protocol: 'auto',
    authMode: 'auto',
    timeout: 60000,
    contextLimit: 32768,
    customHeaders: '{"X-Route":"pages"}',
    bodyOverrides: '',
    exactEndpoint: false,
    bridgeUrl: '',
    bridgeToken: '',
    transport: 'browser'
  });
  assert.equal(configPosts, 0, 'Pages save must not POST to static /api/config');
  await pagesPage.evaluate(() => openModal('apiModal'));
  await pagesPage.locator('#apiModal button[onclick="testApi()"]').click();
  await pagesPage.waitForFunction(() => document.getElementById('testResult')?.textContent.includes('✓ OK'));
  assert.equal(configPosts, 0, 'Pages API test must not POST to static /api/config');
  const directRequest = corsMock.state.requests.at(-1);
  assert.ok(corsMock.state.preflights >= 1, 'Pages request must pass a real cross-origin browser preflight');
  assert.equal(directRequest.path, '/v1/chat/completions');
  assert.equal(directRequest.authorization, 'Bearer browser-test-key');
  assert.equal(directRequest.route, 'pages');
  assert.equal(directRequest.body.provider, undefined, 'browser request must not leak internal proxy fields');
  assert.equal(directRequest.body.model, 'test-model');
  assert.match(directRequest.body.messages[0].content, /Reply with exactly: OK/);

  const projectFactRun = await pagesPage.evaluate(async () => {
    const now = Date.now();
    const worldMarker = 'PAGES_WORLD_RULE_MARKER_北岸渡口只在落潮后开放';
    const outlineMarker = 'PAGES_OUTLINE_PLAN_MARKER_此节点尚未发生';
    const projectId = await importProjectBundleAtomic({
      version: 6,
      project: { name: 'Pages 项目事实验收', genre: '长篇', description: '验证大纲和世界观进入真实请求', world_setting: worldMarker, created_at: now, updated_at: now },
      outlines: [{ title: '第一卷规划', content: outlineMarker, sort_order: 0, created_at: now }],
      characters: [{ name: '陈亦', role: '主角', personality: '只相信亲眼所见', background: '不知道渡口规则的来源', skills: '无' }],
      chapters: [{ title: '第一章 潮痕', content: '陈亦站在封闭的渡口前。', sort_order: 0, word_count: 12, created_at: now }],
      notes: [], memories: [], history: [], categories: []
    });
    await loadProjects();
    await loadProject(projectId);
    await loadWorldContent();
    const worldVisible = document.getElementById('mainEditor').value.includes(worldMarker);
    document.getElementById('mainEditor').value += '\nPAGES_WORLD_EDIT_MARKER_月蚀时规则暂停';
    onEditorInput();
    await saveDoc({ silent: true });
    await loadChapterContent(S.proj.chapters[0].id);
    S.aiMode = '续写';
    setAIContextMode('current');
    const request = buildGenerationRequest('严格核对世界规则和大纲节点');
    const response = await callAITask('skill.续写', request.prompt, S.apiConfig, request.systemPrompt);
    return {
      response,
      worldVisible,
      worldRows: document.querySelectorAll('#outlineList .outline-item').length,
      outlines: S.proj.outlines.length,
      chapters: S.proj.chapters.length,
      contextFull: request.projectContext.full,
      contextChars: request.projectContext.packet.sourceText.length
    };
  });
  assert.equal(projectFactRun.response, 'OK');
  assert.equal(projectFactRun.worldVisible, true, 'imported world setting must be visible and editable in the Pages library');
  assert.equal(projectFactRun.worldRows, 2, 'world setting must be a distinct library row beside the outline');
  assert.equal(projectFactRun.outlines, 1);
  assert.equal(projectFactRun.chapters, 1, 'world and outline records must not become prose chapters');
  assert.equal(projectFactRun.contextFull, true);
  assert.ok(projectFactRun.contextChars > 100);
  const projectFactRequest = corsMock.state.requests.at(-1);
  const projectFactBody = projectFactRequest.body.messages.map(message => message.content || '').join('\n');
  assert.match(projectFactBody, /PAGES_WORLD_RULE_MARKER_北岸渡口只在落潮后开放/);
  assert.match(projectFactBody, /PAGES_WORLD_EDIT_MARKER_月蚀时规则暂停/);
  assert.match(projectFactBody, /PAGES_OUTLINE_PLAN_MARKER_此节点尚未发生/);
  assert.match(projectFactBody, /人物卡与知识边界/);
  assert.match(projectFactBody, /大纲是未来规划/);

  await pagesPage.locator('#apiBaseUrl').fill(`${corsMock.origin}/custom/invoke?route=pages`);
  await pagesPage.locator('#apiExactEndpoint').check();
  await pagesPage.locator('#apiBodyOverrides').fill('{"max_tokens":null,"max_completion_tokens":128}');
  await pagesPage.getByRole('button', { name: '预览实际请求' }).first().click();
  assert.match(await pagesPage.locator('#apiDiagnostic').textContent(), /\/custom\/invoke\?route=pages/);
  assert.match(await pagesPage.locator('#apiDiagnostic').textContent(), /Bearer ••••/);
  assert.doesNotMatch(await pagesPage.locator('#apiDiagnostic').textContent(), /browser-test-key/);
  await pagesPage.locator('#apiModal button[onclick="testApi()"]').click();
  await pagesPage.waitForFunction(() => document.getElementById('testResult')?.textContent.includes('✓ OK'));
  const exactRequest = corsMock.state.requests.at(-1);
  assert.equal(exactRequest.path, '/custom/invoke?route=pages');
  assert.equal(exactRequest.body.max_tokens, undefined);
  assert.equal(exactRequest.body.max_completion_tokens, 128);

  const bridgeURL = process.env.WW_TEST_BRIDGE_URL || '';
  const bridgeToken = process.env.WW_TEST_BRIDGE_TOKEN || '';
  if (bridgeURL && bridgeToken) {
    await pagesPage.locator('#apiProtocol').selectOption('openai-chat');
    await pagesPage.locator('#apiAuthMode').selectOption('bearer');
    await pagesPage.locator('#apiBaseUrl').fill(`${corsMock.origin}/v1`);
    await pagesPage.locator('#apiExactEndpoint').uncheck();
    await pagesPage.locator('#apiBodyOverrides').fill('');
    await pagesPage.locator('#apiBridgeUrl').fill(bridgeURL);
    await pagesPage.locator('#apiBridgeToken').fill(bridgeToken);
    await pagesPage.getByRole('button', { name: '预览实际请求' }).first().click();
    const bridgeDiagnostic = await pagesPage.locator('#apiDiagnostic').textContent();
    assert.match(bridgeDiagnostic, /HTTPS 桥 URL/);
    assert.match(bridgeDiagnostic, /桥后上游 URL/);
    assert.match(bridgeDiagnostic, /\/api\/http-bridge\/browser\/v1\/chat\/completions/);
    assert.doesNotMatch(bridgeDiagnostic, new RegExp(bridgeToken));

    await pagesPage.getByRole('button', { name: '获取模型' }).first().click();
    await pagesPage.waitForFunction(() => document.getElementById('testResult')?.textContent.includes('已读取 2 个模型'));
    assert.equal(corsMock.state.modelRequests, 2, 'Pages bridge must relay the model list request through Go');

    await pagesPage.locator('#apiModal button[onclick="testApi()"]').click();
    await pagesPage.waitForFunction(() => document.getElementById('testResult')?.textContent.includes('✓ OK'));
    const bridgedRequest = corsMock.state.requests.at(-1);
    assert.equal(bridgedRequest.path, '/v1/chat/completions');
    assert.equal(bridgedRequest.authorization, 'Bearer browser-test-key');
    assert.equal(bridgedRequest.bridgeToken, undefined, 'Go bridge token must never reach the model provider');

    const longBridgeResult = await pagesPage.evaluate(async () => {
      const conf = apiFormConfig();
      const runtime = _runtimeConfig(conf, PROVIDERS.custom);
      const content = '长篇桥接记忆。'.repeat(50000);
      const response = await WWApiAdapter.request(runtime, [{ role: 'user', content }], { maxTokens: 64 });
      return { text: response.text, contentLength: content.length, transport: response.transport };
    });
    assert.equal(longBridgeResult.text, 'OK');
    assert.equal(longBridgeResult.transport, 'bridge');
    assert.equal(corsMock.state.requests.at(-1).body.messages[0].content.length, longBridgeResult.contentLength);
    assert.ok(longBridgeResult.contentLength >= 300000, 'bridge browser smoke must exercise a long AI request');

    await pagesPage.locator('#apiBridgeUrl').fill('');
    await pagesPage.locator('#apiBridgeToken').fill('');
  }

  await pagesPage.locator('#apiProtocol').selectOption('ollama');
  await pagesPage.locator('#apiAuthMode').selectOption('none');
  await pagesPage.locator('#apiBaseUrl').fill('http://127.0.0.1:11434');
  await pagesPage.locator('#apiExactEndpoint').uncheck();
  await pagesPage.locator('#apiBodyOverrides').fill('');
  await pagesPage.locator('#apiClearKey').check();
  await pagesPage.locator('#apiClearHeaders').check();
  await pagesPage.evaluate(() => saveApi());
  const keylessConfig = await pagesPage.evaluate(() => JSON.parse(localStorage.getItem('ww_api') || '{}'));
  assert.equal(keylessConfig.authMode, 'none');
  assert.equal(keylessConfig.protocol, 'ollama');
  assert.equal(keylessConfig.key, '');
  assert.equal(keylessConfig.customHeaders, '');
  assert.equal(configPosts, 0, 'keyless Pages save must not POST to static /api/config');
  assert.deepEqual(pagesErrors, [], `Pages browser API errors:\n${pagesErrors.join('\n')}`);
  await corsMock.close();
  await pagesContext.close();

  const staticContext = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const staticPage = await staticContext.newPage();
  const staticErrors = await collectErrors(staticPage);
  await staticPage.route('**/api/health', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'static-host-without-go-backend' })
  }));
  await staticPage.goto(`${baseURL}/app.html`, { waitUntil: 'networkidle' });
  await staticPage.waitForFunction(() => WW_BROWSER_API_MODE === true);
  assert.equal(await staticPage.evaluate(() => apiStorageDescription().includes('当前浏览器')), true, 'custom static host should use browser API mode');
  const staticAdmin = await staticContext.newPage();
  const staticAdminErrors = await collectErrors(staticAdmin);
  await staticAdmin.route('**/api/health', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'static-host-without-go-backend' })
  }));
  await staticAdmin.goto(`${baseURL}/admin.html`, { waitUntil: 'networkidle' });
  await staticAdmin.waitForFunction(() => document.getElementById('apiStatus')?.textContent === '未连接本地服务 · 浏览器 API');
  assert.equal(await staticAdmin.locator('[data-requires-service]:visible').count(), 0, 'static console must hide every server-only tab');
  assert.match(await staticAdmin.locator('#runtimeNotice').textContent(), /不是 Writing Workshop 在线版的“后台”/);
  assert.deepEqual(staticErrors, [], `custom static-host detection errors:\n${staticErrors.join('\n')}`);
  assert.deepEqual(staticAdminErrors, [], `custom static admin detection errors:\n${staticAdminErrors.join('\n')}`);
  await staticContext.close();

  const mobilePage = await desktop.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  const mobileErrors = await collectErrors(mobilePage);
  await mobilePage.goto(`${baseURL}/app.html`, { waitUntil: 'networkidle' });
  await mobilePage.waitForFunction(() => document.getElementById('currentProjectName')?.textContent === '浏览器验收项目');
  await mobilePage.locator('#bottomNav .btab', { hasText: '笔记' }).click();
  await mobilePage.waitForFunction(() => document.getElementById('mp-notes')?.classList.contains('on'));
  await mobilePage.waitForFunction(() => document.querySelector('#mpNoteList .oi-text')?.textContent === '未手动保存的设定核对');
  await mobilePage.locator('#bottomNav .btab', { hasText: 'AI' }).click();
  await mobilePage.waitForFunction(() => document.getElementById('mp-ai')?.classList.contains('on'));
  assert.equal(await mobilePage.locator('#mpAiContextMode').inputValue(), 'smart');
  await mobilePage.locator('#mpAiContextMode').selectOption('current');
  assert.equal(await mobilePage.evaluate(() => getAIContextMode()), 'current');
  assert.deepEqual(mobileErrors, [], `mobile browser errors:\n${mobileErrors.join('\n')}`);

  const doomedProjectId = await page.evaluate(async () => {
    const id = await dbPut('projects', { name: '待原子删除项目', genre: 'test', created_at: Date.now(), updated_at: Date.now() });
    for (const store of ['outlines', 'characters', 'chapters', 'notes', 'aiMemories', 'aiHistory']) {
      await dbPut(store, { project_id: id, title: store, name: store, content: store, text: store, time: Date.now() });
    }
    await loadProjects();
    return id;
  });
  await page.evaluate(() => openModal('projectModal'));
  const doomedCard = page.locator('#projectList .project-list-item', { hasText: '待原子删除项目' });
  page.once('dialog', dialog => dialog.accept());
  await doomedCard.getByRole('button', { name: '删除' }).click();
  await page.waitForFunction(async id => {
    if (await dbGet('projects', id)) return false;
    const stores = ['outlines', 'characters', 'chapters', 'notes', 'aiMemories', 'aiHistory'];
    const rows = await Promise.all(stores.map(store => dbByIndex(store, 'project_id', id)));
    return rows.every(items => items.length === 0);
  }, doomedProjectId);
  assert.deepEqual(errors, [], `desktop browser errors after project cleanup:\n${errors.join('\n')}`);

  await desktop.close();
  console.log('Browser smoke OK: transactional editor switching/export, long-book hierarchy, v1-v5 to v6 migration, guarded candidates, corpus refinement, Pages/custom-static BYOK, desktop/mobile context controls.');
} finally {
  await browser.close();
}
