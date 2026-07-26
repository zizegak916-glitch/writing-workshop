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

  await page.evaluate(() => showImportPreview({
    name: '安全预览',
    chapters: [{ title: '<img src=x onerror=window.__importXss=1>', content: '测试', word_count: 2 }]
  }));
  assert.equal(await page.evaluate(() => window.__importXss || 0), 0);
  assert.equal(await page.locator('#importPreviewContent img').count(), 0);
  await page.evaluate(() => closeModal('importPreviewModal'));

  await page.waitForFunction(() => document.getElementById('desktopContextMeter')?.offsetParent !== null);
  assert.match(await page.locator('#ctxText').textContent(), /tokens/);
  assert.deepEqual(errors, [], `desktop browser errors:\n${errors.join('\n')}`);

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
  console.log('Browser smoke OK: desktop project/notes/import/context and mobile notes navigation.');
} finally {
  await browser.close();
}
