(function () {
  'use strict';

  const PROFILE_KEY = 'ww_corpus_profiles_v1';
  const HISTORY_KEY = 'ww_corpus_refinement_history_v1';
  const AI_REPORT_KEY = 'ww_corpus_ai_report_v1';
  const MAX_FILE = 20 * 1024 * 1024;
  const MAX_AI_SAMPLE = 18000;
  const DEFAULT_SKILLS = ['润色', '续写', '改写', '节奏', '对白'];
  const BLOCK_START = '【本地语料校准候选 · 真实网文指导】';
  const BLOCK_END = '【/本地语料校准候选 · 真实网文指导】';
  const TASK_ALIASES = {
    润色: ['润色', '改写', '扩写', '缩写', '降AI', '校对'],
    续写: ['续写', '补写', '转折', '结局', '实时灵感'],
    节奏: ['节奏', '战斗', '悬疑', '情感'],
    对白: ['对话', '对白', '人物', '心理'],
    总结: ['总结', '分析', '大纲']
  };

  let pendingFiles = [];
  let candidate = null;
  const sessionSources = new Map();

  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (_) { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const countRunes = text => { let count = 0; for (const _ of String(text || '')) count += 1; return count; };
  const usesBrowser = () => typeof window.wwUsesBrowserStorage === 'function' ? window.wwUsesBrowserStorage() : location.hostname.endsWith('github.io');
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const pct = value => `${Math.round(Number(value || 0) * 100)}%`;
  const quantile = (values, q) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const at = (sorted.length - 1) * q;
    const lo = Math.floor(at), hi = Math.ceil(at);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
  };
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const profileSource = profile => profile?.source || profile || {};

  function normalizeProfile(raw, previous) {
    const source = profileSource(raw);
    const old = previous || {};
    return {
      id: source.id || raw.id,
      name: source.name || raw.name,
      sha256: source.sha256 || raw.sha256,
      bytes: source.bytes || raw.bytes,
      imported_at: source.imported_at || raw.imported_at || new Date().toISOString(),
      text_stored: false,
      authorized: source.authorized !== false,
      active: old.active ?? raw.active ?? true,
      metrics: raw.metrics || {},
      summary: raw.summary || old.summary || '',
      guidance_cards: raw.guidance_cards || raw.guidance || old.guidance_cards || [],
      rules: raw.rules || old.rules || [],
      evidence_grade: raw.evidence_grade || old.evidence_grade || 'weak',
      warnings: raw.warnings || old.warnings || []
    };
  }

  function saveProfiles(profiles) {
    write(PROFILE_KEY, profiles);
    document.dispatchEvent(new CustomEvent('ww:corpus-guidance-changed'));
  }

  async function sha256(file) {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  }

  async function fileText(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'docx') {
      if (typeof window.parseDocx !== 'function') throw new Error('当前浏览器无法解析 DOCX');
      return window.parseDocx(await file.arrayBuffer());
    }
    if (!['txt', 'md', 'markdown'].includes(ext)) throw new Error('只支持 TXT、Markdown、DOCX');
    return file.text();
  }

  function isChapterHeading(line) {
    const value = String(line || '').trim();
    if (!value || countRunes(value) > 70) return false;
    return /^(?:正文\s*)?第\s*[〇零一二三四五六七八九十百千万两0-9０-９]+\s*[章卷节回部集篇](?:\s|$|[：:、.-])/.test(value)
      || /^(?:chapter|chap\.?|卷)\s*[0-9０-９ivxlcdm]+(?:\s|$|[：:、.-])/i.test(value)
      || /^[0-9０-９]{1,5}\s*[、.．]\s*\S{1,40}$/.test(value)
      || /^[〇零一二三四五六七八九十百千万两]{1,8}\s*[章回](?:\s|$|[：:、.-])/.test(value);
  }

  function quotedDialogueStats(text) {
    let runes = 0, turns = 0;
    const quotePattern = /[“「『]([^”」』\n]{1,1200})[”」』]|"([^"\n]{1,1200})"/g;
    for (const match of text.matchAll(quotePattern)) {
      runes += countRunes(match[1] || match[2] || '');
      turns += 1;
    }
    return { runes, turns };
  }

  function topStarters(sentences) {
    const counts = new Map();
    const step = Math.max(1, Math.ceil(sentences.length / 100000));
    for (let index = 0; index < sentences.length; index += step) {
      const sentence = sentences[index];
      const start = [...sentence.replace(/^[\s“”「」『』"'—-]+/, '')].slice(0, 3).join('');
      if (start.length >= 2) counts.set(start, (counts.get(start) || 0) + 1);
    }
    return [...counts].map(([value, count]) => ({ value, count })).filter(item => item.count >= 3)
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, 8);
  }

  function endingStats(lines, chapterIndexes) {
    if (chapterIndexes.length < 2) return { hook_ratio: 0, question_ratio: 0, samples: 0 };
    let hooks = 0, questions = 0, samples = 0;
    for (let i = 0; i < chapterIndexes.length; i += 1) {
      const end = (i + 1 < chapterIndexes.length ? chapterIndexes[i + 1] : lines.length) - 1;
      let tail = '';
      for (let j = end; j > chapterIndexes[i] && !tail; j -= 1) tail = (lines[j] || '').trim();
      if (!tail) continue;
      samples += 1;
      if (/[？?]$/.test(tail)) questions += 1;
      if (/[？?！!……—]$/.test(tail) || /(却|忽然|就在这时|没想到|竟然|终于|来了|是谁|为什么).{0,18}$/.test(tail)) hooks += 1;
    }
    return { hook_ratio: hooks / Math.max(1, samples), question_ratio: questions / Math.max(1, samples), samples };
  }

  function deriveGuidance(metrics) {
    const cards = [];
    const medianPara = Math.round(metrics.median_paragraph_runes || metrics.average_paragraph_runes || 0);
    const p90 = Math.round(metrics.p90_paragraph_runes || medianPara);
    cards.push({
      id: 'rhythm', title: '段落节拍', scope: '场景推进与修订', tasks: ['润色', '改写', '扩写', '缩写', '续写', '补写', '节奏', '战斗'],
      instruction: `把 ${medianPara} 字左右视为常见段落而非目标值；动作、反应或信息发生转向时可断段，承载完整说明时允许延长，但通常不要无意超过约 ${p90} 字。`,
      evidence: `段长中位数 ${medianPara}，90 分位 ${p90}，短段占 ${pct(metrics.short_paragraph_ratio)}。`,
      counterexample: '连续动作、完整对白交换或刻意压迫感需要时，不为迎合数字强行断段。'
    });
    cards.push({
      id: 'dialogue', title: '对白组织', scope: '对白、人物与场景', tasks: ['对话', '对白', '人物', '心理', '续写', '补写', '润色'],
      instruction: `把对白当作行动：每轮话应改变信息、关系或下一步选择；参考文本中引号对白约占 ${pct(metrics.dialogue_ratio)}，只用于判断当前场景是否失衡。`,
      evidence: `识别 ${Number(metrics.dialogue_turns || 0).toLocaleString()} 轮引号对白；同时统计段中对白，避免只识别以引号开头的段落。`,
      counterexample: '独处、追逐、环境压迫或意识受限的场景可以几乎没有对白。'
    });
    cards.push({
      id: 'sentence', title: '句子负载', scope: '表达清晰度', tasks: ['润色', '改写', '缩写', '降AI', '校对', '节奏'],
      instruction: `常见句长约 ${Math.round(metrics.median_sentence_runes || metrics.average_sentence_runes || 0)} 字；一句优先承载一个主要动作、判断或信息变化，长句必须保持指代与动作链清楚。`,
      evidence: `句长 90 分位 ${Math.round(metrics.p90_sentence_runes || 0)}，长句占 ${pct(metrics.long_sentence_ratio)}。`,
      counterexample: '视角人物连续观察、思绪滑移或语势蓄积时，可以保留有控制的长句。'
    });
    if (metrics.exposition_marker_ratio > 0 || metrics.action_sentence_ratio > 0) cards.push({
      id: 'showing', title: '解释与行动', scope: '叙述密度', tasks: ['润色', '改写', '续写', '补写', '心理', '情感', '降AI'],
      instruction: '先让人物的判断、动作和后果建立因果，再决定是否需要旁白解释；解释用于补足读者无法从场面获得的关键信息。',
      evidence: `解释标记句约 ${pct(metrics.exposition_marker_ratio)}，动作动词句约 ${pct(metrics.action_sentence_ratio)}。`,
      counterexample: '世界规则、时间跳转或复杂计划若不说明就会误读时，应保留必要解释。'
    });
    if ((metrics.chapters || 0) >= 3) cards.push({
      id: 'chapter', title: '章节收束', scope: '续写、转折与结尾', tasks: ['续写', '补写', '节奏', '悬疑', '转折', '结局', '大纲'],
      instruction: '章节结尾落在可见变化、未完成动作、新信息或明确选择上；钩子来自因果未闭合，不靠无来源反转。',
      evidence: `识别 ${metrics.chapters} 个章节标题；约 ${pct(metrics.chapter_hook_ratio)} 的章末带问题、突变或未完成信号。`,
      counterexample: '情绪落定、关系确认或阶段总结章节，可以安静收束，不必每章悬崖。'
    });
    const starters = metrics.sentence_starters || [];
    if (starters.length) cards.push({
      id: 'repetition', title: '开句重复', scope: '机械感排查', tasks: ['润色', '改写', '降AI', '查AI', '分析'],
      instruction: `复查高频开句“${starters.slice(0, 3).map(item => item.value).join('、')}”是否形成连续同构；只处理邻近且无叙事作用的重复。`,
      evidence: `最高频开句在样本中出现 ${starters[0].count} 次。`,
      counterexample: '有意回环、人物口头习惯或强调节拍不应被机械消除。'
    });
    return cards;
  }

  function analyze(text) {
    const normalized = String(text || '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
    const rawLines = normalized.split('\n');
    const lines = rawLines.map(line => line.trim()).filter(Boolean);
    const paragraphs = lines.filter(line => !isChapterHeading(line) && !/^(?:\*{3,}|-{3,}|—{3,}|#{1,6}\s*)$/.test(line));
    const sentences = paragraphs.join('\n').split(/[。！？!?…]+/).map(value => value.trim()).filter(value => countRunes(value) > 1);
    const runes = countRunes(normalized);
    const paraLens = paragraphs.map(countRunes);
    const sentenceLens = sentences.map(countRunes);
    const chapterIndexes = [];
    lines.forEach((line, index) => { if (isChapterHeading(line)) chapterIndexes.push(index); });
    const quoted = quotedDialogueStats(normalized);
    const dialogueOnly = paragraphs.filter(line => /^[—-]?\s*[“「『"]/.test(line)).length;
    const explanation = sentences.filter(sentence => /(这意味着|也就是说|显然|毫无疑问|事实上|因为|所以|原来|换言之|可见|总而言之)/.test(sentence)).length;
    const action = sentences.filter(sentence => /(走|跑|冲|抬|伸|抓|推|拉|转|看|望|盯|坐|站|起|落|砸|劈|挥|按|拿|放|退|进|出|开|关|躲|追|扑|踢|撞|停|翻|掀|甩|接|握)/.test(sentence)).length;
    const mean = average(paraLens);
    const variance = paraLens.length ? average(paraLens.map(value => (value - mean) ** 2)) : 0;
    const endings = endingStats(lines, chapterIndexes);
    const metrics = {
      runes,
      chapters: chapterIndexes.length || 1,
      paragraphs: paragraphs.length,
      sentences: sentences.length,
      average_paragraph_runes: mean,
      median_paragraph_runes: quantile(paraLens, .5),
      p90_paragraph_runes: quantile(paraLens, .9),
      average_sentence_runes: average(sentenceLens),
      median_sentence_runes: quantile(sentenceLens, .5),
      p90_sentence_runes: quantile(sentenceLens, .9),
      paragraph_variation: mean ? Math.sqrt(variance) / mean : 0,
      dialogue_ratio: quoted.runes / Math.max(1, runes),
      dialogue_turns: quoted.turns,
      dialogue_paragraph_ratio: dialogueOnly / Math.max(1, paragraphs.length),
      short_paragraph_ratio: paraLens.filter(value => value <= 35).length / Math.max(1, paraLens.length),
      long_sentence_ratio: sentenceLens.filter(value => value >= 55).length / Math.max(1, sentenceLens.length),
      exposition_marker_ratio: explanation / Math.max(1, sentences.length),
      action_sentence_ratio: action / Math.max(1, sentences.length),
      scene_breaks: rawLines.filter(line => /^\s*(?:\*{3,}|-{3,}|—{3,})\s*$/.test(line)).length,
      chapter_hook_ratio: endings.hook_ratio,
      chapter_question_ratio: endings.question_ratio,
      sentence_starters: topStarters(sentences)
    };
    const guidanceCards = deriveGuidance(metrics);
    const summary = `识别 ${metrics.chapters.toLocaleString()} 章、${metrics.paragraphs.toLocaleString()} 个正文段和 ${metrics.dialogue_turns.toLocaleString()} 轮引号对白。典型段长 ${Math.round(metrics.median_paragraph_runes)} 字，90% 段落不超过约 ${Math.round(metrics.p90_paragraph_runes)} 字；对白约占 ${pct(metrics.dialogue_ratio)}。以下结论按场景调用，不作为整书配额。`;
    return {
      metrics,
      summary,
      guidance_cards: guidanceCards,
      rules: guidanceCards.map(card => card.instruction),
      evidence_grade: runes >= 100000 && paragraphs.length >= 1000 && metrics.chapters >= 5 ? 'strong' : runes >= 30000 && paragraphs.length >= 250 ? 'moderate' : 'weak',
      warnings: metrics.chapters === 1 && runes > 100000 ? ['未可靠识别章节标题；章末与章节节拍结论已降级。可检查文本是否使用特殊标题格式。'] : []
    };
  }

  function sampleText(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(Boolean);
    if (!lines.length) return '';
    const takeAround = (ratio, count = 24) => {
      const start = clamp(Math.floor(lines.length * ratio) - Math.floor(count / 2), 0, Math.max(0, lines.length - count));
      return lines.slice(start, start + count).join('\n');
    };
    const dialogue = lines.filter(line => /[“「『"].{2,200}[”」』"]/.test(line)).slice(0, 35).join('\n');
    const endings = [];
    lines.forEach((line, index) => { if (isChapterHeading(line) && index > 0) endings.push(lines.slice(Math.max(0, index - 3), index).join('\n')); });
    return [takeAround(0, 36), takeAround(.25), takeAround(.5), takeAround(.75), takeAround(1, 36), dialogue, endings.slice(0, 20).join('\n---章末---\n')]
      .filter(Boolean).join('\n\n---抽样位置切换---\n\n').slice(0, MAX_AI_SAMPLE);
  }

  function ensure() {
    if (document.getElementById('corpusLab')) return;
    const root = document.createElement('div');
    root.id = 'corpusLab'; root.className = 'corpus-overlay'; root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `<section class="corpus-dialog" role="dialog" aria-modal="true">
      <header class="corpus-head"><div><div class="corpus-kicker">Local evidence + optional AI</div><h2>真实网文指导与校准</h2><p>先由本地引擎完整统计，再由你选择是否发送分层抽样给 AI 深析。档案会在写作时按 Skill 提供指导，不只用于改提示词。</p></div><button class="corpus-close" type="button" data-corpus-close>×</button></header>
      <div class="corpus-section"><div class="corpus-grid"><div>
        <label class="corpus-drop"><span><strong>选择参考文本</strong>TXT / MD / DOCX · 单文件不超过 20 MiB</span><input id="corpusFiles" type="file" multiple accept=".txt,.md,.markdown,.docx"></label>
        <label class="corpus-consent"><input id="corpusConsent" type="checkbox"><span>我确认自己有权分析这些文本。默认只保存分析档案，不保存原文；只有点击“AI 深度分析”才会发送界面列明的分层抽样。</span></label>
        <div class="corpus-actions"><button class="corpus-btn primary" type="button" id="corpusAnalyze">本地完整分析</button><button class="corpus-btn" type="button" id="corpusAI">AI 深度分析</button><button class="corpus-btn" type="button" id="corpusExport">导出档案</button></div><p class="corpus-muted" id="corpusFileHint">尚未选择文件</p>
      </div><div><div class="corpus-profile-head"><strong>综合总结</strong><div class="corpus-actions compact"><button class="corpus-btn" id="corpusRememberSummary">记入项目记忆</button><button class="corpus-btn backend-only" id="corpusRememberBackend">记入后台</button></div></div><div class="corpus-summary-box" id="corpusSummary">分析后会解释识别到了什么、哪些结论可靠、哪些需要降级。</div></div></div></div>
      <div class="corpus-section corpus-bordered"><div class="corpus-profile-head"><div><strong>指导库</strong><p class="corpus-muted">启用的档案会在每次对应写作功能请求时动态加入；不会复制来源句子。</p></div><span class="corpus-status" id="corpusGuideStatus">未启用</span></div><div class="corpus-guide-grid" id="corpusGuidance"></div></div>
      <div class="corpus-section corpus-bordered"><strong>语料档案</strong><p class="corpus-muted">哈希去重；可逐份停用指导，而不必删除分析结果。</p><div class="corpus-profile-list" id="corpusProfiles"></div></div>
      <div class="corpus-section corpus-bordered"><div class="corpus-profile-head"><div><strong>提示词工作台</strong><p class="corpus-muted">可追加指导、修改旧指导块，或明确用预览内容整段替换。预览可直接编辑，应用前保留精确快照。</p></div><select class="corpus-select" id="corpusApplyMode"><option value="modify">修改现有指导块</option><option value="append">追加到现有提示词</option><option value="replace">整段替换提示词</option></select></div>
        <div class="corpus-skill-grid" id="corpusSkills"></div><div class="corpus-actions"><button class="corpus-btn" type="button" id="corpusBuild">生成提示词候选</button><button class="corpus-btn" type="button" id="corpusAIRewrite">AI 修改候选</button><button class="corpus-btn primary" type="button" id="corpusApply" disabled>确认应用</button><button class="corpus-btn" type="button" id="corpusRememberPrompt">候选记入记忆</button></div>
        <textarea class="corpus-preview" id="corpusPreview" spellcheck="false" placeholder="候选会显示为每个 Skill 的完整结果，可在应用前修改"></textarea><div class="corpus-history" id="corpusHistory"></div>
      </div></section>`;
    document.body.appendChild(root);
    root.querySelector('[data-corpus-close]').onclick = close;
    root.onclick = event => { if (event.target === root) close(); };
    root.querySelector('#corpusFiles').onchange = event => {
      pendingFiles = [...(event.target.files || [])];
      root.querySelector('#corpusFileHint').textContent = pendingFiles.length ? `${pendingFiles.length} 个文件 · ${pendingFiles.map(file => file.name).join('、')}` : '尚未选择文件';
    };
    root.querySelector('#corpusAnalyze').onclick = analyzeFiles;
    root.querySelector('#corpusAI').onclick = runAIAnalysis;
    root.querySelector('#corpusExport').onclick = exportArchive;
    root.querySelector('#corpusBuild').onclick = buildCandidate;
    root.querySelector('#corpusAIRewrite').onclick = aiRewriteCandidate;
    root.querySelector('#corpusApply').onclick = applyCandidate;
    root.querySelector('#corpusApplyMode').onchange = () => { if (candidate) renderCandidatePreview(); };
    root.querySelector('#corpusRememberSummary').onclick = () => rememberText(combinedSummary(), '语料分析总结', 'style');
    root.querySelector('#corpusRememberBackend').onclick = () => rememberText(combinedSummary(), '语料分析总结', 'style', true);
    root.querySelector('#corpusRememberPrompt').onclick = () => rememberText(root.querySelector('#corpusPreview').value, '语料提示词候选', 'rule');
    render();
  }

  async function prepareFiles() {
    if (!pendingFiles.length) throw new Error('请先选择参考文本');
    const prepared = [];
    for (const file of pendingFiles) {
      if (file.size > MAX_FILE) throw new Error(`${file.name}: 文件超过 20 MiB`);
      const text = await fileText(file);
      if (countRunes(text) < 200) throw new Error(`${file.name}: 有效正文不足 200 字`);
      prepared.push({ file, text, hash: await sha256(file), local: analyze(text) });
    }
    return prepared;
  }

  async function analyzeFiles() {
    if (!document.getElementById('corpusConsent').checked) return toast('✕', '请先确认文本分析权限');
    try {
      const prepared = await prepareFiles();
      let profiles = read(PROFILE_KEY, []), returned = [];
      if (!usesBrowser()) {
        const body = new FormData(); body.append('authorized', 'true'); prepared.forEach(item => body.append('files', item.file, item.file.name));
        const response = await fetch('/api/corpus', { method: 'POST', body });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error?.message || data?.error || `HTTP ${response.status}`);
        returned = data.profiles || [];
      }
      for (const item of prepared) {
        const backend = returned.find(raw => profileSource(raw).sha256 === item.hash);
        const raw = backend ? { ...item.local, ...backend, metrics: backend.metrics || item.local.metrics, guidance_cards: backend.guidance_cards || item.local.guidance_cards, summary: backend.summary || item.local.summary } : { id: `corpus-${item.hash.slice(0, 12)}`, name: item.file.name, sha256: item.hash, bytes: item.file.size, imported_at: new Date().toISOString(), ...item.local };
        const index = profiles.findIndex(profile => profile.sha256 === item.hash);
        const profile = normalizeProfile(raw, profiles[index]);
        if (index >= 0) profiles[index] = profile; else profiles.push(profile);
        sessionSources.set(profile.id, { name: item.file.name, sample: sampleText(item.text) });
      }
      saveProfiles(profiles); candidate = null; document.getElementById('corpusApply').disabled = true;
      document.getElementById('corpusFileHint').textContent = `本地完整分析完成 · ${prepared.length} 份原文仅停留在本次页面内存，刷新即清除`;
      render(); toast('✓', '本地分析与指导卡已更新');
    } catch (error) { toast('✕', error.message); }
  }

  function cleanAIJSON(text) {
    const source = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const start = source.indexOf('{'), end = source.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AI 没有返回可解析的结构化分析');
    return JSON.parse(source.slice(start, end + 1));
  }

  function normalizeAICards(cards) {
    return (Array.isArray(cards) ? cards : []).slice(0, 12).map((card, index) => ({
      id: `ai-${index + 1}`, title: String(card.title || `AI 指导 ${index + 1}`).slice(0, 50), scope: String(card.scope || '按场景判断').slice(0, 80),
      instruction: String(card.instruction || card.rule || '').slice(0, 800), evidence: String(card.evidence || '').slice(0, 500), counterexample: String(card.counterexample || card.caution || '').slice(0, 500),
      tasks: (Array.isArray(card.tasks) ? card.tasks : DEFAULT_SKILLS).map(String).slice(0, 16), source: 'ai'
    })).filter(card => card.instruction);
  }

  async function runAIAnalysis() {
    if (!document.getElementById('corpusConsent').checked) return toast('✕', '请先确认文本分析权限');
    if (typeof S === 'undefined' || !S.apiConfig || (typeof aiHasConfig === 'function' && !aiHasConfig(S.apiConfig))) return toast('✕', '请先配置可用的 AI 模型');
    const profiles = read(PROFILE_KEY, []).filter(profile => profile.active !== false);
    const available = profiles.map(profile => ({ profile, source: sessionSources.get(profile.id) })).filter(item => item.source?.sample);
    if (!available.length) return toast('✕', 'AI 深析需要本次页面内的原文抽样；请重新选择文件并先运行本地分析');
    const metrics = available.map(({ profile }) => ({ name: profile.name, summary: profile.summary, metrics: profile.metrics }));
    const samples = available.map(({ profile, source }) => `【来源：${profile.name} · 分层抽样】\n${source.sample}`).join('\n\n========\n\n').slice(0, MAX_AI_SAMPLE);
    const prompt = `请分析以下用户有权使用的真实网文分层抽样。先校验本地统计，再提取可迁移的叙事方法。不要模仿作者，不要复述或保存原句，不要从作品搬运专名、人物、桥段。\n\n【本地统计】\n${JSON.stringify(metrics)}\n\n【抽样正文】\n${samples}\n\n只输出 JSON：{"summary":"综合总结","guidance_cards":[{"title":"标题","scope":"适用场景","instruction":"可执行指导","evidence":"来自抽样的结构证据，不引用原句","counterexample":"何时不应套用","tasks":["润色","续写"]}],"prompt_notes":["提示词调整建议"],"uncertainties":["不确定项"]}`;
    const system = '你是中文网络小说语料分析器。必须区分证据、推断和不确定性；提取因果组织、场景推进、人物行动、对白功能、信息释放和章节收束的方法，不做作者身份仿写。';
    const button = document.getElementById('corpusAI'); button.disabled = true; button.textContent = 'AI 分析中…';
    try {
      const data = cleanAIJSON(await callAI(prompt, S.apiConfig, system));
      const report = { created_at: new Date().toISOString(), source_ids: available.map(item => item.profile.id), summary: String(data.summary || '').slice(0, 3000), guidance_cards: normalizeAICards(data.guidance_cards), prompt_notes: (Array.isArray(data.prompt_notes) ? data.prompt_notes : []).map(String).slice(0, 12), uncertainties: (Array.isArray(data.uncertainties) ? data.uncertainties : []).map(String).slice(0, 12) };
      if (!report.summary || !report.guidance_cards.length) throw new Error('AI 分析结构不完整，请重试或更换模型');
      write(AI_REPORT_KEY, report); document.dispatchEvent(new CustomEvent('ww:corpus-guidance-changed')); render(); toast('✓', `AI 深析完成，新增 ${report.guidance_cards.length} 张指导卡`);
    } catch (error) { toast('✕', error.message); }
    finally { button.disabled = false; button.textContent = 'AI 深度分析'; }
  }

  function activeGuidance() {
    const profiles = read(PROFILE_KEY, []).filter(profile => profile.active !== false);
    const cards = profiles.flatMap(profile => (profile.guidance_cards || []).map(card => ({ ...card, source_name: profile.name, evidence_grade: profile.evidence_grade })));
    const report = read(AI_REPORT_KEY, null);
    if (report?.guidance_cards?.length) cards.push(...report.guidance_cards.map(card => ({ ...card, source_name: 'AI 深析', evidence_grade: 'ai-reviewed' })));
    const seen = new Set();
    return cards.filter(card => { const key = `${card.title}|${card.instruction}`; if (!card.instruction || seen.has(key)) return false; seen.add(key); return true; });
  }

  function matchesSkill(card, skill) {
    const tasks = card.tasks || [];
    if (tasks.includes(skill)) return true;
    return Object.entries(TASK_ALIASES).some(([group, aliases]) => aliases.includes(skill) && (tasks.includes(group) || tasks.some(task => aliases.includes(task))));
  }

  function guidanceForSkill(skill) {
    const cards = activeGuidance().filter(card => matchesSkill(card, skill)).slice(0, 7);
    if (!cards.length) return '';
    return `【真实网文指导库 · 本次调用】\n${cards.map(card => `- [${card.title}｜${card.scope || '按场景'}] ${card.instruction}${card.counterexample ? ` 例外：${card.counterexample}` : ''}`).join('\n')}\n- 这些是授权语料中提炼的方法证据，不是风格配额；当前指令、项目事实、人物逻辑和当前文本声音优先。不得复制来源专名、句子、人物或桥段。\n【/真实网文指导库 · 本次调用】`;
  }

  function combinedSummary() {
    const profiles = read(PROFILE_KEY, []).filter(profile => profile.active !== false), report = read(AI_REPORT_KEY, null);
    const local = profiles.map(profile => `【${profile.name}｜${profile.evidence_grade}】${profile.summary}`).join('\n');
    return [local, report?.summary ? `【AI 深析】${report.summary}` : '', report?.uncertainties?.length ? `【待验证】${report.uncertainties.join('；')}` : ''].filter(Boolean).join('\n\n');
  }

  function buildBrowserCandidate(profiles, skills) {
    const cards = activeGuidance(), skillAddenda = {};
    for (const skill of skills) {
      const selected = cards.filter(card => matchesSkill(card, skill)).slice(0, 9);
      const lines = selected.length ? selected.map(card => `- ${card.instruction}${card.counterexample ? `（不适用：${card.counterexample}）` : ''}`) : profiles.flatMap(profile => profile.rules || []).slice(0, 7).map(rule => `- ${rule}`);
      skillAddenda[skill] = `\n\n${BLOCK_START}\n${lines.join('\n')}\n- 以上来自授权语料的本地统计与可选 AI 深析；仅作按场景调用的写作指导，不复制来源专名、句子、人物或桥段。当前指令、项目事实、人物逻辑和当前文本声音优先。\n${BLOCK_END}`;
    }
    return { id: `guide-${Date.now().toString(36)}`, created_at: new Date().toISOString(), source_ids: profiles.map(profile => profile.id), target_skills: skills, skill_addenda: skillAddenda, method: 'local-guidance-cards-v3', status: 'candidate' };
  }

  async function buildCandidate() {
    const profiles = read(PROFILE_KEY, []).filter(profile => profile.active !== false);
    if (!profiles.length) return toast('✕', '请先分析并启用至少一份参考文本');
    const skills = [...document.querySelectorAll('[data-corpus-skill]:checked')].map(input => input.value);
    if (!skills.length) return toast('✕', '至少选择一个 Prompt Skill');
    try {
      if (!usesBrowser()) {
        const response = await fetch('/api/corpus/refinements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_ids: profiles.map(profile => profile.id), target_skills: skills }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error?.message || data?.error || `HTTP ${response.status}`);
        candidate = data.proposal;
        const browserCandidate = buildBrowserCandidate(profiles, skills);
        if (!candidate.skill_addenda || !Object.keys(candidate.skill_addenda).length) candidate.skill_addenda = browserCandidate.skill_addenda;
      } else candidate = buildBrowserCandidate(profiles, skills);
      renderCandidatePreview(); document.getElementById('corpusApply').disabled = false;
    } catch (error) { toast('✕', error.message); }
  }

  function stripGuidanceBlock(prompt) {
    const source = String(prompt || ''), start = source.indexOf(BLOCK_START);
    if (start < 0) return source;
    const end = source.indexOf(BLOCK_END, start);
    return (end >= 0 ? source.slice(0, start) + source.slice(end + BLOCK_END.length) : source.slice(0, start)).trimEnd();
  }

  function resultPrompt(name, mode) {
    const current = window.wwPromptSkill?.(name)?.prompt || '', addendum = candidate?.skill_addenda?.[name] || candidate?.addendum || '';
    if (mode === 'replace') return addendum.trim();
    if (mode === 'append') return `${current.trimEnd()}${addendum}`.trim();
    return `${stripGuidanceBlock(current)}${addendum}`.trim();
  }

  function renderCandidatePreview() {
    if (!candidate) return;
    const mode = document.getElementById('corpusApplyMode').value;
    document.getElementById('corpusPreview').value = candidate.target_skills.map(name => `===== ${name} =====\n${resultPrompt(name, mode)}\n===== /${name} =====`).join('\n\n');
  }

  function parsePreview(value, names) {
    const result = {};
    for (const name of names) {
      const start = `===== ${name} =====`, end = `===== /${name} =====`, from = value.indexOf(start), to = value.indexOf(end, from + start.length);
      if (from < 0 || to < 0) throw new Error(`预览缺少 ${name} 的完整分段标记`);
      const prompt = value.slice(from + start.length, to).trim();
      if (!prompt) throw new Error(`${name} 的提示词不能为空`);
      result[name] = prompt;
    }
    return result;
  }

  async function aiRewriteCandidate() {
    if (!candidate) return toast('✕', '请先生成提示词候选');
    if (typeof S === 'undefined' || !S.apiConfig || (typeof aiHasConfig === 'function' && !aiHasConfig(S.apiConfig))) return toast('✕', '请先配置可用的 AI 模型');
    const current = document.getElementById('corpusPreview').value;
    const prompt = `修改以下 Prompt Skill 候选，使要求更具体、完整、无冲突。保留每个“===== 名称 =====”与闭合标记，不能删掉事实优先级、人物知识边界、不得复制来源内容、按场景而非统计配额等边界。不要解释，只输出修改后的全部分段。\n\n${current}`;
    const button = document.getElementById('corpusAIRewrite'); button.disabled = true; button.textContent = 'AI 修改中…';
    try {
      const result = await callAI(prompt, S.apiConfig, '你是提示词编辑器。你修改的是用户可审阅候选，不执行写作任务。');
      parsePreview(result, candidate.target_skills); document.getElementById('corpusPreview').value = result.trim(); toast('✓', 'AI 修改已写入预览，尚未应用');
    } catch (error) { toast('✕', error.message); }
    finally { button.disabled = false; button.textContent = 'AI 修改候选'; }
  }

  function applyCandidate() {
    if (!candidate) return;
    const before = {};
    try {
      const prompts = parsePreview(document.getElementById('corpusPreview').value, candidate.target_skills);
      for (const name of candidate.target_skills) { const skill = window.wwPromptSkill?.(name); if (!skill) continue; before[name] = skill.prompt; window.wwPromptSkillSave(name, prompts[name]); }
      const history = read(HISTORY_KEY, []);
      history.unshift({ ...candidate, mode: document.getElementById('corpusApplyMode').value, status: 'applied', applied_at: new Date().toISOString(), before });
      write(HISTORY_KEY, history.slice(0, 30)); candidate = null; document.getElementById('corpusPreview').value = ''; document.getElementById('corpusApply').disabled = true;
      window.wwRefreshPromptSkillSummary?.(); render(); toast('✓', '提示词已更新，并保留精确回退快照');
    } catch (error) { Object.entries(before).forEach(([name, prompt]) => { try { window.wwPromptSkillSave(name, prompt); } catch (_) {} }); toast('✕', error.message); }
  }

  function rollback(id) {
    const history = read(HISTORY_KEY, []), item = history.find(record => record.id === id && record.status === 'applied');
    if (!item) return;
    try {
      Object.entries(item.before || {}).forEach(([name, prompt]) => window.wwPromptSkillSave(name, prompt)); item.status = 'rolled_back'; item.rolled_back_at = new Date().toISOString();
      write(HISTORY_KEY, history); window.wwRefreshPromptSkillSummary?.(); render(); toast('↶', '已恢复应用前的完整 Prompt Skill');
    } catch (error) { toast('✕', error.message); }
  }

  async function rememberText(content, title, category, backend = false) {
    const value = String(content || '').trim();
    if (!value) return toast('✕', '当前没有可记忆内容');
    if (typeof window.wwRemember !== 'function') return toast('✕', '记忆模块尚未就绪');
    try { await window.wwRemember(value, { title, category, source: 'corpus', scope: 'project', backend }); }
    catch (error) { toast('✕', error.message); }
  }

  function toggleProfile(id) {
    const profiles = read(PROFILE_KEY, []), profile = profiles.find(item => item.id === id);
    if (!profile) return;
    profile.active = profile.active === false; saveProfiles(profiles); candidate = null; render();
  }

  async function removeProfile(id) {
    try {
      if (!usesBrowser()) {
        const response = await fetch(`/api/corpus?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data?.error?.message || data?.error || `HTTP ${response.status}`); }
      }
      saveProfiles(read(PROFILE_KEY, []).filter(profile => profile.id !== id)); sessionSources.delete(id); candidate = null; render();
    } catch (error) { toast('✕', error.message); }
  }

  function renderGuidance() {
    const cards = activeGuidance(), root = document.getElementById('corpusGuidance');
    root.innerHTML = cards.length ? cards.map((card, index) => `<article class="corpus-guide"><div class="corpus-profile-head"><div><strong>${esc(card.title)}</strong><div class="corpus-muted">${esc(card.scope || '按场景')} · ${esc(card.source_name || '')}</div></div><button class="corpus-btn" data-remember-guide="${index}">记忆</button></div><p>${esc(card.instruction)}</p><details><summary>证据与例外</summary><div class="corpus-muted">证据：${esc(card.evidence || '来自聚合结构信号')}</div><div class="corpus-muted">例外：${esc(card.counterexample || '以当前场景因果为准')}</div></details></article>`).join('') : '<div class="corpus-muted">本地分析后会在这里生成按任务调用的指导卡。</div>';
    root.querySelectorAll('[data-remember-guide]').forEach(button => button.onclick = () => { const card = cards[Number(button.dataset.rememberGuide)]; rememberText(`[${card.title}] ${card.instruction}\n适用：${card.scope}\n例外：${card.counterexample || '以当前场景为准'}`, `语料指导：${card.title}`, 'style'); });
    document.getElementById('corpusGuideStatus').textContent = cards.length ? `${cards.length} 张启用 · 写作时动态调用` : '未启用';
  }

  function render() {
    if (!document.getElementById('corpusLab')) return;
    const profiles = read(PROFILE_KEY, []), summary = combinedSummary();
    document.getElementById('corpusSummary').textContent = summary || '分析后会解释识别到了什么、哪些结论可靠、哪些需要降级。';
    document.getElementById('corpusProfiles').innerHTML = profiles.length ? profiles.map(profile => `<article class="corpus-profile ${profile.active === false ? 'disabled' : ''}"><div class="corpus-profile-head"><div><strong>${esc(profile.name)}</strong><div class="corpus-muted">${esc(profile.evidence_grade)} 证据 · ${profile.active === false ? '已停用指导' : '写作指导已启用'}</div></div><div class="corpus-actions compact"><button class="corpus-btn" type="button" data-toggle-corpus="${esc(profile.id)}">${profile.active === false ? '启用' : '停用'}</button><button class="corpus-btn danger" type="button" data-remove-corpus="${esc(profile.id)}">删除</button></div></div><div class="corpus-metrics"><div class="corpus-metric"><strong>${Number(profile.metrics.runes || 0).toLocaleString()}</strong>字</div><div class="corpus-metric"><strong>${Number(profile.metrics.chapters || 0).toLocaleString()}</strong>章节</div><div class="corpus-metric"><strong>${pct(profile.metrics.dialogue_ratio)}</strong>对白</div><div class="corpus-metric"><strong>${Math.round(profile.metrics.median_paragraph_runes || profile.metrics.average_paragraph_runes || 0)}</strong>段长中位</div></div><p class="corpus-profile-summary">${esc(profile.summary || '')}</p>${(profile.warnings || []).map(warning => `<div class="corpus-warning">${esc(warning)}</div>`).join('')}</article>`).join('') : '<div class="corpus-muted">还没有语料档案。</div>';
    document.querySelectorAll('[data-remove-corpus]').forEach(button => button.onclick = () => removeProfile(button.dataset.removeCorpus));
    document.querySelectorAll('[data-toggle-corpus]').forEach(button => button.onclick = () => toggleProfile(button.dataset.toggleCorpus));
    const names = (window.wwPromptSkillManifest || []).map(skill => skill.name), checked = new Set([...document.querySelectorAll('[data-corpus-skill]:checked')].map(input => input.value));
    document.getElementById('corpusSkills').innerHTML = names.map(name => `<label class="corpus-skill"><input type="checkbox" data-corpus-skill value="${esc(name)}" ${(checked.size ? checked.has(name) : DEFAULT_SKILLS.includes(name)) ? 'checked' : ''}><span>${esc(name)}</span></label>`).join('');
    const history = read(HISTORY_KEY, []);
    document.getElementById('corpusHistory').innerHTML = history.length ? `<strong>提示词应用记录</strong>${history.map(item => `<div class="corpus-profile"><div class="corpus-profile-head"><div><strong>${esc((item.target_skills || []).join('、'))}</strong><div class="corpus-muted">${esc(item.applied_at || item.created_at)} · ${esc(item.mode || 'modify')} · ${esc(item.status)}</div></div>${item.status === 'applied' ? `<button class="corpus-btn" data-rollback="${esc(item.id)}">回退</button>` : ''}</div></div>`).join('')}` : '';
    document.querySelectorAll('[data-rollback]').forEach(button => button.onclick = () => rollback(button.dataset.rollback));
    document.querySelectorAll('.backend-only').forEach(element => { element.hidden = usesBrowser(); });
    renderGuidance(); refreshSummary();
  }

  function refreshSummary() {
    const profiles = read(PROFILE_KEY, []), active = profiles.filter(profile => profile.active !== false).length, cards = activeGuidance().length;
    document.querySelectorAll('[data-corpus-summary]').forEach(node => { node.textContent = profiles.length ? `${profiles.length} 份档案 · ${active} 份启用 · ${cards} 张指导卡会按 Skill 动态调用` : '导入授权文本：本地完整分析、可选 AI 深析、写作时动态指导'; });
  }

  function exportArchive() {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `writing-workshop-corpus-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  function exportData() { return { schema: 'writing-workshop/corpus-guidance', version: 2, profiles: read(PROFILE_KEY, []), ai_report: read(AI_REPORT_KEY, null), history: read(HISTORY_KEY, []), text_stored: false }; }
  function importData(data) {
    const value = data?.corpus || data;
    if (!value || !Array.isArray(value.profiles)) return 0;
    const safe = value.profiles.filter(profile => profile && profile.text_stored === false && profile.sha256 && profile.metrics).slice(0, 100).map(profile => normalizeProfile(profile));
    saveProfiles(safe); if (value.ai_report?.guidance_cards) write(AI_REPORT_KEY, value.ai_report); if (Array.isArray(value.history)) write(HISTORY_KEY, value.history.slice(0, 30)); render(); return safe.length;
  }

  async function refreshBackendProfiles() {
    if (usesBrowser()) return;
    try {
      const response = await fetch('/api/corpus', { cache: 'no-store' }); if (!response.ok) return;
      const archive = await response.json();
      if (Array.isArray(archive.profiles)) { const old = read(PROFILE_KEY, []); saveProfiles(archive.profiles.map(raw => normalizeProfile(raw, old.find(item => item.sha256 === profileSource(raw).sha256)))); render(); }
    } catch (_) {}
  }

  function open() { ensure(); render(); refreshBackendProfiles(); const root = document.getElementById('corpusLab'); root.classList.add('show'); root.setAttribute('aria-hidden', 'false'); }
  function close() { const root = document.getElementById('corpusLab'); if (root) { root.classList.remove('show'); root.setAttribute('aria-hidden', 'true'); } }
  function toast(icon, message) { if (typeof window.showToast === 'function') window.showToast(icon, message); else alert(message); }

  window.wwOpenCorpusLab = open;
  window.wwCorpusExport = exportData;
  window.wwCorpusImport = importData;
  window.wwCorpusGuidanceForSkill = guidanceForSkill;
  window.wwRefreshCorpusSummary = refreshSummary;
  window.wwCorpusAnalyzeText = analyze;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { ensure(); refreshSummary(); });
  else { ensure(); refreshSummary(); }
})();
