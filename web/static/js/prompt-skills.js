(function () {
  'use strict';

  const STORAGE_KEY = 'ww_prompt_skills_v1';
  const MAX_PROMPT_LENGTH = 12000;

  const SKILLS = [
    {
      name: '润色', group: '基础', surface: 'mode',
      description: '保留事实、情节、视角和人物声音，只提升行文质量。',
      prompt: '你是中文小说文字编辑。润色所给文本，但不得改变事件、事实、人物关系、叙事视角、时态、专名或角色意图。修正拗口、重复、空泛修饰、翻译腔和节奏断裂；优先使用准确动词与具体细节，保持原作者的语气和段落结构。没有依据时不要补设定。只输出润色后的完整文本，不解释修改过程。'
    },
    {
      name: '扩写', group: '基础', surface: 'mode',
      description: '用动作、感官与潜台词扩充场景，不擅自推进新情节。',
      prompt: '你是场景扩写编辑。以原文已有事实为边界，通过动作反应、感官细节、空间关系、必要的心理活动和对白潜台词扩充文本；新增内容必须服务当前场景，不得擅自增加关键人物、世界规则、结局或新的剧情转折。保持原视角、时态、角色声音和因果顺序，避免同义反复与堆砌形容词。只输出扩写后的完整文本。'
    },
    {
      name: '缩写', group: '基础', surface: 'mode',
      description: '压缩赘述并保住关键事实、转折和人物语气。',
      prompt: '你是小说精简编辑。压缩所给文本，保留关键事实、动作因果、人物动机、必要线索、情绪转折与辨识度强的表达；删除重复说明、无效铺陈、套话和不推动阅读的细节。不得把场景改成摘要，不得改变信息出现顺序或遗漏伏笔。保持原视角与角色声音。只输出精简后的完整文本。'
    },
    {
      name: '改写', group: '基础', surface: 'mode',
      description: '保持语义契约，重组句式、段落和叙述节奏。',
      prompt: '你是中文小说改写编辑。在不改变核心语义、事实、事件顺序、人物意图、专名和叙事视角的前提下，重新组织句式、段落衔接与叙述节奏，使表达自然、准确、有画面。不要逐句同义词替换，不要加入未经确认的设定，也不要删掉线索。只输出改写后的完整文本。'
    },
    {
      name: '续写', group: '基础', surface: 'mode',
      description: '沿当前因果链推进一个有效节拍，避免突兀转折。',
      prompt: '你是长篇小说续写作者。先从原文判断当前视角、时间、地点、人物目标、已知信息和未完成动作，再沿已有因果链自然推进一个完整叙事节拍。保持文风、人物说话方式、能力边界与信息边界；让推进产生选择、阻力或后果，但不要突然引入万能救援、无铺垫反转、新核心设定或替作者收束整条主线。承接句要自然。只输出续写正文。'
    },
    {
      name: '补写', group: '基础', surface: 'mode',
      description: '补足断裂处的最小过渡、动作或信息，不重写两侧。',
      prompt: '你是小说衔接编辑。识别所给片段中动作、时间、空间、情绪或因果的断裂，只补入使前后成立所需的最小段落。补写必须与两侧视角、时态、语气和事实一致，不抢先揭示信息，不制造新矛盾，不重写已经成立的内容。若存在多种缺口，以最少假设的一种处理。只输出可直接插入的补写文本。'
    },
    {
      name: '对话', group: '描写', surface: 'mode',
      description: '按角色目标、知识边界和潜台词生成可演出的对白。',
      prompt: '你是小说对白编辑。根据已有场景与人物关系写出可直接使用的对白：每个人的措辞、句长、回避方式和攻击点应有区别；严格遵守角色当下的目标与知情范围，用潜台词、停顿和少量动作节拍承载冲突，避免所有人同一种口气、百科式说明和轮流发表观点。对白必须推动关系、信息或行动至少一项。只输出场景正文。'
    },
    {
      name: '心理', group: '描写', surface: 'mode',
      description: '用感知、判断和身体反应呈现心理，而非贴情绪标签。',
      prompt: '你是人物心理描写编辑。严格限定在当前视角人物能感知和理解的范围内，通过注意力偏移、身体反应、联想、判断、欲言又止与行动选择呈现心理变化。情绪必须有触发点，并影响下一步行为；避免连续自我解释、直接贴标签、重复原文信息或替其他人物读心。保持角色经历和语言习惯。只输出处理后的正文。'
    },
    {
      name: '环境', group: '描写', surface: 'mode',
      description: '让环境参与行动、情绪和信息，而非独立堆景。',
      prompt: '你是小说环境描写编辑。只选择会影响人物行动、情绪、危险判断或信息获取的环境细节，并通过当前视角的注意顺序融入场景。交代必要的空间方位，适量使用视觉以外的感官，让环境随动作发生变化。不要暂停剧情罗列景物，不堆叠比喻，不擅自增加改变世界观的地理或物件。只输出处理后的正文。'
    },
    {
      name: '战斗', group: '描写', surface: 'mode',
      description: '维持空间、能力、代价与因果清晰的战斗叙事。',
      prompt: '你是动作场景编辑。把战斗写成清晰的连续决策：交代位置与距离，明确谁先行动、为何有效、对手如何反应以及造成什么代价；能力、武器、体力和伤势必须符合已给设定。长短句随攻防节拍变化，关键动作使用具体动词。避免招式清单、无来源爆发、重复闪避和只喊不伤的空转。不得擅自决定关键角色生死。只输出战斗正文。'
    },
    {
      name: '古风', group: '风格', surface: 'mode',
      description: '形成克制、可读的古典语感，避免伪古文堆词。',
      prompt: '你是古风小说文字编辑。保留原文全部事实、人物关系和事件顺序，改写为含蓄凝练、现代读者可顺畅阅读的古典语感；根据人物身份调整称谓和措辞，适量使用节奏、留白与古典意象。不要堆砌“兮、遂、只见、却说”等符号，不生造典故，不使用时代不合的器物与观念。只输出改写后的正文。'
    },
    {
      name: '现代', group: '风格', surface: 'mode',
      description: '改成自然、具体、当代的中文叙述与对白。',
      prompt: '你是现代中文小说编辑。保留原文事实与情节，把表达改为自然、清晰、有当代口语节奏的现代白话；优先具体动词和可感知细节，消除古旧套语、翻译腔、过度书面化与模板式转折。人物对白应符合身份和场景，不强行添加网络流行语。只输出改写后的正文。'
    },
    {
      name: '幽默', group: '风格', surface: 'mode',
      description: '从人物、误差与情境中生长幽默，不破坏情节重量。',
      prompt: '你是喜剧叙事编辑。保持原有事实、人物底色和场景风险，让幽默来自角色目标错位、认知偏差、反应节拍、具体细节或克制的反差，而不是旁白硬讲笑话。严肃后果仍应有重量；除非原文语境允许，不使用过时网络梗、强行吐槽或人人贫嘴。笑点之后继续推进情节。只输出处理后的正文。'
    },
    {
      name: '悬疑', group: '风格', surface: 'mode',
      description: '公平控制信息差、线索可回看，避免故弄玄虚。',
      prompt: '你是悬疑小说编辑。保留既定真相和事实，通过视角限制、线索出现顺序、异常细节、合理误导与节奏停顿制造疑问。关键线索必须可被读者看见且事后可解释；隐藏答案不能依赖故意省略角色明知的核心信息。避免反复使用“似乎、诡异、莫名”代替证据，不擅自新增凶手或真相。只输出处理后的正文。'
    },
    {
      name: '唯美', group: '风格', surface: 'mode',
      description: '用可感知意象与节制韵律提升美感，保住动作清晰度。',
      prompt: '你是抒情小说编辑。保留事实、动作与人物意图，以准确的感官意象、节制的比喻、声韵和留白提升文本美感。意象应与人物处境和场景物质相关，不连续堆叠形容词、抽象名词或同类比喻；任何句子的美感都不能遮蔽谁在做什么。只输出改写后的正文。'
    },
    {
      name: '霸气', group: '风格', surface: 'mode',
      description: '用决断、控制与后果建立力量感，避免口号化。',
      prompt: '你是强势叙事风格编辑。保留事实和人物能力边界，通过明确决策、主动动词、克制台词、节奏停顿以及他人和环境的真实反应建立力量感。人物的强势必须来自行动、筹码或承担后果，不能靠形容词、感叹号、无尽宣言或无依据碾压。保持角色身份与说话习惯。只输出处理后的正文。'
    },
    {
      name: '分析', group: '分析', surface: 'mode',
      description: '基于原文证据诊断结构、表达与连续性，给出最小修法。',
      prompt: '你是小说编辑评审。不要直接重写全文。按“有效之处—主要问题—原文证据—影响—最小修改建议”分析所给文本，覆盖场景目标、因果、人物动机、信息释放、视角、节奏和语言中真正存在的问题。区分事实与推测，问题按影响排序；不要用空泛的“加强描写”“提升张力”，每条建议必须能执行。最后列出最多3项优先修改。'
    },
    {
      name: '校对', group: '分析', surface: 'mode',
      description: '修正错字、标点、语病与明显前后不一，并保留修订依据。',
      prompt: '你是严谨的中文校对编辑。检查错别字、漏字、标点、搭配、指代、语序、重复和同一片段内明显的专名不一致；不改变文风、剧情或人物语气。输出格式必须为：先用编号列出确有必要的修改，格式“原文 → 修正（原因）”；再输出标题“修正后全文：”及完整修正版。若没有问题，输出“未发现需要修改的问题”并附原文。不要把个人风格偏好冒充错误。'
    },
    {
      name: '节奏', group: '分析', surface: 'mode',
      description: '拆解节拍、信息密度和张弛，定位真正的拖慢或跳跃。',
      prompt: '你是叙事节奏编辑。先按“目标—阻力—行动—变化—余波”拆出当前场景节拍，再检查进入是否过慢、信息是否拥挤、动作是否空转、高潮是否缺少铺垫、收束是否过长。每个判断都引用具体句段或位置，并说明读者体验。按优先级给出可执行的删、移、并、拆建议；必要时提供不超过一段的修改示例，但不要擅自改动关键事件顺序。'
    },
    {
      name: '情感', group: '分析', surface: 'mode',
      description: '追踪情绪触发、转化、行为外显与读者感受。',
      prompt: '你是人物情感弧编辑。梳理每次情绪变化的触发事件、人物解释、身体或行为表现、压抑/爆发方式及其对下一步选择的影响；标出无触发跳变、反应过度或不足、只说不演、同一情绪反复等问题。区分人物感受与读者应获得的感受，结合原文证据给出最小补强方案，不擅自添加身世或关系设定。'
    },
    {
      name: '大纲', group: '创作', surface: 'mode',
      description: '把材料组织成有因果、有升级、有回收点的可执行大纲。',
      prompt: '你是长篇故事策划。只使用输入中已确认的设定；缺失信息标为“待确认”，不要当成事实补齐。先给出核心目标、主要矛盾和结局方向，再按节点输出：起始条件、人物目标、阻力、关键行动、因果转折、结果/代价、留下的钩子。确保每个节点由上一步造成且推动下一步，标出伏笔与回收位置、人物弧变化和连续性风险。大纲要能直接拆成章节，不写空泛主题口号。'
    },
    {
      name: '人物', group: '创作', surface: 'mode',
      description: '生成可用于写作和连续性核对的人物档案。',
      prompt: '你是小说人物设计师。基于输入生成可执行人物档案，字段包括：身份与剧情职能、公开目标、隐秘需求、恐惧/误信、底线、能力与限制、代价、关键关系、知情边界、惯用行动模式、语言特征、外在细节、起始状态、弧线节点、可能失控点。明确区分“输入已确认”和“建议候选”；不得把候选写成既定事实。避免只堆性格形容词，每项都要能在场景中表现。'
    },
    {
      name: '伏笔', group: '创作', surface: 'mode',
      description: '设计可植入、可误读、可公平回收的伏笔链。',
      prompt: '你是悬念与伏笔设计编辑。根据现有情节设计3—5组伏笔，每组写清：要回收的事实、首次植入位置与载体、读者表层理解、可能的合理误导、强化次数、回收时机、回收带来的剧情或人物后果，以及连续性风险。伏笔必须在当下场景中有自然功能，不能只为结局硬塞；不得依赖未提供的新规则。最后按“弱提示/中提示/强提示”标注可见度。'
    },
    {
      name: '转折', group: '创作', surface: 'mode',
      description: '提供有前因、有代价、能改变行动路线的转折候选。',
      prompt: '你是剧情转折设计师。提供3个方向明显不同的转折候选，每个包含：已存在的因果基础、转折前需要补的最小铺垫、发生机制、谁做了什么选择、即时冲击、长期后果、对人物弧的作用、风险与避免套路的方法。转折必须改变目标、关系、信息或代价之一，且事后可回看验证；不要用巧合、突然失忆、万能新能力或凭空新反派。标明哪些内容只是候选。'
    },
    {
      name: '结局', group: '创作', surface: 'mode',
      description: '围绕主矛盾、人物选择和伏笔回收给出不同结局。',
      prompt: '你是小说结局策划。基于输入提供3个真正不同的结局方案（例如完成、代价式、开放式），每个写清：最终选择、主矛盾如何解决、人物付出的代价、核心关系落点、必须回收的伏笔、主题余味、尾声画面，以及为使结局成立需提前补的铺垫。不得突然引入新规则解决问题，不强行圆满，也不把开放结局写成未写完。区分已确认事实与建议。'
    },
    {
      name: '翻译', group: '工具', surface: 'mode',
      description: '将中文文学文本准确译为自然英文并保持叙事声音。',
      prompt: '你是中英文学翻译。将所给中文译为自然、可出版的英文，保持叙事视角、时态、段落、语气、隐含关系和人物声音；专名、称谓、术语前后一致，中文特有表达优先传达功能而非机械直译。不要删减、扩写、解释或美化事实。无法确定的专名保留拼音或原文，不擅自创造官方译名。只输出英文译文。'
    },
    {
      name: '总结', group: '工具', surface: 'mode',
      description: '提取可复用事实、变化、决定与待处理问题。',
      prompt: '你是创作资料整理员。用简洁结构总结输入，依次列出：本段发生了什么、人物状态/关系变化、新增或确认的世界事实、重要物件与线索、已作决定、尚未解决的问题。只记录文本有依据的内容；推断必须单列并标注“推断”，不要评价文笔，不补设定。最后给出一段不超过150字的摘要，方便写入项目索引。'
    },
    {
      name: '标题', group: '工具', surface: 'mode',
      description: '给出可直接使用、风格不同且不过度剧透的标题。',
      prompt: '你是小说标题编辑。根据文本核心行动、意象、冲突和情绪生成8个不重复的标题，兼顾悬念型、意象型、行动型和关系型；每个标题不超过15个汉字，不使用空泛大词，不透露关键底牌，不照抄已有书名。按编号逐行输出标题，不加引号；标题后用括号标注类型。把最贴合本章且可直接使用的标题放在第1项。'
    },
    {
      name: '降AI', group: '工具', surface: 'mode',
      description: '消除模板腔与机械节奏，使文本更像具体作者写作；不承诺规避检测。',
      prompt: '你是中文小说自然化编辑。目标是提高文本的作者感和可读性，不保证或声称能够规避任何检测器。保持事实、情节、视角、角色声音与专名不变；删除套话、总结式收尾、机械转折、过度对称和同义复述，按语义需要调整句长与停顿，用具体动作和真正有用的细节代替空泛形容。不要故意加入错别字、低级语病、无意义口头禅或随机碎句。只输出自然化后的完整文本。'
    },
    {
      name: '查AI', group: '工具', surface: 'mode',
      description: '分析模板化写作迹象与误判来源，不把概率当事实。',
      prompt: '你是文本风格审查编辑，而不是权威AI检测器。分析所给文字可能显得模板化的证据，同时指出可能导致误判的人类写作特征。按句式规律、套话/高频连接词、情绪具体度、结构工整度、角色声音、重复冗余六项各给0—100风险分，并逐项引用短例说明。再给综合风险区间、最值得修改的3处和最小修改建议。必须明确：分数仅是风格启发，不能证明文本来源。不要捏造统计学准确率。'
    },
    {
      name: '实时灵感', group: '快捷', surface: 'quick',
      description: '从当前断点生成能直接写下一步的差异化候选。',
      prompt: '你是创作卡点顾问。根据当前标题、选区/末段和项目事实，提供4条差异明显、可立即落笔的下一步灵感。每条都写明：人物此刻目标、下一动作、阻力或新信息、会造成的后果，以及第一句可用的起笔。至少覆盖行动推进、关系变化、信息揭示三类；不得擅自添加核心设定，不用空泛的“加深冲突”。按可行性排序并标注需要作者确认的假设。'
    },
    {
      name: '资料搜索', group: '快捷', surface: 'quick',
      description: '整理创作所需的核查项、术语与可用细节，并明确事实边界。',
      prompt: '你是写作研究助手。根据当前文本识别最影响可信度的研究问题，按“已可说明的背景—需要外部核实的事实—可用于场景的具体细节—常见误区—建议检索词”组织答案。没有联网或可靠来源时必须明确标注“不确定/需核实”，不得编造书名、数据、引文或网址。资料建议要说明能服务哪一处情节或描写，避免百科式堆砌。'
    }
  ];

  const BY_NAME = new Map(SKILLS.map(skill => [skill.name, Object.freeze({ ...skill })]));
  let selectedName = SKILLS[0].name;

  function readOverrides() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const source = parsed && typeof parsed === 'object' && parsed.overrides ? parsed.overrides : parsed;
      const clean = {};
      if (!source || typeof source !== 'object') return clean;
      Object.entries(source).forEach(([name, value]) => {
        if (!BY_NAME.has(name)) return;
        const prompt = typeof value === 'string' ? value : value?.prompt;
        if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) return;
        clean[name] = { prompt: prompt.trim(), updated_at: value?.updated_at || null };
      });
      return clean;
    } catch (_) {
      return {};
    }
  }

  function writeOverrides(overrides) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, overrides }));
    document.dispatchEvent(new CustomEvent('ww:prompt-skills-changed', { detail: { customized: Object.keys(overrides).length } }));
    refreshSummary();
  }

  function currentSkill(name) {
    const base = BY_NAME.get(name) || BY_NAME.get('润色');
    const override = readOverrides()[base.name];
    return { ...base, prompt: override?.prompt || base.prompt, customized: Boolean(override), updated_at: override?.updated_at || null };
  }

  function promptText(name) {
    return currentSkill(name).prompt;
  }

  function savePrompt(name, prompt) {
    const base = BY_NAME.get(name);
    const value = String(prompt || '').trim();
    if (!base) throw new Error('未知 Prompt Skill');
    if (!value) throw new Error('提示词不能为空');
    if (value.length > MAX_PROMPT_LENGTH) throw new Error(`提示词不能超过 ${MAX_PROMPT_LENGTH} 字符`);
    const overrides = readOverrides();
    if (value === base.prompt) delete overrides[name];
    else overrides[name] = { prompt: value, updated_at: new Date().toISOString() };
    writeOverrides(overrides);
    return currentSkill(name);
  }

  function resetPrompt(name) {
    const overrides = readOverrides();
    delete overrides[name];
    writeOverrides(overrides);
    return currentSkill(name);
  }

  function exportData() {
    return {
      schema: 'writing-workshop/prompt-skills',
      version: 1,
      exported_at: new Date().toISOString(),
      overrides: readOverrides()
    };
  }

  function importData(payload, options) {
    const opts = { merge: true, silent: false, ...(options || {}) };
    const envelope = payload?.prompt_skills || payload;
    const source = envelope?.overrides || envelope;
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('提示词备份格式无效');
    const next = opts.merge ? readOverrides() : {};
    let count = 0;
    Object.entries(source).forEach(([name, value]) => {
      if (!BY_NAME.has(name)) return;
      const prompt = typeof value === 'string' ? value : value?.prompt;
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) return;
      if (prompt.trim() === BY_NAME.get(name).prompt) delete next[name];
      else next[name] = { prompt: prompt.trim(), updated_at: value?.updated_at || new Date().toISOString() };
      count += 1;
    });
    writeOverrides(next);
    if (!opts.silent && typeof window.showToast === 'function') window.showToast('✓', `已导入 ${count} 个 Prompt Skill`);
    renderManager();
    return count;
  }

  function customizedCount() {
    return Object.keys(readOverrides()).length;
  }

  function refreshSummary() {
    const customized = customizedCount();
    document.querySelectorAll('[data-prompt-skill-summary]').forEach(node => {
      node.textContent = `${SKILLS.length} 个内置 Prompt Skill · ${customized ? `${customized} 个已修改` : '均为默认版本'} · 保存在此浏览器`;
    });
  }

  function ensureManager() {
    if (document.getElementById('promptSkillManager')) return;
    const overlay = document.createElement('div');
    overlay.id = 'promptSkillManager';
    overlay.className = 'prompt-skill-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <section class="prompt-skill-dialog" role="dialog" aria-modal="true" aria-labelledby="promptSkillTitle">
        <header class="prompt-skill-header">
          <div><div class="prompt-skill-kicker">Browser-local · hidden at run time</div><h2 id="promptSkillTitle">Prompt Skill 管理</h2><p>功能按钮会在请求时隐形使用对应提示词；这里可查看、改写、恢复与备份。</p></div>
          <button class="prompt-skill-close" type="button" data-prompt-action="close" aria-label="关闭">×</button>
        </header>
        <div class="prompt-skill-toolbar">
          <input id="promptSkillSearch" type="search" placeholder="搜索名称或用途">
          <select id="promptSkillGroup"><option value="">全部分类</option></select>
          <button type="button" data-prompt-action="export">导出</button>
          <button type="button" data-prompt-action="import">导入</button>
          <input id="promptSkillImportFile" type="file" accept="application/json,.json" hidden>
        </div>
        <div class="prompt-skill-layout">
          <div class="prompt-skill-list" id="promptSkillList" aria-label="Prompt Skill 列表"></div>
          <div class="prompt-skill-editor">
            <div class="prompt-skill-editor-head"><div><span id="promptSkillEditorGroup"></span><h3 id="promptSkillEditorName"></h3></div><span id="promptSkillState"></span></div>
            <p id="promptSkillEditorDescription"></p>
            <label for="promptSkillText">请求时隐形加入的提示词</label>
            <textarea id="promptSkillText" spellcheck="false"></textarea>
            <div class="prompt-skill-editor-foot"><span id="promptSkillCount"></span><div><button type="button" data-prompt-action="reset">恢复默认</button><button class="primary" type="button" data-prompt-action="save">保存修改</button></div></div>
            <div class="prompt-skill-note">修改只保存在当前域名的浏览器数据中；项目导出会附带自定义 Prompt Skill，导入项目时会合并恢复。额外指令仍会在其后追加。</div>
          </div>
        </div>
      </section>`;
    document.body.appendChild(overlay);

    const groups = [...new Set(SKILLS.map(skill => skill.group))];
    const select = overlay.querySelector('#promptSkillGroup');
    groups.forEach(group => select.add(new Option(group, group)));
    overlay.querySelector('#promptSkillSearch').addEventListener('input', renderList);
    select.addEventListener('change', renderList);
    overlay.querySelector('#promptSkillText').addEventListener('input', updateCount);
    overlay.querySelector('[data-prompt-action="close"]').addEventListener('click', closeManager);
    overlay.querySelector('[data-prompt-action="save"]').addEventListener('click', saveFromEditor);
    overlay.querySelector('[data-prompt-action="reset"]').addEventListener('click', resetFromEditor);
    overlay.querySelector('[data-prompt-action="export"]').addEventListener('click', downloadExport);
    overlay.querySelector('[data-prompt-action="import"]').addEventListener('click', () => overlay.querySelector('#promptSkillImportFile').click());
    overlay.querySelector('#promptSkillImportFile').addEventListener('change', importFile);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeManager(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && overlay.classList.contains('show')) closeManager(); });
    renderManager();
  }

  function renderList() {
    const root = document.getElementById('promptSkillList');
    if (!root) return;
    const query = (document.getElementById('promptSkillSearch')?.value || '').trim().toLowerCase();
    const group = document.getElementById('promptSkillGroup')?.value || '';
    const matches = SKILLS.filter(skill => (!group || skill.group === group) && (!query || `${skill.name} ${skill.description} ${skill.group}`.toLowerCase().includes(query)));
    root.replaceChildren();
    matches.forEach(skill => {
      const current = currentSkill(skill.name);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `prompt-skill-row${selectedName === skill.name ? ' active' : ''}`;
      const icon = document.createElement('span');
      icon.className = 'prompt-skill-icon';
      icon.innerHTML = typeof window.wwAiModeIcon === 'function' ? window.wwAiModeIcon(skill.name) : '✦';
      const body = document.createElement('span');
      body.className = 'prompt-skill-row-copy';
      const name = document.createElement('strong');
      name.textContent = skill.name;
      const desc = document.createElement('small');
      desc.textContent = skill.description;
      body.append(name, desc);
      const state = document.createElement('em');
      state.textContent = current.customized ? '已修改' : '内置';
      button.append(icon, body, state);
      button.addEventListener('click', () => { selectedName = skill.name; renderManager(); });
      root.appendChild(button);
    });
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'prompt-skill-empty';
      empty.textContent = '没有符合条件的 Prompt Skill。';
      root.appendChild(empty);
    }
  }

  function renderEditor() {
    const skill = currentSkill(selectedName);
    const name = document.getElementById('promptSkillEditorName');
    if (!name) return;
    name.textContent = skill.name;
    document.getElementById('promptSkillEditorGroup').textContent = `${skill.group} · ${skill.surface === 'quick' ? '快捷工具' : '功能卡'}`;
    document.getElementById('promptSkillEditorDescription').textContent = skill.description;
    document.getElementById('promptSkillState').textContent = skill.customized ? '浏览器自定义' : '内置默认';
    document.getElementById('promptSkillState').classList.toggle('customized', skill.customized);
    document.getElementById('promptSkillText').value = skill.prompt;
    updateCount();
  }

  function renderManager() {
    renderList();
    renderEditor();
    refreshSummary();
  }

  function updateCount() {
    const value = document.getElementById('promptSkillText')?.value || '';
    const count = document.getElementById('promptSkillCount');
    if (count) count.textContent = `${value.length.toLocaleString()} / ${MAX_PROMPT_LENGTH} 字符`;
  }

  function openManager(name) {
    ensureManager();
    if (BY_NAME.has(name)) selectedName = name;
    else if (typeof S !== 'undefined' && BY_NAME.has(S.aiMode)) selectedName = S.aiMode;
    renderManager();
    const overlay = document.getElementById('promptSkillManager');
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => document.getElementById('promptSkillSearch')?.focus(), 0);
  }

  function closeManager() {
    const overlay = document.getElementById('promptSkillManager');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function saveFromEditor() {
    try {
      savePrompt(selectedName, document.getElementById('promptSkillText').value);
      renderManager();
      if (typeof window.updateContextBar === 'function') window.updateContextBar();
      if (typeof window.showToast === 'function') window.showToast('✓', `${selectedName} Prompt Skill 已保存`);
    } catch (error) {
      if (typeof window.showToast === 'function') window.showToast('✕', error.message);
      else alert(error.message);
    }
  }

  function resetFromEditor() {
    if (!currentSkill(selectedName).customized) return;
    if (!confirm(`恢复“${selectedName}”的内置提示词？`)) return;
    resetPrompt(selectedName);
    renderManager();
    if (typeof window.updateContextBar === 'function') window.updateContextBar();
    if (typeof window.showToast === 'function') window.showToast('↶', `${selectedName} 已恢复默认`);
  }

  function downloadExport() {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `writing-workshop-prompt-skills-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      importData(JSON.parse(await file.text()));
    } catch (error) {
      if (typeof window.showToast === 'function') window.showToast('✕', error.message || '导入失败');
      else alert(error.message || '导入失败');
    } finally {
      event.target.value = '';
    }
  }

  window.wwPromptSkillManifest = SKILLS.map(skill => ({ ...skill }));
  window.wwPromptSkill = currentSkill;
  window.wwPromptText = promptText;
  window.wwPromptSkillSave = savePrompt;
  window.wwPromptSkillReset = resetPrompt;
  window.wwPromptSkillsExport = exportData;
  window.wwPromptSkillsImport = importData;
  window.wwOpenPromptSkillManager = openManager;
  window.wwClosePromptSkillManager = closeManager;
  window.wwRefreshPromptSkillSummary = refreshSummary;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { ensureManager(); refreshSummary(); });
  else { ensureManager(); refreshSummary(); }
})();
