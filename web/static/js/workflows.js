(function () {
  'use strict';

  const WF = {
    capabilities: [],
    skillPacks: [],
    categories: [],
    candidate: '',
    candidateHistoryId: null,
    runSnapshot: null,
    controller: null,
    session: Number(localStorage.getItem('ww_workflow_session') || 1),
    backendReady: false,
    mounted: false
  };

  const CONTEXT_LABELS = {
    current: '当前选区 / 正文',
    project: '项目设定',
    outlines: '大纲',
    characters: '人物卡',
    memories: '记忆'
  };

  const FALLBACK_CATEGORIES = [
    { id: 'planning', name: '规划', color: '#3155D9' },
    { id: 'drafting', name: '写作', color: '#7BD8B2' },
    { id: 'revision', name: '修订', color: '#F26B5B' },
    { id: 'continuity', name: '连续性', color: '#A98DE8' },
    { id: 'research', name: '资料', color: '#F2B544' },
    { id: 'utility', name: '工具', color: '#8FC7EF' }
  ];

  const FALLBACK_CAPABILITIES = [
    { id: 'writing-workshop', name: 'Writing Workshop', type: 'backend', version: 'local', category: 'utility', entry: 'builtin:writing-workshop', output: 'text', enabled: true },
    { id: 'builtin-outline', name: '大纲拆分', type: 'skill', version: '1.0.0', category: 'planning', entry: 'builtin:outline', description: '把材料拆成可执行的大纲候选。', instructions: '根据输入建立清晰的事件顺序和章节节点。', steps: ['读取显式上下文', '拆分事件与章节节点', '输出候选大纲'], permissions: ['只读取本次显式上下文'], enabled: true },
    { id: 'builtin-rewrite', name: '通用改写', type: 'skill', version: '1.0.0', category: 'revision', entry: 'builtin:rewrite', description: '在保留原意的前提下生成改写候选。', instructions: '保持事实与人物意图，只优化表达。', steps: ['读取选区', '保留语义改写', '输出候选'], permissions: ['不自动写入正文'], enabled: true },
    { id: 'builtin-continuity', name: '连续性校准', type: 'skill', version: '1.0.0', category: 'continuity', entry: 'builtin:continuity', description: '检查事实、时间、动机和因果链。', instructions: '指出冲突并给出最小修改建议，不擅自补设定。', steps: ['提取事实约束', '核对时间与因果', '列出冲突和修复候选'], permissions: ['不覆盖原始设定'], enabled: true },
    { id: 'builtin-character-voice', name: '角色声音', type: 'skill', version: '1.0.0', category: 'drafting', entry: 'builtin:character-voice', description: '校准对白、行动与角色动机。', instructions: '保持角色既有经历、措辞习惯和信息边界。', steps: ['读取人物卡', '核对动机与知情范围', '生成角色一致候选'], permissions: ['不创造未经确认的角色事实'], enabled: true },
    { id: 'builtin-scene-pacing', name: '场景节奏', type: 'skill', version: '1.0.0', category: 'revision', entry: 'builtin:scene-pacing', description: '诊断场景推进、停顿和信息释放。', instructions: '不改变关键事件顺序，调整段落张力与节奏。', steps: ['标记场景节拍', '检查张弛与信息密度', '输出节奏修改候选'], permissions: ['不删除关键情节'], enabled: true }
  ];

  const FALLBACK_PACKS = [
    { id: 'longform-planning', name: '长篇规划校准', description: '大纲、连续性与角色声音。', category: 'planning', skill_ids: ['builtin-outline', 'builtin-continuity', 'builtin-character-voice'], enabled: true },
    { id: 'chapter-revision', name: '章节修订', description: '改写、场景节奏与连续性。', category: 'revision', skill_ids: ['builtin-rewrite', 'builtin-scene-pacing', 'builtin-continuity'], enabled: true },
    { id: 'character-dialogue', name: '角色与对白', description: '角色声音与连续性联合检查。', category: 'drafting', skill_ids: ['builtin-character-voice', 'builtin-continuity'], enabled: true }
  ];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[c]);
  }

  function currentContextPrefs() {
    try {
      return { current: true, project: true, outlines: false, characters: true, memories: true, ...JSON.parse(localStorage.getItem('ww_workflow_context') || '{}') };
    } catch (_) {
      return { current: true, project: true, outlines: false, characters: true, memories: true };
    }
  }

  function renderShell() {
    const prefs = currentContextPrefs();
    return `
      <div class="workflow-shell" id="workflowRoot">
        <section class="workflow-card">
          <div class="workflow-session">
            <div>
              <div class="workflow-kicker">Task ${String(WF.session).padStart(2, '0')}</div>
              <div class="workflow-title">创作流程</div>
            </div>
            <button class="workflow-ghost" type="button" onclick="workflowNewSession()">新任务</button>
          </div>
          <div class="workflow-help">上下文由你选择；输出先进入候选区，不会自动改正文或写入记忆。</div>
        </section>

        <section class="workflow-card">
          <label class="workflow-label" for="workflowTaskPrompt">这次要完成什么</label>
          <textarea class="workflow-textarea" id="workflowTaskPrompt" placeholder="例如：检查这一场的因果链，指出断点并给出一版保留人物性格的修改候选。"></textarea>
          <div class="workflow-row" style="margin-top:8px">
            <div>
              <label class="workflow-label" for="workflowTaskType">执行方式</label>
              <select class="workflow-select" id="workflowTaskType">
                <option value="generate">AI 执行</option>
                <option value="rewrite">AI 改写</option>
                <option value="outline">本地大纲拆分</option>
                <option value="echo">链路测试</option>
              </select>
            </div>
            <div>
              <label class="workflow-label" for="workflowBackend">后端</label>
              <select class="workflow-select" id="workflowBackend"><option value="">检测中…</option></select>
            </div>
          </div>
        </section>

        <section class="workflow-card">
          <div class="workflow-card-head">
            <div>
              <div class="workflow-label" style="margin:0">本次上下文包</div>
              <div class="workflow-muted">勾选什么，就只发送什么</div>
            </div>
            <button class="workflow-ghost" type="button" onclick="workflowRefreshContext()">刷新</button>
          </div>
          <div class="workflow-context-grid" style="margin-top:9px">
            ${Object.entries(CONTEXT_LABELS).map(([key, label]) => `
              <label class="workflow-check"><input type="checkbox" data-workflow-context="${key}" ${prefs[key] ? 'checked' : ''}><span>${label}</span></label>
            `).join('')}
          </div>
          <div class="workflow-context-meta"><span id="workflowContextSummary">尚未计算</span><span>发送完整内容</span></div>
          <details style="margin-top:7px">
            <summary class="workflow-muted" style="cursor:pointer">查看上下文预览</summary>
            <pre class="workflow-context-preview" id="workflowContextPreview">打开流程后自动生成</pre>
            <div class="workflow-help">这里只截取界面预览；实际发送内容不会静默截断。</div>
          </details>
        </section>

        <section class="workflow-card">
          <div class="workflow-card-head">
            <div>
              <div class="workflow-label" style="margin:0">组合能力</div>
              <div class="workflow-muted">步骤与权限保持可见</div>
            </div>
            <a class="workflow-ghost" style="text-decoration:none" href="admin.html">管理</a>
          </div>
          <div class="workflow-pack-list" id="workflowPackList"><div class="workflow-muted">正在读取技能包…</div></div>
          <div class="workflow-skill-tools">
            <select class="workflow-select" id="workflowSkillCategory" onchange="workflowFilterSkills()"><option value="">全部分类</option></select>
            <span class="workflow-selected" id="workflowSelectedSkills">已选 0 项</span>
            <button class="workflow-ghost" type="button" onclick="workflowClearSkills()">清空</button>
          </div>
          <div class="workflow-cap-list" id="workflowCapabilityList"><div class="workflow-muted">正在读取能力清单…</div></div>
        </section>

        <section class="workflow-card">
          <div class="workflow-card-head">
            <span class="workflow-status" id="workflowStatus">等待执行</span>
            <button class="workflow-danger" id="workflowAbortBtn" type="button" onclick="workflowAbort()" disabled>中断</button>
          </div>
          <button class="workflow-primary workflow-run" id="workflowRunBtn" type="button" onclick="workflowRun()" style="margin-top:9px">生成候选</button>
          <div class="workflow-help" id="workflowBackendHint">请求只发往当前站点的 <code>/api/run</code>，浏览器不跨域直连模型厂商。</div>
        </section>

        <section class="workflow-card" id="workflowCandidateCard">
          <div class="workflow-card-head">
            <div>
              <div class="workflow-label" style="margin:0">候选结果</div>
              <div class="workflow-muted" id="workflowCandidateMeta">尚未生成</div>
            </div>
            <button class="workflow-ghost" type="button" onclick="workflowCopyCandidate()">复制</button>
          </div>
          <div class="workflow-result empty" id="workflowCandidate">结果会先停在这里，等待你决定是否写入。</div>
          <div class="workflow-result-actions">
            <select class="workflow-select" id="workflowApplyMode">
              <option value="replace">替换运行时选区</option>
              <option value="insert">插入当前光标</option>
              <option value="append">追加到正文末尾</option>
            </select>
            <button class="workflow-secondary" id="workflowApplyBtn" type="button" onclick="workflowApplyCandidate()" disabled>写入正文</button>
            <button class="workflow-ghost" id="workflowMemoryBtn" type="button" onclick="workflowCandidateToMemory()" disabled>整理为记忆…</button>
          </div>
        </section>

        <section class="workflow-card">
          <div class="workflow-history-head">
            <div>
              <div class="workflow-label" style="margin:0">流程历史</div>
              <div class="workflow-muted">候选与写入前快照分开保存</div>
            </div>
            <button class="workflow-ghost" type="button" onclick="workflowRenderHistory()">刷新</button>
          </div>
          <div class="workflow-history" id="workflowHistory"><div class="workflow-muted">暂无流程记录</div></div>
        </section>
      </div>`;
  }

  function mount() {
    if (WF.mounted) return;
    const tabs = document.querySelector('.ai-tabs');
    const body = document.querySelector('.ai-panel-body');
    if (!tabs || !body) return;

    const tab = document.createElement('button');
    tab.className = 'ai-tab workflow-tab';
    tab.type = 'button';
    tab.textContent = '流程';
    tab.onclick = () => window.switchAiTab('workflow', tab);
    tabs.appendChild(tab);

    const panel = document.createElement('div');
    panel.id = 'aiTab-workflow';
    panel.style.display = 'none';
    panel.innerHTML = renderShell();
    body.appendChild(panel);

    const mobilePanel = document.getElementById('mp-ai');
    if (mobilePanel) {
      const entry = document.createElement('button');
      entry.type = 'button';
      entry.className = 'workflow-mobile-entry';
      entry.innerHTML = '打开创作流程 <span>选择上下文与能力，先预览候选，再决定是否写入</span>';
      entry.onclick = window.workflowOpenMobile;
      mobilePanel.prepend(entry);
    }

    const overlay = document.createElement('div');
    overlay.className = 'workflow-mobile-overlay';
    overlay.id = 'workflowMobileOverlay';
    overlay.innerHTML = '<div class="workflow-mobile-head"><span>创作流程</span><button class="workflow-ghost" type="button" onclick="workflowCloseMobile()">关闭</button></div><div class="workflow-mobile-body" id="workflowMobileMount"></div>';
    document.body.appendChild(overlay);

    document.querySelectorAll('[data-workflow-context]').forEach(input => input.addEventListener('change', onContextPreferenceChange));
    document.getElementById('workflowTaskPrompt').addEventListener('input', refreshContext);

    const legacySwitch = window.switchAiTab;
    window.switchAiTab = function (name, el) {
      const workflow = document.getElementById('aiTab-workflow');
      if (name !== 'workflow') {
        if (workflow) workflow.style.display = 'none';
        legacySwitch(name, el);
        return;
      }
      document.querySelectorAll('.ai-tab').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      ['modes', 'multi', 'memory', 'history'].forEach(id => {
        const node = document.getElementById('aiTab-' + id);
        if (node) node.style.display = 'none';
      });
      workflow.style.display = 'block';
      activate();
    };

    WF.mounted = true;
    refreshContext();
  }

  async function activate() {
    refreshContext();
    await Promise.allSettled([loadCapabilities(), renderHistory()]);
  }

  function onContextPreferenceChange() {
    const prefs = {};
    document.querySelectorAll('[data-workflow-context]').forEach(input => { prefs[input.dataset.workflowContext] = input.checked; });
    localStorage.setItem('ww_workflow_context', JSON.stringify(prefs));
    refreshContext();
  }

  function selectedContextKeys() {
    return [...document.querySelectorAll('[data-workflow-context]:checked')].map(input => input.dataset.workflowContext);
  }

  function activeDocumentLabel() {
    const title = document.getElementById('chapterTitle')?.value?.trim();
    const type = typeof S !== 'undefined' && S.active ? S.active.type : 'document';
    return `${type === 'chapter' ? '章节' : type === 'outline' ? '大纲' : type === 'character' ? '人物' : '文档'}：${title || '未命名'}`;
  }

  function collectContext() {
    const keys = selectedContextKeys();
    const blocks = [];
    const structured = {};
    const editor = document.getElementById('mainEditor');

    if (keys.includes('current') && editor) {
      const start = editor.selectionStart || 0;
      const end = editor.selectionEnd || 0;
      const selected = start !== end ? editor.value.slice(start, end) : editor.value;
      const label = start !== end ? `当前选区（${selected.length} 字符）` : activeDocumentLabel();
      blocks.push(`【${label}】\n${selected}`);
      structured.current = selected;
    }

    if (keys.includes('project') && typeof S !== 'undefined' && S.proj) {
      const p = S.proj.project || {};
      const text = [
        p.name && `作品：${p.name}`,
        p.genre && `类型：${p.genre}`,
        p.description && `简介：${p.description}`,
        p.world_setting && `世界观：${p.world_setting}`
      ].filter(Boolean).join('\n');
      if (text) blocks.push(`【项目设定】\n${text}`);
      structured.project = p;
    }

    if (keys.includes('outlines') && typeof S !== 'undefined' && S.proj) {
      const text = (S.proj.outlines || []).map((o, i) => `${i + 1}. ${o.title || '未命名'}\n${o.content || ''}`).join('\n\n');
      if (text) blocks.push(`【大纲】\n${text}`);
      structured.outlines = S.proj.outlines || [];
    }

    if (keys.includes('characters') && typeof S !== 'undefined' && S.proj) {
      const text = (S.proj.characters || []).map(c => [
        `${c.name || '未命名'}（${c.role || '未设定'}）`,
        c.personality && `性格：${c.personality}`,
        c.background && `背景：${c.background}`,
        c.appearance && `外貌：${c.appearance}`,
        c.skills && `能力：${c.skills}`
      ].filter(Boolean).join('\n')).join('\n\n');
      if (text) blocks.push(`【人物卡】\n${text}`);
      structured.characters = S.proj.characters || [];
    }

    if (keys.includes('memories') && typeof buildMemoryContext === 'function') {
      const text = buildMemoryContext();
      if (text) blocks.push(text);
      structured.memories = typeof S !== 'undefined' ? (S.aiMemories || []).filter(m => !S.proj || m.project_id === S.proj.project.id) : [];
    }

    const text = blocks.join('\n\n');
    return { text, structured, keys, chars: text.length, tokens: typeof estimateTokens === 'function' ? estimateTokens(text) : Math.ceil(text.length / 2) };
  }

  function refreshContext() {
    const context = collectContext();
    const summary = document.getElementById('workflowContextSummary');
    const preview = document.getElementById('workflowContextPreview');
    if (summary) summary.textContent = `${context.keys.length} 类 · ${context.chars.toLocaleString()} 字符 · 约 ${context.tokens.toLocaleString()} tokens`;
    if (preview) preview.textContent = context.text ? context.text.slice(0, 2400) + (context.text.length > 2400 ? '\n\n…界面预览到此，发送时仍包含完整内容。' : '') : '未选择上下文，或当前项目暂无对应内容。';
    return context;
  }

  async function loadCapabilities() {
    const list = document.getElementById('workflowCapabilityList');
    const backend = document.getElementById('workflowBackend');
    if (!list || !backend) return;
    try {
      const [capResponse, packResponse, categoryResponse] = await Promise.all([
        fetch('/api/capabilities', { headers: { Accept: 'application/json' } }),
        fetch('/api/skill-packs', { headers: { Accept: 'application/json' } }),
        fetch('/api/categories', { headers: { Accept: 'application/json' } })
      ]);
      const [data, packData, categoryData] = await Promise.all([
        capResponse.json().catch(() => ({})),
        packResponse.json().catch(() => ({})),
        categoryResponse.json().catch(() => ({}))
      ]);
      if (!capResponse.ok) throw new Error(data.error || `HTTP ${capResponse.status}`);
      WF.capabilities = (data.capabilities || []).filter(cap => cap.enabled);
      WF.skillPacks = packResponse.ok ? (packData.packs || []).filter(pack => pack.enabled) : FALLBACK_PACKS;
      WF.categories = categoryResponse.ok ? (categoryData.categories || []) : FALLBACK_CATEGORIES;
      WF.backendReady = true;
      const backends = WF.capabilities.filter(cap => cap.type === 'backend' || cap.type === 'project');
      backend.innerHTML = backends.length
        ? backends.map(cap => `<option value="${esc(cap.id)}" ${cap.id === 'writing-workshop' ? 'selected' : ''}>${esc(cap.name)}</option>`).join('')
        : '<option value="">内置执行器</option>';
      renderSkillCatalog();
      setStatus('ready', '后端已连接');
      document.getElementById('workflowBackendHint').innerHTML = '同源后端已连接。模型密钥由后端配置，浏览器不会跨域直连厂商。';
    } catch (error) {
      WF.backendReady = false;
      WF.capabilities = FALLBACK_CAPABILITIES;
      WF.skillPacks = FALLBACK_PACKS;
      WF.categories = FALLBACK_CATEGORIES;
      backend.innerHTML = '<option value="">后端不可用</option>';
      renderSkillCatalog();
      setStatus('error', '后端未连接');
      document.getElementById('workflowBackendHint').innerHTML = `当前显示可选技能目录，但执行需要同源后端。无法访问 <code>/api/capabilities</code>：${esc(error.message)}。请使用 <code>writing-workshop serve --demo</code>，不要让浏览器跨域直连模型厂商。`;
    }
  }

  function renderSkillCatalog() {
    renderCategoryFilter();
    renderSkillPacks();
    renderCapabilities();
    updateSelectedSkills();
  }

  function renderCategoryFilter() {
    const select = document.getElementById('workflowSkillCategory');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">全部分类</option>' + WF.categories.map(category => `<option value="${esc(category.id)}">${esc(category.name)}</option>`).join('');
    select.value = WF.categories.some(category => category.id === current) ? current : '';
  }

  function renderSkillPacks() {
    const list = document.getElementById('workflowPackList');
    if (!list) return;
    if (!WF.skillPacks.length) {
      list.innerHTML = '<div class="workflow-muted">暂无技能包；仍可逐项多选能力。</div>';
      return;
    }
    list.innerHTML = WF.skillPacks.map(pack => `<button class="workflow-pack" type="button" onclick="workflowApplySkillPack('${esc(pack.id)}')" title="${esc(pack.description || '')}">
      <span>${esc(pack.name)}</span><small>${(pack.skill_ids || []).length} skills</small>
    </button>`).join('');
  }

  function renderCapabilities() {
    const list = document.getElementById('workflowCapabilityList');
    if (!list) return;
    const saved = savedSkillSet();
    const category = document.getElementById('workflowSkillCategory')?.value || '';
    const caps = WF.capabilities.filter(cap => !['backend', 'project'].includes(cap.type) && (!category || cap.category === category));
    if (!caps.length) {
      list.innerHTML = '<div class="workflow-muted">暂无已启用的 skill、prompt 或规则能力。</div>';
      return;
    }
    list.innerHTML = caps.map(cap => {
      const steps = Array.isArray(cap.steps) && cap.steps.length ? cap.steps : (cap.instructions ? [cap.instructions] : []);
      const permissions = Array.isArray(cap.permissions) && cap.permissions.length ? cap.permissions.join('、') : '不声明额外权限';
      return `<div class="workflow-cap">
        <label>
          <input type="checkbox" data-workflow-skill="${esc(cap.id)}" ${saved.has(cap.id) ? 'checked' : ''}>
          <span><span class="workflow-cap-name">${esc(cap.name)}<span class="workflow-cap-type">${esc(cap.type)}</span>${cap.category ? `<span class="workflow-cap-category">${esc(categoryName(cap.category))}</span>` : ''}</span>
          <span class="workflow-cap-desc">${esc(cap.description || '未提供能力说明')}</span></span>
        </label>
        <details><summary>查看步骤与权限</summary>
          ${steps.length ? `<ol>${steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol>` : '<div style="margin-top:6px">未声明执行步骤</div>'}
          <div style="margin-top:6px">权限：${esc(permissions)}</div>
          <div style="margin-top:4px">入口：<code>${esc(cap.entry)}</code></div>
        </details>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-workflow-skill]').forEach(input => input.addEventListener('change', () => {
      const next = savedSkillSet();
      if (input.checked) next.add(input.dataset.workflowSkill);
      else next.delete(input.dataset.workflowSkill);
      localStorage.setItem('ww_workflow_skills', JSON.stringify([...next]));
      updateSelectedSkills();
    }));
  }

  function savedSkillSet() {
    try {
      const value = JSON.parse(localStorage.getItem('ww_workflow_skills') || '[]');
      return new Set(Array.isArray(value) ? value : []);
    } catch (_) {
      return new Set();
    }
  }

  function categoryName(id) {
    return WF.categories.find(category => category.id === id)?.name || id;
  }

  function applySkillPack(id) {
    const pack = WF.skillPacks.find(item => item.id === id);
    if (!pack) return;
    const wanted = new Set(pack.skill_ids || []);
    document.querySelectorAll('[data-workflow-skill]').forEach(input => { input.checked = wanted.has(input.dataset.workflowSkill); });
    localStorage.setItem('ww_workflow_skills', JSON.stringify([...wanted]));
    updateSelectedSkills();
  }

  function filterSkills() {
    renderCapabilities();
    updateSelectedSkills();
  }

  function clearSkills() {
    document.querySelectorAll('[data-workflow-skill]').forEach(input => { input.checked = false; });
    localStorage.setItem('ww_workflow_skills', '[]');
    updateSelectedSkills();
  }

  function updateSelectedSkills() {
    const count = selectedSkillIds().length;
    const node = document.getElementById('workflowSelectedSkills');
    if (node) node.textContent = `已选 ${count} 项${count > 1 ? ' · 多 Skill' : ''}`;
  }

  function selectedSkillIds() {
    const available = new Set(WF.capabilities.filter(cap => !['backend', 'project'].includes(cap.type)).map(cap => cap.id));
    return [...savedSkillSet()].filter(id => !available.size || available.has(id));
  }

  function setStatus(kind, message) {
    const status = document.getElementById('workflowStatus');
    if (!status) return;
    status.className = `workflow-status ${kind || ''}`;
    status.textContent = message;
  }

  function setRunning(running) {
    const run = document.getElementById('workflowRunBtn');
    const abort = document.getElementById('workflowAbortBtn');
    if (run) { run.disabled = running; run.textContent = running ? '正在生成候选…' : '生成候选'; }
    if (abort) abort.disabled = !running;
  }

  function snapshotEditor() {
    const editor = document.getElementById('mainEditor');
    return {
      document: editor?.value || '',
      selectionStart: editor?.selectionStart || 0,
      selectionEnd: editor?.selectionEnd || 0,
      title: document.getElementById('chapterTitle')?.value || '',
      projectId: typeof S !== 'undefined' && S.proj ? S.proj.project.id : null,
      activeType: typeof S !== 'undefined' && S.active ? S.active.type : null,
      activeId: typeof S !== 'undefined' && S.active ? S.active.id : null
    };
  }

  async function run() {
    if (WF.controller) WF.controller.abort();
    if (!WF.backendReady) {
      setStatus('error', '请先启动后端');
      if (typeof showToast === 'function') showToast('✕', '能力执行需要同源后端');
      return;
    }
    const instruction = document.getElementById('workflowTaskPrompt').value.trim();
    const context = refreshContext();
    if (!instruction && !context.text.trim()) {
      if (typeof showToast === 'function') showToast('✎', '请写任务，或选择有内容的上下文');
      return;
    }

    const task = document.getElementById('workflowTaskType').value;
    const backendId = document.getElementById('workflowBackend').value;
    const skillIds = selectedSkillIds();
    const message = [
      instruction && `【本次任务】\n${instruction}`,
      context.text && `【本次上下文包】\n${context.text}`,
      '【输出约束】\n只完成本次任务。不要宣称已经修改正文、保存文件或同步记忆；先返回可审阅的候选结果。'
    ].filter(Boolean).join('\n\n');

    WF.runSnapshot = snapshotEditor();
    WF.candidate = '';
    WF.candidateHistoryId = null;
    const candidate = document.getElementById('workflowCandidate');
    candidate.classList.remove('empty');
    candidate.textContent = '';
    document.getElementById('workflowApplyBtn').disabled = true;
    document.getElementById('workflowMemoryBtn').disabled = true;
    document.getElementById('workflowCandidateMeta').textContent = `${context.tokens.toLocaleString()} tokens 上下文 · ${skillIds.length} 个能力`;

    WF.controller = new AbortController();
    setRunning(true);
    setStatus('running', '执行中');
    const started = performance.now();
    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        signal: WF.controller.signal,
        body: JSON.stringify({
          backend_id: backendId,
          skill_ids: skillIds,
          task,
          message,
          context: {
            project_name: typeof S !== 'undefined' && S.proj ? S.proj.project.name : '',
            active_title: WF.runSnapshot.title,
            included: context.keys
          },
          params: { stream: true, use_ai: task === 'rewrite' }
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      await readEventStream(response, text => {
        WF.candidate += text;
        candidate.textContent = WF.candidate;
      });
      if (!WF.candidate.trim()) throw new Error('后端没有返回文本结果');
      const elapsed = ((performance.now() - started) / 1000).toFixed(1);
      const record = {
        mode: `流程 · ${task}`,
        text: WF.candidate,
        workflow: true,
        task,
        instruction,
        skill_ids: skillIds,
        context_tokens: context.tokens,
        editor_before_run: WF.runSnapshot.document,
        selection_start: WF.runSnapshot.selectionStart,
        selection_end: WF.runSnapshot.selectionEnd,
        active_title: WF.runSnapshot.title,
        time: Date.now()
      };
      if (typeof dbPut === 'function' && typeof db !== 'undefined' && db) WF.candidateHistoryId = await dbPut('aiHistory', record);
      document.getElementById('workflowCandidateMeta').textContent = `${WF.candidate.length.toLocaleString()} 字符 · ${elapsed}s · 等待你处理`;
      document.getElementById('workflowApplyBtn').disabled = false;
      document.getElementById('workflowMemoryBtn').disabled = false;
      const mode = document.getElementById('workflowApplyMode');
      mode.value = WF.runSnapshot.selectionStart !== WF.runSnapshot.selectionEnd ? 'replace' : 'insert';
      setStatus('ready', '候选已生成');
      await renderHistory();
    } catch (error) {
      if (error.name === 'AbortError') {
        setStatus('', '已中断');
      } else {
        setStatus('error', error.message || '执行失败');
        candidate.classList.add('empty');
        candidate.textContent = `执行失败：${error.message || error}`;
      }
    } finally {
      WF.controller = null;
      setRunning(false);
    }
  }

  async function readEventStream(response, onDelta) {
    if (!response.body) throw new Error('当前浏览器不支持流式响应');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';
      for (const event of events) {
        const eventName = event.split(/\r?\n/).find(line => line.startsWith('event:'))?.slice(6).trim();
        const dataLines = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim());
        if (!dataLines.length) continue;
        const data = JSON.parse(dataLines.join('\n'));
        if (eventName === 'delta' && data.text) onDelta(data.text);
        if (eventName === 'error') throw new Error(data.error || '能力执行失败');
        if (eventName === 'aborted') throw new DOMException('Aborted', 'AbortError');
      }
      if (done) break;
    }
  }

  async function abort() {
    if (WF.controller) WF.controller.abort();
    try { await fetch('/api/abort', { method: 'POST' }); } catch (_) { /* local abort already happened */ }
    setStatus('', '已发送中断');
  }

  async function applyCandidate() {
    if (!WF.candidate || !WF.runSnapshot) return;
    const editor = document.getElementById('mainEditor');
    const mode = document.getElementById('workflowApplyMode').value;
    const beforeApply = editor.value;
    let next = beforeApply;
    if (mode === 'replace') {
      if (WF.runSnapshot.selectionStart === WF.runSnapshot.selectionEnd) {
        if (typeof showToast === 'function') showToast('✎', '运行时没有选区，请改用插入或追加');
        return;
      }
      if (beforeApply !== WF.runSnapshot.document) {
        if (typeof showToast === 'function') showToast('!', '正文在运行后已变化；为避免错位，请改用当前光标插入');
        return;
      }
      next = beforeApply.slice(0, WF.runSnapshot.selectionStart) + WF.candidate + beforeApply.slice(WF.runSnapshot.selectionEnd);
    } else if (mode === 'append') {
      next = beforeApply + (beforeApply.trim() ? '\n\n' : '') + WF.candidate;
    } else {
      const cursor = editor.selectionStart || 0;
      next = beforeApply.slice(0, cursor) + WF.candidate + beforeApply.slice(editor.selectionEnd || cursor);
    }
    editor.value = next;
    if (typeof onEditorInput === 'function') onEditorInput();
    if (WF.candidateHistoryId && typeof dbGet === 'function' && typeof dbPut === 'function') {
      const item = await dbGet('aiHistory', WF.candidateHistoryId);
      if (item) await dbPut('aiHistory', { ...item, original_document: beforeApply, applied_at: Date.now(), apply_mode: mode });
    }
    if (typeof showToast === 'function') showToast('✓', '候选已写入；记忆未同步');
    document.getElementById('workflowCandidateMeta').textContent = '已写入正文 · 尚未保存为记忆';
    await renderHistory();
  }

  function copyCandidate() {
    if (!WF.candidate) return;
    navigator.clipboard.writeText(WF.candidate).then(() => {
      if (typeof showToast === 'function') showToast('✓', '候选已复制');
    });
  }

  function candidateToMemory() {
    if (!WF.candidate) return;
    if (typeof S === 'undefined' || !S.proj) {
      if (typeof showToast === 'function') showToast('✕', '请先打开一个项目');
      return;
    }
    const input = document.getElementById('memContent');
    if (input) input.value = WF.candidate;
    document.querySelectorAll('#memCatGrid .genre-chip').forEach(chip => chip.classList.toggle('on', chip.textContent.includes('备注')));
    if (typeof openModal === 'function') openModal('memoryModal');
    if (typeof showToast === 'function') showToast('◆', '请编辑确认后再保存记忆');
  }

  async function renderHistory() {
    const root = document.getElementById('workflowHistory');
    if (!root || typeof dbAll !== 'function' || typeof db === 'undefined' || !db) return;
    const items = (await dbAll('aiHistory')).filter(item => item.workflow).sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 12);
    if (!items.length) {
      root.innerHTML = '<div class="workflow-muted">暂无流程记录</div>';
      return;
    }
    root.innerHTML = items.map(item => `
      <div class="workflow-history-item">
        <div class="workflow-history-title">${esc(item.mode || '创作流程')} · ${esc(new Date(item.time).toLocaleString())}</div>
        <div class="workflow-history-preview">${esc(String(item.text || '').slice(0, 110))}${String(item.text || '').length > 110 ? '…' : ''}</div>
        <div class="workflow-history-actions">
          <button class="workflow-ghost" type="button" onclick="workflowOpenHistory(${Number(item.id)})">查看候选</button>
          ${item.applied_at && typeof item.original_document === 'string' ? `<button class="workflow-danger" type="button" onclick="workflowRestoreBefore(${Number(item.id)})">恢复写入前</button>` : ''}
        </div>
      </div>`).join('');
  }

  async function openHistory(id) {
    const item = await dbGet('aiHistory', id);
    if (!item) return;
    WF.candidate = item.text || '';
    WF.candidateHistoryId = item.id;
    WF.runSnapshot = {
      document: item.editor_before_run || '',
      selectionStart: item.selection_start || 0,
      selectionEnd: item.selection_end || 0,
      title: item.active_title || ''
    };
    const result = document.getElementById('workflowCandidate');
    result.classList.toggle('empty', !WF.candidate);
    result.textContent = WF.candidate || '此记录没有候选文本。';
    document.getElementById('workflowCandidateMeta').textContent = `历史候选 · ${new Date(item.time).toLocaleString()}`;
    document.getElementById('workflowApplyBtn').disabled = !WF.candidate;
    document.getElementById('workflowMemoryBtn').disabled = !WF.candidate;
    document.getElementById('workflowCandidateCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function restoreBefore(id) {
    const item = await dbGet('aiHistory', id);
    if (!item || typeof item.original_document !== 'string') return;
    if (!confirm('恢复到这次候选写入前的正文？当前未保存修改会留在新的流程快照中，但不会自动保存。')) return;
    const editor = document.getElementById('mainEditor');
    const current = editor.value;
    await dbPut('aiHistory', {
      mode: '流程 · 恢复前快照', text: current, workflow: true, task: 'restore-snapshot',
      editor_before_run: current, original_document: current, time: Date.now()
    });
    editor.value = item.original_document;
    if (typeof onEditorInput === 'function') onEditorInput();
    if (typeof showToast === 'function') showToast('↶', '已恢复到写入前，尚未保存');
    await renderHistory();
  }

  function newSession() {
    if (WF.controller) WF.controller.abort();
    WF.session += 1;
    localStorage.setItem('ww_workflow_session', String(WF.session));
    WF.candidate = '';
    WF.candidateHistoryId = null;
    WF.runSnapshot = null;
    const root = document.getElementById('workflowRoot');
    const parent = root?.parentElement;
    if (!parent) return;
    parent.innerHTML = renderShell();
    document.querySelectorAll('[data-workflow-context]').forEach(input => input.addEventListener('change', onContextPreferenceChange));
    document.getElementById('workflowTaskPrompt').addEventListener('input', refreshContext);
    refreshContext();
    loadCapabilities();
    renderHistory();
  }

  function openMobile() {
    const root = document.getElementById('workflowRoot');
    const mount = document.getElementById('workflowMobileMount');
    if (root && mount) mount.appendChild(root);
    document.getElementById('workflowMobileOverlay')?.classList.add('show');
    activate();
  }

  function closeMobile() {
    const root = document.getElementById('workflowRoot');
    const panel = document.getElementById('aiTab-workflow');
    if (root && panel) panel.appendChild(root);
    document.getElementById('workflowMobileOverlay')?.classList.remove('show');
  }

  window.workflowRun = run;
  window.workflowAbort = abort;
  window.workflowApplyCandidate = applyCandidate;
  window.workflowCopyCandidate = copyCandidate;
  window.workflowCandidateToMemory = candidateToMemory;
  window.workflowRefreshContext = refreshContext;
  window.workflowRenderHistory = renderHistory;
  window.workflowOpenHistory = openHistory;
  window.workflowRestoreBefore = restoreBefore;
  window.workflowNewSession = newSession;
  window.workflowOpenMobile = openMobile;
  window.workflowCloseMobile = closeMobile;
  window.workflowApplySkillPack = applySkillPack;
  window.workflowFilterSkills = filterSkills;
  window.workflowClearSkills = clearSkills;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
