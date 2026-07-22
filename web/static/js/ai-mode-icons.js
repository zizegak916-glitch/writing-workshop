(function () {
  'use strict';

  const iconIds = Object.freeze({
    '润色': 'mode-polish', '扩写': 'mode-expand', '缩写': 'mode-condense', '改写': 'mode-rewrite',
    '续写': 'mode-continue', '补写': 'mode-fill', '对话': 'mode-dialogue', '心理': 'mode-psychology',
    '环境': 'mode-environment', '战斗': 'mode-battle', '古风': 'mode-classical', '现代': 'mode-modern',
    '幽默': 'mode-humor', '悬疑': 'mode-suspense', '唯美': 'mode-poetic', '霸气': 'mode-epic',
    '分析': 'mode-analyze', '校对': 'mode-proofread', '节奏': 'mode-rhythm', '情感': 'mode-emotion',
    '大纲': 'mode-outline', '人物': 'mode-character', '伏笔': 'mode-foreshadow', '转折': 'mode-twist',
    '结局': 'mode-ending', '翻译': 'mode-translate', '总结': 'mode-summarize', '标题': 'mode-title',
    '降AI': 'mode-humanize', '查AI': 'mode-detect',
    '实时灵感': 'mode-inspiration', '资料搜索': 'mode-research'
  });

  window.WW_AI_MODE_ICON_IDS = iconIds;
  window.wwAiModeIcon = function wwAiModeIcon(mode) {
    const id = iconIds[mode] || 'mode-workshop';
    return '<svg class="ic ai-mode-icon" aria-hidden="true" focusable="false"><use href="icons/ai-mode-icons.svg#' + id + '"></use></svg>';
  };
})();
