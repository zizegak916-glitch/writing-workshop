// ═══════════════════════════════════════════════════════════════
// Characters Module - 人物档案管理
// ═══════════════════════════════════════════════════════════════

// ═══ Character Card Rendering ═══
function renderCharList() {
  const el = document.getElementById('characterList');
  if (!S.proj || !S.proj.characters) {
    el.innerHTML = '<div class="empty-hint">📝 '+t('char-empty')+'</div>';
    return;
  }

  const chars = S.proj.characters;
  if (chars.length === 0) {
    el.innerHTML = '<div class="empty-hint">📝 '+t('char-empty')+'</div>';
    return;
  }

  let html = '<div class="char-grid">';
  for (const c of chars) {
    const avatar = c.avatar || getDefaultAvatar(c.role);
    html += `
      <div class="char-card" onclick="openCharacterDetail(${c.id})">
        <div class="char-avatar">${avatar}</div>
        <div class="char-info">
          <div class="char-name">${escapeHtml(c.name)}</div>
          <div class="char-role">${escapeHtml(c.role || '')}</div>
        </div>
        <div class="char-actions">
          <button class="char-edit-btn" onclick="event.stopPropagation();editCharacter(${c.id})" title="${t('btn-edit')}">
            <svg class="ic ic-sm"><use href="#ic-edit"/></svg>
          </button>
          <button class="char-del-btn" onclick="event.stopPropagation();deleteCharacter(${c.id})" title="${t('btn-delete')}">
            <svg class="ic ic-sm"><use href="#ic-trash"/></svg>
          </button>
        </div>
      </div>
    `;
  }
  html += '</div>';
  el.innerHTML = html;
}

function getDefaultAvatar(role) {
  const avatars = {
    '主角': '🦸',
    '主人公': '🦸',
    '配角': '👤',
    '反派': '😈',
    '导师': '🧙',
    '朋友': '🤝',
    '情侣': '💕',
    '家人': '👨‍👩‍👧',
    '路人': '🚶',
  };
  return avatars[role] || '👤';
}

// ═══ Character Detail Modal ═══
function openCharacterDetail(id) {
  const c = S.proj.characters.find(ch => ch.id === id);
  if (!c) return;

  const modal = document.getElementById('characterDetailModal');
  if (!modal) return;

  // Fill in character details
  document.getElementById('charDetailAvatar').textContent = c.avatar || getDefaultAvatar(c.role);
  document.getElementById('charDetailName').textContent = c.name;
  document.getElementById('charDetailRole').textContent = c.role || '未设定';

  // Profile sections
  const sections = [
    { id: 'charDetailPersonality', value: c.personality || '暂无' },
    { id: 'charDetailBackground', value: c.background || '暂无' },
    { id: 'charDetailAppearance', value: c.appearance || '暂无' },
    { id: 'charDetailSkills', value: c.skills || '暂无' },
    { id: 'charDetailGoals', value: c.goals || '暂无' },
    { id: 'charDetailRelations', value: c.relations || '暂无' }
  ];

  sections.forEach(s => {
    const el = document.getElementById(s.id);
    if (el) el.textContent = s.value;
  });

  modal.style.display = 'flex';
}

function closeCharacterDetail() {
  const modal = document.getElementById('characterDetailModal');
  if (modal) modal.style.display = 'none';
}

// ═══ Create/Edit Character ═══
function openNewCharacterModal() {
  if (!S.proj) return showToast('✕', t('toast-no-proj'));

  // Reset form
  document.getElementById('charFormId').value = '';
  document.getElementById('charFormName').value = '';
  document.getElementById('charFormRole').value = '';
  document.getElementById('charFormAvatar').value = '';
  document.getElementById('charFormPersonality').value = '';
  document.getElementById('charFormBackground').value = '';
  document.getElementById('charFormAppearance').value = '';
  document.getElementById('charFormSkills').value = '';
  document.getElementById('charFormGoals').value = '';
  document.getElementById('charFormRelations').value = '';

  document.getElementById('charFormTitle').textContent = t('char-create');
  openModal('characterFormModal');
}

async function editCharacter(id) {
  const c = S.proj.characters.find(ch => ch.id === id);
  if (!c) return;

  // Fill form
  document.getElementById('charFormId').value = c.id;
  document.getElementById('charFormName').value = c.name || '';
  document.getElementById('charFormRole').value = c.role || '';
  document.getElementById('charFormAvatar').value = c.avatar || '';
  document.getElementById('charFormPersonality').value = c.personality || '';
  document.getElementById('charFormBackground').value = c.background || '';
  document.getElementById('charFormAppearance').value = c.appearance || '';
  document.getElementById('charFormSkills').value = c.skills || '';
  document.getElementById('charFormGoals').value = c.goals || '';
  document.getElementById('charFormRelations').value = c.relations || '';

  document.getElementById('charFormTitle').textContent = t('char-edit');
  openModal('characterFormModal');
}

async function saveCharacter() {
  const id = document.getElementById('charFormId').value;
  const name = document.getElementById('charFormName').value.trim();

  if (!name) {
    showToast('✕', t('toast-enter-name'));
    return;
  }

  const data = {
    project_id: S.proj.project.id,
    name,
    role: document.getElementById('charFormRole').value.trim(),
    avatar: document.getElementById('charFormAvatar').value.trim(),
    personality: document.getElementById('charFormPersonality').value.trim(),
    background: document.getElementById('charFormBackground').value.trim(),
    appearance: document.getElementById('charFormAppearance').value.trim(),
    skills: document.getElementById('charFormSkills').value.trim(),
    goals: document.getElementById('charFormGoals').value.trim(),
    relations: document.getElementById('charFormRelations').value.trim(),
    updated_at: Date.now()
  };

  if (id) {
    // Update existing
    data.id = parseInt(id);
    await dbPut('characters', data);
    showToast('✓', t('toast-updated'));
  } else {
    // Create new
    data.created_at = Date.now();
    await dbPut('characters', data);
    showToast('✓', t('toast-created'));
  }

  await loadProject(S.proj.project.id);
  closeModal('characterFormModal');
}

async function deleteCharacter(id) {
  const c = S.proj.characters.find(ch => ch.id === id);
  if (!c) return;

  if (!confirm(t('confirm-delete-char').replace('{name}', c.name))) return;

  await dbDel('characters', id);
  await loadProject(S.proj.project.id);
  showToast('🗑', t('toast-deleted'));
}

// ═══ AI Character Generation ═══
async function aiGenerateCharacter() {
  if (!S.apiConf || !S.apiConf.key) {
    showToast('✕', t('toast-no-api'));
    return;
  }

  const prompt = document.getElementById('charAiPrompt').value.trim();
  if (!prompt) {
    showToast('✕', '请输入人物描述');
    return;
  }

  const btn = event.target;
  btn.disabled = true;
  btn.textContent = t('generating') + '...';

  try {
    const systemPrompt = `你是一个专业的人物设定助手。根据用户的简短描述，生成详细的人物档案。
包含以下内容：
1. 姓名（如果用户没提供，请创造一个合适的）
2. 角色定位（主角/配角/反派/导师等）
3. 性格特征（100字左右）
4. 人物背景（150字左右）
5. 外貌描写（80字左右）
6. 技能特长（列举3-5项）
7. 目标动机（80字左右）
8. 人际关系（可选，如有）

请用JSON格式返回，格式如下：
{
  "name": "人物姓名",
  "role": "角色定位",
  "personality": "性格描写",
  "background": "背景故事",
  "appearance": "外貌描写",
  "skills": "技能1、技能2、技能3",
  "goals": "目标动机",
  "relations": "人际关系"
}`;

    const result = await callAI(prompt, S.apiConf, systemPrompt);

    // Parse JSON
    let charData;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        charData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (e) {
      showToast('✕', 'AI返回格式错误');
      return;
    }

    // Fill form with AI-generated data
    document.getElementById('charFormName').value = charData.name || '';
    document.getElementById('charFormRole').value = charData.role || '';
    document.getElementById('charFormPersonality').value = charData.personality || '';
    document.getElementById('charFormBackground').value = charData.background || '';
    document.getElementById('charFormAppearance').value = charData.appearance || '';
    document.getElementById('charFormSkills').value = charData.skills || '';
    document.getElementById('charFormGoals').value = charData.goals || '';
    document.getElementById('charFormRelations').value = charData.relations || '';

    showToast('✓', 'AI生成完成');
    document.getElementById('charAiPrompt').value = '';

  } catch (e) {
    showToast('✕', t('toast-api-err') + ': ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'AI 生成';
  }
}

// ═══ Character Consistency Check ═══
async function checkCharacterConsistency() {
  if (!S.proj || !S.proj.characters || S.proj.characters.length === 0) {
    showToast('✕', '没有人物档案可检查');
    return;
  }

  if (!S.apiConf || !S.apiConf.key) {
    showToast('✕', t('toast-no-api'));
    return;
  }

  const content = document.getElementById('mainEditor').value;
  if (!content.trim()) {
    showToast('✕', '编辑器内容为空');
    return;
  }

  const btn = event.target;
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = '检查中...';

  try {
    const charInfo = S.proj.characters.map(c =>
      `${c.name}（${c.role}）：性格-${c.personality || '未设定'}；背景-${c.background || '未设定'}`
    ).join('\n');

    const systemPrompt = `你是一个小说一致性审查助手。根据给定的人物设定，检查文本中的人物言行是否符合其性格特征和背景设定。

人物设定：
${charInfo}

请检查文本中每个人物的：
1. 对话是否符合性格
2. 行为是否符合背景
3. 是否出现性格崩坏

如果发现问题，请指出具体位置和原因。如果一切正常，则说明"未发现明显的人物一致性问题"。`;

    const result = await callAI('请检查以下文本的人物一致性：\n\n' + content, S.apiConf, systemPrompt);

    // Show result in AI panel
    document.getElementById('arpText').textContent = result;
    showAiResult();

    showToast('✓', '一致性检查完成');

  } catch (e) {
    showToast('✕', t('toast-api-err') + ': ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

// ═══ Utility ═══
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
