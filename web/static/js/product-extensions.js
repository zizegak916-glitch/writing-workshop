(function () {
  'use strict';

  const CATEGORY_KEY = 'ww_custom_categories';
  const COLORS = ['#3155D9', '#F26B5B', '#7BD8B2', '#F2B544', '#A98DE8', '#8FC7EF'];

  function text(value) { return String(value == null ? '' : value); }
  function safeFileName(value) { return text(value || 'writing-project').replace(/[\\/:*?"<>|]+/g, '-'); }
  function getCategories() {
    try {
      const value = JSON.parse(localStorage.getItem(CATEGORY_KEY) || '[]');
      return Array.isArray(value) ? value.filter(item => item && item.id && item.name) : [];
    } catch (_) { return []; }
  }
  function saveCategories(items) { localStorage.setItem(CATEGORY_KEY, JSON.stringify(items)); }
  function categoryById(id) { return getCategories().find(item => item.id === id); }
  function categoryName(id) { return categoryById(id)?.name || id; }
  window.wwCategoryLabel = categoryName;
  function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }
  function downloadJSON(value, filename) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function injectProjectTools() {
    const list = document.getElementById('projectList');
    if (!list || document.getElementById('projectManagerTools')) return;
    const tools = document.createElement('div');
    tools.id = 'projectManagerTools';
    tools.className = 'project-manager-tools';
    tools.innerHTML = '<input class="form-input" id="projectSearch" placeholder="搜索项目名称、类型或分类"><select class="form-input" id="projectCategoryFilter"><option value="">全部分类</option></select><button class="btn-cancel" type="button" id="manageProjectCategories">分类管理</button>';
    list.before(tools);
    tools.querySelector('#projectSearch').addEventListener('input', () => window.renderProjectList());
    tools.querySelector('#projectCategoryFilter').addEventListener('change', () => window.renderProjectList());
    tools.querySelector('#manageProjectCategories').addEventListener('click', openCategoryManager);
    renderCategoryFilter();

    const fakeUrlRow = document.getElementById('importUrlInput')?.parentElement;
    if (fakeUrlRow) fakeUrlRow.remove();

    const newModal = document.querySelector('#newProjectModal .modal-footer');
    if (newModal && !document.getElementById('newProjectCategories')) {
      const row = document.createElement('div');
      row.className = 'form-row';
      row.innerHTML = '<div class="form-label">自定义分类 <span class="form-hint">可多选</span></div><div class="project-category-picks" id="newProjectCategories"></div>';
      newModal.before(row);
      renderNewProjectCategories();
    }
  }

  function renderCategoryFilter() {
    const select = document.getElementById('projectCategoryFilter');
    if (!select) return;
    const current = select.value;
    select.replaceChildren(new Option('全部分类', ''));
    getCategories().forEach(item => select.add(new Option(item.name, item.id)));
    select.value = current;
  }

  function renderNewProjectCategories() {
    const root = document.getElementById('newProjectCategories');
    if (!root) return;
    root.replaceChildren();
    const items = getCategories().filter(item => item.scope === 'all' || item.scope === 'project');
    if (!items.length) {
      const empty = document.createElement('span');
      empty.className = 'project-manager-empty';
      empty.textContent = '尚未创建分类，可在“我的项目 → 分类管理”中添加。';
      root.appendChild(empty);
      return;
    }
    items.forEach(item => {
      const label = document.createElement('label');
      label.className = 'project-category-pick';
      label.style.setProperty('--category-color', item.color || '#8FC7EF');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = item.id;
      label.append(input, document.createTextNode(item.name));
      root.appendChild(label);
    });
  }

  function openCategoryManager() {
    let overlay = document.getElementById('projectCategoryManager');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id = 'projectCategoryManager';
      overlay.innerHTML = '<div class="modal"><div class="modal-title">自定义分类</div><div class="modal-sub">分类保存在当前浏览器，可用于筛选和组织项目。</div><div id="projectCategoryRows"></div><div class="project-category-create"><input class="form-input" id="projectCategoryName" placeholder="例如：考据、待重构、合作项目"><input id="projectCategoryColor" type="color" value="#8FC7EF"><select class="form-input" id="projectCategoryScope"><option value="project">项目</option><option value="all">全部</option><option value="memory">记忆</option><option value="capability">能力</option></select><button class="btn-confirm" type="button" id="projectCategoryCreate">添加</button></div><div class="modal-footer"><button class="btn-cancel" type="button" id="projectCategoryClose">完成</button></div></div>';
      document.body.appendChild(overlay);
      overlay.querySelector('#projectCategoryCreate').addEventListener('click', createCategory);
      overlay.querySelector('#projectCategoryClose').addEventListener('click', () => overlay.classList.remove('show'));
      overlay.addEventListener('click', event => { if (event.target === overlay) overlay.classList.remove('show'); });
    }
    renderCategoryManager();
    overlay.classList.add('show');
  }

  function createCategory() {
    const input = document.getElementById('projectCategoryName');
    const name = input.value.trim();
    if (!name) return window.showToast('✕', '请输入分类名称');
    const items = getCategories();
    items.push({ id: uid('category'), name, color: document.getElementById('projectCategoryColor').value || COLORS[items.length % COLORS.length], scope: document.getElementById('projectCategoryScope').value || 'project', created_at: new Date().toISOString() });
    saveCategories(items);
    input.value = '';
    renderCategoryManager();
    refreshCategoryUI();
  }

  function renderCategoryManager() {
    const root = document.getElementById('projectCategoryRows');
    if (!root) return;
    root.replaceChildren();
    const items = getCategories();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'project-manager-empty';
      empty.textContent = '暂无自定义分类。';
      root.appendChild(empty);
      return;
    }
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'project-category-row';
      const dot = document.createElement('span');
      dot.className = 'project-category-dot';
      dot.style.background = item.color || '#8FC7EF';
      const copy = document.createElement('span');
      copy.textContent = `${item.name} · ${item.scope || 'project'}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'project-mini-button danger';
      remove.textContent = '删除';
      remove.addEventListener('click', () => deleteCategory(item.id));
      row.append(dot, copy, remove);
      root.appendChild(row);
    });
  }

  async function deleteCategory(id) {
    const item = categoryById(id);
    if (!item || !confirm(`删除分类“${item.name}”？项目本身不会被删除。`)) return;
    saveCategories(getCategories().filter(category => category.id !== id));
    if (window.S?.projects) {
      for (const project of S.projects) {
        const ids = (project.category_ids || []).filter(categoryId => categoryId !== id);
        if (ids.length !== (project.category_ids || []).length) await dbPut('projects', { ...project, category_ids: ids, updated_at: Date.now() });
      }
      await loadProjects();
    }
    renderCategoryManager();
    refreshCategoryUI();
  }

  function refreshCategoryUI() {
    renderCategoryFilter();
    renderNewProjectCategories();
    renderMemoryCategories();
    window.renderProjectList?.();
  }

  function renderMemoryCategories() {
    const root = document.getElementById('memCatGrid');
    if (!root) return;
    root.querySelectorAll('[data-custom-memory-category]').forEach(node => node.remove());
    getCategories().filter(item => item.scope === 'all' || item.scope === 'memory').forEach(item => {
      const chip = document.createElement('div');
      chip.className = 'genre-chip';
      chip.dataset.customMemoryCategory = '1';
      chip.dataset.categoryId = item.id;
      chip.style.setProperty('--category-color', item.color || '#8FC7EF');
      chip.textContent = `● ${item.name}`;
      chip.addEventListener('click', () => window.toggleMemCat(chip));
      root.appendChild(chip);
    });
  }

  async function projectBundle(id) {
    const project = await dbGet('projects', id);
    if (!project) throw new Error('项目不存在');
    const [outlines, characters, chapters, memories] = await Promise.all([
      dbByIndex('outlines', 'project_id', id),
      dbByIndex('characters', 'project_id', id),
      dbByIndex('chapters', 'project_id', id),
      dbByIndex('aiMemories', 'project_id', id)
    ]);
    return { version: 2, exported_at: new Date().toISOString(), project, outlines, characters, chapters, memories };
  }

  async function exportProjectById(id) {
    try {
      const bundle = await projectBundle(id);
      downloadJSON(bundle, `${safeFileName(bundle.project.name)}.json`);
      window.showToast('↓', '项目已导出');
    } catch (error) { window.showToast('✕', error.message); }
  }

  async function renameProject(id) {
    const project = await dbGet('projects', id);
    if (!project) return;
    const next = prompt('新的项目名称', project.name || '');
    if (next == null || !next.trim()) return;
    project.name = next.trim();
    project.updated_at = Date.now();
    await dbPut('projects', project);
    await loadProjects();
    if (S.proj?.project?.id === id) await loadProject(id);
    window.renderProjectList();
  }

  async function duplicateProject(id) {
    try {
      const bundle = await projectBundle(id);
      const now = Date.now();
      const source = bundle.project;
      const copy = { ...source, name: `${source.name || '未命名项目'} · 副本`, created_at: now, updated_at: now };
      delete copy.id;
      const newId = await dbPut('projects', copy);
      for (const store of ['outlines', 'characters', 'chapters', 'aiMemories']) {
        for (const entry of bundle[store === 'aiMemories' ? 'memories' : store] || []) {
          const next = { ...entry, project_id: newId };
          delete next.id;
          await dbPut(store, next);
        }
      }
      await loadProjects();
      window.renderProjectList();
      window.showToast('✓', '项目副本已创建');
    } catch (error) { window.showToast('✕', error.message); }
  }

  async function editProjectCategories(id) {
    const project = await dbGet('projects', id);
    if (!project) return;
    const categories = getCategories().filter(item => item.scope === 'all' || item.scope === 'project');
    if (!categories.length) { openCategoryManager(); return; }
    const current = new Set(project.category_ids || []);
    const answer = prompt(`输入分类名称，以逗号分隔。可选：${categories.map(item => item.name).join('、')}`, categories.filter(item => current.has(item.id)).map(item => item.name).join('、'));
    if (answer == null) return;
    const names = new Set(answer.split(/[,，、]/).map(item => item.trim()).filter(Boolean));
    project.category_ids = categories.filter(item => names.has(item.name)).map(item => item.id);
    project.updated_at = Date.now();
    await dbPut('projects', project);
    await loadProjects();
    window.renderProjectList();
  }

  async function deleteProjectById(id) {
    const project = await dbGet('projects', id);
    if (!project || !confirm(`删除项目“${project.name}”及其大纲、人物、章节和记忆？此操作不可撤销，建议先导出。`)) return;
    for (const store of ['outlines', 'characters', 'chapters', 'aiMemories']) {
      const rows = await dbByIndex(store, 'project_id', id);
      for (const row of rows) await dbDel(store, row.id);
    }
    await dbDel('projects', id);
    if (S.proj?.project?.id === id) S.proj = null;
    await loadProjects();
    if (S.projects.length) await loadProject(S.projects[0].id);
    else {
      S.active = null;
      document.getElementById('currentProjectName').textContent = '选择项目...';
      document.getElementById('mainEditor').value = '';
      document.getElementById('chapterTitle').value = '';
      ['outlineList', 'chapterList', 'charList', 'mpOutlineList', 'mpChapterList', 'mpCharList'].forEach(id => {
        const node = document.getElementById(id);
        if (node) node.replaceChildren();
      });
      window.onEditorInput?.();
    }
    window.renderProjectList();
    window.showToast('✕', '项目已删除');
  }

  function projectAction(label, handler, danger) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `project-mini-button${danger ? ' danger' : ''}`;
    button.textContent = label;
    button.addEventListener('click', event => { event.stopPropagation(); handler(); });
    return button;
  }

  const originalCreateProject = window.createProject;
  window.createProject = async function () {
    const selected = [...document.querySelectorAll('#newProjectCategories input:checked')].map(input => input.value);
    const beforeId = S.proj?.project?.id;
    await originalCreateProject();
    if (!S.proj?.project || S.proj.project.id === beforeId || !selected.length) return;
    const project = { ...S.proj.project, category_ids: selected, updated_at: Date.now() };
    await dbPut('projects', project);
    S.proj.project = project;
    await loadProjects();
  };

  window.renderProjectList = function () {
    const root = document.getElementById('projectList');
    if (!root) return;
    const query = (document.getElementById('projectSearch')?.value || '').trim().toLowerCase();
    const category = document.getElementById('projectCategoryFilter')?.value || '';
    const projects = (S.projects || []).filter(project => {
      const categoryNames = (project.category_ids || []).map(categoryName).join(' ');
      const matchQuery = !query || `${project.name || ''} ${project.genre || ''} ${categoryNames}`.toLowerCase().includes(query);
      return matchQuery && (!category || (project.category_ids || []).includes(category));
    });
    root.replaceChildren();
    if (!projects.length) {
      const empty = document.createElement('div');
      empty.className = 'project-manager-empty';
      empty.textContent = (S.projects || []).length ? '没有符合筛选条件的项目。' : '暂无项目。';
      root.appendChild(empty);
      return;
    }
    projects.forEach(project => {
      const item = document.createElement('div');
      item.className = 'project-list-item project-managed-item';
      item.addEventListener('click', async () => { await loadProject(project.id); closeModal('projectModal'); });
      const head = document.createElement('div');
      head.className = 'project-managed-head';
      const name = document.createElement('div');
      name.className = 'pli-name';
      name.textContent = project.name || '未命名项目';
      const meta = document.createElement('div');
      meta.className = 'pli-meta';
      meta.textContent = `${project.genre || '未分类'} · ${new Date(project.updated_at || project.created_at || Date.now()).toLocaleDateString()}`;
      head.append(name, meta);
      const tags = document.createElement('div');
      tags.className = 'project-category-tags';
      (project.category_ids || []).forEach(id => {
        const categoryItem = categoryById(id);
        if (!categoryItem) return;
        const tag = document.createElement('span');
        tag.style.setProperty('--category-color', categoryItem.color || '#8FC7EF');
        tag.textContent = categoryItem.name;
        tags.appendChild(tag);
      });
      const actions = document.createElement('div');
      actions.className = 'project-managed-actions';
      actions.append(
        projectAction('重命名', () => renameProject(project.id)),
        projectAction('复制', () => duplicateProject(project.id)),
        projectAction('分类', () => editProjectCategories(project.id)),
        projectAction('导出', () => exportProjectById(project.id)),
        projectAction('删除', () => deleteProjectById(project.id), true)
      );
      item.append(head, tags, actions);
      root.appendChild(item);
    });
  };

  window.exportProject = async function () {
    if (!S.proj) return window.showToast('✕', t('toast-no-proj'));
    return exportProjectById(S.proj.project.id);
  };

  injectProjectTools();
  renderMemoryCategories();
})();
