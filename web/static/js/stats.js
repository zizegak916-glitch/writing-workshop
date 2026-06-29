// ═══════════════════════════════════════════════════════════════
// Writing Statistics Dashboard - 写作统计仪表盘
// ═══════════════════════════════════════════════════════════════

// ═══ Statistics Data Collection ═══
async function collectWritingStats() {
  if (!S.proj) return null;

  const stats = {
    project: {
      name: S.proj.project.name,
      created_at: S.proj.project.created_at,
      total_chapters: S.proj.chapters.length,
      total_words: 0,
      total_characters: 0,
      avg_chapter_length: 0
    },
    daily: {},
    weekly: {},
    monthly: {},
    ai_usage: {
      total_calls: 0,
      by_mode: {},
      by_provider: {},
      total_tokens: { input: 0, output: 0 }
    },
    writing_habits: {
      most_active_hour: null,
      most_active_day: null,
      avg_session_duration: 0,
      longest_streak: 0
    }
  };

  // Calculate chapter stats
  S.proj.chapters.forEach(ch => {
    const words = countWords(ch.content || '');
    stats.project.total_words += words;
    stats.project.total_characters += (ch.content || '').length;

    // Daily stats
    const date = new Date(ch.updated_at || ch.created_at).toISOString().split('T')[0];
    if (!stats.daily[date]) {
      stats.daily[date] = { words: 0, characters: 0, chapters: 0 };
    }
    stats.daily[date].words += words;
    stats.daily[date].characters += (ch.content || '').length;
    stats.daily[date].chapters += 1;
  });

  stats.project.avg_chapter_length = stats.project.total_chapters > 0
    ? Math.round(stats.project.total_words / stats.project.total_chapters)
    : 0;

  // Get AI history from IndexedDB
  const aiHistory = await dbAll('aiHistory');
  stats.ai_usage.total_calls = aiHistory.length;

  aiHistory.forEach(record => {
    // By mode
    const mode = record.mode || 'unknown';
    stats.ai_usage.by_mode[mode] = (stats.ai_usage.by_mode[mode] || 0) + 1;

    // By provider
    const provider = record.provider || 'unknown';
    stats.ai_usage.by_provider[provider] = (stats.ai_usage.by_provider[provider] || 0) + 1;

    // Token usage
    if (record.tokens) {
      stats.ai_usage.total_tokens.input += record.tokens.input || 0;
      stats.ai_usage.total_tokens.output += record.tokens.output || 0;
    }
  });

  return stats;
}

// ═══ Statistics Dashboard Display ═══
async function showStatsDashboard() {
  const stats = await collectWritingStats();
  if (!stats) {
    showToast('✕', t('toast-no-proj'));
    return;
  }

  const modal = document.getElementById('statsDashboardModal');
  if (!modal) {
    console.warn('Stats dashboard modal not found');
    return;
  }

  // Project overview
  document.getElementById('statsProjectName').textContent = stats.project.name;
  document.getElementById('statsTotalWords').textContent = formatNumber(stats.project.total_words);
  document.getElementById('statsTotalChapters').textContent = stats.project.total_chapters;
  document.getElementById('statsAvgLength').textContent = formatNumber(stats.project.avg_chapter_length);

  // AI usage
  document.getElementById('statsAiCalls').textContent = formatNumber(stats.ai_usage.total_calls);
  const totalTokens = stats.ai_usage.total_tokens.input + stats.ai_usage.total_tokens.output;
  document.getElementById('statsAiTokens').textContent = formatTokens(totalTokens);

  // Daily trend chart
  drawDailyTrendChart(stats.daily);

  // AI mode distribution
  drawAiModeChart(stats.ai_usage.by_mode);

  // Recent activity
  renderRecentActivity(stats.daily);

  modal.style.display = 'flex';
}

function closeStatsDashboard() {
  const modal = document.getElementById('statsDashboardModal');
  if (modal) modal.style.display = 'none';
}

// ═══ Chart Drawing ═══
function drawDailyTrendChart(dailyData) {
  const canvas = document.getElementById('trendCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  // Clear
  ctx.clearRect(0, 0, width, height);

  // Get last 30 days
  const dates = Object.keys(dailyData).sort().slice(-30);
  if (dates.length === 0) return;

  const values = dates.map(d => dailyData[d].words);
  const maxValue = Math.max(...values, 1);

  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const stepX = chartWidth / (dates.length - 1 || 1);

  // Draw axes
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  // Draw grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  // Draw line
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
  ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();

  dates.forEach((date, i) => {
    const x = padding + stepX * i;
    const y = height - padding - (values[i] / maxValue) * chartHeight;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  // Fill area
  ctx.lineTo(padding + stepX * (dates.length - 1), height - padding);
  ctx.lineTo(padding, height - padding);
  ctx.closePath();
  ctx.fill();

  // Draw points
  ctx.fillStyle = 'rgba(99, 102, 241, 1)';
  dates.forEach((date, i) => {
    const x = padding + stepX * i;
    const y = height - padding - (values[i] / maxValue) * chartHeight;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw labels
  ctx.fillStyle = '#ffffff';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';

  // X-axis labels (show every 5 days)
  dates.forEach((date, i) => {
    if (i % 5 === 0 || i === dates.length - 1) {
      const x = padding + stepX * i;
      const label = new Date(date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
      ctx.fillText(label, x, height - padding + 20);
    }
  });

  // Y-axis labels
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight / 5) * i;
    const value = Math.round(maxValue * (1 - i / 5));
    ctx.fillText(formatNumber(value), padding - 10, y + 4);
  }
}

function drawAiModeChart(modeData) {
  const canvas = document.getElementById('aiModeCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) - 40;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const entries = Object.entries(modeData).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  if (total === 0) return;

  const colors = [
    'rgba(99, 102, 241, 0.8)',
    'rgba(139, 92, 246, 0.8)',
    'rgba(236, 72, 153, 0.8)',
    'rgba(251, 146, 60, 0.8)',
    'rgba(34, 197, 94, 0.8)',
    'rgba(59, 130, 246, 0.8)',
    'rgba(168, 85, 247, 0.8)',
    'rgba(244, 114, 182, 0.8)'
  ];

  let currentAngle = -Math.PI / 2;

  entries.forEach(([mode, count], i) => {
    const sliceAngle = (count / total) * Math.PI * 2;

    // Draw slice
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
    ctx.closePath();
    ctx.fill();

    // Draw border
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw label
    const labelAngle = currentAngle + sliceAngle / 2;
    const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
    const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mode, labelX, labelY - 8);

    const percentage = ((count / total) * 100).toFixed(1);
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(percentage + '%', labelX, labelY + 8);

    currentAngle += sliceAngle;
  });
}

function renderRecentActivity(dailyData) {
  const el = document.getElementById('recentActivityList');
  if (!el) return;

  const dates = Object.keys(dailyData).sort().reverse().slice(0, 10);

  if (dates.length === 0) {
    el.innerHTML = '<div class="empty-hint">暂无数据</div>';
    return;
  }

  el.innerHTML = dates.map(date => {
    const data = dailyData[date];
    const dateObj = new Date(date);
    const dateStr = dateObj.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' });

    return `
      <div class="activity-item">
        <div class="activity-date">${dateStr}</div>
        <div class="activity-stats">
          <span class="activity-stat">${formatNumber(data.words)} 字</span>
          <span class="activity-stat">${data.chapters} 章</span>
        </div>
      </div>
    `;
  }).join('');
}

// ═══ Export Statistics ═══
async function exportStats() {
  const stats = await collectWritingStats();
  if (!stats) return;

  const csv = generateStatsCSV(stats);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `写作统计_${stats.project.name}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();

  showToast('↓', '统计已导出');
}

function generateStatsCSV(stats) {
  let csv = '日期,字数,字符数,章节数\n';

  Object.keys(stats.daily).sort().forEach(date => {
    const data = stats.daily[date];
    csv += `${date},${data.words},${data.characters},${data.chapters}\n`;
  });

  return csv;
}

// ═══ Utility Functions ═══
function formatNumber(num) {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  return num.toLocaleString('zh-CN');
}

function formatTokens(tokens) {
  if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'k';
  }
  return tokens.toString();
}

function countWords(text) {
  if (!text) return 0;
  // Chinese characters + English words
  const chinese = (text.match(/[一-龥]/g) || []).length;
  const english = (text.match(/[a-zA-Z]+/g) || []).length;
  return chinese + english;
}
