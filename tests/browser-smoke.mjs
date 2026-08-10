import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
      version: 5,
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
  await page.locator('#outlineList .outline-item').first().click();
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
  await page.locator('#outlineList .outline-item').first().click();
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
  assert.equal(exportedBundle.version, 5);
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
      { version: 4, project: { name: 'v4' }, notes: [{ title: '旧笔记' }], aiHistory: [{ mode: '旧候选', text: '保留' }] }
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
    { version: 5, sourceVersion: 1, chapters: 1, memories: 0, categories: 0, prompt: '', notes: 0, history: 0 },
    { version: 5, sourceVersion: 2, chapters: 0, memories: 1, categories: 0, prompt: '', notes: 0, history: 0 },
    { version: 5, sourceVersion: 3, chapters: 0, memories: 0, categories: 1, prompt: '保留事实', notes: 0, history: 0 },
    { version: 5, sourceVersion: 4, chapters: 0, memories: 0, categories: 0, prompt: '', notes: 1, history: 1 }
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
  await page.locator('#outlineList .outline-item').first().click();
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
  await adminPage.waitForFunction(() => document.getElementById('apiStatus')?.textContent === '后端已连接');
  await adminPage.getByRole('button', { name: '公开能力目录' }).click();
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
  let configPosts = 0;
  let directRequest = null;
  pagesPage.on('request', request => {
    if (request.url().endsWith('/api/config') && request.method() === 'POST') configPosts += 1;
  });
  await pagesPage.route('https://mock-api.example/v1/chat/completions', async route => {
    const request = route.request();
    directRequest = {
      authorization: request.headers().authorization,
      route: request.headers()['x-route'],
      body: request.postDataJSON()
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: 'OK' } }],
        usage: { prompt_tokens: 8, completion_tokens: 1 }
      })
    });
  });
  await pagesPage.goto(`${baseURL}/app.html?api_mode=browser`, { waitUntil: 'networkidle' });
  await pagesPage.evaluate(() => {
    localStorage.setItem('ww_cookie_consent', '1');
    openModal('apiModal');
    const custom = document.querySelector('#providerGrid .provider-chip[onclick*="custom"]');
    selectProvider(custom, 'custom');
  });
  await pagesPage.locator('#apiBaseUrl').fill('https://mock-api.example/v1');
  await pagesPage.locator('#apiKey').fill('browser-test-key');
  await pagesPage.locator('#apiModel').fill('test-model');
  await pagesPage.locator('#apiModal .api-advanced > summary').click();
  await pagesPage.locator('#apiContextLimit').fill('32768');
  await pagesPage.locator('#apiHeaders').fill('{"X-Route":"pages"}');
  assert.equal(
    await pagesPage.locator('#apiModal .btn-confirm').getAttribute('onclick'),
    'saveApi()',
    'Pages API modal save button should invoke saveApi()',
  );
  const preparedPagesConfig = await pagesPage.evaluate(() => apiFormConfig());
  assert.equal(preparedPagesConfig.provider, 'custom');
  assert.equal(preparedPagesConfig.transport, 'browser');
  assert.equal(preparedPagesConfig.baseUrl, 'https://mock-api.example/v1');
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
    baseUrl: 'https://mock-api.example/v1',
    type: 'openai',
    protocol: 'auto',
    authMode: 'auto',
    timeout: 60000,
    contextLimit: 32768,
    customHeaders: '{"X-Route":"pages"}',
    transport: 'browser'
  });
  assert.equal(configPosts, 0, 'Pages save must not POST to static /api/config');
  await pagesPage.evaluate(() => openModal('apiModal'));
  await pagesPage.locator('#apiModal .btn-test').click();
  await pagesPage.waitForFunction(() => document.getElementById('testResult')?.textContent.includes('✓ OK'));
  assert.equal(configPosts, 0, 'Pages API test must not POST to static /api/config');
  assert.equal(directRequest.authorization, 'Bearer browser-test-key');
  assert.equal(directRequest.route, 'pages');
  assert.equal(directRequest.body.provider, undefined, 'browser request must not leak internal proxy fields');
  assert.equal(directRequest.body.model, 'test-model');
  assert.match(directRequest.body.messages[0].content, /Reply with exactly: OK/);

  await pagesPage.locator('#apiProtocol').selectOption('ollama');
  await pagesPage.locator('#apiAuthMode').selectOption('none');
  await pagesPage.locator('#apiBaseUrl').fill('http://127.0.0.1:11434');
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
  await staticAdmin.waitForFunction(() => document.getElementById('apiStatus')?.textContent === '静态在线版 · 浏览器 API');
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
  console.log('Browser smoke OK: transactional editor switching/export, v1-v4 to v5 migration, guarded candidates, Pages/custom-static BYOK, desktop context and mobile notes navigation.');
} finally {
  await browser.close();
}
