// ═══════════════════════════════════════════════════════════════
// Advanced AI Features - 高级AI功能增强
// ═══════════════════════════════════════════════════════════════

// ═══ AI味审查雷达图可视化 ═══
function drawAiRadarChart(scores) {
  const canvas = document.getElementById('aiRadarCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) - 40;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 6 dimensions
  const dimensions = [
    { label: '句式规律', key: 'pattern' },
    { label: '词汇丰富', key: 'vocab' },
    { label: '情感自然', key: 'emotion' },
    { label: '结构完美', key: 'structure' },
    { label: '口语程度', key: 'colloquial' },
    { label: '重复冗余', key: 'redundancy' }
  ];

  const angleStep = (Math.PI * 2) / dimensions.length;

  // Draw background circles
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 5; i++) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, (radius / 5) * i, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Draw axes
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  dimensions.forEach((dim, i) => {
    const angle = angleStep * i - Math.PI / 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.stroke();

    // Draw labels
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelX = centerX + Math.cos(angle) * (radius + 25);
    const labelY = centerY + Math.sin(angle) * (radius + 25);
    ctx.fillText(dim.label, labelX, labelY);
  });

  // Draw data polygon
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
  ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
  ctx.lineWidth = 2;

  dimensions.forEach((dim, i) => {
    const angle = angleStep * i - Math.PI / 2;
    const value = scores[dim.key] || 0;
    const r = (radius * value) / 100;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    // Draw value points
    ctx.fillStyle = 'rgba(99, 102, 241, 1)';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Draw score values
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px Inter, sans-serif';
  dimensions.forEach((dim, i) => {
    const angle = angleStep * i - Math.PI / 2;
    const value = scores[dim.key] || 0;
    const r = (radius * value) / 100;
    const x = centerX + Math.cos(angle) * (r + 15);
    const y = centerY + Math.sin(angle) * (r + 15);

    ctx.fillText(value.toString(), x, y);
  });
}

// ═══ AI味深度分析（增强版） ═══
async function deepAiCheck() {
  if (!aiHasConfig(S.apiConfig)) {
    showToast('✕', t('toast-no-api'));
    return;
  }

  const content = document.getElementById('mainEditor').value.trim();
  if (!content) {
    showToast('✕', '编辑器内容为空');
    return;
  }

  const btn = event?.target;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '分析中...';
  }

  try {
    const systemPrompt = `你是AI写作检测专家。分析文本的AI生成特征，返回JSON格式：

{
  "scores": {
    "pattern": 0-100,    // 句式规律性（越高越AI）
    "vocab": 0-100,      // 词汇丰富度（越低越AI）
    "emotion": 0-100,    // 情感自然度（越低越AI）
    "structure": 0-100,  // 结构完美度（越高越AI）
    "colloquial": 0-100, // 口语化程度（越低越AI）
    "redundancy": 0-100  // 重复冗余度（越高越AI）
  },
  "probability": 0-100,  // AI概率（综合评分）
  "highlights": [
    {"sentence": "具体句子", "reason": "AI特征描述", "start": 位置}
  ],
  "suggestions": [
    {"issue": "问题描述", "fix": "修改建议"}
  ]
}

⚠️ 仅供参考，不构成正式判定。`;

    const result = await callAI('分析以下文本：\n\n' + content, S.apiConfig, systemPrompt);

    // Parse JSON
    let analysis;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (e) {
      showToast('✕', 'AI返回格式错误');
      return;
    }

    // Show results
    displayAiCheckResults(analysis, content);

  } catch (e) {
    showToast('✕', t('toast-api-err') + ': ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'AI味深度分析';
    }
  }
}

function displayAiCheckResults(analysis, originalText) {
  const modal = document.getElementById('aiCheckResultModal');
  if (!modal) return;

  // Draw radar chart
  if (analysis.scores) {
    drawAiRadarChart(analysis.scores);
  }

  // Overall probability
  const probEl = document.getElementById('aiProbability');
  if (probEl) {
    probEl.textContent = (analysis.probability || 0) + '%';
    probEl.className = 'ai-prob-value';
    if (analysis.probability > 70) probEl.classList.add('high');
    else if (analysis.probability > 40) probEl.classList.add('medium');
    else probEl.classList.add('low');
  }

  // Dimension scores
  if (analysis.scores) {
    const scoreList = document.getElementById('aiScoreList');
    if (scoreList) {
      const labels = {
        pattern: '句式规律性',
        vocab: '词汇丰富度',
        emotion: '情感自然度',
        structure: '结构完美度',
        colloquial: '口语化程度',
        redundancy: '重复冗余度'
      };

      scoreList.innerHTML = Object.entries(analysis.scores)
        .map(([key, value]) => `
          <div class="score-item">
            <span class="score-label">${labels[key] || key}</span>
            <div class="score-bar-container">
              <div class="score-bar" style="width: ${value}%"></div>
            </div>
            <span class="score-value">${value}</span>
          </div>
        `).join('');
    }
  }

  // Highlighted sentences
  if (analysis.highlights && analysis.highlights.length > 0) {
    const highlightEl = document.getElementById('aiHighlights');
    if (highlightEl) {
      highlightEl.innerHTML = analysis.highlights.map(h => `
        <div class="highlight-item">
          <div class="highlight-sentence">"${escapeHtml(h.sentence)}"</div>
          <div class="highlight-reason">${escapeHtml(h.reason)}</div>
        </div>
      `).join('');
    }
  }

  // Suggestions
  if (analysis.suggestions && analysis.suggestions.length > 0) {
    const suggestEl = document.getElementById('aiSuggestions');
    if (suggestEl) {
      suggestEl.innerHTML = analysis.suggestions.map((s, i) => `
        <div class="suggestion-item">
          <div class="suggestion-number">${i + 1}</div>
          <div class="suggestion-content">
            <div class="suggestion-issue">${escapeHtml(s.issue)}</div>
            <div class="suggestion-fix">💡 ${escapeHtml(s.fix)}</div>
          </div>
        </div>
      `).join('');
    }
  }

  modal.style.display = 'flex';
}

function closeAiCheckResult() {
  const modal = document.getElementById('aiCheckResultModal');
  if (modal) modal.style.display = 'none';
}

// ═══ 智能降AI（多轮+强度控制） ═══
let reduceAiHistory = [];

async function smartReduceAi(intensity = 'medium') {
  if (!aiHasConfig(S.apiConfig)) {
    showToast('✕', t('toast-no-api'));
    return;
  }

  const ed = document.getElementById('mainEditor');
  const selected = ed.value.slice(ed.selectionStart, ed.selectionEnd).trim();
  const content = selected || ed.value.trim();

  if (!content) {
    showToast('✕', '请先选择文本或在编辑器中输入内容');
    return;
  }

  const intensityMap = {
    light: { degree: '轻度', desc: '保留80%原文，仅调整最明显的AI痕迹' },
    medium: { degree: '中度', desc: '保留60%原文，优化句式和表达' },
    heavy: { degree: '重度', desc: '保留40%原文，大幅重写' }
  };

  const config = intensityMap[intensity] || intensityMap.medium;

  const btn = event?.target;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '降AI中...';
  }

  try {
    const systemPrompt = `你是人类化写作专家。将AI生成文本改写为自然的人类写作风格。

强度：${config.degree}（${config.desc}）

要求：
1. 打破工整的排比和对仗
2. 使用不规则句式，偶尔用短句和碎片
3. 加入口语化表达、语气词
4. 保留一些不完美和即兴感
5. 避免过度修饰和堆砌
6. 让文字有"人味"，而非机械精准

直接输出改写后的文本，不要解释。`;

    showStreamingResult('reduceAiResult');
    const resultEl = document.getElementById('reduceAiResult');
    document.getElementById('reduceAiModal').style.display = 'flex';

    let fullResult = '';
    await callAIStream('请改写以下文本：\n\n' + content, S.apiConfig, systemPrompt, (chunk) => {
      fullResult += chunk;
      resultEl.textContent = fullResult;
    });

    hideStreamingCursor();

    // Save to history
    reduceAiHistory.push({
      original: content,
      result: fullResult,
      intensity,
      timestamp: Date.now()
    });

    S.lastReduceAiResult = fullResult;
    showToast('✓', '降AI完成');

  } catch (e) {
    showToast('✕', t('toast-api-err') + ': ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '智能降AI';
    }
  }
}

function applyReduceAi() {
  if (!S.lastReduceAiResult) return;

  const ed = document.getElementById('mainEditor');
  const start = ed.selectionStart;
  const end = ed.selectionEnd;

  if (start !== end) {
    // Replace selection
    ed.value = ed.value.slice(0, start) + S.lastReduceAiResult + ed.value.slice(end);
  } else {
    // Replace all
    ed.value = S.lastReduceAiResult;
  }

  onEditorInput();
  closeReduceAiModal();
  showToast('✓', '已应用');
}

function closeReduceAiModal() {
  document.getElementById('reduceAiModal').style.display = 'none';
}

function showReduceAiHistory() {
  if (reduceAiHistory.length === 0) {
    showToast('📝', '暂无历史记录');
    return;
  }

  const lines = reduceAiHistory.slice(-10).reverse().map((item, index) => {
    const time = item.time ? new Date(item.time).toLocaleString(currentLang || 'zh-CN') : '';
    const text = (item.result || item.text || '').slice(0, 220);
    return `${index + 1}. ${time}\n${text}`;
  });
  S.lastArpResult = lines.join('\n\n');
  document.getElementById('arpMode').textContent = '降AI历史';
  document.getElementById('arpText').textContent = S.lastArpResult;
  document.getElementById('aiResultPopup').classList.add('show');
}

// ═══ AI续写建议（三个方向） ═══
async function aiSuggestContinuations() {
  if (!aiHasConfig(S.apiConfig)) {
    showToast('✕', t('toast-no-api'));
    return;
  }

  const ed = document.getElementById('mainEditor');
  const content = ed.value.trim();

  if (!content) {
    showToast('✕', '编辑器内容为空');
    return;
  }

  // Get last 500 chars as context
  const context = content.slice(-500);

  const btn = event?.target;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '生成中...';
  }

  try {
    const systemPrompt = `你是创意写作助手。基于已有文本，提供3个不同方向的续写建议。

返回JSON格式：
{
  "suggestions": [
    {
      "direction": "方向名称（如：冲突升级/情感深化/转折）",
      "preview": "续写预览（50字以内）",
      "reasoning": "为什么这样写（30字以内）"
    }
  ]
}`;

    const result = await callAI('请为以下文本提供3个续写方向：\n\n' + context, S.apiConfig, systemPrompt);

    // Parse and display
    let suggestions;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      showToast('✕', 'AI返回格式错误');
      return;
    }

    displayContinuationSuggestions(suggestions);

  } catch (e) {
    showToast('✕', t('toast-api-err') + ': ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'AI续写建议';
    }
  }
}

function displayContinuationSuggestions(data) {
  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
  if (!suggestions.length) {
    showToast('✕', '没有可显示的续写方向');
    return;
  }
  S.lastArpResult = suggestions.map((s, i) => {
    const direction = s.direction || `方向 ${i + 1}`;
    const preview = s.preview || '';
    const reasoning = s.reasoning || '';
    return `${i + 1}. ${direction}\n${preview}\n${reasoning}`;
  }).join('\n\n');
  document.getElementById('arpMode').textContent = 'AI续写建议';
  document.getElementById('arpText').textContent = S.lastArpResult;
  document.getElementById('aiResultPopup').classList.add('show');
  showToast('✓', '生成了 ' + suggestions.length + ' 个方向');
}

// ═══ 风格学习与迁移 ═══
async function learnWritingStyle() {
  if (!S.proj) {
    showToast('✕', t('toast-no-proj'));
    return;
  }

  // Collect all chapter content
  const allContent = S.proj.chapters
    .map(c => c.content)
    .filter(Boolean)
    .join('\n\n');

  if (allContent.length < 500) {
    showToast('✕', '内容太少，无法学习风格（至少需要500字）');
    return;
  }

  const btn = event?.target;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '学习中...';
  }

  try {
    const systemPrompt = `你是写作风格分析专家。分析文本的写作风格特征，用于后续生成时保持一致。

返回JSON格式：
{
  "style": {
    "sentence_length": "short/medium/long",
    "vocab_level": "simple/moderate/advanced",
    "tone": "serious/casual/humorous/etc",
    "rhetoric": ["常用修辞手法"],
    "signature_phrases": ["特色表达"],
    "pacing": "fast/moderate/slow"
  },
  "summary": "风格总结（100字以内）"
}`;

    const sample = allContent.slice(0, 2000); // Sample first 2000 chars
    const result = await callAI('分析以下文本的写作风格：\n\n' + sample, S.apiConfig, systemPrompt);

    // Parse and save
    let styleData;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        styleData = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      showToast('✕', 'AI返回格式错误');
      return;
    }

    // Save to project metadata
    S.proj.project.learned_style = styleData;
    await dbPut('projects', S.proj.project);

    showToast('✓', '风格学习完成');
    console.log('学到的风格', styleData);

  } catch (e) {
    showToast('✕', t('toast-api-err') + ': ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '学习我的风格';
    }
  }
}

// ═══ Utility Functions ═══
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
