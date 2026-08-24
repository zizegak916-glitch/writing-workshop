(function (root) {
  'use strict';

  const skills = [
    '润色', '扩写', '缩写', '改写', '续写', '补写', '对话', '心理', '环境', '战斗',
    '古风', '现代', '幽默', '悬疑', '唯美', '霸气', '分析', '校对', '节奏', '情感',
    '大纲', '人物', '伏笔', '转折', '结局', '翻译', '总结', '标题', '降AI', '查AI',
    '实时灵感', '资料搜索'
  ];
  const entries = skills.map(name => ({ id: `skill.${name}`, label: `Prompt Skill · ${name}`, maxTokens: ['润色', '扩写', '改写', '续写', '补写', '翻译', '降AI'].includes(name) ? 8192 : 4096 }));
  entries.push(
    { id: 'import.analysis', label: '导入项目 AI 分析', maxTokens: 4096 },
    { id: 'api.connection', label: 'API 连接测试', maxTokens: 64 },
    { id: 'multi.desktop', label: '桌面多模型生成', maxTokens: 8192 },
    { id: 'multi.mobile', label: '移动多模型生成', maxTokens: 8192 },
    { id: 'analysis.deep-check', label: 'AI 深度检查', maxTokens: 4096 },
    { id: 'humanize.smart', label: '智能降 AI 改写', maxTokens: 8192 },
    { id: 'continuation.suggest', label: '续写方向建议', maxTokens: 2048 },
    { id: 'style.learn', label: '写作风格分析', maxTokens: 4096 },
    { id: 'quick.proofread', label: '快速校对', maxTokens: 8192 },
    { id: 'quick.title', label: '快速标题', maxTokens: 1024 },
    { id: 'quick.inspiration', label: '实时灵感', maxTokens: 4096 },
    { id: 'quick.research', label: '资料搜索', maxTokens: 4096 },
    { id: 'quick.humanize', label: '快速降 AI', maxTokens: 8192 },
    { id: 'quick.detect', label: 'AI 特征分析', maxTokens: 4096 },
    { id: 'corpus.deep-analysis', label: '真实网文 AI 深析', maxTokens: 8192 },
    { id: 'corpus.prompt-rewrite', label: '语料提示词 AI 修改', maxTokens: 8192 },
    { id: 'memory.chapter-compress', label: '长篇章节分块记忆', maxTokens: 4096 },
    { id: 'memory.chapter-merge', label: '长篇章节记忆合并', maxTokens: 4096 },
    { id: 'memory.arc-compress', label: '长篇阶段记忆压缩', maxTokens: 8192 },
    { id: 'memory.book-compress', label: '长篇全书记忆压缩', maxTokens: 8192 },
    { id: 'recursive.plan', label: '递归创作规划', maxTokens: 4096 },
    { id: 'recursive.design', label: '递归创作设计', maxTokens: 8192 },
    { id: 'recursive.write', label: '递归创作正文', maxTokens: 8192 },
    { id: 'workflow.run', label: '后端能力流程', maxTokens: 8192 }
  );

  const byId = new Map(entries.map(entry => [entry.id, Object.freeze({ ...entry })]));
  const contract = {
    list: () => [...byId.values()],
    has: id => byId.has(String(id || '')),
    get(id) {
      const task = byId.get(String(id || ''));
      if (!task) throw new Error(`未登记的 AI 功能：${id || '（空）'}`);
      return task;
    },
    taskForSkill(name) { return this.get(`skill.${name}`); },
    record(id, prompt, systemPrompt, stream) {
      const task = this.get(id);
      const detail = Object.freeze({ id: task.id, label: task.label, stream: !!stream, promptChars: String(prompt || '').length, systemChars: String(systemPrompt || '').length, at: Date.now() });
      root.wwLastAITask = detail;
      if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('ww:ai-task', { detail }));
      }
      return task;
    }
  };
  root.WWAITaskContract = Object.freeze(contract);
})(typeof globalThis !== 'undefined' ? globalThis : window);
