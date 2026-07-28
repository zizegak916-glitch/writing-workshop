import assert from 'node:assert/strict';
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

  const bundle = await page.evaluate(async () => {
    const project = S.proj.project;
    return {
      version: 4,
      project,
      notes: await dbByIndex('notes', 'project_id', project.id)
    };
  });
  assert.equal(bundle.notes.length, 1);
  assert.equal(bundle.notes[0].title, '设定核对');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.getElementById('currentProjectName')?.textContent === '浏览器验收项目');
  await page.locator('.nav-tab', { hasText: '笔记' }).click();
  await page.waitForFunction(() => document.querySelector('#noteList .oi-text')?.textContent === '设定核对');
  await page.locator('#noteList .outline-item', { hasText: '设定核对' }).click();

  const migrations = await page.evaluate(() => {
    const fixtures = [
      { version: 1, project: { name: 'v1' }, chapters: [{ title: '旧章', content: '旧正文' }] },
      { version: 2, project: { name: 'v2' }, aiMemories: [{ content: '旧记忆' }] },
      {
        version: 3,
        project: { name: 'v3', category_ids: ['history'] },
        custom_categories: [{ id: 'history', name: '考据' }],
        promptSkills: { overrides: { '润色': { prompt: '保留事实' } } }
      }
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
        notes: migrated.notes.length
      };
    });
  });
  assert.deepEqual(migrations, [
    { version: 4, sourceVersion: 1, chapters: 1, memories: 0, categories: 0, prompt: '', notes: 0 },
    { version: 4, sourceVersion: 2, chapters: 0, memories: 1, categories: 0, prompt: '', notes: 0 },
    { version: 4, sourceVersion: 3, chapters: 0, memories: 0, categories: 1, prompt: '保留事实', notes: 0 }
  ]);

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
  await pagesPage.locator('#apiModal .btn-confirm').click();
  await pagesPage.waitForFunction(() => !document.getElementById('apiModal')?.classList.contains('show'));
  const browserConfig = await pagesPage.evaluate(() => JSON.parse(localStorage.getItem('ww_api') || '{}'));
  assert.deepEqual(browserConfig, {
    provider: 'custom',
    key: 'browser-test-key',
    model: 'test-model',
    baseUrl: 'https://mock-api.example/v1',
    type: 'openai',
    transport: 'browser'
  });
  assert.equal(configPosts, 0, 'Pages save must not POST to static /api/config');
  await pagesPage.evaluate(() => openModal('apiModal'));
  await pagesPage.locator('#apiModal .btn-test').click();
  await pagesPage.waitForFunction(() => document.getElementById('testResult')?.textContent.includes('✓ OK'));
  assert.equal(configPosts, 0, 'Pages API test must not POST to static /api/config');
  assert.equal(directRequest.authorization, 'Bearer browser-test-key');
  assert.equal(directRequest.body.provider, undefined, 'browser request must not leak internal proxy fields');
  assert.equal(directRequest.body.model, 'test-model');
  assert.match(directRequest.body.messages[0].content, /Reply with exactly: OK/);
  assert.deepEqual(pagesErrors, [], `Pages browser API errors:\n${pagesErrors.join('\n')}`);
  await pagesContext.close();

  const mobilePage = await desktop.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  const mobileErrors = await collectErrors(mobilePage);
  await mobilePage.goto(`${baseURL}/app.html`, { waitUntil: 'networkidle' });
  await mobilePage.waitForFunction(() => document.getElementById('currentProjectName')?.textContent === '浏览器验收项目');
  await mobilePage.locator('#bottomNav .btab', { hasText: '笔记' }).click();
  await mobilePage.waitForFunction(() => document.getElementById('mp-notes')?.classList.contains('on'));
  await mobilePage.waitForFunction(() => document.querySelector('#mpNoteList .oi-text')?.textContent === '设定核对');
  assert.deepEqual(mobileErrors, [], `mobile browser errors:\n${mobileErrors.join('\n')}`);

  await desktop.close();
  console.log('Browser smoke OK: v1-v3 migration, guarded candidate recovery, Pages browser BYOK, desktop project/notes/import/context and mobile notes navigation.');
} finally {
  await browser.close();
}
