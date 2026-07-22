
// ═══ IndexedDB ═══
const DB_NAME='WritingWorkshop',DB_VER=3;let db;
function ensureIndex(store,name,keyPath,options={unique:false}){if(!store.indexNames.contains(name))store.createIndex(name,keyPath,options);}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VER);r.onupgradeneeded=e=>{const d=e.target.result;let st;if(!d.objectStoreNames.contains('projects'))d.createObjectStore('projects',{keyPath:'id',autoIncrement:true});st=d.objectStoreNames.contains('outlines')?e.target.transaction.objectStore('outlines'):d.createObjectStore('outlines',{keyPath:'id',autoIncrement:true});ensureIndex(st,'project_id','project_id');st=d.objectStoreNames.contains('characters')?e.target.transaction.objectStore('characters'):d.createObjectStore('characters',{keyPath:'id',autoIncrement:true});ensureIndex(st,'project_id','project_id');st=d.objectStoreNames.contains('chapters')?e.target.transaction.objectStore('chapters'):d.createObjectStore('chapters',{keyPath:'id',autoIncrement:true});ensureIndex(st,'project_id','project_id');if(!d.objectStoreNames.contains('aiHistory'))d.createObjectStore('aiHistory',{keyPath:'id',autoIncrement:true});st=d.objectStoreNames.contains('aiMemories')?e.target.transaction.objectStore('aiMemories'):d.createObjectStore('aiMemories',{keyPath:'id',autoIncrement:true});ensureIndex(st,'project_id','project_id');};r.onsuccess=e=>{db=e.target.result;res(db);};r.onerror=e=>rej(e.target.error);});}
function dbPut(s,v){return new Promise((r,j)=>{const t=db.transaction(s,'readwrite');const st=t.objectStore(s);const q=st.put(v);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});}
function dbGet(s,id){return new Promise((r,j)=>{const t=db.transaction(s,'readonly');const q=t.objectStore(s).get(id);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});}
function dbDel(s,id){return new Promise((r,j)=>{const t=db.transaction(s,'readwrite');const q=t.objectStore(s).delete(id);q.onsuccess=()=>r();q.onerror=()=>j(q.error);});}
function dbAll(s){return new Promise((r,j)=>{const t=db.transaction(s,'readonly');const q=t.objectStore(s).getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});}
function dbByIndex(s,f,v){return new Promise((r,j)=>{const t=db.transaction(s,'readonly');const st=t.objectStore(s);if(st.indexNames.contains(f)){const q=st.index(f).getAll(v);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);return;}const a=[];const q=st.openCursor();q.onsuccess=e=>{const c=e.target.result;if(c){if(c.value[f]===v)a.push(c.value);c.continue();}else r(a);};q.onerror=()=>j(q.error);});}
async function apiJSON(url,opts={}){
  const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
  return d;
}

// ═══ State ═══
const S={proj:null,active:null,editCharId:null,aiMode:'润色',aiTemp:'mid',aiLen:'long',apiConfig:JSON.parse(localStorage.getItem('ww_api')||'{}'),autoSave:true,unsaved:false,wordGoal:2000,curFontSize:16,lastArpResult:'',selectedProvider:'claude',previewMode:false,projects:[],aiMemories:[]};


// ═══ Token Estimation & Context Limits ═══
const MODEL_CONTEXT_LIMITS={
  'claude-sonnet-4-20250514':200000,'claude-sonnet-4':200000,'claude-3-5-sonnet':200000,'claude-3-haiku':200000,
  'gpt-4o':128000,'gpt-4o-mini':128000,'gpt-4-turbo':128000,'gpt-4':8192,'gpt-3.5-turbo':16385,
  'deepseek-chat':65536,'deepseek-reasoner':65536,
  'mimo-v2.5-pro':131072,'mimo-v2.5':131072,
  'qwen-plus':131072,'qwen-turbo':131072,'qwen-max':32768,
  'glm-4-flash':128000,'glm-4':128000,
  'moonshot-v1-8k':8192,'moonshot-v1-32k':32768,'moonshot-v1-128k':131072,
  'deepseek-ai/DeepSeek-V3':65536,
  'anthropic/claude-sonnet-4':200000
};
function estimateTokens(text){
  if(!text)return 0;
  let count=0;
  for(let i=0;i<text.length;i++){
    const c=text.charCodeAt(i);
    if(c>=0x4E00&&c<=0x9FFF||c>=0x3400&&c<=0x4DBF||c>=0x20000&&c<=0x2A6DF)count+=2;
    else if(c>=0x00&&c<=0x7F)count+=0.25;
    else count+=1.5;
  }
  return Math.ceil(count);
}
function getContextLimit(model){
  if(!model)return 200000;
  for(const[k,v]of Object.entries(MODEL_CONTEXT_LIMITS)){
    if(model.includes(k)||k.includes(model))return v;
  }
  return 200000;
}
function updateContextBar(){
  const ac=S.apiConfig;
  if(!aiHasConfig(ac))return;
  const ed=document.getElementById('mainEditor');
  const sel=ed.value.slice(ed.selectionStart,ed.selectionEnd).trim();
  const content=sel||ed.value.trim().slice(-1000);
  const extra=document.getElementById('aiPrompt')?.value.trim()||'';
  const md=AI_MODES[S.aiMode]||{p:''};
  let fullPrompt=(typeof wwPromptText==='function'?wwPromptText(S.aiMode):md.p)+'\n\n'+content;
  if(S.proj)fullPrompt+='\n\n'+buildCtx();
  if(extra)fullPrompt+='\n\n'+extra;
  const memCtx=buildMemoryContext();
  if(memCtx)fullPrompt+='\n\n'+memCtx;
  const promptTokens=estimateTokens(fullPrompt);
  const limit=getContextLimit(ac.model||'');
  const pct=Math.min(100,Math.round(promptTokens/limit*100));
  const bar=document.getElementById('ctxBar');
  const txt=document.getElementById('ctxText');
  if(bar){
    bar.style.width=pct+'%';
    if(pct>80){bar.style.background='var(--red)';}
    else if(pct>50){bar.style.background='var(--gold)';}
    else{bar.style.background='var(--accent)';}
  }
  if(txt){
    const kStr=promptTokens>1000?(promptTokens/1000).toFixed(1)+'k':promptTokens;
    const lStr=limit>1000?(limit/1000).toFixed(0)+'k':limit;
    txt.textContent=kStr+'/'+lStr+' tokens';
    if(pct>80)txt.style.color='var(--red)';
    else if(pct>50)txt.style.color='var(--gold)';
    else txt.style.color='var(--text-muted)';
  }
}
async function sha256(t){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');}

// ═══ i18n ═══
const LANG={
zh:{
  "nav-outline":"大纲",
  "nav-chapters":"章节",
  "nav-chars":"人物",
  "nav-notes":"笔记",
  "bnav-editor":"编辑",
  "bnav-outline":"大纲",
  "bnav-chapters":"章节",
  "bnav-chars":"人物",
  "bnav-ai":"AI",
  "tb-focus":"◎ 专注",
  "tb-preview":"◉ 预览",
  "tb-save":"保存",
  "tb-autosave":"↯ 自动保存",
  "tb-export":"↓ 导出",
  "aq-proof":"✓ 纠错",
  "aq-title":"¶ 自动标题",
  "aq-inspire":"◇ 实时灵感",
  "aq-research":"⊕ 资料搜索",
  "aq-humanize":"▷ 降AI率",
  "aq-detect":"⊕ 查AI",
  "ed-placeholder":"开始写作...",
  "ed-chapter":"章节标题...",
  "ed-para":"段",
  "ed-sent":"句",
  "ed-read":"约",
  "ed-min":"分钟",
  "ed-words":"字",
  "bb-total":"总字数:",
  "bb-para":"段落:",
  "ap-title":"AI 助手",
  "ap-tab-modes":"助手",
  "ap-tab-multi":"对比",
  "ap-tab-hist":"历史",
  "ap-tab-memory":"🧠 记忆",
  "ap-temp":"创意度",
  "ap-len":"输出长度",
  "ap-prompt":"补充指令",
  "ap-prompt-ph":"可选：输入额外要求...",
  "ap-gen":"开始生成",
  "ap-gen-ing":"生成中...",
  "multi-slot":"槽位",
  "multi-gen":"⚡ 并行生成所有槽位",
  "hist-title":"AI 操作记录",
  "hist-clear":"清空",
  "hist-empty":"暂无历史记录",
  "mod-newproj":"📁 新建项目",
  "mod-newproj-sub":"创建一个新的写作项目",
  "mod-projname":"项目名称",
  "mod-projname-ph":"例如：《星河往事》",
  "mod-required":"必填",
  "mod-genre":"作品类型",
  "mod-goal":"每日写作目标",
  "mod-goal-hint":"字数",
  "mod-desc":"项目简介",
  "mod-desc-ph":"简单描述一下这个故事...",
  "mod-world":"世界观设定",
  "mod-world-ph":"世界观、背景设定...",
  "mod-cancel":"取消",
  "mod-create":"创建项目 ✓",
  "mod-projlist":"📚 我的项目",
  "mod-projlist-sub":"点击项目进入写作",
  "mod-import":"📥 导入项目",
  "mod-close":"关闭",
  "mod-newproj-btn":"＋ 新建项目",
  "mod-api":"⚙️ API 设置",
  "mod-api-sub":"配置 AI 服务商。API Key 仅存储在本地浏览器。",
  "mod-api-provider":"选择服务商",
  "mod-api-url":"Base URL",
  "mod-api-url-hint":"自定义接口地址",
  "mod-api-key":"API Key",
  "mod-api-key-hint":"加密存储于本地",
  "mod-api-test":"测试",
  "mod-api-model":"模型",
  "mod-api-model-hint":"留空使用默认模型",
  "mod-api-save":"保存设置 ✓",
  "mod-char":"👤 添加人物",
  "mod-char-sub":"建立人物档案，AI会参考人物性格",
  "mod-char-name":"人物姓名",
  "mod-char-name-ph":"例如：陆云深",
  "mod-char-role":"人物定位",
  "mod-char-pers":"性格特点",
  "mod-char-pers-ph":"性格特点...",
  "mod-char-back":"背景故事",
  "mod-char-back-ph":"背景故事...",
  "mod-char-look":"外貌描述",
  "mod-char-look-ph":"外貌描述...",
  "mod-char-skill":"技能/能力",
  "mod-char-skill-ph":"技能或特殊能力...",
  "mod-char-save":"保存 ✓",
  "mod-profile":"👤 个人中心",
  "mod-profile-sub":"游客本地模式、查看项目统计",
  "mod-profile-stats":"📊 当前项目统计",
  "mod-profile-chpwd":"🔒 游客本地模式",
  "mod-oldpwd":"当前密码",
  "mod-newpwd":"新密码（至少4位）",
  "mod-newpwd2":"确认新密码",
  "mod-lock":"游客本地模式",
  "mod-chpwd-btn":"无需密码",
  "sb-outline":"故事大纲",
  "sb-chapters":"章节列表",
  "sb-chars":"人物档案",
  "sb-notes":"笔记",
  "sb-add-outline":"＋ 添加大纲",
  "sb-add-chapter":"＋ 添加章节",
  "sb-add-char":"＋ 添加人物",
  "sb-empty-outline":"暂无大纲",
  "sb-empty-chapter":"暂无章节",
  "sb-empty-char":"暂无人物",
  "sb-empty-notes":"功能开发中...",
  "lock-set":"游客本地模式",
  "lock-unlock":"游客本地模式",
  "lock-btn-set":"进入工坊",
  "lock-btn-unlock":"进入工坊",
  "lock-hint":"忘记密码？",
  "lock-reset":"重置（将清除所有数据）",
  "lock-placeholder":"本地游客模式无需密码",
  "toast-saved":"已保存",
  "toast-deleted":"已删除",
  "toast-added":"已添加",
  "toast-copied":"已复制",
  "toast-exported":"已导出",
  "toast-created":"已创建",
  "toast-locked":"密码设置成功",
  "toast-pwd-err":"密码错误",
  "toast-pwd-short":"密码至少4位",
  "toast-pwd-changed":"密码已修改",
  "toast-no-proj":"请先选择项目",
  "toast-no-api":"请先配置 API",
  "toast-no-content":"请先输入内容",
  "arp-title":"AI 生成结果",
  "arp-replace":"替换原文",
  "arp-append":"追加到末尾",
  "arp-insert":"插入光标处",
  "arp-copy":"复制",
  "aqr-apply":"✓ 应用",
  "aqr-copy":"⊡ 复制",
  "ps-project":"项目：",
  "ps-genre":"类型：",
  "ps-words":"总字数：",
  "ps-outlines":"大纲：",
  "ps-chapters":"个 · 章节：",
  "ps-chars":"人物：",
  "ps-goal":"每日目标：",
  "ps-created":"创建：",
  "ps-updated":"更新：",
  "ps-none":"暂无项目",
  "ps-units-1":"个",
  "param-strict":"严谨",
  "param-balance":"平衡",
  "param-creative":"创意",
  "param-short":"短",
  "param-medium":"中",
  "param-long":"长",
  "param-xlong":"超长",
  "select-project":"选择项目...",
  "logo":"AI 写作工坊",
  "genre-xf":"玄幻",
  "genre-ds":"都市",
  "genre-yq":"言情",
  "genre-kh":"科幻",
  "genre-xy":"悬疑",
  "genre-ls":"历史",
  "genre-wx":"武侠",
  "genre-qh":"奇幻",
  "form-name":"项目名称",
  "form-required":"必填",
  "form-genre":"作品类型",
  "form-goal":"每日目标",
  "form-goal-unit":"字数",
  "form-desc":"项目简介",
  "form-desc-ph":"简述故事...",
  "form-world":"世界观",
  "form-world-ph":"世界观设定...",
  "form-cancel":"取消",
  "form-create":"创建 ✓",
  "form-save":"保存 ✓",
  "form-api-provider":"选择服务商",
  "form-api-key-label":"API Key",
  "form-api-key-hint":"加密存储于本地",
  "form-api-test":"测试",
  "form-api-model-label":"模型",
  "form-api-model-ph":"留空使用默认",
  "prov-tongyi":"通义",
  "prov-zhipu":"智谱",
  "prov-custom":"自定义",
  "mode-润色":"润色",
  "mode-扩写":"扩写",
  "mode-缩写":"缩写",
  "mode-改写":"改写",
  "mode-续写":"续写",
  "mode-补写":"补写",
  "mode-对话":"对话",
  "mode-心理":"心理",
  "mode-环境":"环境",
  "mode-战斗":"战斗",
  "mode-古风":"古风",
  "mode-现代":"现代",
  "mode-幽默":"幽默",
  "mode-悬疑":"悬疑",
  "mode-唯美":"唯美",
  "mode-霸气":"霸气",
  "mode-分析":"分析",
  "mode-校对":"校对",
  "mode-节奏":"节奏",
  "mode-情感":"情感",
  "mode-大纲":"大纲",
  "mode-人物":"人物",
  "mode-伏笔":"伏笔",
  "mode-转折":"转折",
  "mode-结局":"结局",
  "mode-翻译":"翻译",
  "mode-总结":"总结",
  "mode-标题":"标题",
  "mode-降AI":"降AI",
  "mode-查AI":"查AI",
  "grp-基础":"基础",
  "grp-描写":"描写",
  "grp-风格":"风格",
  "grp-分析":"分析",
  "grp-创作":"创作",
  "grp-工具":"工具",
  "mod-settings":"⚙️ 设置",
  "mod-settings-sub":"语言、API 和主题设置",
  "mod-save":"保存 ✓",
  "tb-settings":"设置",
  "toast-autosave-on":"自动保存已开启",
  "toast-autosave-off":"自动保存已关闭",
  "toast-enter-name":"请输入名称",
  "toast-enter-char-name":"请输入姓名",
  "toast-enter-memory":"请输入记忆内容",
  "toast-enter-current-password":"请输入当前密码",
  "toast-current-password-wrong":"当前密码错误",
  "toast-title-applied":"标题已应用",
  "toast-humanize-applied":"降AI已应用",
  "toast-proofread-applied":"纠错已应用",
  "toast-inspire-inserted":"灵感已插入",
  "genre-uncategorized":"未分类",
  "default-chapter-title":"第一章",
  "ps-units-2":"字",
  "default-doc-title":"我的创作",
  "toast-imported":"导入成功",
  "toast-import-scan":"AI 正在扫描导入内容...",
  "toast-import-scan-done":"导入内容扫描完成",
  "toast-invalid-file":"无效文件",
  "toast-copy-failed":"复制失败",
  "toast-new-password-short":"新密码至少4位",
  "toast-password-mismatch":"两次密码不一致",
  "outline-new":"新大纲",
  "chapter-new":"新章节",
  "char-no-desc":"暂无简介",
  "action-edit":"编辑",
  "action-delete":"删除",
  "label-personality":"性格",
  "label-background":"背景",
  "label-appearance":"外貌",
  "label-skills":"技能",
  "confirm-delete":"确定删除？",
},
en:{
  "nav-outline":"Outline",
  "nav-chapters":"Chapters",
  "nav-chars":"Characters",
  "nav-notes":"Notes",
  "bnav-editor":"Editor",
  "bnav-outline":"Outline",
  "bnav-chapters":"Chapters",
  "bnav-chars":"Chars",
  "bnav-ai":"AI",
  "tb-focus":"◎ Focus",
  "tb-preview":"◉ Preview",
  "tb-save":"Save",
  "tb-autosave":"↯ AutoSave",
  "tb-export":"↓ Export",
  "aq-proof":"✓ Proofread",
  "aq-title":"¶ Auto Title",
  "aq-inspire":"◇ Inspire",
  "aq-research":"⊕ Research",
  "aq-humanize":"▷ Humanize",
  "aq-detect":"⊕ AI Check",
  "ed-placeholder":"Start writing...",
  "ed-chapter":"Chapter title...",
  "ed-para":"¶",
  "ed-sent":"sentences",
  "ed-read":"~",
  "ed-min":"min read",
  "ed-words":"chars",
  "bb-total":"Total:",
  "bb-para":"¶:",
  "ap-title":"AI Assistant",
  "ap-tab-modes":"Modes",
  "ap-tab-multi":"Compare",
  "ap-tab-hist":"History",
  "ap-tab-memory":"🧠 Memory",
  "ap-temp":"Creativity",
  "ap-len":"Length",
  "ap-prompt":"Extra",
  "ap-prompt-ph":"Optional instructions...",
  "ap-gen":"Generate",
  "ap-gen-ing":"Generating...",
  "multi-slot":"Slot",
  "multi-gen":"⚡ Generate All Slots",
  "hist-title":"AI History",
  "hist-clear":"Clear",
  "hist-empty":"No history yet",
  "mod-newproj":"📁 New Project",
  "mod-newproj-sub":"Create a new writing project",
  "mod-projname":"Project Name",
  "mod-projname-ph":"e.g. Star Wars",
  "mod-required":"Required",
  "mod-genre":"Genre",
  "mod-goal":"Daily Goal",
  "mod-goal-hint":"words",
  "mod-desc":"Description",
  "mod-desc-ph":"Brief description...",
  "mod-world":"World Setting",
  "mod-world-ph":"World building notes...",
  "mod-cancel":"Cancel",
  "mod-create":"Create ✓",
  "mod-projlist":"📚 My Projects",
  "mod-projlist-sub":"Click to open",
  "mod-import":"📥 Import",
  "mod-close":"Close",
  "mod-newproj-btn":"＋ New Project",
  "mod-api":"⚙️ API Settings",
  "mod-api-sub":"Configure AI provider. Key stored locally only.",
  "mod-api-provider":"Provider",
  "mod-api-url":"Base URL",
  "mod-api-url-hint":"Custom endpoint",
  "mod-api-key":"API Key",
  "mod-api-key-hint":"Stored locally",
  "mod-api-test":"Test",
  "mod-api-model":"Model",
  "mod-api-model-hint":"Leave empty for default",
  "mod-api-save":"Save ✓",
  "mod-char":"👤 Add Character",
  "mod-char-sub":"AI will reference character traits",
  "mod-char-name":"Name",
  "mod-char-name-ph":"e.g. John",
  "mod-char-role":"Role",
  "mod-char-pers":"Personality",
  "mod-char-pers-ph":"Personality traits...",
  "mod-char-back":"Background",
  "mod-char-back-ph":"Backstory...",
  "mod-char-look":"Appearance",
  "mod-char-look-ph":"Physical description...",
  "mod-char-skill":"Skills",
  "mod-char-skill-ph":"Special abilities...",
  "mod-char-save":"Save ✓",
  "mod-profile":"👤 Profile",
  "mod-profile-sub":"Local guest mode & project stats",
  "mod-profile-stats":"📊 Project Stats",
  "mod-profile-chpwd":"Guest local mode",
  "mod-oldpwd":"Current Password",
  "mod-newpwd":"New Password (4+ chars)",
  "mod-newpwd2":"Confirm Password",
  "mod-lock":"Guest mode",
  "mod-chpwd-btn":"Guest mode",
  "sb-outline":"Story Outline",
  "sb-chapters":"Chapters",
  "sb-chars":"Characters",
  "sb-notes":"Notes",
  "sb-add-outline":"＋ Add Outline",
  "sb-add-chapter":"＋ Add Chapter",
  "sb-add-char":"＋ Add Character",
  "sb-empty-outline":"No outlines",
  "sb-empty-chapter":"No chapters",
  "sb-empty-char":"No characters",
  "sb-empty-notes":"Coming soon...",
  "lock-set":"Local guest mode",
  "lock-unlock":"Local guest mode",
  "lock-btn-set":"Enter workshop",
  "lock-btn-unlock":"Enter workshop",
  "lock-hint":"Forgot?",
  "lock-reset":"Reset (clears all data)",
  "lock-placeholder":"Local guest mode",
  "toast-saved":"Saved",
  "toast-deleted":"Deleted",
  "toast-added":"Added",
  "toast-copied":"Copied",
  "toast-exported":"Exported",
  "toast-created":"Created",
  "toast-locked":"Password set",
  "toast-pwd-err":"Wrong password",
  "toast-pwd-short":"Min 4 characters",
  "toast-pwd-changed":"Password changed",
  "toast-no-proj":"Select a project first",
  "toast-no-api":"Configure API first",
  "toast-no-content":"Enter some content first",
  "arp-title":"AI Result",
  "arp-replace":"Replace",
  "arp-append":"Append",
  "arp-insert":"Insert",
  "arp-copy":"Copy",
  "aqr-apply":"✓ Apply",
  "aqr-copy":"⊡ Copy",
  "ps-project":"Project:",
  "ps-genre":"Genre:",
  "ps-words":"Words:",
  "ps-outlines":"Outlines:",
  "ps-chapters":" · Chapters:",
  "ps-chars":"Characters:",
  "ps-goal":"Daily Goal:",
  "ps-created":"Created:",
  "ps-updated":"Updated:",
  "ps-none":"No project",
  "ps-units-1":"",
  "param-strict":"Strict",
  "param-balance":"Balance",
  "param-creative":"Creative",
  "param-short":"Short",
  "param-medium":"Medium",
  "param-long":"Long",
  "param-xlong":"Extra Long",
  "select-project":"Select project...",
  "logo":"AI Writing Workshop",
  "genre-xf":"Xianxia",
  "genre-ds":"Urban",
  "genre-yq":"Romance",
  "genre-kh":"Sci-Fi",
  "genre-xy":"Mystery",
  "genre-ls":"Historical",
  "genre-wx":"Martial Arts",
  "genre-qh":"Fantasy",
  "form-name":"Project Name",
  "form-required":"Required",
  "form-genre":"Genre",
  "form-goal":"Daily Goal",
  "form-goal-unit":"words",
  "form-desc":"Description",
  "form-desc-ph":"Brief description...",
  "form-world":"World Setting",
  "form-world-ph":"World building notes...",
  "form-cancel":"Cancel",
  "form-create":"Create ✓",
  "form-save":"Save ✓",
  "form-api-provider":"Provider",
  "form-api-key-label":"API Key",
  "form-api-key-hint":"Stored locally",
  "form-api-test":"Test",
  "form-api-model-label":"Model",
  "form-api-model-ph":"Leave empty for default",
  "prov-tongyi":"Tongyi",
  "prov-zhipu":"Zhipu",
  "prov-custom":"Custom",
  "mode-润色":"Polish",
  "mode-扩写":"Expand",
  "mode-缩写":"Condense",
  "mode-改写":"Rewrite",
  "mode-续写":"Continue",
  "mode-补写":"Fill",
  "mode-对话":"Dialogue",
  "mode-心理":"Psychology",
  "mode-环境":"Scenery",
  "mode-战斗":"Battle",
  "mode-古风":"Classical",
  "mode-现代":"Modern",
  "mode-幽默":"Humor",
  "mode-悬疑":"Mystery",
  "mode-唯美":"Poetic",
  "mode-霸气":"Epic",
  "mode-分析":"Analyze",
  "mode-校对":"Proofread",
  "mode-节奏":"Pacing",
  "mode-情感":"Emotion",
  "mode-大纲":"Outline",
  "mode-人物":"Character",
  "mode-伏笔":"Foreshadow",
  "mode-转折":"Twist",
  "mode-结局":"Ending",
  "mode-翻译":"Translate",
  "mode-总结":"Summary",
  "mode-标题":"Titles",
  "mode-降AI":"Humanize",
  "mode-查AI":"AI Check",
  "grp-基础":"Basic",
  "grp-描写":"Describe",
  "grp-风格":"Style",
  "grp-分析":"Analyze",
  "grp-创作":"Create",
  "grp-工具":"Tools",
  "mod-settings":"⚙️ Settings",
  "mod-settings-sub":"Language, API & Theme",
  "mod-save":"Save ✓",
  "tb-settings":"Settings",
  "toast-autosave-on":"Auto save enabled",
  "toast-autosave-off":"Auto save disabled",
  "toast-enter-name":"Please enter a name",
  "toast-enter-char-name":"Please enter a character name",
  "toast-enter-memory":"Please enter memory content",
  "toast-enter-current-password":"Please enter current password",
  "toast-current-password-wrong":"Current password is incorrect",
  "toast-title-applied":"Title applied",
  "toast-humanize-applied":"Humanize result applied",
  "toast-proofread-applied":"Proofread result applied",
  "toast-inspire-inserted":"Inspiration inserted",
  "genre-uncategorized":"Uncategorized",
  "default-chapter-title":"Chapter One",
  "ps-units-2":"words",
  "default-doc-title":"My Writing",
  "toast-imported":"Imported successfully",
  "toast-import-scan":"AI is scanning imported content...",
  "toast-import-scan-done":"Imported content scan complete",
  "toast-invalid-file":"Invalid file",
  "toast-copy-failed":"Copy failed",
  "toast-new-password-short":"New password must be at least 4 characters",
  "toast-password-mismatch":"Passwords do not match",
  "outline-new":"New Outline",
  "chapter-new":"New Chapter",
  "char-no-desc":"No description",
  "action-edit":"Edit",
  "action-delete":"Delete",
  "label-personality":"Personality",
  "label-background":"Background",
  "label-appearance":"Appearance",
  "label-skills":"Skills",
  "confirm-delete":"Delete?",
},
ja:{
  "nav-outline":"あらすじ",
  "nav-chapters":"章",
  "nav-chars":"キャラ",
  "nav-notes":"メモ",
  "bnav-editor":"編集",
  "bnav-outline":"あらすじ",
  "bnav-chapters":"章",
  "bnav-chars":"キャラ",
  "bnav-ai":"AI",
  "tb-focus":"◎ 集中",
  "tb-preview":"◉ プレビュー",
  "tb-save":"保存",
  "tb-autosave":"↯ 自動保存",
  "tb-export":"↓ 書出し",
  "aq-proof":"✓ 校正",
  "aq-title":"¶ タイトル",
  "aq-inspire":"◇ 着想",
  "aq-research":"⊕ 資料",
  "aq-humanize":"▷ 人間化",
  "aq-detect":"⊕ AI判定",
  "ed-placeholder":"書き始める...",
  "ed-chapter":"章のタイトル...",
  "ed-para":"段落",
  "ed-sent":"文",
  "ed-read":"約",
  "ed-min":"分で読める",
  "ed-words":"文字",
  "bb-total":"合計:",
  "bb-para":"段落:",
  "ap-title":"AI アシスタント",
  "ap-tab-modes":"モード",
  "ap-tab-multi":"比較",
  "ap-tab-hist":"履歴",
  "ap-tab-memory":"🧠 メモリ",
  "ap-temp":"創造性",
  "ap-len":"長さ",
  "ap-prompt":"追加",
  "ap-prompt-ph":"オプションの指示...",
  "ap-gen":"生成する",
  "ap-gen-ing":"生成中...",
  "multi-slot":"スロット",
  "multi-gen":"⚡ 全スロット生成",
  "hist-title":"AI 履歴",
  "hist-clear":"消去",
  "hist-empty":"履歴なし",
  "mod-newproj":"📁 新規プロジェクト",
  "mod-newproj-sub":"新しい執筆プロジェクトを作成",
  "mod-projname":"プロジェクト名",
  "mod-projname-ph":"例：銀河往事",
  "mod-required":"必須",
  "mod-genre":"ジャンル",
  "mod-goal":"毎日の目標",
  "mod-goal-hint":"文字",
  "mod-desc":"説明",
  "mod-desc-ph":"簡単な説明...",
  "mod-world":"世界観設定",
  "mod-world-ph":"世界観のメモ...",
  "mod-cancel":"キャンセル",
  "mod-create":"作成 ✓",
  "mod-projlist":"📚 プロジェクト一覧",
  "mod-projlist-sub":"クリックして開く",
  "mod-import":"📥 インポート",
  "mod-close":"閉じる",
  "mod-newproj-btn":"＋ 新規",
  "mod-api":"⚙️ API設定",
  "mod-api-sub":"AIプロバイダーを設定。キーはローカル保存。",
  "mod-api-provider":"プロバイダー",
  "mod-api-url":"Base URL",
  "mod-api-url-hint":"カスタム",
  "mod-api-key":"APIキー",
  "mod-api-key-hint":"ローカル保存",
  "mod-api-test":"テスト",
  "mod-api-model":"モデル",
  "mod-api-model-hint":"空白でデフォルト",
  "mod-api-save":"保存 ✓",
  "mod-char":"👤 キャラ追加",
  "mod-char-sub":"AIがキャラの性格を参照します",
  "mod-char-name":"名前",
  "mod-char-name-ph":"例：太郎",
  "mod-char-role":"役割",
  "mod-char-pers":"性格",
  "mod-char-pers-ph":"性格の特徴...",
  "mod-char-back":"経歴",
  "mod-char-back-ph":"バックストーリー...",
  "mod-char-look":"外見",
  "mod-char-look-ph":"外見の描写...",
  "mod-char-skill":"スキル",
  "mod-char-skill-ph":"特殊能力...",
  "mod-char-save":"保存 ✓",
  "mod-profile":"👤 プロファイル",
  "mod-profile-sub":"Local guest mode & project stats",
  "mod-profile-stats":"📊 プロジェクト統計",
  "mod-profile-chpwd":"Guest local mode",
  "mod-oldpwd":"現在のパスワード",
  "mod-newpwd":"新しいパスワード（4文字以上）",
  "mod-newpwd2":"確認",
  "mod-lock":"Guest mode",
  "mod-chpwd-btn":"Guest mode",
  "sb-outline":"ストーリーあらすじ",
  "sb-chapters":"章一覧",
  "sb-chars":"キャラ一覧",
  "sb-notes":"メモ",
  "sb-add-outline":"＋ あらすじ追加",
  "sb-add-chapter":"＋ 章追加",
  "sb-add-char":"＋ キャラ追加",
  "sb-empty-outline":"あらすじなし",
  "sb-empty-chapter":"章なし",
  "sb-empty-char":"キャラなし",
  "sb-empty-notes":"準備中...",
  "lock-set":"Local guest mode",
  "lock-unlock":"Local guest mode",
  "lock-btn-set":"Enter workshop",
  "lock-btn-unlock":"Enter workshop",
  "lock-hint":"忘れた？",
  "lock-reset":"リセット（全データ消去）",
  "lock-placeholder":"Local guest mode",
  "toast-saved":"保存済",
  "toast-deleted":"削除済",
  "toast-added":"追加済",
  "toast-copied":"コピー済",
  "toast-exported":"エクスポート済",
  "toast-created":"作成済",
  "toast-locked":"パスワード設定済",
  "toast-pwd-err":"パスワード間違い",
  "toast-pwd-short":"4文字以上",
  "toast-pwd-changed":"パスワード変更済",
  "toast-no-proj":"プロジェクトを選択",
  "toast-no-api":"APIを設定",
  "toast-no-content":"内容を入力",
  "arp-title":"AI 結果",
  "arp-replace":"置換",
  "arp-append":"追加",
  "arp-insert":"挿入",
  "arp-copy":"コピー",
  "aqr-apply":"✓ 適用",
  "aqr-copy":"⊡ コピー",
  "ps-project":"プロジェクト:",
  "ps-genre":"ジャンル:",
  "ps-words":"文字数:",
  "ps-outlines":"あらすじ:",
  "ps-chapters":" · 章:",
  "ps-chars":"キャラ:",
  "ps-goal":"毎日目標:",
  "ps-created":"作成:",
  "ps-updated":"更新:",
  "ps-none":"プロジェクトなし",
  "ps-units-1":"",
  "param-strict":"厳密",
  "param-balance":"バランス",
  "param-creative":"クリエイティブ",
  "param-short":"短い",
  "param-medium":"中",
  "param-long":"長い",
  "param-xlong":"超長い",
  "select-project":"プロジェクト選択...",
  "logo":"AI ライティング工房",
  "genre-xf":"仙侠",
  "genre-ds":"都市",
  "genre-yq":"恋愛",
  "genre-kh":"SF",
  "genre-xy":"ミステリー",
  "genre-ls":"歴史",
  "genre-wx":"武侠",
  "genre-qh":"ファンタジー",
  "form-name":"プロジェクト名",
  "form-required":"必須",
  "form-genre":"ジャンル",
  "form-goal":"毎日目標",
  "form-goal-unit":"文字",
  "form-desc":"説明",
  "form-desc-ph":"簡単な説明...",
  "form-world":"世界観",
  "form-world-ph":"世界観設定...",
  "form-cancel":"キャンセル",
  "form-create":"作成 ✓",
  "form-save":"保存 ✓",
  "form-api-provider":"プロバイダー",
  "form-api-key-label":"APIキー",
  "form-api-key-hint":"ローカル保存",
  "form-api-test":"テスト",
  "form-api-model-label":"モデル",
  "form-api-model-ph":"空白でデフォルト",
  "prov-tongyi":"通義",
  "prov-zhipu":"智譜",
  "prov-custom":"カスタム",
  "mode-润色":"推敲",
  "mode-扩写":"膨張",
  "mode-缩写":"要約",
  "mode-改写":"書き直し",
  "mode-续写":"続き",
  "mode-补写":"補完",
  "mode-对话":"会話",
  "mode-心理":"心理",
  "mode-环境":"環境",
  "mode-战斗":"戦闘",
  "mode-古风":"古典",
  "mode-现代":"現代",
  "mode-幽默":"ユーモア",
  "mode-悬疑":"ミステリー",
  "mode-唯美":"唯美",
  "mode-霸气":"壮絶",
  "mode-分析":"分析",
  "mode-校对":"校正",
  "mode-节奏":"リズム",
  "mode-情感":"感情",
  "mode-大纲":"あらすじ",
  "mode-人物":"キャラ",
  "mode-伏笔":"伏線",
  "mode-转折":"転換",
  "mode-结局":"結末",
  "mode-翻译":"翻訳",
  "mode-总结":"要約",
  "mode-标题":"タイトル",
  "mode-降AI":"人間化",
  "mode-查AI":"AI判定",
  "grp-基础":"基本",
  "grp-描写":"描写",
  "grp-风格":"スタイル",
  "grp-分析":"分析",
  "grp-创作":"創作",
  "grp-工具":"ツール",
  "mod-settings":"⚙️ 設定",
  "mod-settings-sub":"言語、API、テーマ",
  "mod-save":"保存 ✓",
  "tb-settings":"設定",
  "toast-autosave-on":"自動保存が有効になりました",
  "toast-autosave-off":"自動保存が無効になりました",
  "toast-enter-name":"名前を入力してください",
  "toast-enter-char-name":"キャラクター名を入力してください",
  "toast-enter-memory":"記憶内容を入力してください",
  "toast-enter-current-password":"現在のパスワードを入力してください",
  "toast-current-password-wrong":"現在のパスワードが正しくありません",
  "toast-title-applied":"タイトルを適用しました",
  "toast-humanize-applied":"人間化結果を適用しました",
  "toast-proofread-applied":"校正結果を適用しました",
  "toast-inspire-inserted":"着想を挿入しました",
  "genre-uncategorized":"未分類",
  "default-chapter-title":"第一章",
  "ps-units-2":"文字",
  "default-doc-title":"私の作品",
  "toast-imported":"インポート成功",
  "toast-import-scan":"AIがインポート内容をスキャン中...",
  "toast-import-scan-done":"インポート内容のスキャンが完了しました",
  "toast-invalid-file":"無効なファイル",
  "toast-copy-failed":"コピー失敗",
  "toast-new-password-short":"新しいパスワードは4文字以上必要です",
  "toast-password-mismatch":"パスワードが一致しません",
  "outline-new":"新しいあらすじ",
  "chapter-new":"新しい章",
  "char-no-desc":"説明なし",
  "action-edit":"編集",
  "action-delete":"削除",
  "label-personality":"性格",
  "label-background":"背景",
  "label-appearance":"外見",
  "label-skills":"スキル",
  "confirm-delete":"削除しますか？",
},
ko:{
  "nav-outline":"개요",
  "nav-chapters":"챕터",
  "nav-chars":"캐릭터",
  "nav-notes":"메모",
  "bnav-editor":"편집",
  "bnav-outline":"개요",
  "bnav-chapters":"챕터",
  "bnav-chars":"캐릭터",
  "bnav-ai":"AI",
  "tb-focus":"◎ 집중",
  "tb-preview":"◉ 미리보기",
  "tb-save":"저장",
  "tb-autosave":"↯ 자동저장",
  "tb-export":"↓ 내보내기",
  "aq-proof":"✓ 교정",
  "aq-title":"¶ 제목",
  "aq-inspire":"◇ 영감",
  "aq-research":"⊕ 자료",
  "aq-humanize":"▷ 인간화",
  "aq-detect":"⊕ AI검출",
  "ed-placeholder":"글쓰기 시작...",
  "ed-chapter":"챕터 제목...",
  "ed-para":"단락",
  "ed-sent":"문장",
  "ed-read":"약",
  "ed-min":"분 읽기",
  "ed-words":"자",
  "bb-total":"총:",
  "bb-para":"단락:",
  "ap-title":"AI 어시스턴트",
  "ap-tab-modes":"모드",
  "ap-tab-multi":"비교",
  "ap-tab-hist":"기록",
  "ap-tab-memory":"🧠 메모리",
  "ap-temp":"창의성",
  "ap-len":"길이",
  "ap-prompt":"추가",
  "ap-prompt-ph":"선택 지시사항...",
  "ap-gen":"생성",
  "ap-gen-ing":"생성중...",
  "multi-slot":"슬롯",
  "multi-gen":"⚡ 전체 슬롯 생성",
  "hist-title":"AI 기록",
  "hist-clear":"지우기",
  "hist-empty":"기록 없음",
  "mod-newproj":"📁 새 프로젝트",
  "mod-newproj-sub":"새 글쓰기 프로젝트 만들기",
  "mod-projname":"프로젝트명",
  "mod-projname-ph":"예: 은하往事",
  "mod-required":"필수",
  "mod-genre":"장르",
  "mod-goal":"일일 목표",
  "mod-goal-hint":"자",
  "mod-desc":"설명",
  "mod-desc-ph":"간단한 설명...",
  "mod-world":"세계관 설정",
  "mod-world-ph":"세계관 메모...",
  "mod-cancel":"취소",
  "mod-create":"생성 ✓",
  "mod-projlist":"📚 프로젝트 목록",
  "mod-projlist-sub":"클릭하여 열기",
  "mod-import":"📥 가져오기",
  "mod-close":"닫기",
  "mod-newproj-btn":"＋ 새 프로젝트",
  "mod-api":"⚙️ API 설정",
  "mod-api-sub":"AI 공급자 설정. 키는 로컬 저장.",
  "mod-api-provider":"공급자",
  "mod-api-url":"Base URL",
  "mod-api-url-hint":"사용자 정의",
  "mod-api-key":"API 키",
  "mod-api-key-hint":"로컬 저장",
  "mod-api-test":"테스트",
  "mod-api-model":"모델",
  "mod-api-model-hint":"비우면 기본값",
  "mod-api-save":"저장 ✓",
  "mod-char":"👤 캐릭터 추가",
  "mod-char-sub":"AI가 캐릭터 성격을 참조합니다",
  "mod-char-name":"이름",
  "mod-char-name-ph":"예: 영수",
  "mod-char-role":"역할",
  "mod-char-pers":"성격",
  "mod-char-pers-ph":"성격 특징...",
  "mod-char-back":"배경",
  "mod-char-back-ph":"배경 스토리...",
  "mod-char-look":"외모",
  "mod-char-look-ph":"외모 묘사...",
  "mod-char-skill":"스킬",
  "mod-char-skill-ph":"특수 능력...",
  "mod-char-save":"저장 ✓",
  "mod-profile":"👤 프로필",
  "mod-profile-sub":"Local guest mode & project stats",
  "mod-profile-stats":"📊 프로젝트 통계",
  "mod-profile-chpwd":"Guest local mode",
  "mod-oldpwd":"현재 비밀번호",
  "mod-newpwd":"새 비밀번호 (4자 이상)",
  "mod-newpwd2":"확인",
  "mod-lock":"Guest mode",
  "mod-chpwd-btn":"Guest mode",
  "sb-outline":"스토리 개요",
  "sb-chapters":"챕터 목록",
  "sb-chars":"캐릭터 목록",
  "sb-notes":"메모",
  "sb-add-outline":"＋ 개요 추가",
  "sb-add-chapter":"＋ 챕터 추가",
  "sb-add-char":"＋ 캐릭터 추가",
  "sb-empty-outline":"개요 없음",
  "sb-empty-chapter":"챕터 없음",
  "sb-empty-char":"캐릭터 없음",
  "sb-empty-notes":"준비중...",
  "lock-set":"Local guest mode",
  "lock-unlock":"Local guest mode",
  "lock-btn-set":"Enter workshop",
  "lock-btn-unlock":"Enter workshop",
  "lock-hint":"잊으셨나요?",
  "lock-reset":"초기화 (모든 데이터 삭제)",
  "lock-placeholder":"Local guest mode",
  "toast-saved":"저장됨",
  "toast-deleted":"삭제됨",
  "toast-added":"추가됨",
  "toast-copied":"복사됨",
  "toast-exported":"내보내기됨",
  "toast-created":"생성됨",
  "toast-locked":"비밀번호 설정됨",
  "toast-pwd-err":"비밀번호 오류",
  "toast-pwd-short":"4자 이상",
  "toast-pwd-changed":"비밀번호 변경됨",
  "toast-no-proj":"프로젝트 선택",
  "toast-no-api":"API 설정",
  "toast-no-content":"내용 입력",
  "arp-title":"AI 결과",
  "arp-replace":"교체",
  "arp-append":"추가",
  "arp-insert":"삽입",
  "arp-copy":"복사",
  "aqr-apply":"✓ 적용",
  "aqr-copy":"⊡ 복사",
  "ps-project":"프로젝트:",
  "ps-genre":"장르:",
  "ps-words":"글자수:",
  "ps-outlines":"개요:",
  "ps-chapters":" · 챕터:",
  "ps-chars":"캐릭터:",
  "ps-goal":"일일 목표:",
  "ps-created":"생성:",
  "ps-updated":"업데이트:",
  "ps-none":"프로젝트 없음",
  "ps-units-1":"",
  "param-strict":"엄격",
  "param-balance":"균형",
  "param-creative":"창의적",
  "param-short":"짧음",
  "param-medium":"중간",
  "param-long":"김",
  "param-xlong":"매우 김",
  "select-project":"프로젝트 선택...",
  "logo":"AI 글쓰기 공방",
  "genre-xf":"동양 판타지",
  "genre-ds":"도시",
  "genre-yq":"로맨스",
  "genre-kh":"SF",
  "genre-xy":"미스터리",
  "genre-ls":"역사",
  "genre-wx":"무협",
  "genre-qh":"판타지",
  "form-name":"프로젝트 이름",
  "form-required":"필수",
  "form-genre":"작품 유형",
  "form-goal":"일일 목표",
  "form-goal-unit":"글자 수",
  "form-desc":"프로젝트 소개",
  "form-desc-ph":"이야기를 간단히 설명하세요...",
  "form-world":"세계관",
  "form-world-ph":"세계관 설정...",
  "form-cancel":"취소",
  "form-create":"생성 ✓",
  "form-save":"저장 ✓",
  "form-api-provider":"제공업체 선택",
  "form-api-key-label":"API Key",
  "form-api-key-hint":"로컬에 암호화 저장",
  "form-api-test":"테스트",
  "form-api-model-label":"모델",
  "form-api-model-ph":"비워 두면 기본값 사용",
  "prov-tongyi":"통의",
  "prov-zhipu":"지푸",
  "prov-custom":"사용자 지정",
  "mode-润色":"다듬기",
  "mode-扩写":"확장",
  "mode-缩写":"축약",
  "mode-改写":"재작성",
  "mode-续写":"이어쓰기",
  "mode-补写":"채우기",
  "mode-对话":"대화",
  "mode-心理":"심리",
  "mode-环境":"환경",
  "mode-战斗":"전투",
  "mode-古风":"고풍",
  "mode-现代":"현대",
  "mode-幽默":"유머",
  "mode-悬疑":"미스터리",
  "mode-唯美":"서정",
  "mode-霸气":"웅장",
  "mode-分析":"분석",
  "mode-校对":"교정",
  "mode-节奏":"리듬",
  "mode-情感":"감정",
  "mode-大纲":"개요",
  "mode-人物":"인물",
  "mode-伏笔":"복선",
  "mode-转折":"반전",
  "mode-结局":"결말",
  "mode-翻译":"번역",
  "mode-总结":"요약",
  "mode-标题":"제목",
  "mode-降AI":"AI 완화",
  "mode-查AI":"AI 검사",
  "grp-基础":"기본",
  "grp-描写":"묘사",
  "grp-风格":"스타일",
  "grp-分析":"분석",
  "grp-创作":"창작",
  "grp-工具":"도구",
  "mod-settings":"⚙️ 설정",
  "mod-settings-sub":"언어, API 및 테마 설정",
  "mod-save":"저장 ✓",
  "tb-settings":"설정",
  "toast-autosave-on":"자동저장이 켜졌습니다",
  "toast-autosave-off":"자동저장이 꺼졌습니다",
  "toast-enter-name":"이름을 입력하세요",
  "toast-enter-char-name":"인물 이름을 입력하세요",
  "toast-enter-memory":"메모리 내용을 입력하세요",
  "toast-enter-current-password":"현재 비밀번호를 입력하세요",
  "toast-current-password-wrong":"현재 비밀번호가 올바르지 않습니다",
  "toast-title-applied":"제목이 적용되었습니다",
  "toast-humanize-applied":"인간화 결과가 적용되었습니다",
  "toast-proofread-applied":"교정 결과가 적용되었습니다",
  "toast-inspire-inserted":"영감이 삽입되었습니다",
  "genre-uncategorized":"미분류",
  "default-chapter-title":"제1장",
  "ps-units-2":"글자",
  "default-doc-title":"내 글",
  "toast-imported":"가져오기 성공",
  "toast-import-scan":"AI가 가져온 내용을 스캔 중입니다...",
  "toast-import-scan-done":"가져온 내용 스캔 완료",
  "toast-invalid-file":"잘못된 파일",
  "toast-copy-failed":"복사 실패",
  "toast-new-password-short":"새 비밀번호는 4자 이상이어야 합니다",
  "toast-password-mismatch":"비밀번호가 일치하지 않습니다",
  "outline-new":"새 개요",
  "chapter-new":"새 챕터",
  "char-no-desc":"소개 없음",
  "action-edit":"편집",
  "action-delete":"삭제",
  "label-personality":"성격",
  "label-background":"배경",
  "label-appearance":"외모",
  "label-skills":"스킬",
  "confirm-delete":"삭제하시겠습니까?",
},
fr:{
  "nav-outline":"Plan",
  "nav-chapters":"Chapitres",
  "nav-chars":"Personnages",
  "nav-notes":"Notes",
  "bnav-editor":"Éditeur",
  "bnav-outline":"Plan",
  "bnav-chapters":"Chapitres",
  "bnav-chars":"Persos",
  "bnav-ai":"IA",
  "tb-focus":"◎ Focus",
  "tb-preview":"◉ Aperçu",
  "tb-save":"Sauver",
  "tb-autosave":"↯ Auto",
  "tb-export":"↓ Export",
  "aq-proof":"✓ Corriger",
  "aq-title":"¶ Titre",
  "aq-inspire":"◇ Inspi",
  "aq-research":"⊕ Recherche",
  "aq-humanize":"▷ Humain",
  "aq-detect":"⊕ Détec IA",
  "ed-placeholder":"Commencer à écrire...",
  "ed-chapter":"Titre du chapitre...",
  "ed-para":"¶",
  "ed-sent":"phrases",
  "ed-read":"~",
  "ed-min":"min de lecture",
  "ed-words":"car.",
  "bb-total":"Total:",
  "bb-para":"¶:",
  "ap-title":"Assistant IA",
  "ap-tab-modes":"Modes",
  "ap-tab-multi":"Comparer",
  "ap-tab-hist":"Historique",
  "ap-tab-memory":"🧠 Mémoire",
  "ap-temp":"Créativité",
  "ap-len":"Longueur",
  "ap-prompt":"Extra",
  "ap-prompt-ph":"Instructions optionnelles...",
  "ap-gen":"Générer",
  "ap-gen-ing":"Génération...",
  "multi-slot":"Emplacement",
  "multi-gen":"⚡ Générer tous les emplacements en parallèle",
  "hist-title":"Historique des actions IA",
  "hist-clear":"Effacer",
  "hist-empty":"Aucun historique",
  "mod-newproj":"📁 Nouveau projet",
  "mod-newproj-sub":"Créer un nouveau projet d’écriture",
  "mod-projname":"Nom du projet",
  "mod-projname-ph":"Ex. : Souvenirs galactiques",
  "mod-required":"Requis",
  "mod-genre":"Type d’œuvre",
  "mod-goal":"Objectif quotidien",
  "mod-goal-hint":"mots",
  "mod-desc":"Présentation du projet",
  "mod-desc-ph":"Décrivez brièvement cette histoire...",
  "mod-world":"Univers",
  "mod-world-ph":"Univers et contexte...",
  "mod-cancel":"Annuler",
  "mod-create":"Créer le projet ✓",
  "mod-projlist":"📚 Mes projets",
  "mod-projlist-sub":"Cliquez sur un projet pour écrire",
  "mod-import":"📥 Importer un projet",
  "mod-close":"Fermer",
  "mod-newproj-btn":"＋ Nouveau projet",
  "mod-api":"⚙️ Paramètres API",
  "mod-api-sub":"Configurer le fournisseur IA.",
  "mod-api-provider":"Choisir un fournisseur",
  "mod-api-url":"Base URL",
  "mod-api-url-hint":"Adresse d’API personnalisée",
  "mod-api-key":"Clé API",
  "mod-api-key-hint":"Stockée localement avec chiffrement",
  "mod-api-test":"Tester",
  "mod-api-model":"Modèle",
  "mod-api-model-hint":"Laisser vide pour le modèle par défaut",
  "mod-api-save":"Enregistrer les réglages ✓",
  "mod-char":"👤 Ajouter un personnage",
  "mod-char-sub":"Créer une fiche personnage pour aider l’IA",
  "mod-char-name":"Nom du personnage",
  "mod-char-name-ph":"Ex. : Luc Moreau",
  "mod-char-role":"Rôle du personnage",
  "mod-char-pers":"Personnalité",
  "mod-char-pers-ph":"Traits de personnalité...",
  "mod-char-back":"Histoire personnelle",
  "mod-char-back-ph":"Histoire personnelle...",
  "mod-char-look":"Apparence",
  "mod-char-look-ph":"Description physique...",
  "mod-char-skill":"Compétences/capacités",
  "mod-char-skill-ph":"Compétences ou capacités spéciales...",
  "mod-char-save":"Enregistrer ✓",
  "mod-profile":"👤 Centre personnel",
  "mod-profile-sub":"Local guest mode & project stats",
  "mod-profile-stats":"📊 Statistiques du projet actuel",
  "mod-profile-chpwd":"Guest local mode",
  "mod-oldpwd":"Mot de passe actuel",
  "mod-newpwd":"Nouveau mot de passe (4+ caractères)",
  "mod-newpwd2":"Confirmer le nouveau mot de passe",
  "mod-lock":"Guest mode",
  "mod-chpwd-btn":"Guest mode",
  "sb-outline":"Plan de l’histoire",
  "sb-chapters":"Liste des chapitres",
  "sb-chars":"Fiches personnages",
  "sb-notes":"Notes",
  "sb-add-outline":"＋ Ajouter un plan",
  "sb-add-chapter":"＋ Ajouter un chapitre",
  "sb-add-char":"＋ Ajouter un personnage",
  "sb-empty-outline":"Aucun plan",
  "sb-empty-chapter":"Aucun chapitre",
  "sb-empty-char":"Aucun personnage",
  "sb-empty-notes":"Fonction en développement...",
  "lock-set":"Local guest mode",
  "lock-unlock":"Local guest mode",
  "lock-btn-set":"Enter workshop",
  "lock-btn-unlock":"Enter workshop",
  "lock-hint":"Mot de passe oublié ?",
  "lock-reset":"Réinitialiser (efface toutes les données)",
  "lock-placeholder":"Local guest mode",
  "toast-saved":"Enregistré",
  "toast-deleted":"Supprimé",
  "toast-added":"Ajouté",
  "toast-copied":"Copié",
  "toast-exported":"Exporté",
  "toast-created":"Créé",
  "toast-locked":"Mot de passe défini",
  "toast-pwd-err":"Mot de passe incorrect",
  "toast-pwd-short":"Le mot de passe doit contenir 4 caractères ou plus",
  "toast-pwd-changed":"Mot de passe modifié",
  "toast-no-proj":"Veuillez d’abord choisir un projet",
  "toast-no-api":"Veuillez d’abord configurer l’API",
  "toast-no-content":"Veuillez d’abord saisir du contenu",
  "arp-title":"Résultat généré par IA",
  "arp-replace":"Remplacer le texte original",
  "arp-append":"Ajouter à la fin",
  "arp-insert":"Insérer au curseur",
  "arp-copy":"Copier",
  "aqr-apply":"✓ Appliquer",
  "aqr-copy":"⊡ Copier",
  "ps-project":"Projet :",
  "ps-genre":"Type :",
  "ps-words":"Nombre total de mots :",
  "ps-outlines":"Plans :",
  "ps-chapters":"éléments · Chapitres :",
  "ps-chars":"Personnages :",
  "ps-goal":"Objectif quotidien :",
  "ps-created":"Créé :",
  "ps-updated":"Mis à jour :",
  "ps-none":"Aucun projet",
  "ps-units-1":"élément",
  "param-strict":"Strict",
  "param-balance":"Équilibre",
  "param-creative":"Créatif",
  "param-short":"Court",
  "param-medium":"Moyen",
  "param-long":"Long",
  "param-xlong":"Très long",
  "select-project":"Choisir un projet...",
  "logo":"Atelier d'écriture IA",
  "genre-xf":"Fantasy orientale",
  "genre-ds":"Urbain",
  "genre-yq":"Romance",
  "genre-kh":"Science-fiction",
  "genre-xy":"Suspense",
  "genre-ls":"Historique",
  "genre-wx":"Arts martiaux",
  "genre-qh":"Fantasy",
  "form-name":"Nom du projet",
  "form-required":"Requis",
  "form-genre":"Type d’œuvre",
  "form-goal":"Objectif quotidien",
  "form-goal-unit":"mots",
  "form-desc":"Présentation du projet",
  "form-desc-ph":"Résumez l’histoire...",
  "form-world":"Univers",
  "form-world-ph":"Définition de l’univers...",
  "form-cancel":"Annuler",
  "form-create":"Créer ✓",
  "form-save":"Enregistrer ✓",
  "form-api-provider":"Choisir un fournisseur",
  "form-api-key-label":"Clé API",
  "form-api-key-hint":"Stockée localement avec chiffrement",
  "form-api-test":"Tester",
  "form-api-model-label":"Modèle",
  "form-api-model-ph":"Vide = défaut",
  "prov-tongyi":"Tongyi",
  "prov-zhipu":"Zhipu",
  "prov-custom":"Personnalisé",
  "mode-润色":"Polir",
  "mode-扩写":"Développer",
  "mode-缩写":"Réduire",
  "mode-改写":"Réécrire",
  "mode-续写":"Continuer",
  "mode-补写":"Compléter",
  "mode-对话":"Dialogue",
  "mode-心理":"Psychologie",
  "mode-环境":"Environnement",
  "mode-战斗":"Combat",
  "mode-古风":"Style ancien",
  "mode-现代":"Moderne",
  "mode-幽默":"Humour",
  "mode-悬疑":"Suspense",
  "mode-唯美":"Lyrique",
  "mode-霸气":"Épique",
  "mode-分析":"Analyser",
  "mode-校对":"Corriger",
  "mode-节奏":"Rythme",
  "mode-情感":"Émotion",
  "mode-大纲":"Plan",
  "mode-人物":"Personnage",
  "mode-伏笔":"Présage",
  "mode-转折":"Rebondissement",
  "mode-结局":"Fin",
  "mode-翻译":"Traduire",
  "mode-总结":"Résumé",
  "mode-标题":"Titres",
  "mode-降AI":"Réduire l’IA",
  "mode-查AI":"Vérifier IA",
  "grp-基础":"Base",
  "grp-描写":"Description",
  "grp-风格":"Style",
  "grp-分析":"Analyse",
  "grp-创作":"Création",
  "grp-工具":"Outils",
  "mod-settings":"⚙️ Paramètres",
  "mod-settings-sub":"Langue, API et Thème",
  "mod-save":"Sauvegarder ✓",
  "tb-settings":"Paramètres",
  "toast-autosave-on":"Enregistrement automatique activé",
  "toast-autosave-off":"Enregistrement automatique désactivé",
  "toast-enter-name":"Veuillez saisir un nom",
  "toast-enter-char-name":"Veuillez saisir le nom du personnage",
  "toast-enter-memory":"Veuillez saisir le contenu de la mémoire",
  "toast-enter-current-password":"Veuillez saisir le mot de passe actuel",
  "toast-current-password-wrong":"Le mot de passe actuel est incorrect",
  "toast-title-applied":"Titre appliqué",
  "toast-humanize-applied":"Résultat d’humanisation appliqué",
  "toast-proofread-applied":"Résultat de correction appliqué",
  "toast-inspire-inserted":"Inspiration insérée",
  "genre-uncategorized":"Non classé",
  "default-chapter-title":"Chapitre un",
  "ps-units-2":"caractères",
  "default-doc-title":"Mon texte",
  "toast-imported":"Importation réussie",
  "toast-import-scan":"L’IA analyse le contenu importé...",
  "toast-import-scan-done":"Analyse du contenu importé terminée",
  "toast-invalid-file":"Fichier invalide",
  "toast-copy-failed":"Échec de la copie",
  "toast-new-password-short":"Le nouveau mot de passe doit contenir au moins 4 caractères",
  "toast-password-mismatch":"Les mots de passe ne correspondent pas",
  "outline-new":"Nouveau plan",
  "chapter-new":"Nouveau chapitre",
  "char-no-desc":"Aucune description",
  "action-edit":"Modifier",
  "action-delete":"Supprimer",
  "label-personality":"Personnalité",
  "label-background":"Passé",
  "label-appearance":"Apparence",
  "label-skills":"Compétences",
  "confirm-delete":"Supprimer ?",
},
es:{
  "nav-outline":"Esquema",
  "nav-chapters":"Capítulos",
  "nav-chars":"Personajes",
  "nav-notes":"Notas",
  "bnav-editor":"Editor",
  "bnav-outline":"Esquema",
  "bnav-chapters":"Capítulos",
  "bnav-chars":"Pers.",
  "bnav-ai":"IA",
  "tb-focus":"◎ Enfoque",
  "tb-preview":"◉ Vista previa",
  "tb-save":"Guardar",
  "tb-autosave":"↯ Auto",
  "tb-export":"↓ Exportar",
  "aq-proof":"✓ Corregir",
  "aq-title":"¶ Título",
  "aq-inspire":"◇ Inspira",
  "aq-research":"⊕ Buscar",
  "aq-humanize":"▷ Humanizar",
  "aq-detect":"⊕ Detectar IA",
  "ed-placeholder":"Empieza a escribir...",
  "ed-chapter":"Título del capítulo...",
  "ed-para":"¶",
  "ed-sent":"frases",
  "ed-read":"~",
  "ed-min":"min lectura",
  "ed-words":"car.",
  "bb-total":"Total:",
  "bb-para":"¶:",
  "ap-title":"Asistente IA",
  "ap-tab-modes":"Modos",
  "ap-tab-multi":"Comparar",
  "ap-tab-hist":"Historial",
  "ap-tab-memory":"🧠 Memoria",
  "ap-temp":"Creatividad",
  "ap-len":"Longitud",
  "ap-prompt":"Extra",
  "ap-prompt-ph":"Instrucciones opcionales...",
  "ap-gen":"Generar",
  "ap-gen-ing":"Generando...",
  "multi-slot":"Ranura",
  "multi-gen":"⚡ Generar todas las ranuras en paralelo",
  "hist-title":"Registro de acciones de IA",
  "hist-clear":"Vaciar",
  "hist-empty":"Sin historial",
  "mod-newproj":"📁 Nuevo proyecto",
  "mod-newproj-sub":"Crear un nuevo proyecto de escritura",
  "mod-projname":"Nombre del proyecto",
  "mod-projname-ph":"Ej.: Recuerdos de la galaxia",
  "mod-required":"Obligatorio",
  "mod-genre":"Tipo de obra",
  "mod-goal":"Objetivo diario",
  "mod-goal-hint":"palabras",
  "mod-desc":"Descripción del proyecto",
  "mod-desc-ph":"Describe brevemente esta historia...",
  "mod-world":"Construcción del mundo",
  "mod-world-ph":"Mundo y contexto...",
  "mod-cancel":"Cancelar",
  "mod-create":"Crear proyecto ✓",
  "mod-projlist":"📚 Mis proyectos",
  "mod-projlist-sub":"Haz clic en un proyecto para escribir",
  "mod-import":"📥 Importar proyecto",
  "mod-close":"Cerrar",
  "mod-newproj-btn":"＋ Nuevo proyecto",
  "mod-api":"⚙️ Configuración API",
  "mod-api-sub":"Configurar proveedor de IA.",
  "mod-api-provider":"Elegir proveedor",
  "mod-api-url":"Base URL",
  "mod-api-url-hint":"Dirección de API personalizada",
  "mod-api-key":"API Key",
  "mod-api-key-hint":"Cifrada y guardada localmente",
  "mod-api-test":"Probar",
  "mod-api-model":"Modelo",
  "mod-api-model-hint":"Déjalo vacío para usar el modelo predeterminado",
  "mod-api-save":"Guardar ajustes ✓",
  "mod-char":"👤 Añadir personaje",
  "mod-char-sub":"Crear una ficha para mantener coherente al personaje",
  "mod-char-name":"Nombre del personaje",
  "mod-char-name-ph":"Ej.: Lucía Vega",
  "mod-char-role":"Rol del personaje",
  "mod-char-pers":"Personalidad",
  "mod-char-pers-ph":"Rasgos de personalidad...",
  "mod-char-back":"Historia de fondo",
  "mod-char-back-ph":"Historia de fondo...",
  "mod-char-look":"Aspecto",
  "mod-char-look-ph":"Descripción física...",
  "mod-char-skill":"Habilidades/poderes",
  "mod-char-skill-ph":"Habilidades o poderes especiales...",
  "mod-char-save":"Guardar ✓",
  "mod-profile":"👤 Centro personal",
  "mod-profile-sub":"Local guest mode & project stats",
  "mod-profile-stats":"📊 Estadísticas del proyecto actual",
  "mod-profile-chpwd":"Guest local mode",
  "mod-oldpwd":"Contraseña actual",
  "mod-newpwd":"Nueva contraseña (4+ caracteres)",
  "mod-newpwd2":"Confirmar nueva contraseña",
  "mod-lock":"Guest mode",
  "mod-chpwd-btn":"Guest mode",
  "sb-outline":"Esquema de la historia",
  "sb-chapters":"Lista de capítulos",
  "sb-chars":"Perfiles de personajes",
  "sb-notes":"Notas",
  "sb-add-outline":"＋ Añadir esquema",
  "sb-add-chapter":"＋ Añadir capítulo",
  "sb-add-char":"＋ Añadir personaje",
  "sb-empty-outline":"Sin esquemas",
  "sb-empty-chapter":"Sin capítulos",
  "sb-empty-char":"Sin personajes",
  "sb-empty-notes":"Función en desarrollo...",
  "lock-set":"Local guest mode",
  "lock-unlock":"Local guest mode",
  "lock-btn-set":"Enter workshop",
  "lock-btn-unlock":"Enter workshop",
  "lock-hint":"¿Olvidaste la contraseña?",
  "lock-reset":"Restablecer (borra todos los datos)",
  "lock-placeholder":"Local guest mode",
  "toast-saved":"Guardado",
  "toast-deleted":"Eliminado",
  "toast-added":"Añadido",
  "toast-copied":"Copiado",
  "toast-exported":"Exportado",
  "toast-created":"Creado",
  "toast-locked":"Contraseña establecida",
  "toast-pwd-err":"Contraseña incorrecta",
  "toast-pwd-short":"La contraseña debe tener 4+ caracteres",
  "toast-pwd-changed":"Contraseña cambiada",
  "toast-no-proj":"Selecciona primero un proyecto",
  "toast-no-api":"Configura primero la API",
  "toast-no-content":"Introduce contenido primero",
  "arp-title":"Resultado generado por IA",
  "arp-replace":"Reemplazar original",
  "arp-append":"Añadir al final",
  "arp-insert":"Insertar en el cursor",
  "arp-copy":"Kopieren",
  "aqr-apply":"✓ Aplicar",
  "aqr-copy":"⊡ Kopieren",
  "ps-project":"Proyecto:",
  "ps-genre":"Tipo:",
  "ps-words":"Palabras totales:",
  "ps-outlines":"Esquemas:",
  "ps-chapters":"elementos · Capítulos:",
  "ps-chars":"Personajes:",
  "ps-goal":"Objetivo diario:",
  "ps-created":"Creado:",
  "ps-updated":"Actualizado:",
  "ps-none":"Sin proyecto",
  "ps-units-1":"elemento",
  "param-strict":"Estricto",
  "param-balance":"Equilibrio",
  "param-creative":"Creativo",
  "param-short":"Corto",
  "param-medium":"Medio",
  "param-long":"Largo",
  "param-xlong":"Extra largo",
  "select-project":"Seleccionar proyecto...",
  "logo":"Taller de escritura IA",
  "genre-xf":"Fantasía oriental",
  "genre-ds":"Urbano",
  "genre-yq":"Romance",
  "genre-kh":"Ciencia ficción",
  "genre-xy":"Suspenso",
  "genre-ls":"Histórico",
  "genre-wx":"Artes marciales",
  "genre-qh":"Fantasía",
  "form-name":"Nombre del proyecto",
  "form-required":"Obligatorio",
  "form-genre":"Tipo de obra",
  "form-goal":"Objetivo diario",
  "form-goal-unit":"palabras",
  "form-desc":"Descripción del proyecto",
  "form-desc-ph":"Resume la historia...",
  "form-world":"Mundo",
  "form-world-ph":"Configuración del mundo...",
  "form-cancel":"Cancelar",
  "form-create":"Crear ✓",
  "form-save":"Guardar ✓",
  "form-api-provider":"Elegir proveedor",
  "form-api-key-label":"API Key",
  "form-api-key-hint":"Cifrada y guardada localmente",
  "form-api-test":"Probar",
  "form-api-model-label":"Modelo",
  "form-api-model-ph":"Vacío = predeterminado",
  "prov-tongyi":"Tongyi",
  "prov-zhipu":"Zhipu",
  "prov-custom":"Personalizado",
  "mode-润色":"Pulir",
  "mode-扩写":"Ampliar",
  "mode-缩写":"Reducir",
  "mode-改写":"Reescribir",
  "mode-续写":"Continuar",
  "mode-补写":"Completar",
  "mode-对话":"Diálogo",
  "mode-心理":"Psicología",
  "mode-环境":"Ambiente",
  "mode-战斗":"Combate",
  "mode-古风":"Estilo clásico",
  "mode-现代":"Moderno",
  "mode-幽默":"Humor",
  "mode-悬疑":"Suspenso",
  "mode-唯美":"Lírico",
  "mode-霸气":"Épico",
  "mode-分析":"Analizar",
  "mode-校对":"Corregir",
  "mode-节奏":"Ritmo",
  "mode-情感":"Emoción",
  "mode-大纲":"Esquema",
  "mode-人物":"Personaje",
  "mode-伏笔":"Presagio",
  "mode-转折":"Giro",
  "mode-结局":"Final",
  "mode-翻译":"Traducir",
  "mode-总结":"Resumen",
  "mode-标题":"Títulos",
  "mode-降AI":"Humanizar IA",
  "mode-查AI":"Detectar IA",
  "grp-基础":"Básico",
  "grp-描写":"Descripción",
  "grp-风格":"Estilo",
  "grp-分析":"Análisis",
  "grp-创作":"Creación",
  "grp-工具":"Herramientas",
  "mod-settings":"⚙️ Ajustes",
  "mod-settings-sub":"Idioma, API y Tema",
  "mod-save":"Guardar ✓",
  "tb-settings":"Ajustes",
  "toast-autosave-on":"Guardado automático activado",
  "toast-autosave-off":"Guardado automático desactivado",
  "toast-enter-name":"Introduce un nombre",
  "toast-enter-char-name":"Introduce el nombre del personaje",
  "toast-enter-memory":"Introduce contenido de memoria",
  "toast-enter-current-password":"Introduce la contraseña actual",
  "toast-current-password-wrong":"La contraseña actual es incorrecta",
  "toast-title-applied":"Título aplicado",
  "toast-humanize-applied":"Resultado de humanización aplicado",
  "toast-proofread-applied":"Resultado de corrección aplicado",
  "toast-inspire-inserted":"Inspiración insertada",
  "genre-uncategorized":"Sin categoría",
  "default-chapter-title":"Capítulo uno",
  "ps-units-2":"caracteres",
  "default-doc-title":"Mi escritura",
  "toast-imported":"Importado correctamente",
  "toast-import-scan":"La IA está analizando el contenido importado...",
  "toast-import-scan-done":"Análisis del contenido importado completado",
  "toast-invalid-file":"Archivo no válido",
  "toast-copy-failed":"Error al copiar",
  "toast-new-password-short":"La nueva contraseña debe tener al menos 4 caracteres",
  "toast-password-mismatch":"Las contraseñas no coinciden",
  "outline-new":"Nuevo esquema",
  "chapter-new":"Nuevo capítulo",
  "char-no-desc":"Sin descripción",
  "action-edit":"Editar",
  "action-delete":"Eliminar",
  "label-personality":"Personalidad",
  "label-background":"Trasfondo",
  "label-appearance":"Aspecto",
  "label-skills":"Habilidades",
  "confirm-delete":"¿Eliminar?",
},
de:{
  "nav-outline":"Gliederung",
  "nav-chapters":"Kapitel",
  "nav-chars":"Charaktere",
  "nav-notes":"Notizen",
  "bnav-editor":"Editor",
  "bnav-outline":"Gliederung",
  "bnav-chapters":"Kapitel",
  "bnav-chars":"Chars",
  "bnav-ai":"KI",
  "tb-focus":"◎ Fokus",
  "tb-preview":"◉ Vorschau",
  "tb-save":"Speichern",
  "tb-autosave":"↯ Auto",
  "tb-export":"↓ Export",
  "aq-proof":"✓ Korrektur",
  "aq-title":"¶ Titel",
  "aq-inspire":"◇ Inspi",
  "aq-research":"⊕ Suche",
  "aq-humanize":"▷ Menschlich",
  "aq-detect":"⊕ KI-Erkennung",
  "ed-placeholder":"Schreiben beginnen...",
  "ed-chapter":"Kapiteltitel...",
  "ed-para":"¶",
  "ed-sent":"Sätze",
  "ed-read":"~",
  "ed-min":"Min. Lesezeit",
  "ed-words":"Zeichen",
  "bb-total":"Gesamt:",
  "bb-para":"¶:",
  "ap-title":"KI-Assistent",
  "ap-tab-modes":"Modi",
  "ap-tab-multi":"Vergleich",
  "ap-tab-hist":"Verlauf",
  "ap-tab-memory":"🧠 Speicher",
  "ap-temp":"Kreativität",
  "ap-len":"Länge",
  "ap-prompt":"Extra",
  "ap-prompt-ph":"Optionale Anweisungen...",
  "ap-gen":"Generieren",
  "ap-gen-ing":"Generierung...",
  "multi-slot":"Slot",
  "multi-gen":"⚡ Alle Slots parallel generieren",
  "hist-title":"KI-Aktionsverlauf",
  "hist-clear":"Leeren",
  "hist-empty":"Kein Verlauf",
  "mod-newproj":"📁 Neues Projekt",
  "mod-newproj-sub":"Ein neues Schreibprojekt erstellen",
  "mod-projname":"Projektname",
  "mod-projname-ph":"z. B. Erinnerungen der Galaxie",
  "mod-required":"Pflichtfeld",
  "mod-genre":"Werktyp",
  "mod-goal":"Tagesziel",
  "mod-goal-hint":"Wörter",
  "mod-desc":"Projektbeschreibung",
  "mod-desc-ph":"Beschreibe diese Geschichte kurz...",
  "mod-world":"Weltenbau",
  "mod-world-ph":"Welt und Hintergrund...",
  "mod-cancel":"Abbrechen",
  "mod-create":"Projekt erstellen ✓",
  "mod-projlist":"📚 Meine Projekte",
  "mod-projlist-sub":"Projekt zum Schreiben anklicken",
  "mod-import":"📥 Projekt importieren",
  "mod-close":"Schließen",
  "mod-newproj-btn":"＋ Neues Projekt",
  "mod-api":"⚙️ API-Einstellungen",
  "mod-api-sub":"KI-Anbieter konfigurieren.",
  "mod-api-provider":"Anbieter wählen",
  "mod-api-url":"Base URL",
  "mod-api-url-hint":"Benutzerdefinierte API-Adresse",
  "mod-api-key":"API Key",
  "mod-api-key-hint":"Lokal verschlüsselt gespeichert",
  "mod-api-test":"Testen",
  "mod-api-model":"Modell",
  "mod-api-model-hint":"Leer lassen für Standardmodell",
  "mod-api-save":"Einstellungen speichern ✓",
  "mod-char":"👤 Charakter hinzufügen",
  "mod-char-sub":"Charakterprofil für konsistente KI-Texte erstellen",
  "mod-char-name":"Charaktername",
  "mod-char-name-ph":"z. B. Lukas Stern",
  "mod-char-role":"Charakterrolle",
  "mod-char-pers":"Persönlichkeit",
  "mod-char-pers-ph":"Persönlichkeitsmerkmale...",
  "mod-char-back":"Hintergrundgeschichte",
  "mod-char-back-ph":"Hintergrundgeschichte...",
  "mod-char-look":"Aussehen",
  "mod-char-look-ph":"Äußere Beschreibung...",
  "mod-char-skill":"Fähigkeiten/Kräfte",
  "mod-char-skill-ph":"Fähigkeiten oder besondere Kräfte...",
  "mod-char-save":"Speichern ✓",
  "mod-profile":"👤 Profilcenter",
  "mod-profile-sub":"Local guest mode & project stats",
  "mod-profile-stats":"📊 Aktuelle Projektstatistiken",
  "mod-profile-chpwd":"Guest local mode",
  "mod-oldpwd":"Aktuelles Passwort",
  "mod-newpwd":"Neues Passwort (4+ Zeichen)",
  "mod-newpwd2":"Neues Passwort bestätigen",
  "mod-lock":"Guest mode",
  "mod-chpwd-btn":"Guest mode",
  "sb-outline":"Story-Gliederung",
  "sb-chapters":"Kapitelliste",
  "sb-chars":"Charakterprofile",
  "sb-notes":"Notas",
  "sb-add-outline":"＋ Gliederung hinzufügen",
  "sb-add-chapter":"＋ Kapitel hinzufügen",
  "sb-add-char":"＋ Charakter hinzufügen",
  "sb-empty-outline":"Keine Gliederungen",
  "sb-empty-chapter":"Keine Kapitel",
  "sb-empty-char":"Keine Charaktere",
  "sb-empty-notes":"Funktion in Entwicklung...",
  "lock-set":"Local guest mode",
  "lock-unlock":"Local guest mode",
  "lock-btn-set":"Enter workshop",
  "lock-btn-unlock":"Enter workshop",
  "lock-hint":"Passwort vergessen?",
  "lock-reset":"Zurücksetzen (löscht alle Daten)",
  "lock-placeholder":"Local guest mode",
  "toast-saved":"Guardado",
  "toast-deleted":"Eliminado",
  "toast-added":"Hinzugefügt",
  "toast-copied":"Copiado",
  "toast-exported":"Exportado",
  "toast-created":"Creado",
  "toast-locked":"Passwort festgelegt",
  "toast-pwd-err":"Falsches Passwort",
  "toast-pwd-short":"Passwort muss mindestens 4 Zeichen haben",
  "toast-pwd-changed":"Passwort geändert",
  "toast-no-proj":"Bitte zuerst ein Projekt wählen",
  "toast-no-api":"Bitte zuerst API konfigurieren",
  "toast-no-content":"Bitte zuerst Inhalt eingeben",
  "arp-title":"KI-generiertes Ergebnis",
  "arp-replace":"Original ersetzen",
  "arp-append":"Am Ende anhängen",
  "arp-insert":"An Cursor einfügen",
  "arp-copy":"Kopieren",
  "aqr-apply":"✓ Anwenden",
  "aqr-copy":"⊡ Kopieren",
  "ps-project":"Projekt:",
  "ps-genre":"Typ:",
  "ps-words":"Gesamtwörter:",
  "ps-outlines":"Gliederungen:",
  "ps-chapters":"Elemente · Kapitel:",
  "ps-chars":"Charaktere:",
  "ps-goal":"Tagesziel:",
  "ps-created":"Erstellt:",
  "ps-updated":"Aktualisiert:",
  "ps-none":"Kein Projekt",
  "ps-units-1":"Element",
  "param-strict":"Streng",
  "param-balance":"Ausgewogen",
  "param-creative":"Kreativ",
  "param-short":"Kurz",
  "param-medium":"Mittel",
  "param-long":"Lang",
  "param-xlong":"Sehr lang",
  "select-project":"Projekt wählen...",
  "logo":"KI-Schreibwerkstatt",
  "genre-xf":"Östliche Fantasy",
  "genre-ds":"Urban",
  "genre-yq":"Romantik",
  "genre-kh":"Science-Fiction",
  "genre-xy":"Suspense",
  "genre-ls":"Historisch",
  "genre-wx":"Kampfkunst",
  "genre-qh":"Fantasy",
  "form-name":"Projektname",
  "form-required":"Pflichtfeld",
  "form-genre":"Werktyp",
  "form-goal":"Tagesziel",
  "form-goal-unit":"Wörter",
  "form-desc":"Projektbeschreibung",
  "form-desc-ph":"Geschichte kurz zusammenfassen...",
  "form-world":"Welt",
  "form-world-ph":"Weltenbau...",
  "form-cancel":"Abbrechen",
  "form-create":"Erstellen ✓",
  "form-save":"Speichern ✓",
  "form-api-provider":"Anbieter wählen",
  "form-api-key-label":"API Key",
  "form-api-key-hint":"Lokal verschlüsselt gespeichert",
  "form-api-test":"Testen",
  "form-api-model-label":"Modell",
  "form-api-model-ph":"Leer = Standard",
  "prov-tongyi":"Tongyi",
  "prov-zhipu":"Zhipu",
  "prov-custom":"Benutzerdefiniert",
  "mode-润色":"Polieren",
  "mode-扩写":"Erweitern",
  "mode-缩写":"Kürzen",
  "mode-改写":"Umschreiben",
  "mode-续写":"Fortsetzen",
  "mode-补写":"Ergänzen",
  "mode-对话":"Dialog",
  "mode-心理":"Psychologie",
  "mode-环境":"Umgebung",
  "mode-战斗":"Kampf",
  "mode-古风":"Alter Stil",
  "mode-现代":"Modern",
  "mode-幽默":"Humor",
  "mode-悬疑":"Suspense",
  "mode-唯美":"Lyrisch",
  "mode-霸气":"Episch",
  "mode-分析":"Analysieren",
  "mode-校对":"Korrektur",
  "mode-节奏":"Tempo",
  "mode-情感":"Emotion",
  "mode-大纲":"Gliederung",
  "mode-人物":"Charakter",
  "mode-伏笔":"Andeutung",
  "mode-转折":"Wendung",
  "mode-结局":"Ende",
  "mode-翻译":"Übersetzen",
  "mode-总结":"Zusammenfassung",
  "mode-标题":"Titel",
  "mode-降AI":"KI humanisieren",
  "mode-查AI":"KI prüfen",
  "grp-基础":"Grundlagen",
  "grp-描写":"Beschreibung",
  "grp-风格":"Stil",
  "grp-分析":"Analyse",
  "grp-创作":"Kreation",
  "grp-工具":"Werkzeuge",
  "mod-settings":"⚙️ Einstellungen",
  "mod-settings-sub":"Sprache, API und Thema",
  "mod-save":"Speichern ✓",
  "tb-settings":"Einstellungen",
  "toast-autosave-on":"Automatisches Speichern aktiviert",
  "toast-autosave-off":"Automatisches Speichern deaktiviert",
  "toast-enter-name":"Bitte Namen eingeben",
  "toast-enter-char-name":"Bitte Charakternamen eingeben",
  "toast-enter-memory":"Bitte Speicherinhalt eingeben",
  "toast-enter-current-password":"Bitte aktuelles Passwort eingeben",
  "toast-current-password-wrong":"Aktuelles Passwort ist falsch",
  "toast-title-applied":"Titel angewendet",
  "toast-humanize-applied":"Humanisierung angewendet",
  "toast-proofread-applied":"Korrektur angewendet",
  "toast-inspire-inserted":"Inspiration eingefügt",
  "genre-uncategorized":"Nicht kategorisiert",
  "default-chapter-title":"Kapitel eins",
  "ps-units-2":"Zeichen",
  "default-doc-title":"Mein Text",
  "toast-imported":"Import erfolgreich",
  "toast-import-scan":"KI scannt importierte Inhalte...",
  "toast-import-scan-done":"Scan der importierten Inhalte abgeschlossen",
  "toast-invalid-file":"Ungültige Datei",
  "toast-copy-failed":"Kopieren fehlgeschlagen",
  "toast-new-password-short":"Neues Passwort muss mindestens 4 Zeichen haben",
  "toast-password-mismatch":"Passwörter stimmen nicht überein",
  "outline-new":"Neue Gliederung",
  "chapter-new":"Neues Kapitel",
  "char-no-desc":"Keine Beschreibung",
  "action-edit":"Bearbeiten",
  "action-delete":"Löschen",
  "label-personality":"Persönlichkeit",
  "label-background":"Hintergrund",
  "label-appearance":"Aussehen",
  "label-skills":"Fähigkeiten",
  "confirm-delete":"Löschen?",
},
ru:{
  "nav-outline":"План",
  "nav-chapters":"Главы",
  "nav-chars":"Персонажи",
  "nav-notes":"Заметки",
  "bnav-editor":"Редактор",
  "bnav-outline":"План",
  "bnav-chapters":"Главы",
  "bnav-chars":"Перс.",
  "bnav-ai":"ИИ",
  "tb-focus":"◎ Фокус",
  "tb-preview":"◉ Просмотр",
  "tb-save":"Сохранить",
  "tb-autosave":"↯ Авто",
  "tb-export":"↓ Экспорт",
  "aq-proof":"✓ Проверка",
  "aq-title":"¶ Заголовок",
  "aq-inspire":"◇ Идеи",
  "aq-research":"⊕ Поиск",
  "aq-humanize":"▷ Оживить",
  "aq-detect":"⊕ ИИ-детект",
  "ed-placeholder":"Начните писать...",
  "ed-chapter":"Название главы...",
  "ed-para":"¶",
  "ed-sent":"предл.",
  "ed-read":"~",
  "ed-min":"мин чтения",
  "ed-words":"симв.",
  "bb-total":"Итого:",
  "bb-para":"¶:",
  "ap-title":"ИИ-ассистент",
  "ap-tab-modes":"Режимы",
  "ap-tab-multi":"Сравнение",
  "ap-tab-hist":"История ИИ",
  "ap-tab-memory":"🧠 Память",
  "ap-temp":"Креативность",
  "ap-len":"Длина",
  "ap-prompt":"Доп.",
  "ap-prompt-ph":"Доп. инструкции...",
  "ap-gen":"Создать",
  "ap-gen-ing":"Создание...",
  "multi-slot":"Слот",
  "multi-gen":"⚡ Создать все слоты параллельно",
  "hist-title":"Журнал действий ИИ",
  "hist-clear":"Очистить",
  "hist-empty":"Нет истории",
  "mod-newproj":"📁 Новый проект",
  "mod-newproj-sub":"Создать новый писательский проект",
  "mod-projname":"Название проекта",
  "mod-projname-ph":"Напр.: Воспоминания галактики",
  "mod-required":"Обязательно",
  "mod-genre":"Тип произведения",
  "mod-goal":"Ежедневная цель",
  "mod-goal-hint":"слова",
  "mod-desc":"Описание проекта",
  "mod-desc-ph":"Кратко опишите эту историю...",
  "mod-world":"Мир произведения",
  "mod-world-ph":"Мир и фон...",
  "mod-cancel":"Отмена",
  "mod-create":"Создать проект ✓",
  "mod-projlist":"📚 Мои проекты",
  "mod-projlist-sub":"Нажмите проект, чтобы писать",
  "mod-import":"📥 Импорт проекта",
  "mod-close":"Закрыть",
  "mod-newproj-btn":"＋ Новый проект",
  "mod-api":"⚙️ Настройки API",
  "mod-api-sub":"Настройка ИИ-провайдера.",
  "mod-api-provider":"Выбрать провайдера",
  "mod-api-url":"Base URL",
  "mod-api-url-hint":"Пользовательский адрес API",
  "mod-api-key":"API Key",
  "mod-api-key-hint":"Зашифровано и сохранено локально",
  "mod-api-test":"Тест",
  "mod-api-model":"Модель",
  "mod-api-model-hint":"Оставьте пустым для модели по умолчанию",
  "mod-api-save":"Сохранить настройки ✓",
  "mod-char":"👤 Добавить персонажа",
  "mod-char-sub":"Создайте профиль для согласованности персонажа",
  "mod-char-name":"Имя персонажа",
  "mod-char-name-ph":"Напр.: Лев Орлов",
  "mod-char-role":"Роль персонажа",
  "mod-char-pers":"Характер",
  "mod-char-pers-ph":"Черты характера...",
  "mod-char-back":"Предыстория",
  "mod-char-back-ph":"Предыстория...",
  "mod-char-look":"Внешность",
  "mod-char-look-ph":"Описание внешности...",
  "mod-char-skill":"Навыки/способности",
  "mod-char-skill-ph":"Навыки или особые способности...",
  "mod-char-save":"Сохранить ✓",
  "mod-profile":"👤 Личный центр",
  "mod-profile-sub":"Local guest mode & project stats",
  "mod-profile-stats":"📊 Статистика текущего проекта",
  "mod-profile-chpwd":"Guest local mode",
  "mod-oldpwd":"Текущий пароль",
  "mod-newpwd":"Новый пароль (4+ символа)",
  "mod-newpwd2":"Подтвердить новый пароль",
  "mod-lock":"Guest mode",
  "mod-chpwd-btn":"Guest mode",
  "sb-outline":"План истории",
  "sb-chapters":"Список глав",
  "sb-chars":"Профили персонажей",
  "sb-notes":"Notas",
  "sb-add-outline":"＋ Добавить план",
  "sb-add-chapter":"＋ Добавить главу",
  "sb-add-char":"＋ Добавить персонажа",
  "sb-empty-outline":"Планов нет",
  "sb-empty-chapter":"Глав нет",
  "sb-empty-char":"Персонажей нет",
  "sb-empty-notes":"Функция в разработке...",
  "lock-set":"Local guest mode",
  "lock-unlock":"Local guest mode",
  "lock-btn-set":"Enter workshop",
  "lock-btn-unlock":"Enter workshop",
  "lock-hint":"Забыли пароль?",
  "lock-reset":"Сброс (удалит все данные)",
  "lock-placeholder":"Local guest mode",
  "toast-saved":"Guardado",
  "toast-deleted":"Eliminado",
  "toast-added":"Добавлено",
  "toast-copied":"Copiado",
  "toast-exported":"Exportado",
  "toast-created":"Creado",
  "toast-locked":"Пароль установлен",
  "toast-pwd-err":"Неверный пароль",
  "toast-pwd-short":"Пароль должен быть не короче 4 символов",
  "toast-pwd-changed":"Пароль изменён",
  "toast-no-proj":"Сначала выберите проект",
  "toast-no-api":"Сначала настройте API",
  "toast-no-content":"Сначала введите содержимое",
  "arp-title":"Результат ИИ",
  "arp-replace":"Заменить исходный текст",
  "arp-append":"Добавить в конец",
  "arp-insert":"Вставить в курсор",
  "arp-copy":"Копировать",
  "aqr-apply":"✓ Применить",
  "aqr-copy":"⊡ Копировать",
  "ps-project":"Проект:",
  "ps-genre":"Тип:",
  "ps-words":"Всего слов:",
  "ps-outlines":"Планы:",
  "ps-chapters":"элем. · Главы:",
  "ps-chars":"Персонажи:",
  "ps-goal":"Ежедневная цель:",
  "ps-created":"Создано:",
  "ps-updated":"Обновлено:",
  "ps-none":"Нет проекта",
  "ps-units-1":"элемент",
  "param-strict":"Строгий",
  "param-balance":"Баланс",
  "param-creative":"Креативный",
  "param-short":"Короткий",
  "param-medium":"Средний",
  "param-long":"Длинный",
  "param-xlong":"Сверхдлинный",
  "select-project":"Выбрать проект...",
  "logo":"ИИ Мастерская Письма",
  "genre-xf":"Восточное фэнтези",
  "genre-ds":"Городской",
  "genre-yq":"Романтика",
  "genre-kh":"Научная фантастика",
  "genre-xy":"Саспенс",
  "genre-ls":"Исторический",
  "genre-wx":"Боевые искусства",
  "genre-qh":"Фэнтези",
  "form-name":"Название проекта",
  "form-required":"Обязательно",
  "form-genre":"Тип произведения",
  "form-goal":"Ежедневная цель",
  "form-goal-unit":"слова",
  "form-desc":"Описание проекта",
  "form-desc-ph":"Краткое содержание...",
  "form-world":"Мир",
  "form-world-ph":"Настройка мира...",
  "form-cancel":"Отмена",
  "form-create":"Создать ✓",
  "form-save":"Сохранить ✓",
  "form-api-provider":"Выбрать провайдера",
  "form-api-key-label":"API Key",
  "form-api-key-hint":"Зашифровано и сохранено локально",
  "form-api-test":"Тест",
  "form-api-model-label":"Модель",
  "form-api-model-ph":"Пусто = по умолчанию",
  "prov-tongyi":"Tongyi",
  "prov-zhipu":"Zhipu",
  "prov-custom":"Пользовательский",
  "mode-润色":"Полировка",
  "mode-扩写":"Расширить",
  "mode-缩写":"Сократить",
  "mode-改写":"Переписать",
  "mode-续写":"Продолжить",
  "mode-补写":"Дополнить",
  "mode-对话":"Диалог",
  "mode-心理":"Психология",
  "mode-环境":"Окружение",
  "mode-战斗":"Бой",
  "mode-古风":"Старинный стиль",
  "mode-现代":"Современный",
  "mode-幽默":"Юмор",
  "mode-悬疑":"Саспенс",
  "mode-唯美":"Лирично",
  "mode-霸气":"Эпично",
  "mode-分析":"Анализ",
  "mode-校对":"Корректура",
  "mode-节奏":"Темп",
  "mode-情感":"Эмоция",
  "mode-大纲":"План",
  "mode-人物":"Персонаж",
  "mode-伏笔":"Предвестие",
  "mode-转折":"Поворот",
  "mode-结局":"Финал",
  "mode-翻译":"Перевод",
  "mode-总结":"Сводка",
  "mode-标题":"Заголовки",
  "mode-降AI":"Очеловечить ИИ",
  "mode-查AI":"Проверить ИИ",
  "grp-基础":"Основы",
  "grp-描写":"Описание",
  "grp-风格":"Стиль",
  "grp-分析":"Анализ",
  "grp-创作":"Создание",
  "grp-工具":"Инструменты",
  "mod-settings":"⚙️ Настройки",
  "mod-settings-sub":"Язык, API и Тема",
  "mod-save":"Сохранить ✓",
  "tb-settings":"Настройки",
  "toast-autosave-on":"Автосохранение включено",
  "toast-autosave-off":"Автосохранение выключено",
  "toast-enter-name":"Введите название",
  "toast-enter-char-name":"Введите имя персонажа",
  "toast-enter-memory":"Введите содержимое памяти",
  "toast-enter-current-password":"Введите текущий пароль",
  "toast-current-password-wrong":"Текущий пароль неверен",
  "toast-title-applied":"Заголовок применён",
  "toast-humanize-applied":"Результат очеловечивания применён",
  "toast-proofread-applied":"Результат корректуры применён",
  "toast-inspire-inserted":"Идея вставлена",
  "genre-uncategorized":"Без категории",
  "default-chapter-title":"Глава первая",
  "ps-units-2":"символы",
  "default-doc-title":"Мой текст",
  "toast-imported":"Импорт выполнен",
  "toast-import-scan":"ИИ сканирует импортированное содержимое...",
  "toast-import-scan-done":"Сканирование импортированного содержимого завершено",
  "toast-invalid-file":"Недопустимый файл",
  "toast-copy-failed":"Не удалось скопировать",
  "toast-new-password-short":"Новый пароль должен быть не короче 4 символов",
  "toast-password-mismatch":"Пароли не совпадают",
  "outline-new":"Новый план",
  "chapter-new":"Новая глава",
  "char-no-desc":"Нет описания",
  "action-edit":"Редактировать",
  "action-delete":"Удалить",
  "label-personality":"Характер",
  "label-background":"Предыстория",
  "label-appearance":"Внешность",
  "label-skills":"Навыки",
  "confirm-delete":"Удалить?",
},
};

let currentLang=localStorage.getItem('ww_lang')||'zh';
function t(k){return LANG[currentLang]?.[k]||k;}
function textWithoutLeadingIcon(v){return String(v).replace(/^[^A-Za-z0-9\u00C0-\uFFFF]+\s*/,'');}
function setElementTextPreservingMedia(el,label){
  [...el.childNodes].forEach(n=>{if(n.nodeType===3)n.remove();});
  el.appendChild(document.createTextNode(' '+label));
}
function localizeProviderChips(){
  const providerLabels={qwen:t('prov-tongyi'),zhipu:t('prov-zhipu'),custom:t('prov-custom')};
  Object.entries(providerLabels).forEach(([provider,label])=>{
    document.querySelectorAll(`.provider-chip[onclick*="'${provider}'"]`).forEach(ch=>setElementTextPreservingMedia(ch,label));
  });
}

const LANGS=['zh','en','ja','ko','fr','es','de','ru'];
const LANG_LABELS={zh:'中',en:'EN',ja:'日',ko:'한',fr:'FR',es:'ES',de:'DE',ru:'RU'};

function toggleLangMenu(){}
document.addEventListener('click',()=>{});

function setLang(lang){
  currentLang=lang;
  localStorage.setItem('ww_lang',lang);
  applyLang();
  // Highlight selected lang card in settings modal
  document.querySelectorAll('.lang-card').forEach(c=>{c.classList.toggle('active',c.onclick&&c.getAttribute('onclick')?.includes("'"+lang+"'"));});
}

// ═══ Lock ═══
async function handleLock(){showApp();}
function showApp(){const lock=document.getElementById('lockScreen');if(lock)lock.style.display='none';document.getElementById('app').classList.add('visible');localStorage.removeItem('ww_pwd_hash');if(!db)initApp();}
function clearPwd(){if(confirm('确定重置？将清除所有数据。')){localStorage.clear();indexedDB.deleteDatabase(DB_NAME);location.reload();}}
function lockApp(){showToast('i','本地游客模式无需本地锁定');showApp();}

// Boot directly into local guest mode. Old password hashes are ignored and removed.
(function(){localStorage.removeItem('ww_pwd_hash');showApp();})();


// ═══ Init ═══
async function initApp(){await openDB();renderAiModeGrid();renderMultiSlots();await loadProjects();await loadMemories();renderHistory();setInterval(()=>{if(S.autoSave&&S.unsaved)saveDoc();},30000);const ed=document.getElementById('mainEditor');ed.addEventListener('input',onEditorInput);ed.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveDoc();}});document.getElementById('focusEditor').addEventListener('input',()=>{document.getElementById('focusInfo').textContent=countWords(document.getElementById('focusEditor').value)+' 字 · Esc 退出';});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeFocus();closeAiResult();}});if(S.projects.length>0)await loadProject(S.projects[0].id);updateAllStats();}
document.addEventListener('DOMContentLoaded',()=>{/* lock handled in IIFE above */});

// ═══ Editor ═══
let editorTimer;
function onEditorInput(){const txt=document.getElementById('mainEditor').value,w=countWords(txt);document.getElementById('editorWords').textContent=w;document.getElementById('totalWordsBar').textContent=w;const ps=txt.split(/\n\n+/).filter(p=>p.trim()).length||1;document.getElementById('paraCount').textContent=ps;document.getElementById('paraCountBar').textContent=ps;document.getElementById('sentCount').textContent=(txt.match(/[。！？.!?]/g)||[]).length;document.getElementById('readTime').textContent=Math.max(1,Math.ceil(w/300));updateGoal();S.unsaved=true;document.getElementById('saveBtn').classList.add('unsaved');clearTimeout(editorTimer);editorTimer=setTimeout(()=>{if(S.autoSave)saveDoc();updateContextBar();},3000);if(S.previewMode)document.getElementById('previewPane').innerHTML=renderMD(txt);}
function countWords(t){return t.replace(/\s/g,'').length;}
function updateGoal(){const w=countWords(document.getElementById('mainEditor').value),p=Math.min(100,Math.round(w/S.wordGoal*100));document.getElementById('goalFill').style.width=p+'%';document.getElementById('goalText').textContent=w+'/'+S.wordGoal;document.getElementById('goalTextBar').textContent=w+'/'+S.wordGoal;document.getElementById('todayWords').textContent=w;}
function updateAllStats(){document.getElementById('totalWords').textContent=countWords(document.getElementById('mainEditor').value);updateGoal();}
function formatText(c){document.execCommand(c);document.getElementById('mainEditor').focus();}
function changeFontSize(d){S.curFontSize=Math.max(12,Math.min(24,S.curFontSize+d));document.getElementById('mainEditor').style.fontSize=S.curFontSize+'px';document.getElementById('fontSizeDisplay').textContent=S.curFontSize+'px';}
function insertDivider(){const e=document.getElementById('mainEditor'),p=e.selectionStart,i='\n\n────────────────\n\n';e.value=e.value.slice(0,p)+i+e.value.slice(p);e.selectionStart=e.selectionEnd=p+i.length;onEditorInput();}
function insertQuote(){const e=document.getElementById('mainEditor'),p=e.selectionStart,s=e.value.slice(e.selectionStart,e.selectionEnd),i=s?'「'+s+'」':'「」';e.value=e.value.slice(0,p)+i+e.value.slice(e.selectionEnd);onEditorInput();}
function exportText(){const t=document.getElementById('mainEditor').value,n=document.getElementById('chapterTitle').value||t('default-doc-title'),b=new Blob([t],{type:'text/plain;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=n+'.txt';a.click();showToast('↓',t('toast-exported'));}
function toggleAutoSave(){S.autoSave=!S.autoSave;document.getElementById('autoSaveToggle').classList.toggle('active',S.autoSave);showToast(S.autoSave?'⚡':'⏸',S.autoSave?t('toast-autosave-on'):t('toast-autosave-off'));}
function renderMD(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/^### (.+)$/gm,'<h3 style="font-size:18px;font-weight:700;margin:12px 0 6px">$1</h3>').replace(/^## (.+)$/gm,'<h2 style="font-size:20px;font-weight:700;margin:12px 0 6px">$1</h2>').replace(/^# (.+)$/gm,'<h1 style="font-size:24px;font-weight:700;margin:12px 0 6px">$1</h1>').replace(/^> (.+)$/gm,'<blockquote style="border-left:3px solid var(--accent);padding-left:12px;color:var(--text-secondary)">$1</blockquote>').replace(/^---$/gm,'<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/`(.+?)`/g,'<code style="background:var(--bg-card);padding:1px 4px;border-radius:3px">$1</code>').replace(/\n/g,'<br>');}
function togglePreview(){S.previewMode=!S.previewMode;const ed=document.getElementById('mainEditor'),pv=document.getElementById('previewPane'),b=document.getElementById('previewBtn');if(S.previewMode){pv.innerHTML=renderMD(ed.value);pv.style.display='block';ed.style.display='none';b.classList.add('active');}else{pv.style.display='none';ed.style.display='block';b.classList.remove('active');}}


// ═══ Focus ═══
function openFocus(){document.getElementById('focusEditor').value=document.getElementById('mainEditor').value;document.getElementById('focusOverlay').classList.add('on');document.getElementById('focusEditor').focus();}
function closeFocus(){document.getElementById('mainEditor').value=document.getElementById('focusEditor').value;document.getElementById('focusOverlay').classList.remove('on');onEditorInput();}


// ═══ Sidebar ═══
function switchSidebar(t,el){document.querySelectorAll('.nav-tab').forEach(x=>x.classList.remove('active'));el.classList.add('active');['outline','chapters','chars','notes'].forEach(x=>{document.getElementById('tab-'+x).style.display=x===t?'block':'none';});}

// ═══ Projects ═══
async function loadProjects(){S.projects=await dbAll('projects');S.projects.sort((a,b)=>(b.updated_at||0)-(a.updated_at||0));if(S.projects.length>0&&!S.proj)await loadProject(S.projects[0].id);}
async function loadProject(id){const p=await dbGet('projects',id);if(!p)return;const [os,cs,chs]=await Promise.all([dbByIndex('outlines','project_id',id),dbByIndex('characters','project_id',id),dbByIndex('chapters','project_id',id)]);os.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));chs.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));S.proj={project:p,outlines:os,characters:cs,chapters:chs};S.active=null;S.wordGoal=p.goal||2000;document.getElementById('currentProjectName').textContent=p.name;document.querySelector('.project-selector')?.setAttribute('title',p.name);renderOutlineList();renderChapterList();renderCharList();if(chs.length>0)loadChapterContent(chs[0].id);else if(os.length>0)loadOutlineContent(os[0].id);else{document.getElementById('mainEditor').value='';document.getElementById('chapterTitle').value='';}onEditorInput();showToast('📁',p.name);}
async function createProject(){const name=document.getElementById('newProjectName').value.trim();if(!name){showToast('✕',t('toast-enter-name'));return;}const g=[...document.querySelectorAll('#genreGrid .genre-chip.on')].map(e=>e.textContent),now=Date.now();const id=await dbPut('projects',{name,genre:g[0]||t('genre-uncategorized'),description:document.getElementById('newProjectDesc').value.trim(),world_setting:document.getElementById('newProjectWorld').value.trim(),goal:parseInt(document.getElementById('dailyGoal').value)||2000,created_at:now,updated_at:now});await dbPut('outlines',{project_id:id,title:t('default-chapter-title'),content:'',sort_order:0,created_at:now});closeModal('newProjectModal');await loadProjects();await loadProject(id);showToast('📁',t('toast-created')+': '+name);document.getElementById('newProjectName').value='';}
function renderProjectList(){const el=document.getElementById('projectList');if(!S.projects.length){el.innerHTML='<div style="text-align:center;padding:30px;color:var(--text-muted)">'+t('ps-none')+'</div>';return;}el.innerHTML=S.projects.map(p=>'<div class="project-list-item" onclick="loadProject('+p.id+');closeModal(\'projectModal\')"><div class="pli-name">'+p.name+'</div><div class="pli-meta">'+p.genre+' · '+new Date(p.created_at).toLocaleDateString(currentLang)+'</div></div>').join('');}
function exportProject(){if(!S.proj)return showToast('✕',t('toast-no-proj'));const d={version:3,project:S.proj.project,outlines:S.proj.outlines,characters:S.proj.characters,chapters:S.proj.chapters,memories:S.aiMemories.filter(m=>m.project_id===S.proj.project.id),prompt_skills:window.wwPromptSkillsExport?.()||null};const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(S.proj.project.name||t('default-doc-title'))+'.json';a.click();showToast('↓',t('toast-exported'));}
function cloneWithoutId(v){const x={...(v||{})};delete x.id;return x;}
// ═══ DOCX Parser (minimal ZIP XML extraction) ═══
async function parseDocx(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  let eocdOffset = -1;
  for (let i = arrayBuffer.byteLength - 22; i >= Math.max(0, arrayBuffer.byteLength - 65576); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset < 0) return '';
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  let pos = cdOffset, docOffset = -1, docSize = 0, docMethod = 0;
  while (pos < cdOffset + cdSize && pos + 46 <= arrayBuffer.byteLength) {
    if (view.getUint32(pos, true) !== 0x02014b50) break;
    const method = view.getUint16(pos + 10, true);
    const compSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(arrayBuffer, pos + 46, nameLen));
    if (name === 'word/document.xml') {
      const lhNameLen = view.getUint16(localOffset + 26, true);
      const lhExtraLen = view.getUint16(localOffset + 28, true);
      docOffset = localOffset + 30 + lhNameLen + lhExtraLen;
      docSize = compSize;
      docMethod = method;
      break;
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  if (docOffset < 0) return '';
  const rawData = new Uint8Array(arrayBuffer, docOffset, docSize);
  let xmlText;
  if (docMethod === 0) {
    xmlText = new TextDecoder().decode(rawData);
  } else if (docMethod === 8) {
    try {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(rawData); writer.close();
      const reader = ds.readable.getReader();
      const chunks = [];
      while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
      const totalLen = chunks.reduce((s, c) => s + c.length, 0);
      const result = new Uint8Array(totalLen);
      let p2 = 0;
      for (const c of chunks) { result.set(c, p2); p2 += c.length; }
      xmlText = new TextDecoder().decode(result);
    } catch (e) { console.warn('DOCX decompression failed:', e); }
  }
  if (!xmlText) return '';
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const paragraphs = doc.getElementsByTagName('w:p');
  const lines = [];
  for (const p of paragraphs) {
    const texts = p.getElementsByTagName('w:t');
    let line = '';
    for (const t of texts) line += t.textContent || '';
    lines.push(line);
  }
  return lines.join('\n');
}
// ═══ Smart Chapter Splitting ═══
function splitIntoChapters(text) {
  if (!text || !text.trim()) return [{ title: '未命名章节', content: text || '', word_count: 0 }];
  const pattern = /(?:^|\n)(第[一二三四五六七八九十百千万零〇\d]+[章回卷部]|Chapter\s+\d+[.:：\s\-]*.*|CHAPTER\s+\d+[.:：\s\-]*.*|第[一二三四五六七八九十百千万零〇\d]+[节篇]|Section\s+\d+[.:：\s\-]*.*|#{1,3}\s+.+)/i;
  const matches = [...text.matchAll(new RegExp(pattern.source, 'gm'))];
  if (matches.length >= 2) {
    const chapters = [];
    for (let i = 0; i < matches.length; i++) {
      const matchEnd = matches[i].index + matches[i][0].length;
      let title = (matches[i][1] || matches[i][0]).trim().replace(/^#+\s*/, '');
      const contentEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
      const content = text.slice(matchEnd, contentEnd).trim();
      if (content || title) chapters.push({ title, content, word_count: countWords(content) });
    }
    if (chapters.length >= 2) {
      const preContent = text.slice(0, matches[0].index).trim();
      if (countWords(preContent) > 50) chapters.unshift({ title: '序章', content: preContent, word_count: countWords(preContent) });
      return chapters;
    }
  }
  return [{ title: '全文', content: text.trim(), word_count: countWords(text) }];
}
// ═══ Import Preview & Confirm ═══
let pendingImportData = null;
function showImportPreview(importData) {
  pendingImportData = importData;
  const totalWords = importData.chapters.reduce((s, c) => s + (c.word_count || countWords(c.content || '')), 0);
  const chapterCount = importData.chapters.length;
  let h = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:16px">';
  h += '<div style="display:flex;gap:24px;margin-bottom:12px">';
  h += '<div><div style="font-size:24px;font-weight:700;color:var(--accent)">' + chapterCount + '</div><div style="font-size:11px;color:var(--text-hint)">章节</div></div>';
  h += '<div><div style="font-size:24px;font-weight:700;color:var(--accent)">' + totalWords + '</div><div style="font-size:11px;color:var(--text-hint)">总字数</div></div>';
  h += '</div>';
  if (chapterCount <= 10) {
    h += '<div style="max-height:120px;overflow-y:auto">';
    importData.chapters.forEach((c, i) => {
      h += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border)">';
      h += '<span style="color:var(--text-muted)">' + (i + 1) + '.</span>';
      h += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (c.title || '未命名') + '</span>';
      h += '<span style="color:var(--text-hint)">' + (c.word_count || countWords(c.content || '')) + '字</span>';
      h += '</div>';
    });
    h += '</div>';
  } else {
    h += '<div style="font-size:12px;color:var(--text-hint)">共' + chapterCount + '个章节，点击"确认导入"继续</div>';
  }
  h += '</div>';
  document.getElementById('importPreviewContent').innerHTML = h;
  document.getElementById('importProjectName').value = importData.name || '';
  openModal('importPreviewModal');
}
async function confirmImport() {
  if (!pendingImportData) return;
  const data = pendingImportData;
  const projectName = document.getElementById('importProjectName').value.trim() || data.name || '未命名项目';
  const autoAnalyze = document.getElementById('importAutoAnalyzeVal').value === '1';
  closeModal('importPreviewModal');
  try {
    const now = Date.now();
    const id = await dbPut('projects', {
      name: projectName,
      genre: data.genre || t('genre-uncategorized'),
      description: data.description || '',
      world_setting: data.world_setting || '',
      goal: data.goal || 2000,
      created_at: data.created_at || now,
      updated_at: now
    });
    if (data.outlines) for (const o of data.outlines) await dbPut('outlines', { ...cloneWithoutId(o), project_id: id });
    if (data.characters) for (const c of data.characters) await dbPut('characters', { ...cloneWithoutId(c), project_id: id });
    for (const c of data.chapters) {
      await dbPut('chapters', {
        ...cloneWithoutId(c),
        project_id: id,
        title: c.title || '未命名章节',
        word_count: c.word_count || countWords(c.content || ''),
        sort_order: c.sort_order || 0
      });
    }
    await loadProjects();
    await loadProject(id);
    showToast('✓', t('toast-imported') + ': ' + projectName);
    if (autoAnalyze) await autoAnalyzeImportedProject(id);
  } catch (err) { showToast('✕', err.message); }
  pendingImportData = null;
}
// ═══ Enhanced Import ═══
async function importProject(e) {
  const files = e.target.files;
  if (!files || !files.length) return;
  // Single JSON file: direct import (original behavior)
  if (files.length === 1 && files[0].name.toLowerCase().endsWith('.json')) {
    try {
      const f = files[0];
      const raw = await f.text();
      const d = JSON.parse(raw);
      if (!d.project) return showToast('✕', t('toast-invalid-file'));
      const now = Date.now();
      const id = await dbPut('projects', { ...cloneWithoutId(d.project), created_at: d.project.created_at || now, updated_at: now });
      if (d.outlines) for (const o of d.outlines) await dbPut('outlines', { ...cloneWithoutId(o), project_id: id });
      if (d.characters) for (const c of d.characters) await dbPut('characters', { ...cloneWithoutId(c), project_id: id });
      if (d.chapters) for (const c of d.chapters) await dbPut('chapters', { ...cloneWithoutId(c), project_id: id, word_count: c.word_count || countWords(c.content || '') });
      if (d.memories) for (const m of d.memories) await dbPut('aiMemories', { ...cloneWithoutId(m), project_id: id });
      if (d.prompt_skills && window.wwPromptSkillsImport) {
        try { window.wwPromptSkillsImport(d.prompt_skills, { merge: true, silent: true }); }
        catch (promptError) { console.warn('Prompt Skill import skipped:', promptError); }
      }
      await loadProjects();
      await loadProject(id);
      showToast('↓', t('toast-imported'));
      await autoAnalyzeImportedProject(id);
    } catch (err) { showToast('✕', err.message); }
    e.target.value = '';
    return;
  }
  // Multi-file or non-JSON: show preview
  const allChapters = [];
  let projectName = '';
  for (const f of files) {
    try {
      const ext = (f.name || '').split('.').pop().toLowerCase();
      let text = '';
      if (ext === 'docx') {
        const buf = await f.arrayBuffer();
        text = await parseDocx(buf);
      } else {
        text = await f.text();
      }
      if (!text.trim()) continue;
      const chapters = splitIntoChapters(text);
      const fileBase = (f.name || '').replace(/\.[^.]+$/, '');
      if (files.length === 1 && !projectName) projectName = fileBase;
      chapters.forEach((ch) => {
        allChapters.push({
          title: chapters.length === 1 ? fileBase : ch.title,
          content: ch.content,
          word_count: ch.word_count || countWords(ch.content || ''),
          sort_order: allChapters.length
        });
      });
    } catch (err) {
      console.warn('Failed to read file:', f.name, err);
      showToast('✕', '读取失败: ' + f.name);
    }
  }
  if (allChapters.length === 0) { showToast('✕', '未检测到有效内容'); e.target.value = ''; return; }
  showImportPreview({
    name: projectName || files[0]?.name?.replace(/\.[^.]+$/, '') || '未命名项目',
    chapters: allChapters,
    created_at: Date.now()
  });
  e.target.value = '';
}

function collectProjectText(proj){
  if(!proj)return'';
  const parts=[];
  const p=proj.project||{};
  if(p.name)parts.push('项目：'+p.name);
  if(p.genre)parts.push('类型：'+p.genre);
  if(p.description)parts.push('简介：'+p.description);
  if(p.world_setting)parts.push('世界观：'+p.world_setting);
  (proj.outlines||[]).forEach(o=>parts.push('【大纲】'+(o.title||'')+'\n'+(o.content||'')));
  (proj.characters||[]).forEach(c=>parts.push('【人物】'+[c.name,c.role,c.personality,c.background,c.appearance,c.skills].filter(Boolean).join(' / ')));
  (proj.chapters||[]).forEach(c=>parts.push('【章节】'+(c.title||'')+'\n'+(c.content||'')));
  return parts.join('\n\n').slice(0,24000);
}
function parseAiImportAnalysis(text){
  const raw=(text||'').replace(/```json|```/g,'').trim();
  const m=raw.match(/\{[\s\S]*\}/);
  if(!m)return null;
  try{return JSON.parse(m[0]);}catch{return null;}
}
function fallbackImportAnalysis(proj){
  const p=proj.project||{},chapters=proj.chapters||[],text=collectProjectText(proj);
  const outlines=[];
  if(text.trim())outlines.push({title:p.name||t('outline-new'),content:text.slice(0,800)});
  const generatedChapters=[];
  if(!chapters.length&&text.trim()){
    const sections=text.split(/(?:^|\n)(?:第[一二三四五六七八九十百千万0-9]+[章节回]|chapter\s+\d+)[:：\s-]*/i).filter(x=>x.trim().length>80).slice(0,12);
    (sections.length?sections:[text]).forEach((content,i)=>generatedChapters.push({title:(i+1)+'. '+(content.trim().split('\n')[0]||t('chapter-new')).slice(0,40),content:content.trim().slice(0,4000)}));
  }
  return {outlines,characters:[],chapters:generatedChapters};
}
async function applyImportAnalysis(projectId,analysis){
  if(!analysis)return 0;
  const [os,cs,chs]=await Promise.all([dbByIndex('outlines','project_id',projectId),dbByIndex('characters','project_id',projectId),dbByIndex('chapters','project_id',projectId)]);
  const now=Date.now();let added=0;
  const outlineTitles=new Set(os.map(o=>(o.title||'').trim().toLowerCase()));
  for(const [i,o] of (analysis.outlines||[]).slice(0,12).entries()){
    const title=String(o.title||t('outline-new')).trim().slice(0,80);
    if(!title||outlineTitles.has(title.toLowerCase()))continue;
    await dbPut('outlines',{project_id:projectId,title,content:String(o.content||o.summary||'').trim(),sort_order:os.length+i,created_at:now,updated_at:now});added++;
  }
  const charNames=new Set(cs.map(c=>(c.name||'').trim().toLowerCase()));
  for(const c of (analysis.characters||[]).slice(0,24)){
    const name=String(c.name||'').trim().slice(0,40);
    if(!name||charNames.has(name.toLowerCase()))continue;
    await dbPut('characters',{project_id:projectId,name,role:String(c.role||'').slice(0,30),personality:String(c.personality||'').slice(0,500),background:String(c.background||'').slice(0,800),appearance:String(c.appearance||'').slice(0,500),skills:String(c.skills||'').slice(0,500),created_at:now});added++;
  }
  const chapterTitles=new Set(chs.map(c=>(c.title||'').trim().toLowerCase()));
  for(const [i,c] of (analysis.chapters||[]).slice(0,40).entries()){
    const title=String(c.title||t('chapter-new')).trim().slice(0,80);
    if(!title||chapterTitles.has(title.toLowerCase()))continue;
    const content=String(c.content||c.summary||'').trim();
    await dbPut('chapters',{project_id:projectId,title,content,word_count:countWords(content),sort_order:chs.length+i,created_at:now,updated_at:now});added++;
  }
  return added;
}
async function autoAnalyzeImportedProject(projectId){
  const p=await dbGet('projects',projectId);if(!p)return;
  const proj={project:p,outlines:await dbByIndex('outlines','project_id',projectId),characters:await dbByIndex('characters','project_id',projectId),chapters:await dbByIndex('chapters','project_id',projectId)};
  const source=collectProjectText(proj);if(!source.trim())return;
  showToast('⊕',t('toast-import-scan'));
  let analysis=null;
  if(aiHasConfig(S.apiConfig)){
    try{
      const prompt='请扫描以下导入的写作项目内容，识别并补全项目结构。只输出严格 JSON，不要 Markdown。JSON 格式：{"outlines":[{"title":"","content":""}],"characters":[{"name":"","role":"","personality":"","background":"","appearance":"","skills":""}],"chapters":[{"title":"","summary":""}]}。如果项目已经有章节/人物/大纲，也请根据内容识别可能缺失的条目，避免重复。\n\n'+source;
      analysis=parseAiImportAnalysis(await callAI(prompt,S.apiConfig,'你是写作项目导入分析助手，负责从文本中提取大纲、人物和章节结构。'));
    }catch(err){console.warn('import analysis failed',err);}
  }
  if(!analysis)analysis=fallbackImportAnalysis(proj);
  const added=await applyImportAnalysis(projectId,analysis);
  if(added>0){await loadProjects();await loadProject(projectId);showToast('★',t('toast-import-scan-done'));}
  else showToast('✓',t('toast-import-scan-done'));
}



// ═══ Outlines ═══
function renderOutlineList(){if(!S.proj)return;const el=document.getElementById('outlineList');if(!S.proj.outlines.length){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:12px">'+t('sb-empty-outline')+'</div>';return;}el.innerHTML=S.proj.outlines.map(o=>'<div class="outline-item'+(S.active&&S.active.type==='outline'&&S.active.id===o.id?' active':'')+'" onclick="loadOutlineContent('+o.id+')"><span class="oi-icon"><svg class="ic ic-sm"><use href="#ic-outline"/></svg></span><span class="oi-text">'+o.title+'</span><span class="oi-count">'+(o.content?countWords(o.content):0)+t('ps-units-2')+'</span><button class="oi-del" onclick="event.stopPropagation();delOutline('+o.id+')">✕</button></div>').join('');}
async function addOutline(){if(!S.proj)return showToast('✕',t('toast-no-proj'));const now=Date.now(),id=await dbPut('outlines',{project_id:S.proj.project.id,title:t('outline-new'),content:'',sort_order:S.proj.outlines.length,created_at:now});S.proj.outlines.push({id,project_id:S.proj.project.id,title:t('outline-new'),content:'',sort_order:S.proj.outlines.length});renderOutlineList();showToast('✓',t('toast-added'));}
function loadOutlineContent(id){const o=S.proj.outlines.find(x=>x.id===id);if(!o)return;S.active={type:'outline',id,data:o};document.getElementById('chapterTitle').value=o.title;document.getElementById('mainEditor').value=o.content||'';onEditorInput();renderOutlineList();}
async function delOutline(id){if(!confirm(t('confirm-delete')))return;await dbDel('outlines',id);S.proj.outlines=S.proj.outlines.filter(x=>x.id!==id);if(S.active&&S.active.id===id)S.active=null;renderOutlineList();showToast('✕',t('toast-deleted'));}


// ═══ Chapters ═══
function renderChapterList(){if(!S.proj)return;const el=document.getElementById('chapterList');if(!S.proj.chapters.length){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:12px">'+t('sb-empty-chapter')+'</div>';return;}el.innerHTML=S.proj.chapters.map(c=>'<div class="outline-item'+(S.active&&S.active.type==='chapter'&&S.active.id===c.id?' active':'')+'" onclick="loadChapterContent('+c.id+')"><span class="oi-icon"><svg class="ic ic-sm"><use href="#ic-chapter"/></svg></span><span class="oi-text">'+c.title+'</span><span class="oi-count">'+(c.word_count||0)+t('ps-units-2')+'</span><button class="oi-del" onclick="event.stopPropagation();delChapter('+c.id+')">✕</button></div>').join('');}
async function addChapter(){if(!S.proj)return showToast('✕',t('toast-no-proj'));const now=Date.now(),id=await dbPut('chapters',{project_id:S.proj.project.id,title:t('chapter-new'),content:'',word_count:0,sort_order:S.proj.chapters.length,created_at:now,updated_at:now});S.proj.chapters.push({id,project_id:S.proj.project.id,title:t('chapter-new'),content:'',word_count:0});renderChapterList();showToast('✓',t('toast-added'));}
function loadChapterContent(id){const c=S.proj.chapters.find(x=>x.id===id);if(!c)return;S.active={type:'chapter',id,data:c};document.getElementById('chapterTitle').value=c.title;document.getElementById('mainEditor').value=c.content||'';onEditorInput();renderChapterList();}
async function delChapter(id){if(!confirm(t('confirm-delete')))return;await dbDel('chapters',id);S.proj.chapters=S.proj.chapters.filter(x=>x.id!==id);if(S.active&&S.active.id===id)S.active=null;renderChapterList();showToast('✕',t('toast-deleted'));}


// ═══ Characters ═══
function renderCharList(){if(!S.proj)return;const el=document.getElementById('charList');if(!S.proj.characters.length){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:12px">'+t('sb-empty-char')+'</div>';return;}el.innerHTML=S.proj.characters.map(c=>'<div class="char-card" onclick="loadCharContent('+c.id+')"><div class="char-name">'+c.name+'</div><span class="char-role">'+c.role+'</span><div class="char-desc">'+(c.personality||c.background||t('char-no-desc'))+'</div><div class="char-actions"><button class="char-act-btn" onclick="event.stopPropagation();editChar('+c.id+')">'+t('action-edit')+'</button><button class="char-act-btn" onclick="event.stopPropagation();delChar('+c.id+')">'+t('action-delete')+'</button></div></div>').join('');}
function loadCharContent(id){const c=S.proj.characters.find(x=>x.id===id);if(!c)return;S.active={type:'character',id,data:c};document.getElementById('chapterTitle').value=c.name;document.getElementById('mainEditor').value='【'+c.role+'】'+c.name+'\n\n性格：'+(c.personality||'')+'\n\n背景：'+(c.background||'')+'\n\n外貌：'+(c.appearance||'')+(c.skills?'\n\n技能：'+c.skills:'');onEditorInput();renderCharList();}
function editChar(id){const c=S.proj.characters.find(x=>x.id===id);if(!c)return;S.editCharId=id;document.getElementById('charModalTitle').textContent='✎ 编辑人物';document.getElementById('charName').value=c.name;document.querySelectorAll('#charRoleGrid .genre-chip').forEach(ch=>{ch.classList.toggle('on',ch.textContent===c.role);});document.getElementById('charPers').value=c.personality||'';document.getElementById('charBack').value=c.background||'';document.getElementById('charLook').value=c.appearance||'';document.getElementById('charSkill').value=c.skills||'';openModal('charModal');}
async function saveChar(){const name=document.getElementById('charName').value.trim();if(!name){showToast('✕',t('toast-enter-char-name'));return;}const role=document.querySelector('#charRoleGrid .genre-chip.on')?.textContent||'配角';const d={project_id:S.proj.project.id,name,role,personality:document.getElementById('charPers').value,background:document.getElementById('charBack').value,appearance:document.getElementById('charLook').value,skills:document.getElementById('charSkill').value,created_at:Date.now()};if(S.editCharId){d.id=S.editCharId;await dbPut('characters',d);}else{await dbPut('characters',d);}S.editCharId=null;closeModal('charModal');await loadProject(S.proj.project.id);showToast('●',name+' '+t('toast-saved'));document.getElementById('charName').value='';document.getElementById('charPers').value='';document.getElementById('charBack').value='';document.getElementById('charLook').value='';document.getElementById('charSkill').value='';document.getElementById('charModalTitle').textContent=t('mod-char');}
async function delChar(id){if(!confirm(t('confirm-delete')))return;await dbDel('characters',id);S.proj.characters=S.proj.characters.filter(x=>x.id!==id);if(S.active&&S.active.id===id)S.active=null;renderCharList();showToast('✕',t('toast-deleted'));}


// ═══ Save ═══
async function saveDoc(){if(!S.active||!S.proj)return;const text=document.getElementById('mainEditor').value,title=document.getElementById('chapterTitle').value,now=Date.now();if(S.active.type==='outline'){const o=S.proj.outlines.find(x=>x.id===S.active.id);if(o){o.title=title;o.content=text;o.updated_at=now;await dbPut('outlines',{...o,title,content:text,updated_at:now});renderOutlineList();}}else if(S.active.type==='chapter'){const c=S.proj.chapters.find(x=>x.id===S.active.id);if(c){const words=countWords(text);c.title=title;c.content=text;c.word_count=words;c.updated_at=now;await dbPut('chapters',{...c,title,content:text,word_count:words,updated_at:now});renderChapterList();}}S.proj.project.updated_at=now;await dbPut('projects',S.proj.project);S.unsaved=false;document.getElementById('saveBtn').classList.remove('unsaved');showToast('💾','已保存');}

// ═══ AI Modes ═══
const AI_MODES={'润色':{icon:'◇',group:'基础',p:'请对以下文字进行润色，提升语言的流畅度、文学性和表达力，保持原意和风格：'},'扩写':{icon:'↑',group:'基础',p:'请对以下文字进行扩写，增加细节描写、画面感和情感层次：'},'缩写':{icon:'↓',group:'基础',p:'请对以下文字进行精炼缩写，保留核心内容，简洁有力：'},'改写':{icon:'↻',group:'基础',p:'请用不同的表达方式改写以下文字，保持核心意思：'},'续写':{icon:'→',group:'基础',p:'请根据以下内容自然地续写下文，保持风格和情节逻辑：'},'补写':{icon:'⊞',group:'基础',p:'请为以下内容填补缺失的过渡或细节部分：'},'对话':{icon:'❝',group:'描写',p:'请为以下场景创作自然生动的对话，符合人物性格：'},'心理':{icon:'◉',group:'描写',p:'请为以下内容增加细腻的人物心理描写：'},'环境':{icon:'❋',group:'描写',p:'请为以下内容增加生动的环境和氛围描写：'},'战斗':{icon:'⚡',group:'描写',p:'请将以下内容改写为紧张刺激的战斗场景描写：'},'古风':{icon:'◎',group:'风格',p:'请将以下内容改写为古典文学风格：'},'现代':{icon:'▣',group:'风格',p:'请将以下内容改写为现代白话文风格：'},'幽默':{icon:'♪',group:'风格',p:'请将以下内容改写得轻松幽默：'},'悬疑':{icon:'⊕',group:'风格',p:'请将以下内容改写为悬疑神秘风格：'},'唯美':{icon:'✿',group:'风格',p:'请将以下内容改写为唯美诗意风格：'},'霸气':{icon:'△',group:'风格',p:'请将以下内容改写为霸气豪迈风格：'},'分析':{icon:'≡',group:'分析',p:'请分析以下文字的结构、节奏和表达问题：'},'校对':{icon:'✓',group:'分析',p:'请检查以下文字的错别字、语病和标点错误：'},'节奏':{icon:'♫',group:'分析',p:'请分析以下文字的叙事节奏：'},'情感':{icon:'♥',group:'分析',p:'请分析以下文字的情感层次和情绪弧度：'},'大纲':{icon:'☰',group:'创作',p:'请根据以下信息生成详细的故事大纲：'},'人物':{icon:'◉',group:'创作',p:'请根据以下信息生成详细的人物档案：'},'伏笔':{icon:'⊹',group:'创作',p:'请为以下故事设计3-5个巧妙的伏笔：'},'转折':{icon:'⇄',group:'创作',p:'请为以下故事情节设计2-3个出乎意料的转折：'},'结局':{icon:'■',group:'创作',p:'请为以下故事提供3种不同风格的结局：'},'翻译':{icon:'⊕',group:'工具',p:'请将以下中文内容翻译为英文：'},'总结':{icon:'✎',group:'工具',p:'请为以下内容生成简洁摘要：'},'标题':{icon:'¶',group:'工具',p:'请为以下内容生成5个吸引人的标题：'},'降AI':{icon:'▷',group:'工具',p:'请将以下AI生成的文字重写为自然的人类写作风格。要求：1.使用口语化、不规则的句式 2.加入个人化的表达和语气词 3.偶尔使用短句或碎片化表达 4.避免完美排比和过度修饰 5.添加一些即兴感和不完美感 6.保持核心意思不变 7.让文字读起来像真人随手写的，而不是AI精心构造的。输出重写后的全文：'},'查AI':{icon:'⊕',group:'工具',p:'请分析以下文字的AI生成特征。从句式规律性、词汇丰富度、情感自然度、结构完美度、口语化程度、重复冗余度六个维度各给0-100评分，给出综合AI概率评估和具体特征描述。⚠️ 仅供参考，不构成正式判定。文字：'}};
function renderAiModeGrid(){const el=document.getElementById('aiModeGrid'),g={};for(const[k,v]of Object.entries(AI_MODES)){if(!g[v.group])g[v.group]=[];g[v.group].push(k);}let h='';for(const[label,keys]of Object.entries(g)){h+='<div class="mode-group" data-mode-group="'+label+'"><div class="mode-group-title">'+t('grp-'+label)+'</div><div class="mode-grid">';for(const k of keys)h+='<button class="mode-btn'+(S.aiMode===k?' selected':'')+'" data-mode="'+k+'" onclick="selectMode(this,\''+k+'\')"><span class="micon">'+wwAiModeIcon(k)+'</span>'+t('mode-'+k)+'</button>';h+='</div></div>';}el.innerHTML=h;}
function selectMode(btn,m){document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');S.aiMode=m;updateContextBar();}
function setTemp(v,btn){btn.parentElement.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');S.aiTemp=v;}
function setLen(v,btn){btn.parentElement.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');S.aiLen=v;}


// ═══ API ═══
const PROVIDERS={claude:{url:'https://api.anthropic.com/v1/messages',model:'claude-sonnet-4-20250514',type:'claude'},openai:{url:'https://api.openai.com/v1/chat/completions',model:'gpt-4o',type:'openai'},deepseek:{url:'https://api.deepseek.com/v1/chat/completions',model:'deepseek-chat',type:'openai'},xiaomi:{url:'https://api.xiaomimimo.com/v1/chat/completions',model:'mimo-v2.5-pro',type:'openai'},qwen:{url:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',model:'qwen-plus',type:'openai'},zhipu:{url:'https://open.bigmodel.cn/api/paas/v4/chat/completions',model:'glm-4-flash',type:'openai'},moonshot:{url:'https://api.moonshot.cn/v1/chat/completions',model:'moonshot-v1-8k',type:'openai'},siliconflow:{url:'https://api.siliconflow.cn/v1/chat/completions',model:'deepseek-ai/DeepSeek-V3',type:'openai'},openrouter:{url:'https://openrouter.ai/api/v1/chat/completions',model:'anthropic/claude-sonnet-4',type:'openai'},gemini:{url:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',model:'gemini-2.0-flash',type:'gemini'},grok:{url:'https://api.x.ai/v1/chat/completions',model:'grok-3',type:'openai'},custom:{url:'',model:'',type:'openai'}};
const TRANSIENT_ERRORS=[429,500,502,503,504];
function _isTransient(err){const m=err.message?.match?.(/HTTP (\d+)/);return m&&TRANSIENT_ERRORS.includes(+m[1]);}
async function _sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function aiHasConfig(conf){return !!(conf&&(conf.key||conf.provider));}
async function _fetchWithTimeout(url,opts,timeoutMs=60000){
  const ac=new AbortController();const id=setTimeout(()=>ac.abort(),timeoutMs);
  try{
    const original=opts.body?JSON.parse(opts.body):{};
    const providerEntry=Object.entries(PROVIDERS).find(([,p])=>p.url===url)?.[0];
    const aiBody={...original,provider:providerEntry||original.provider,signal:undefined};
    const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(aiBody),signal:ac.signal});
    const data=await r.json();
    return{ok:r.ok&&(!data.error||r.status===200),status:r.status,json:async()=>data,
      _proxyError:data.error?new Error('HTTP '+(data.error.code||r.status)+': '+(data.error.message||'Unknown')):null};
  }finally{clearTimeout(id);}}
function _buildHeaders(conf,p){const h={'Content-Type':'application/json'};if(p.type==='claude'){h['x-api-key']=conf.key;h['anthropic-version']='2023-06-01';}else{h['Authorization']='Bearer '+conf.key;}return h;}
function _buildBody(conf,p,msgs,systemPrompt,stream){
  if(p.type==='claude'){
    const claudeBody={provider:conf.provider,model:conf.model||p.model,max_tokens:2000,messages:msgs.filter(m=>m.role!=='system')};
    if(systemPrompt)claudeBody.system=systemPrompt;
    if(stream)claudeBody.stream=true;
    return JSON.stringify(claudeBody);
  }
  const b={provider:conf.provider,model:conf.model||p.model,max_tokens:2000,messages:msgs};
  if(stream)b.stream=true;
  return JSON.stringify(b);
}
function _parseMessages(prompt,systemPrompt){const msgs=[];if(systemPrompt)msgs.push({role:'system',content:systemPrompt});msgs.push({role:'user',content:prompt});return msgs;}
async function callAI(prompt,conf,systemPrompt){
  const pr=conf.provider||'claude',p=PROVIDERS[pr]||PROVIDERS.claude,url=conf.baseUrl||p.url;
  const msgs=_parseMessages(prompt,systemPrompt);
  const h=_buildHeaders(conf,p),body=_buildBody(conf,p,msgs,systemPrompt,false);
  let lastErr=null;
  for(let attempt=0;attempt<3;attempt++){
    try{const r=await _fetchWithTimeout(url,{method:'POST',headers:h,body},conf.timeout||60000);
      if(r._proxyError)throw r._proxyError;
      if(!r.ok)throw new Error('HTTP '+r.status);
      const d=await r.json();let result='',usage=null;
      if(d.error)throw new Error(d.error.message||JSON.stringify(d.error));
      if(p.type==='claude'){result=d.content?.[0]?.text||'（无返回）';usage=d.usage?{input:d.usage.input_tokens,output:d.usage.output_tokens}:null;}
      else{result=d.choices?.[0]?.message?.content||'（无返回）';usage=d.usage?{input:d.usage.prompt_tokens,output:d.usage.completion_tokens}:null;}
      if(usage)updateUsageDisplay(usage);return result;
    }catch(e){lastErr=e;if(_isTransient(e)&&attempt<2){await _sleep(1000*Math.pow(2,attempt));continue;}throw e;}
  }
  throw lastErr;
}
async function callAIStream(prompt,conf,systemPrompt,onChunk){
  const text=await callAI(prompt,conf,systemPrompt);
  if(text&&onChunk)onChunk(text);
}
function showStreamingResult(elementId){const el=document.getElementById(elementId);if(!el)return;el.textContent='';el.classList.add('streaming-cursor');}
function hideStreamingCursor(){const el=document.getElementById('arpText');if(el)el.classList.remove('streaming-cursor');}
function updateUsageDisplay(usage){
  const el=document.getElementById('ctxUsedText');
  if(!el)return;
  const total=(usage.input||0)+(usage.output||0);
  const totalStr=total>1000?(total/1000).toFixed(1)+'k':total;
  const inStr=(usage.input||0)>1000?((usage.input||0)/1000).toFixed(1)+'k':usage.input||0;
  const outStr=(usage.output||0)>1000?((usage.output||0)/1000).toFixed(1)+'k':usage.output||0;
  el.textContent='上次: 入'+inStr+' 出'+outStr+' = '+totalStr+' tokens';
  el.style.display='block';
}
function buildCtx(){if(!S.proj)return'';const p=S.proj.project,a=[];a.push('作品：《'+p.name+'》');if(p.genre)a.push('类型：'+p.genre);if(p.description)a.push('简介：'+p.description);if(p.world_setting)a.push('世界观：'+p.world_setting);if(S.proj.characters.length)a.push('人物：'+S.proj.characters.map(c=>c.name+'('+c.role+')').join('、'));return a.join('\n');}


// ═══ AI Memory ═══
function buildMemoryContext(){
  if(!S.proj||!S.aiMemories.length)return'';
  const projMem=S.aiMemories.filter(m=>m.project_id===S.proj.project.id);
  if(!projMem.length)return'';
  const lines=projMem.map(m=>'['+m.category+'] '+m.content);
  return'【AI记忆 — 请参考以下已知信息】\n'+lines.join('\n');
}
async function loadMemories(){
  if(!db)return;
  S.aiMemories=await dbAll('aiMemories');
  renderMemoryList();
}
function renderMemoryList(){
  const el=document.getElementById('memoryList');
  if(!el)return;
  const projMem=S.proj?S.aiMemories.filter(m=>m.project_id===S.proj.project.id):[];
  if(!projMem.length){
    el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:12px">暂无记忆条目<br><span style="font-size:11px;opacity:0.7">添加记忆后，AI会自动参考这些信息</span></div>';
    return;
  }
  const cats={plot:'☐ 剧情',style:'✎ 风格',world:'◆ 世界观',char:'● 人物',note:'📝 备注',rule:'─ 规则'};
  el.innerHTML=projMem.map(m=>'<div class="char-card" style="position:relative"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-size:10px;padding:1px 6px;border-radius:10px;background:var(--accent-glow);color:var(--accent)">'+(cats[m.category]||m.category)+'</span><div style="display:none;gap:4px" class="mem-actions"><button class="char-act-btn" onclick="event.stopPropagation();editMemory('+m.id+')">'+t('action-edit')+'</button><button class="char-act-btn" onclick="event.stopPropagation();delMemory('+m.id+')">'+t('action-delete')+'</button></div></div><div style="font-size:12px;color:var(--text-secondary);line-height:1.6">'+m.content+'</div></div>').join('');
  el.querySelectorAll('.char-card').forEach(c=>{
    c.addEventListener('mouseenter',()=>{const a=c.querySelector('.mem-actions');if(a)a.style.display='flex';});
    c.addEventListener('mouseleave',()=>{const a=c.querySelector('.mem-actions');if(a)a.style.display='none';});
  });
}
async function saveMemory(){
  const content=document.getElementById('memContent').value.trim();
  if(!content){showToast('✕',t('toast-enter-memory'));return;}
  if(!S.proj){showToast('✕',t('toast-no-proj'));return;}
  const catEl=document.querySelector('#memCatGrid .genre-chip.on');
  const category=catEl?catEl.textContent.replace(/^[^\s]+\s/,''):'备注';
  const catMap={'☐ 剧情':'plot','✎ 风格':'style','◆ 世界观':'world','● 人物':'char','📝 备注':'note','─ 规则':'rule'};
  const catKey=catMap[category]||'note';
  const d={project_id:S.proj.project.id,category:catKey,content,created_at:Date.now()};
  if(S.editMemoryId){d.id=S.editMemoryId;}
  await dbPut('aiMemories',d);
  S.editMemoryId=null;
  document.getElementById('memContent').value='';
  await loadMemories();
  closeModal('memoryModal');
  showToast('◆','记忆已保存');
  updateContextBar();
}
async function delMemory(id){
  if(!confirm('删除此记忆？'))return;
  await dbDel('aiMemories',id);
  S.aiMemories=S.aiMemories.filter(m=>m.id!==id);
  renderMemoryList();
  showToast('✕',t('toast-deleted'));
  updateContextBar();
}
function editMemory(id){
  const m=S.aiMemories.find(x=>x.id===id);
  if(!m)return;
  S.editMemoryId=id;
  document.getElementById('memContent').value=m.content;
  const catMap2={plot:'☐ 剧情',style:'✎ 风格',world:'◆ 世界观',char:'● 人物',note:'📝 备注',rule:'─ 规则'};
  document.querySelectorAll('#memCatGrid .genre-chip').forEach(c=>c.classList.toggle('on',c.textContent===catMap2[m.category]));
  openModal('memoryModal');
}
function toggleMemCat(el){el.parentElement.querySelectorAll('.genre-chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');}
function selectProvider(el,p){el.parentElement.querySelectorAll('.provider-chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');S.selectedProvider=p;const cur=el.closest('.provider-grid').id;const urlRow=cur==='sProviderGrid'?'sCustomUrlRow':'customUrlRow';document.getElementById(urlRow).style.display=p==='custom'?'block':'none';const d={claude:'claude-sonnet-4-20250514',openai:'gpt-4o',deepseek:'deepseek-chat',xiaomi:'mimo-v2.5-pro',qwen:'qwen-plus',zhipu:'glm-4-flash',moonshot:'moonshot-v1-8k',siliconflow:'deepseek-ai/DeepSeek-V3',openrouter:'anthropic/claude-sonnet-4',gemini:'gemini-2.0-flash',grok:'grok-3',custom:''};const modelEl=cur==='sProviderGrid'?document.getElementById('sApiModel'):document.getElementById('apiModel');if(modelEl)modelEl.placeholder=d[p]||'';}
async function testApi(){const k=document.getElementById('apiKey').value.trim(),r=document.getElementById('testResult');r.className='test-result ok';r.textContent='⟳ '+t('mod-api-test')+'...';try{const conf={key:k||'backend',provider:S.selectedProvider,model:document.getElementById('apiModel').value.trim(),baseUrl:document.getElementById('apiBaseUrl').value.trim()};await apiJSON('/api/config',{method:'POST',body:JSON.stringify({provider:conf.provider,model:conf.model,api_key:k,base_url:conf.baseUrl})});const t=await callAI('Reply with OK',conf);r.className='test-result ok';r.textContent='✓ '+t.slice(0,30);}catch(e){r.className='test-result fail';r.textContent='✗ '+e.message;}}
async function saveApi(){const key=document.getElementById('apiKey').value.trim();const c={provider:S.selectedProvider,key:key||'backend',model:document.getElementById('apiModel').value.trim(),baseUrl:document.getElementById('apiBaseUrl').value.trim()};try{await apiJSON('/api/config',{method:'POST',body:JSON.stringify({provider:c.provider,model:c.model,api_key:key,base_url:c.baseUrl})});S.apiConfig=c;localStorage.setItem('ww_api',JSON.stringify(c));closeModal('apiModal');showToast('✓',t('toast-saved'));}catch(e){showToast('✕',e.message);}}
function loadApiUI(){const c=S.apiConfig;if(c.provider){const el=document.querySelector('.provider-chip[onclick*="'+c.provider+'"]');if(el)selectProvider(el,c.provider);}document.getElementById('apiKey').value=c.key==='backend'?'':(c.key||'');document.getElementById('apiModel').value=c.model||'';document.getElementById('apiBaseUrl').value=c.baseUrl||'';}


// ═══ AI Generate ═══
async function doGenerate(){const ac=S.apiConfig;if(!aiHasConfig(ac)){showToast('⚙',t('toast-no-api'));openModal('apiModal');return;}const ed=document.getElementById('mainEditor'),sel=ed.value.slice(ed.selectionStart,ed.selectionEnd).trim(),full=ed.value.trim(),extra=document.getElementById('aiPrompt').value.trim(),content=sel||full.slice(-1000);if(!content&&!extra){showToast('✎',t('toast-no-content'));return;}const lm={short:'100字以内',mid:'200-300字',long:'400-600字',xl:'800字以上'},tm={low:'保持严谨',mid:'适度创意',high:'大胆想象'};const md=AI_MODES[S.aiMode]||{p:'请处理以下内容：'};let prompt=(typeof wwPromptText==='function'?wwPromptText(S.aiMode):md.p)+'\n\n'+content+'\n\n【输出要求】'+lm[S.aiLen]+'。'+tm[S.aiTemp]+'。';if(S.proj)prompt+='\n\n【项目信息】\n'+buildCtx();if(extra)prompt+='\n\n【额外指令】'+extra;let sysPrompt='你是一位专业的中文写作助手。';const memCtx=buildMemoryContext();if(memCtx)sysPrompt+='\n\n'+memCtx;const btn=document.getElementById('generateBtn');btn.classList.add('loading');document.getElementById('generateBtnIcon').innerHTML='<div class="spinner"></div>';document.getElementById('generateBtnText').textContent=t('ap-gen-ing');try{showStreamingResult('arpText');const arpEl=document.getElementById('arpText');document.getElementById('arpMode').textContent=S.aiMode;document.getElementById('aiResultPopup').classList.add('show');let fullResult='';await callAIStream(prompt,ac,sysPrompt,(chunk)=>{fullResult+=chunk;arpEl.textContent=fullResult;});S.lastArpResult=fullResult;addHistory(S.aiMode,fullResult);}catch(e){showToast('✕',e.message||'请求失败');}finally{hideStreamingCursor();btn.classList.remove('loading');document.getElementById('generateBtnIcon').textContent='★';document.getElementById('generateBtnText').textContent=t('ap-gen');}}
function arpAction(t){const text=S.lastArpResult,ed=document.getElementById('mainEditor');if(t==='replace'){const s=ed.selectionStart,e=ed.selectionEnd;if(s!==e)ed.value=ed.value.slice(0,s)+text+ed.value.slice(e);else ed.value=text;showToast('✓','已替换');}else if(t==='append'){ed.value+='\n\n'+text;showToast('✓','已追加');}else if(t==='insert'){const p=ed.selectionStart;ed.value=ed.value.slice(0,p)+text+ed.value.slice(p);showToast('✓','已插入');}else if(t==='copy'){navigator.clipboard.writeText(text).then(()=>showToast('✓',t('toast-copied')));return;}onEditorInput();closeAiResult();}
function closeAiResult(){document.getElementById('aiResultPopup').classList.remove('show');}


// ═══ Multi-AI ═══
const SLOT_PRESETS={xiaomi:{url:'https://api.xiaomimimo.com/v1/chat/completions',model:'mimo-v2.5-pro'},claude:{url:'https://api.anthropic.com/v1/messages',model:'claude-sonnet-4-20250514'},openai:{url:'https://api.openai.com/v1/chat/completions',model:'gpt-4o'},deepseek:{url:'https://api.deepseek.com/v1/chat/completions',model:'deepseek-chat'},qwen:{url:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',model:'qwen-plus'},openrouter:{url:'https://openrouter.ai/api/v1/chat/completions',model:'anthropic/claude-sonnet-4'},siliconflow:{url:'https://api.siliconflow.cn/v1/chat/completions',model:'deepseek-ai/DeepSeek-V3'},gemini:{url:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',model:'gemini-2.0-flash'},grok:{url:'https://api.x.ai/v1/chat/completions',model:'grok-3'}};
function renderMultiSlots(){
  const el=document.getElementById('multiSlots');
  const hasMainKey=aiHasConfig(S.apiConfig);
  let h='<div id="multiSummary" class="multi-summary" style="display:none"></div><div id="multiSlotList">';
  for(let i=1;i<=3;i++){
    const s=JSON.parse(localStorage.getItem('ww_slot'+i)||'{}');
    if(i===1&&hasMainKey&&!s.key&&!s._touched)s.enabled=true;
    const enabled=s.enabled;
    const presetName=s.preset||'';
    const displayName=presetName?(SLOT_PRESETS[presetName]?presetName:'自定义'):'未配置';
    const modelDisplay=s.model||SLOT_PRESETS[presetName]?.model||'';
    h+='<div class="multi-slot'+(enabled?' slot-active':'')+'" id="multiSlot'+i+'">';
    h+='<div class="slot-header">';
    h+='<div class="slot-info"><span class="slot-num">'+i+'</span><span class="slot-provider-badge">'+displayName+'</span>';
    if(modelDisplay)h+='<span class="slot-model-name">'+modelDisplay+'</span>';
    h+='</div>';
    h+='<button class="slot-toggle'+(enabled?' on':'')+'" onclick="toggleSlot('+i+')"></button>';
    h+='</div>';
    h+='<div class="slot-fields'+(enabled?' show':'')+'" id="slotFields'+i+'">';
    h+='<select class="slot-select" onchange="applySlotPreset('+i+',this.value)"><option value="">自定义</option>';
    for(const[k]of Object.entries(SLOT_PRESETS))h+='<option value="'+k+'"'+(s.preset===k?' selected':'')+'>'+k+'</option>';
    h+='</select>';
    h+='<input class="slot-input" id="slotUrl'+i+'" placeholder="Base URL" value="'+(s.url||'')+'" onchange="saveSlot('+i+')">';
    h+='<input class="slot-input" id="slotKey'+i+'" type="password" placeholder="API Key" value="'+(s.key||'')+'" onchange="saveSlot('+i+')">';
    h+='<input class="slot-input" id="slotModel'+i+'" placeholder="Model" value="'+(s.model||'')+'" onchange="saveSlot('+i+')">';
    h+='<div class="slot-result" id="slotResult'+i+'"></div>';
    h+='<div class="slot-meta" id="slotMeta'+i+'" style="display:none"></div>';
    h+='<div class="slot-actions" id="slotActions'+i+'" style="display:none">';
    h+='<button class="slot-action-btn slot-best-btn" onclick="markBest('+i+')">★ 最佳</button>';
    h+='<button class="slot-action-btn" onclick="applySlotToEditor('+i+')">应用到编辑器</button>';
    h+='<button class="slot-action-btn" onclick="copySlotResult('+i+')">复制</button>';
    h+='</div>';
    h+='</div>';
    h+='</div>';
  }
  h+='</div>';
  h+='<div class="multi-bottom-actions">';
  h+='<button class="generate-btn multi-gen-btn" data-i18n="multi-gen" onclick="doMultiGenerate()"><span>⚡</span> 并行生成所有槽位</button>';
  h+='<div class="multi-extra-btns">';
  h+='<button class="multi-action-btn" onclick="applyAllSlots()">全部应用</button>';
  h+='<button class="multi-action-btn" onclick="clearAllResults()">清空结果</button>';
  h+='</div>';
  h+='</div>';
  el.innerHTML=h;
}
function toggleSlot(n){
  const btn=document.querySelector('#multiSlot'+n+' .slot-toggle');
  if(!btn)return;
  const isOn=btn.classList.toggle('on');
  document.getElementById('slotFields'+n).classList.toggle('show',isOn);
  document.getElementById('multiSlot'+n).classList.toggle('slot-active',isOn);
  saveSlot(n);
  event&&event.stopPropagation();
}
function applySlotPreset(n,p){
  if(p&&SLOT_PRESETS[p]){document.getElementById('slotUrl'+n).value=SLOT_PRESETS[p].url;document.getElementById('slotModel'+n).value=SLOT_PRESETS[p].model;}
  saveSlot(n);
  const badge=document.querySelector('#multiSlot'+n+' .slot-provider-badge');
  const mName=document.querySelector('#multiSlot'+n+' .slot-model-name');
  if(badge)badge.textContent=p||(SLOT_PRESETS[p]?'自定义':'未配置');
  if(mName)mName.textContent=(p&&SLOT_PRESETS[p])?SLOT_PRESETS[p].model:((document.getElementById('slotModel'+n)?.value)||'');
}
function saveSlot(n){
  const toggle=document.querySelector('#multiSlot'+n+' .slot-toggle');
  const s={enabled:toggle?toggle.classList.contains('on'):false,preset:document.querySelector('#slotFields'+n+' .slot-select')?.value||'',url:document.getElementById('slotUrl'+n)?.value||'',key:document.getElementById('slotKey'+n)?.value||'',model:document.getElementById('slotModel'+n)?.value||'',_touched:true};
  localStorage.setItem('ww_slot'+n,JSON.stringify(s));
}
async function doMultiGenerate(){
  const ac=S.apiConfig;
  if(!aiHasConfig(ac)){showToast('⚙',t('toast-no-api'));openModal('apiModal');return;}
  const content=document.getElementById('mainEditor').value.slice(-800)||'请创作一段精彩的故事片段';
  const lm={short:'100字以内',mid:'200-300字',long:'400-600字',xl:'800字以上'};
  const tm={low:'保持严谨',mid:'适度创意',high:'大胆想象'};
  const md=AI_MODES[S.aiMode]||{p:'请处理以下内容：'};
  let prompt=(typeof wwPromptText==='function'?wwPromptText(S.aiMode):md.p)+'\n\n'+content+'\n\n【输出要求】'+(lm[S.aiLen]||'400-600字')+'。'+(tm[S.aiTemp]||'适度创意')+'。';
  if(S.proj)prompt+='\n\n【项目信息】\n'+buildCtx();
  const extra=document.getElementById('aiPrompt')?.value?.trim();
  if(extra)prompt+='\n\n【额外指令】'+extra;
  let sysPrompt='你是一位专业的中文写作助手。';
  const memCtx=buildMemoryContext();
  if(memCtx)sysPrompt+='\n\n'+memCtx;
  const promises=[];
  const results=[];
  for(let i=1;i<=3;i++){
    const s=JSON.parse(localStorage.getItem('ww_slot'+i)||'{}');
    if(!s.enabled||!s.key){results.push({i,skipped:true});continue;}
    const r=document.getElementById('slotResult'+i);
    const meta=document.getElementById('slotMeta'+i);
    const actions=document.getElementById('slotActions'+i);
    if(r){r.innerHTML='<div class="slot-loading"><div class="spinner"></div> 生成中...</div>';r.classList.add('has-content');}
    if(meta)meta.style.display='none';
    if(actions)actions.style.display='none';
    const conf={key:s.key,provider:s.preset||'openai',model:s.model,baseUrl:s.url};
    results.push({i,conf});
  }
  for(const r of results){
    if(r.skipped)continue;
    const p=(async()=>{
      const start=performance.now();
      const text=await callAI(prompt,r.conf);
      const elapsed=Math.round(performance.now()-start);
      const wc=text.replace(/\s/g,'').length;
      const el=document.getElementById('slotResult'+r.i);
      const meta=document.getElementById('slotMeta'+r.i);
      const actions=document.getElementById('slotActions'+r.i);
      if(el){el.textContent=text;}
      if(meta){meta.innerHTML='<span>⏱ '+elapsed+'ms</span><span>📝 '+wc+'字</span>';meta.style.display='flex';}
      if(actions)actions.style.display='flex';
      r.text=text;r.time=elapsed;r.wc=wc;r.done=true;
    })().catch(e=>{
      const el=document.getElementById('slotResult'+r.i);
      if(el){el.textContent='✕ '+e.message;}
      r.text='';r.done=false;r.error=true;
    });
    promises.push(p);
  }
  await Promise.all(promises);
  const summary=document.getElementById('multiSummary');
  if(summary){
    const parts=[];
    for(const r of results){
      if(r.skipped)continue;
      if(r.done){parts.push('槽位'+r.i+': '+r.wc+'字 '+(r.time/1000).toFixed(1)+'s');}
      else{parts.push('槽位'+r.i+': 失败');}
    }
    if(parts.length){summary.textContent=parts.join(' | ');summary.style.display='flex';}
  }
  showToast('⚡','对比完成');
}
function applySlotToEditor(n){
  const r=document.getElementById('slotResult'+n);
  if(!r||!r.textContent)return;
  const ed=document.getElementById('mainEditor');
  const text=r.textContent;
  const p=ed.selectionStart;
  ed.value=ed.value.slice(0,p)+text+ed.value.slice(p);
  onEditorInput();
  showToast('✓','已应用槽位'+n);
}
function copySlotResult(n){
  const r=document.getElementById('slotResult'+n);
  if(!r||!r.textContent)return;
  navigator.clipboard.writeText(r.textContent).then(()=>showToast('✓',t('toast-copied')));
}
function markBest(n){
  document.querySelectorAll('.multi-slot').forEach(el=>el.classList.remove('slot-best'));
  const slot=document.getElementById('multiSlot'+n);
  if(slot)slot.classList.add('slot-best');
  showToast('★','槽位'+n+'标记为最佳');
}
function applyAllSlots(){
  const parts=[];
  for(let i=1;i<=3;i++){
    const r=document.getElementById('slotResult'+i);
    if(r&&r.textContent&&r.classList.contains('has-content'))parts.push(r.textContent);
  }
  if(!parts.length){showToast('✎','没有可应用的结果');return;}
  const ed=document.getElementById('mainEditor');
  const text=parts.join('\n\n---\n\n');
  const p=ed.selectionStart;
  ed.value=ed.value.slice(0,p)+text+ed.value.slice(p);
  onEditorInput();
  showToast('✓','已应用全部结果');
}
function clearAllResults(){
  for(let i=1;i<=3;i++){
    const r=document.getElementById('slotResult'+i);
    const meta=document.getElementById('slotMeta'+i);
    const actions=document.getElementById('slotActions'+i);
    if(r){r.textContent='';r.classList.remove('has-content');}
    if(meta)meta.style.display='none';
    if(actions)actions.style.display='none';
  }
  const summary=document.getElementById('multiSummary');
  if(summary)summary.style.display='none';
  document.querySelectorAll('.multi-slot').forEach(el=>el.classList.remove('slot-best'));
}


// ═══ History ═══
async function addHistory(m,t){await dbPut('aiHistory',{mode:m,text:t.slice(0,500),time:Date.now()});renderHistory();}
async function renderHistory(){if(!db)return;const items=await dbAll('aiHistory');items.sort((a,b)=>(b.time||0)-(a.time||0));const el=document.getElementById('historyList');if(!items.length){el.innerHTML='<div class="history-empty">☐ '+t('hist-empty')+'</div>';return;}el.innerHTML=items.slice(0,50).map(h=>'<div class="history-item" onclick="restoreHistory(this)" data-text="'+h.text.slice(0,200).replace(/"/g,'&quot;')+'" data-mode="'+h.mode+'"><div class="hi-meta"><span class="hi-mode">'+h.mode+'</span><span class="hi-time">'+new Date(h.time).toLocaleString(currentLang)+'</span></div><div class="hi-preview">'+h.text.slice(0,100)+'</div></div>').join('');}
function restoreHistory(el){S.lastArpResult=el.dataset.text;document.getElementById('arpText').textContent=el.dataset.text;document.getElementById('arpMode').textContent=el.dataset.mode;document.getElementById('aiResultPopup').classList.add('show');}
async function clearHistory(){if(!confirm('清空历史？'))return;const items=await dbAll('aiHistory');for(const i of items)await dbDel('aiHistory',i.id);renderHistory();showToast('✕','已清空');}


// ═══ AI Tabs ═══
function switchAiTab(t,el){document.querySelectorAll('.ai-tab').forEach(x=>x.classList.remove('active'));el.classList.add('active');['modes','multi','memory','history'].forEach(x=>{document.getElementById('aiTab-'+x).style.display=x===t?'block':'none';});if(t==='memory')renderMemoryList();if(t==='multi')renderMultiSlots();}

// ═══ Mobile Multi-AI ═══
function renderMpMultiSlots(){
  const el=document.getElementById('mpMultiSlots');if(!el)return;
  const hasMainKey=aiHasConfig(S.apiConfig);
  let h='';
  for(let i=1;i<=3;i++){
    const s=JSON.parse(localStorage.getItem('ww_slot'+i)||'{}');
    if(i===1&&hasMainKey&&!s.key&&!s._touched)s.enabled=true;
    const enabled=s.enabled;
    const presetName=s.preset||'';
    const displayName=presetName?(SLOT_PRESETS[presetName]?presetName:'自定义'):'未配置';
    h+='<div class="multi-slot'+(enabled?' slot-active':'')+'" style="margin-bottom:8px">';
    h+='<div class="slot-header"><div class="slot-info"><span class="slot-num">'+i+'</span><span class="slot-provider-badge">'+displayName+'</span></div>';
    h+='<button class="slot-toggle'+(enabled?' on':'')+'" onclick="toggleMpSlot('+i+')"></button></div>';
    if(enabled){
      h+='<div style="margin-top:6px">';
      h+='<select class="slot-select" onchange="applySlotPreset('+i+',this.value);renderMpMultiSlots()"><option value="">自定义</option>';
      for(const[k]of Object.entries(SLOT_PRESETS))h+='<option value="'+k+'"'+(s.preset===k?' selected':'')+'>'+k+'</option>';
      h+='</select>';
      h+='<input class="slot-input" type="password" placeholder="API Key" value="'+(s.key||'')+'" onchange="saveMpSlot('+i+',this.value,\'key\')">';
      h+='<input class="slot-input" placeholder="Model" value="'+(s.model||'')+'" onchange="saveMpSlot('+i+',this.value,\'model\')">';
      h+='<div class="slot-result" id="mpSlotResult'+i+'" style="min-height:80px;max-height:200px;overflow-y:auto"></div>';
      h+='<div class="slot-meta" id="mpSlotMeta'+i+'" style="display:none"></div>';
      h+='</div>';
    }
    h+='</div>';
  }
  el.innerHTML=h;
}
function toggleMpSlot(n){
  const slots=el=>el.querySelectorAll('.multi-slot');
  const allSlots=document.querySelectorAll('#mpMultiSlots .multi-slot');
  const slot=allSlots[n-1];if(!slot)return;
  const btn=slot.querySelector('.slot-toggle');
  const isOn=btn.classList.toggle('on');
  const s=JSON.parse(localStorage.getItem('ww_slot'+n)||'{}');
  s.enabled=isOn;localStorage.setItem('ww_slot'+n,JSON.stringify(s));
  renderMpMultiSlots();
}
function saveMpSlot(n,val,key){
  const s=JSON.parse(localStorage.getItem('ww_slot'+n)||'{}');
  s[key]=val;s._touched=true;localStorage.setItem('ww_slot'+n,JSON.stringify(s));
}
async function doMultiGenerateMobile(){
  const ac=S.apiConfig;if(!aiHasConfig(ac)){showToast('⚙',t('toast-no-api'));openModal('apiModal');return;}
  const content=document.getElementById('mainEditor').value.slice(-800)||'请创作一段精彩的故事片段';
  const lm={short:'100字以内',mid:'200-300字',long:'400-600字',xl:'800字以上'};
  const tm={low:'保持严谨',mid:'适度创意',high:'大胆想象'};
  const md=AI_MODES[S.aiMode]||{p:'请处理以下内容：'};
  let prompt=(typeof wwPromptText==='function'?wwPromptText(S.aiMode):md.p)+'\n\n'+content+'\n\n【输出要求】'+(lm[S.aiLen]||'400-600字')+'。'+(tm[S.aiTemp]||'适度创意')+'。';
  if(S.proj)prompt+='\n\n【项目信息】\n'+buildCtx();
  const extra=document.getElementById('mpAiPrompt')?.value?.trim();
  if(extra)prompt+='\n\n【额外指令】'+extra;
  let sysPrompt='你是一位专业的中文写作助手。';
  const memCtx=buildMemoryContext();if(memCtx)sysPrompt+='\n\n'+memCtx;
  const tasks=[];
  for(let i=1;i<=3;i++){
    const s=JSON.parse(localStorage.getItem('ww_slot'+i)||'{}');
    if(!s.enabled||!s.key)continue;
    tasks.push({i,conf:{key:s.key,provider:s.preset||'openai',model:s.model,baseUrl:s.url}});
  }
  if(!tasks.length){showToast('✕','请至少启用一个槽位并填入API Key');return;}
  showToast('⟳','并行生成中...');
  const results=await Promise.allSettled(tasks.map(async({i,conf})=>{
    const t0=Date.now();
    try{const r=await callAI(prompt,conf,sysPrompt);return{i,text:r,time:Date.now()-t0};}
    catch(e){return{i,text:'✕ '+e.message,time:Date.now()-t0};}
  }));
  for(const r of results){
    const d=r.value||r.reason;if(!d)continue;
    const el=document.getElementById('mpSlotResult'+d.i);
    const meta=document.getElementById('mpSlotMeta'+d.i);
    if(el){el.textContent=d.text;el.classList.add('has-content');}
    if(meta){meta.style.display='block';meta.textContent=d.text.replace(/\s/g,'').length+'字 · '+(d.time/1000).toFixed(1)+'s';}
  }
  showToast('✓','对比完成');
}

// ═══ Modals ═══
function openModal(id){document.getElementById(id).classList.add('show');if(id==='projectModal')renderProjectList();if(id==='apiModal')loadApiUI();if(id==='settingsModal')initSettingsModal();}
function closeModal(id){document.getElementById(id).classList.remove('show');}
function toggleGenre(el){el.parentElement.querySelectorAll('.genre-chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');}
document.querySelectorAll('.modal-overlay').forEach(o=>{o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('show');});});


// ═══ Theme ═══
function toggleTheme(){document.body.classList.toggle('light');const isLight=document.body.classList.contains('light');localStorage.setItem('ww_theme',isLight?'light':'dark');}
(function loadTheme(){if(localStorage.getItem('ww_theme')==='light'){document.body.classList.add('light');}})();

// ═══ Settings Modal ═══
function openSettingsTab(tab,el){
  document.querySelectorAll('.settings-tab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  ['lang','api','theme','rules'].forEach(t=>{
    const pane=document.getElementById('settingsTab-'+t);
    if(pane)pane.style.display=t===tab?'block':'none';
  });
  if(tab==='rules')loadRulesPanel();
}

function initSettingsModal(){
  // Highlight current language
  document.querySelectorAll('.lang-card').forEach(c=>{c.classList.toggle('active',c.getAttribute('onclick')?.includes("'"+currentLang+"'"));});
  // Load API settings into settings modal fields
  const c=S.apiConfig;
  if(c.provider){const el=document.querySelector('#sProviderGrid .provider-chip[onclick*="'+c.provider+'"]');if(el)selectProvider(el,c.provider);}
  document.getElementById('sApiKey').value=c.key==='backend'?'':(c.key||'');
  document.getElementById('sApiModel').value=c.model||'';
  document.getElementById('sApiBaseUrl').value=c.baseUrl||'';
  // Highlight current theme
  const isLight=document.body.classList.contains('light');
  document.getElementById('themeCardDark').classList.toggle('active',!isLight);
  document.getElementById('themeCardLight').classList.toggle('active',isLight);
  // Reset to lang tab
  openSettingsTab('lang',document.querySelector('.settings-tab'));
}

let currentRulesPayload=null;
async function loadRulesPanel(){
  const grid=document.getElementById('rulesPresetGrid');
  const rawEl=document.getElementById('rulesRaw');
  if(!grid||!rawEl)return;
  try{
    const data=await apiJSON('/api/rules');
    currentRulesPayload=data;
    rawEl.value=data.custom||data.preferences||'';
    grid.innerHTML=(data.presets||[]).map(p=>`<div class="provider-chip" onclick="applyRulePreset('${p.id}')">${p.name}</div>`).join('');
  }catch(e){
    grid.innerHTML='<div style="color:var(--text-muted);font-size:12px">规则加载失败</div>';
  }
}
async function applyRulePreset(id){
  const p=(currentRulesPayload?.presets||[]).find(x=>x.id===id);
  if(p)document.getElementById('rulesRaw').value=p.content||'';
}
async function saveRulesPack(){
  const raw=document.getElementById('rulesRaw').value.trim();
  if(!raw){showToast('✕','请输入规则内容');return;}
  try{
    await apiJSON('/api/rules',{method:'POST',body:JSON.stringify({raw})});
    showToast('✓','规则包已保存');
    await loadRulesPanel();
  }catch(e){showToast('✕',e.message);}
}
async function importRulesFile(e){
  const f=e.target.files?.[0];if(!f)return;
  const text=await f.text();
  if(f.name.endsWith('.json')){
    try{
      const obj=JSON.parse(text);
      document.getElementById('rulesRaw').value=obj.custom||obj.preferences||obj.raw||JSON.stringify(obj,null,2);
    }catch{document.getElementById('rulesRaw').value=text;}
  }else{
    document.getElementById('rulesRaw').value=text;
  }
  e.target.value='';
}
function exportRules(){
  const data={version:1,raw:document.getElementById('rulesRaw').value,exported_at:new Date().toISOString()};
  const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(b);
  a.download='ainovel-rules.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function settingsSetLang(lang,el){
  setLang(lang);
}

function settingsSetTheme(theme,el){
  if(theme==='light'&&!document.body.classList.contains('light'))toggleTheme();
  else if(theme==='dark'&&document.body.classList.contains('light'))toggleTheme();
  document.getElementById('themeCardDark').classList.toggle('active',theme==='dark');
  document.getElementById('themeCardLight').classList.toggle('active',theme==='light');
}

function settingsTestApi(){
  const r=document.getElementById('sTestResult');
  const key=document.getElementById('sApiKey').value.trim();
  const provider=S.selectedProvider||'claude';
  r.className='test-result ok';r.textContent='⟳ '+t('mod-api-test')+'...';
  const conf={key:key||'backend',provider,model:document.getElementById('sApiModel').value.trim(),baseUrl:document.getElementById('sApiBaseUrl').value.trim()};
  apiJSON('/api/config',{method:'POST',body:JSON.stringify({provider:conf.provider,model:conf.model,api_key:key,base_url:conf.baseUrl})}).then(()=>{
  const pr=conf.provider||'claude',p=PROVIDERS[pr]||PROVIDERS.claude,url=conf.baseUrl||p.url;
  const msgs=[{role:'user',content:'Reply with exactly: OK'}];
  const h=_buildHeaders(conf,p),body=_buildBody(conf,p,msgs,null,false);
  return _fetchWithTimeout(url,{method:'POST',headers:h,body},30000);
  }).then(resp=>{
    if(resp._proxyError)throw resp._proxyError;
    if(!resp.ok)throw new Error('HTTP '+resp.status);
    return resp.json();
  }).then(d=>{
    if(d.error)throw new Error(d.error.message||JSON.stringify(d.error));
    let txt=d.choices?.[0]?.message?.content||d.content?.[0]?.text||'（无返回）';
    r.className='test-result ok';r.textContent='✓ '+txt.slice(0,60);
  }).catch(e=>{
    let msg=e.message||'Error';
    if(msg.includes('429'))msg+=' (请求过于频繁，请稍后再试)';
    if(msg.includes('403'))msg+=' (API Key 无权限，请检查 Key 是否正确)';
    if(msg.includes('401')||msg.includes('invalid'))msg+=' (API Key 无效)';
    r.className='test-result fail';r.textContent='✕ '+msg;
  });
}

function saveSettings(){
  // Save API settings from settings modal
  const key=document.getElementById('sApiKey').value.trim();
  const c={provider:S.selectedProvider,key:key||'backend',model:document.getElementById('sApiModel').value.trim(),baseUrl:document.getElementById('sApiBaseUrl').value.trim()};
  if(!key&&!c.model&&!c.baseUrl&&!S.apiConfig.provider){closeModal('settingsModal');showToast('✓',t('mod-save'));return;}
  apiJSON('/api/config',{method:'POST',body:JSON.stringify({provider:c.provider,model:c.model,api_key:key,base_url:c.baseUrl})}).then(()=>{
    S.apiConfig=c;localStorage.setItem('ww_api',JSON.stringify(c));
    closeModal('settingsModal');
    showToast('✓',t('mod-save'));
  }).catch(e=>showToast('✕',e.message));
}

function applyLang(){
  // Universal data-i18n translator — all translatable elements use data-i18n attributes
  document.querySelectorAll('[data-i18n]').forEach(el=>{
  const k=el.getAttribute('data-i18n');
  const v=LANG[currentLang]?.[k];
  if(!v)return;
  const svg=el.querySelector('svg');
  if(svg){
    // Preserve SVG icon, only update text nodes. Strip decorative text icons
    // such as ⚙️/↓ from translated labels, but keep multi-word labels intact.
    setElementTextPreservingMedia(el,textWithoutLeadingIcon(v));
  }else{
    el.textContent=v;
  }
});
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{const k=el.getAttribute('data-i18n-ph');if(LANG[currentLang]?.[k])el.placeholder=LANG[currentLang][k];});
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{const k=el.getAttribute('data-i18n-title');if(LANG[currentLang]?.[k])el.title=LANG[currentLang][k];});
  document.title=t('logo');
  document.documentElement.lang=currentLang;

  // Sidebar nav tabs (use index-based keys)
  const navTabs=document.querySelectorAll('.nav-tab');
  const navKeys=['nav-outline','nav-chapters','nav-chars','nav-notes'];
  navTabs.forEach((tab,i)=>{if(navKeys[i])tab.lastChild.textContent=' '+t(navKeys[i]);});
  // Bottom nav
  const bnavTabs=document.querySelectorAll('#bottomNav .btab');
  const bnavKeys=['bnav-editor','bnav-outline','bnav-chapters','bnav-chars','bnav-ai'];
  bnavTabs.forEach((tab,i)=>{if(bnavKeys[i])tab.lastChild.textContent=' '+t(bnavKeys[i]);});
  // Editor placeholders
  document.getElementById('mainEditor').placeholder=t('ed-placeholder');
  document.getElementById('chapterTitle').placeholder=t('ed-chapter');
  // Section labels (use data-i18n keys stored in a map)
  document.querySelectorAll('.section-label').forEach(el=>{
    const key=el.getAttribute('data-i18n-sb');
    if(key)el.textContent=t(key);
  });
  // Add buttons (use data-i18n keys)
  document.querySelectorAll('.add-item-btn').forEach(btn=>{
    const key=btn.getAttribute('data-i18n-sb');
    if(key)btn.textContent=t(key);
  });
  const histTitle=document.querySelector('#aiTab-history span');
  if(histTitle)histTitle.textContent=t('hist-title');
  const histClear=document.querySelector('#aiTab-history button');
  if(histClear)histClear.textContent=t('hist-clear');
  // AI panel title
  const apTitle=document.querySelector('.ai-panel-title');
  if(apTitle)apTitle.lastChild.textContent=' '+t('ap-title');
  // AI panel tabs
  const apTabs=document.querySelectorAll('.ai-tab');
  const apKeys=['ap-tab-modes','ap-tab-multi','ap-tab-memory','ap-tab-hist'];
  apTabs.forEach((tab,i)=>{if(apKeys[i])tab.textContent=t(apKeys[i]);});
  // Generate button
  const genBtn=document.getElementById('generateBtnText');
  if(genBtn&&!genBtn.closest('.loading'))genBtn.textContent=t('ap-gen');
  // Logo
  document.querySelector('.topbar-logo').lastChild.textContent=t('logo');
  const projectNameEl=document.getElementById('currentProjectName');
  if(projectNameEl&&!S.proj){projectNameEl.textContent=t('select-project');projectNameEl.closest('.project-selector')?.setAttribute('title',t('select-project'));}
  // Bottom bar stats
  document.querySelectorAll('.wc-item').forEach(el=>{
    const key=el.getAttribute('data-i18n-bb');
    if(key){
      const label=el.querySelector('span:first-child, [data-i18n]');
      if(label)label.textContent=t(key)+' ';
    }
  });
  // Genre chips — store keys in data attribute
  document.querySelectorAll('.genre-chip[data-i18n-genre]').forEach(ch=>{
    const key=ch.getAttribute('data-i18n-genre');
    if(key)ch.textContent=t(key);
  });
  // Provider chips — store keys in data attribute
  document.querySelectorAll('.provider-chip[data-i18n-prov]').forEach(ch=>{
    const key=ch.getAttribute('data-i18n-prov');
    if(key)setElementTextPreservingMedia(ch,t(key));
  });
  localizeProviderChips();
  // Lock screen
  const lockSub=document.getElementById('lockSub');
  if(lockSub)lockSub.textContent=t('lock-set');
  const lockBtn=document.getElementById('lockBtn');
  if(lockBtn)lockBtn.textContent=t('lock-btn-set');
  const lockInput=document.getElementById('lockInput');
  if(lockInput)lockInput.placeholder=t('lock-placeholder');
  // Re-render AI mode grids with translated names
  renderAiModeGrid();
  const mpGrid=document.getElementById('mpAiModeGrid');
  if(mpGrid){mpGrid.innerHTML='';renderMpAi();}
}

// Hook: apply translations when modals open
(function(){
  const origOpenModal=openModal;
  openModal=function(id){
    origOpenModal(id);
    if(id==='newProjectModal'){
      document.querySelector('#newProjectModal .modal-title').textContent=t('mod-newproj');
      document.querySelector('#newProjectModal .modal-sub').textContent=t('mod-newproj-sub');
      // Translate form labels
      document.querySelectorAll('#newProjectModal .form-label').forEach(el=>{
        const txt=el.textContent;
        if(txt.includes('项目名称')||txt.includes('Project Name')||txt.includes('プロジェクト名')||txt.includes('프로젝트명')||txt.includes('Nom du')||txt.includes('Nombre')||txt.includes('Projektname')||txt.includes('Название'))el.childNodes[0].textContent=t('form-name')+' ';
        if(txt.includes('作品类型')||txt.includes('Genre')||txt.includes('ジャンル')||txt.includes('장르')||txt.includes('Género')||txt.includes('Género'))el.textContent=t('form-genre');
        if(txt.includes('每日')||txt.includes('Daily')||txt.includes('毎日')||txt.includes('일일')||txt.includes('Objectif')||txt.includes('Meta')||txt.includes('Tagesziel')||txt.includes('Дневная'))el.childNodes[0].textContent=t('form-goal')+' ';
        if(txt.includes('项目简介')||txt.includes('Description')||txt.includes('説明')||txt.includes('설명'))el.childNodes[0].textContent=t('form-desc')+' ';
        if(txt.includes('世界观')||txt.includes('World')||txt.includes('世界観')||txt.includes('세계관')||txt.includes('Univers')||txt.includes('Mundo')||txt.includes('Welt')||txt.includes('Мир'))el.childNodes[0].textContent=t('form-world')+' ';
      });
      // Translate form hints
      document.querySelectorAll('#newProjectModal .form-hint').forEach(el=>{
        const txt=el.textContent;
        if(txt.includes('必填')||txt.includes('Required')||txt.includes('必須')||txt.includes('필수')||txt.includes('Requis')||txt.includes('Requerido')||txt.includes('Pflicht')||txt.includes('Обязательно'))el.textContent=t('form-required');
        if(txt.includes('字数')||txt.includes('words')||txt.includes('文字')||txt.includes('자')||txt.includes('mots')||txt.includes('palabras')||txt.includes('Wörter')||txt.includes('слов'))el.textContent=t('form-goal-unit');
      });
      // Translate placeholders
      const nameInput=document.getElementById('newProjectName');
      if(nameInput)nameInput.placeholder=t('mod-projname-ph');
      const descInput=document.getElementById('newProjectDesc');
      if(descInput)descInput.placeholder=t('form-desc-ph');
      const worldInput=document.getElementById('newProjectWorld');
      if(worldInput)worldInput.placeholder=t('form-world-ph');
      // Translate buttons
      document.querySelectorAll('#newProjectModal .btn-cancel').forEach(b=>b.textContent=t('form-cancel'));
      document.querySelectorAll('#newProjectModal .btn-confirm').forEach(b=>b.textContent=t('form-create'));
    }
    if(id==='apiModal'){
      document.querySelector('#apiModal .modal-title').textContent=t('mod-api');
      document.querySelector('#apiModal .modal-sub').textContent=t('mod-api-sub');
      // Translate form labels
      document.querySelectorAll('#apiModal .form-label').forEach(el=>{
        const txt=el.textContent;
        if(txt.includes('选择服务')||txt.includes('Provider')||txt.includes('プロバイダー')||txt.includes('공급자')||txt.includes('Fournisseur')||txt.includes('Anbieter')||txt.includes('Proveedor')||txt.includes('Провайдер'))el.textContent=t('form-api-provider');
        if(txt.includes('API Key')||txt.includes('APIキー')||txt.includes('API 키')||txt.includes('Clé API')||txt.includes('Clave API')||txt.includes('API-Schlüssel'))el.childNodes[0].textContent=t('form-api-key-label')+' ';
        if(txt.includes('模型')||txt.includes('Model')||txt.includes('モデル')||txt.includes('모델')||txt.includes('Modèle')||txt.includes('Modell'))el.childNodes[0].textContent=t('form-api-model-label')+' ';
      });
      // Translate test button
      document.querySelectorAll('#apiModal .btn-test').forEach(b=>b.textContent=t('form-api-test'));
      // Translate model placeholder
      const modelInput=document.getElementById('apiModel');
      if(modelInput)modelInput.placeholder=t('form-api-model-ph');
      // Translate buttons
      document.querySelectorAll('#apiModal .btn-cancel').forEach(b=>b.textContent=t('form-cancel'));
      document.querySelectorAll('#apiModal .btn-confirm').forEach(b=>b.textContent=t('form-save'));
    }
    if(id==='charModal'){
      document.getElementById('charModalTitle').textContent=t('mod-char');
      document.querySelectorAll('#charModal .form-label').forEach(el=>{
        const txt=el.textContent;
        if(txt.includes('姓名')||txt.includes('Name')||txt.includes('名前')||txt.includes('이름')||txt.includes('Nom'))el.textContent=t('mod-char-name');
        if(txt.includes('定位')||txt.includes('Role')||txt.includes('役割')||txt.includes('역할'))el.textContent=t('mod-char-role');
        if(txt.includes('性格')||txt.includes('Personality'))el.textContent=t('mod-char-pers');
        if(txt.includes('背景')||txt.includes('Background'))el.textContent=t('mod-char-back');
        if(txt.includes('外貌')||txt.includes('Appearance')||txt.includes('外見')||txt.includes('외모')||txt.includes('Aussehen'))el.textContent=t('mod-char-look');
        if(txt.includes('技能')||txt.includes('Skills')||txt.includes('スキル')||txt.includes('스킬')||txt.includes('Fähigkeiten')||txt.includes('Навыки'))el.textContent=t('mod-char-skill');
      });
      document.getElementById('charName').placeholder=t('mod-char-name-ph');
      document.getElementById('charPers').placeholder=t('mod-char-pers-ph');
      document.getElementById('charBack').placeholder=t('mod-char-back-ph');
      document.getElementById('charLook').placeholder=t('mod-char-look-ph');
      document.getElementById('charSkill').placeholder=t('mod-char-skill-ph');
      document.querySelectorAll('#charModal .btn-cancel').forEach(b=>b.textContent=t('form-cancel'));
      document.querySelectorAll('#charModal .btn-confirm').forEach(b=>b.textContent=t('mod-char-save'));
    }
    if(id==='profileModal'){
      document.querySelector('#profileModal .modal-title').textContent=t('mod-profile');
      document.querySelector('#profileModal .modal-sub').textContent=t('mod-profile-sub');
    }
  };
})();

// Load language on boot
(function(){if(currentLang!=='zh'){setTimeout(()=>{applyLang();},100);}})();


// ═══ Profile Center ═══
async function renderProfileStats(){
  const el=document.getElementById('profileStatsContent');
  if(!S.proj){el.innerHTML='<div style="color:var(--text-hint)">'+t('ps-none')+'</div>';return;}
  const p=S.proj.project;
  const totalWords=S.proj.chapters.reduce((s,c)=>s+(c.word_count||0),0);
  const totalChars=S.proj.characters.length;
  const totalOutlines=S.proj.outlines.length;
  const totalChapters=S.proj.chapters.length;
  const created=new Date(p.created_at).toLocaleDateString(currentLang);
  const updated=p.updated_at?new Date(p.updated_at).toLocaleDateString(currentLang):'-';
  el.innerHTML='<div>📁 '+t('ps-project')+' <b>'+p.name+'</b></div><div>◎ '+t('ps-genre')+' '+(p.genre||'-')+'</div><div>📝 '+t('ps-words')+' <b>'+totalWords+'</b> '+t('ps-units-2')+'</div><div>☐ '+t('ps-outlines')+' '+totalOutlines+' '+t('ps-units-1')+t('ps-chapters')+' '+totalChapters+' '+t('ps-units-1')+'</div><div>● '+t('ps-chars')+' '+totalChars+' '+t('ps-units-1')+'</div><div>◎ '+t('ps-goal')+' '+S.wordGoal+' '+t('ps-units-2')+'</div><div>◷ '+t('ps-created')+' '+created+' · '+t('ps-updated')+' '+updated+'</div>';
}
async function changePassword(){
  localStorage.removeItem('ww_pwd_hash');
  showToast('i','本地游客模式不提供密码设置');
}
// Hook: render stats when profile modal opens
(function(){const orig=openModal;openModal=function(id){orig(id);if(id==='profileModal')renderProfileStats();};})();


// ═══ AI Quick Tools ═══
let aiQuickLastResult='',aiQuickMode='',aiPresLevel='medium',aiDetectScores=null;
function aiCheckApi(){const ac=S.apiConfig;if(!aiHasConfig(ac)){showToast('⚙',t('toast-no-api'));openModal('apiModal');return false;}return true;}
function showAiQuickResult(title,text,mode){aiQuickLastResult=text;aiQuickMode=mode;document.getElementById('aiQuickResultTitle').textContent=title;document.getElementById('aiQuickResultText').textContent=text;document.getElementById('aiQuickResult').style.display='block';document.getElementById('aiRadarWrap').style.display='none';document.getElementById('aiDiffWrap').style.display='none';document.getElementById('aiSentencesWrap').style.display='none';}
function closeAiQuickResult(){document.getElementById('aiQuickResult').style.display='none';aiQuickLastResult='';aiQuickMode='';aiDetectScores=null;document.getElementById('aiRadarWrap').style.display='none';document.getElementById('aiDiffWrap').style.display='none';document.getElementById('aiSentencesWrap').style.display='none';document.getElementById('presLevelBar').style.display='none';}
function aiQuickApply(){if(!aiQuickLastResult)return;if(aiQuickMode==='title'){document.getElementById('chapterTitle').value=aiQuickLastResult;S.unsaved=true;showToast('✓',t('toast-title-applied'));closeAiQuickResult();return;}const ed=document.getElementById('mainEditor');if(aiQuickMode==='proofread'||aiQuickMode==='humanize'){ed.value=aiQuickLastResult;onEditorInput();showToast('✓',aiQuickMode==='humanize'?t('toast-humanize-applied'):t('toast-proofread-applied'));}else if(aiQuickMode==='inspire'){const pos=ed.selectionStart;ed.value=ed.value.slice(0,pos)+'\n\n'+aiQuickLastResult+'\n'+ed.value.slice(pos);onEditorInput();showToast('✓',t('toast-inspire-inserted'));}closeAiQuickResult();}
function aiQuickCopy(){if(!aiQuickLastResult)return;navigator.clipboard.writeText(aiQuickLastResult).then(()=>showToast('✓',t('toast-copied'))).catch(()=>showToast('✕',t('toast-copy-failed')));}
function setLoading(btnId,loading){const b=document.getElementById(btnId);if(b){if(loading){b.disabled=true;b.dataset.origText=b.textContent;b.textContent='⟳ ...';}else{b.disabled=false;b.textContent=b.dataset.origText||b.textContent;}}}

// ═══ Preservation Level (for humanize) ═══
function setPresLevel(level){
  aiPresLevel=level;
  document.querySelectorAll('#presLevelBar button').forEach(b=>b.classList.toggle('active',b.dataset.pl===level));
}

// ═══ Parse AI Detection Scores ═══
function parseAiScores(text){
  const labels=['句式规律性','词汇丰富度','情感自然度','结构完美度','口语化程度','重复与冗余'];
  const scores=[];
  for(const label of labels){
    // Try patterns: "句式规律性...75", "句式规律性 — 75/100", "句式规律性：75", "**句式规律性** — 75", etc.
    const re=new RegExp(label+'[^\\d]*(\\d{1,3})','i');
    const m=text.match(re);
    scores.push(m?Math.min(100,Math.max(0,parseInt(m[1],10))):null);
  }
  return scores.every(Number.isFinite)?scores:null;
}

// ═══ Canvas Radar Chart ═══
function drawRadarChart(canvas,scores){
  const ctx=canvas.getContext('2d');
  const W=200,H=200,cx=W/2,cy=H/2,R=70;
  const labels=['句式','词汇','情感','结构','口语','重复'];
  ctx.clearRect(0,0,W,H);
  // Background
  ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim()||'#1a1a2e';
  ctx.fillRect(0,0,W,H);
  const n=labels.length;
  const step=Math.PI*2/n;
  // Grid circles
  for(let r=1;r<=4;r++){
    const rad=R*r/4;
    ctx.beginPath();
    for(let i=0;i<=n;i++){
      const a=-Math.PI/2+step*(i%n);
      const x=cx+rad*Math.cos(a),y=cy+rad*Math.sin(a);
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.strokeStyle='rgba(255,255,255,0.12)';
    ctx.lineWidth=1;
    ctx.stroke();
  }
  // Axes
  for(let i=0;i<n;i++){
    const a=-Math.PI/2+step*i;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.lineTo(cx+R*Math.cos(a),cy+R*Math.sin(a));
    ctx.strokeStyle='rgba(255,255,255,0.15)';
    ctx.stroke();
  }
  // Data polygon
  ctx.beginPath();
  for(let i=0;i<=n;i++){
    const idx=i%n;
    const a=-Math.PI/2+step*idx;
    const r=R*scores[idx]/100;
    const x=cx+r*Math.cos(a),y=cy+r*Math.sin(a);
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.closePath();
  ctx.fillStyle='rgba(99,102,241,0.25)';
  ctx.fill();
  ctx.strokeStyle='rgba(99,102,241,0.8)';
  ctx.lineWidth=2;
  ctx.stroke();
  // Dots & labels
  for(let i=0;i<n;i++){
    const a=-Math.PI/2+step*i;
    const r=R*scores[i]/100;
    const x=cx+r*Math.cos(a),y=cy+r*Math.sin(a);
    ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fillStyle='#818cf8';ctx.fill();
    // Label
    const lx=cx+(R+16)*Math.cos(a),ly=cy+(R+16)*Math.sin(a);
    ctx.fillStyle='rgba(255,255,255,0.7)';
    ctx.font='10px sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(labels[i]+' '+scores[i],lx,ly);
  }
  // AI probability estimate at center
  const avg=Math.round(scores.reduce((a,b)=>a+b,0)/n);
  ctx.fillStyle='rgba(255,255,255,0.9)';
  ctx.font='bold 14px sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(avg+'%',cx,cy);
  ctx.font='8px sans-serif';
  ctx.fillStyle='rgba(255,255,255,0.5)';
  ctx.fillText('AI',cx,cy+12);
}

// ═══ Show Detection Result with Radar ═══
function showAiDetectionResult(scores,text){
  const hasScores=Array.isArray(scores)&&scores.length===6&&scores.every(Number.isFinite);
  aiDetectScores=hasScores?scores:[];
  const canvas=document.getElementById('aiRadarCanvas');
  const radarWrap=document.getElementById('aiRadarWrap');
  if(hasScores){drawRadarChart(canvas,scores);radarWrap.style.display='flex';}
  else radarWrap.style.display='none';
  // Show text result
  document.getElementById('aiQuickResultText').textContent=text;
  // Parse AI-like sentences from the text
  const sentWrap=document.getElementById('aiSentencesWrap');
  sentWrap.replaceChildren();
  sentWrap.style.display='none';
  const sentRe=/[「」""]?([^。！？\n]{5,60})[。！？"]/g;
  const editor=document.getElementById('mainEditor');
  const editorText=editor.value;
  let m;const found=new Set();
  while((m=sentRe.exec(text))!==null){
    const frag=m[1].trim();
    if(frag.length<4)continue;
    // Check if this fragment appears to be flagged as AI-like in context
    const idx=text.indexOf(m[0]);
    const prev=text.slice(Math.max(0,idx-120),idx);
    const isAIFlagged=/(过于|疑似|AI|明显|典型|像是|特征|高[分概率]|像AI)/i.test(prev.slice(-80));
    if(!editorText.includes(frag)||found.has(frag))continue;
    if(isAIFlagged||found.size<3)found.add(frag);
  }
  if(found.size>0){
    const label=document.createElement('div');
    label.className='sent-label';
    label.textContent='📌 点击句子在编辑器中定位并高亮';
    sentWrap.appendChild(label);
    let idx=0;
    for(const s of found){
      const button=document.createElement('button');
      button.type='button';
      button.className='sent-btn';
      button.dataset.sentIdx=String(idx);
      button.title=s;
      button.textContent=s.length>30?s.slice(0,30)+'…':s;
      button.addEventListener('click',()=>highlightSentInEditor(button));
      sentWrap.appendChild(button);
      idx++;
    }
    sentWrap.style.display='block';
    // Store sentences for lookup
    sentWrap.dataset.sentences=JSON.stringify([...found]);
  }
}

// ═══ Highlight Sentence in Editor ═══
function highlightSentInEditor(btn){
  const wrap=document.getElementById('aiSentencesWrap');
  const sentences=JSON.parse(wrap.dataset.sentences||'[]');
  const idx=parseInt(btn.dataset.sentIdx,10);
  if(idx>=sentences.length)return;
  const sentence=sentences[idx];
  const ed=document.getElementById('mainEditor');
  const text=ed.value;
  // Find the sentence in editor text
  const pos=text.indexOf(sentence);
  if(pos===-1){showToast('✎','未在编辑器中找到该句子');return;}
  ed.focus();
  ed.setSelectionRange(pos,pos+sentence.length);
  // Scroll into view
  ed.blur();ed.focus();
  // Visual feedback on button
  btn.style.background='var(--accent)';
  btn.style.color='#fff';
  setTimeout(()=>{btn.style.background='';btn.style.color='';},1200);
  showToast('✓','已定位句子');
}

// ═══ Diff View for Humanize ═══
function renderDiffView(before,after){
  const wrap=document.getElementById('aiDiffWrap');
  wrap.style.display='block';
  // Simple line-based diff
  const bLines=before.split(/(?<=[。！？\n])/);
  const aLines=after.split(/(?<=[。！？\n])/);
  let html='<div class="diff-header">📋 原文 vs 降AI后 对比：</div>';
  // Show removed lines
  const bSet=new Set(bLines.map(l=>l.trim()).filter(Boolean));
  const aSet=new Set(aLines.map(l=>l.trim()).filter(Boolean));
  let hasDel=false,hasIns=false;
  for(const l of bSet){
    if(l&&l.length>2&&!aSet.has(l)){
      if(!hasDel){html+='<div class="diff-header" style="color:#e55">✕ 被移除/修改：</div>';hasDel=true;}
      html+='<span class="diff-del">'+l.replace(/</g,'&lt;')+'</span>';
    }
  }
  for(const l of aSet){
    if(l&&l.length>2&&!bSet.has(l)){
      if(!hasIns){html+='<div class="diff-header" style="color:#2a2">✓ 新增/改写：</div>';hasIns=true;}
      html+='<span class="diff-ins">'+l.replace(/</g,'&lt;')+'</span>';
    }
  }
  if(!hasDel&&!hasIns){
    html+='<span class="diff-ins">（无明显差异，文字可能已很自然）</span>';
  }
  wrap.innerHTML=html;
}

async function aiProofread(){
  if(!aiCheckApi())return;
  const text=document.getElementById('mainEditor').value.trim();
  if(!text){showToast('✎',t('toast-no-content'));return;}
  setLoading('aiBtnProof',true);
  try{
    const ctx=S.proj?buildCtx()+'\n\n':'';
    const prompt=wwPromptText('校对')+'\n\n'+ctx+'【原文】\n'+text;
    const result=await callAI(prompt,S.apiConfig);
    // Check if it contains corrected text
    const correctedMatch=result.match(/修正后全文[：:]\s*([\s\S]*)/);
    if(correctedMatch){
      aiQuickLastResult=correctedMatch[1].trim();
      aiQuickMode='proofread';
    }
    showAiQuickResult('✓ 纠错结果',result,'proofread');
    // If there's a corrected version, store it for apply
    if(correctedMatch)aiQuickLastResult=correctedMatch[1].trim();
  }catch(e){showToast('✕',e.message||'纠错失败');}
  setLoading('aiBtnProof',false);
}

async function aiAutoTitle(){
  if(!aiCheckApi())return;
  const text=document.getElementById('mainEditor').value.trim();
  if(!text){showToast('✎',t('toast-no-content'));return;}
  setLoading('aiBtnTitle',true);
  try{
    const ctx=S.proj?buildCtx()+'\n\n':'';
    const prompt=wwPromptText('标题')+'\n\n'+ctx+'【内容】\n'+text.slice(0,2000);
    const result=await callAI(prompt,S.apiConfig);
    showAiQuickResult('◇ 标题建议（点击"应用"使用第一个标题）',result,'title');
    // Extract first title for apply
    const titles=result.match(/\d+[.、．)\s]+(.+)/g);
    if(titles&&titles.length>0){
      const first=titles[0].replace(/^\d+[.、．)\s]+/,'').trim().replace(/^["「『]|["」』]$/g,'');
      aiQuickLastResult=first;aiQuickMode='title';
    }
  }catch(e){showToast('✕',e.message||'生成失败');}
  setLoading('aiBtnTitle',false);
}

async function aiInspiration(){
  if(!aiCheckApi())return;
  const text=document.getElementById('mainEditor').value.trim();
  const title=document.getElementById('chapterTitle').value.trim();
  setLoading('aiBtnInspire',true);
  try{
    const ctx=S.proj?buildCtx()+'\n\n':'';
    const selectedText=text.slice(document.getElementById('mainEditor').selectionStart,document.getElementById('mainEditor').selectionEnd).trim();
    const content=selectedText||text.slice(-800);
    const prompt=wwPromptText('实时灵感')+'\n\n'+ctx+(title?'【当前标题】'+title+'\n':'')+'【当前断点】\n'+(content||'（空文档，请先给出可确认的开篇方向）');
    const result=await callAI(prompt,S.apiConfig);
    showAiQuickResult('◆ 实时灵感',result,'inspire');
  }catch(e){showToast('✕',e.message||'获取灵感失败');}
  setLoading('aiBtnInspire',false);
}

async function aiResearch(){
  if(!aiCheckApi())return;
  const text=document.getElementById('mainEditor').value.trim();
  const title=document.getElementById('chapterTitle').value.trim();
  // Extract keywords from content
  const selectedText=text.slice(document.getElementById('mainEditor').selectionStart,document.getElementById('mainEditor').selectionEnd).trim();
  setLoading('aiBtnResearch',true);
  try{
    const ctx=S.proj?buildCtx()+'\n\n':'';
    const content=selectedText||text.slice(-500);
    const prompt=wwPromptText('资料搜索')+'\n\n'+ctx+(title?'【当前标题】'+title+'\n':'')+'【内容或关键词】\n'+(content||'请先列出需要作者补充的研究主题');
    const result=await callAI(prompt,S.apiConfig);
    showAiQuickResult('⊕ 资料搜索结果',result,'research');
  }catch(e){showToast('✕',e.message||'搜索失败');}
  setLoading('aiBtnResearch',false);
}

async function aiHumanize(){
  if(!aiCheckApi())return;
  const ed=document.getElementById('mainEditor');
  const selected=ed.value.slice(ed.selectionStart,ed.selectionEnd).trim();
  const text=selected||ed.value.trim();
  if(!text){showToast('✎',t('toast-no-content'));return;}
  setLoading('aiBtnHumanize',true);
  // Show preservation level selector
  document.getElementById('presLevelBar').style.display='flex';
  try{
    const ctx=S.proj?buildCtx()+'\n\n':'';
    const levelPrompts={
      light:'轻度：只处理最明显的模板句和机械衔接，尽量保留原句与原词。',
      medium:'中度：允许重组句段和节奏，但保持作者原有正式/口语程度。',
      heavy:'重度：允许从段落层面重新表达，但仍须严格保留事实、角色声音与信息顺序。'
    };
    const prompt=wwPromptText('降AI')+'\n\n【改写强度】'+levelPrompts[aiPresLevel]+'\n\n'+ctx+'【原文】\n'+text;
    const originalText=text;
    const result=await callAI(prompt,S.apiConfig);
    showAiQuickResult('◆ 降AI率结果 — 点击"应用"替换原文',result,'humanize');
    aiQuickLastResult=result;aiQuickMode='humanize';
    // Show diff view
    renderDiffView(originalText,result);
  }catch(e){showToast('✕',e.message||'处理失败');}
  setLoading('aiBtnHumanize',false);
}

async function aiDetect(){
  if(!aiCheckApi())return;
  const ed=document.getElementById('mainEditor');
  const text=ed.value.trim();
  if(!text||text.length<50){showToast('✎','请先输入至少50字');return;}
  setLoading('aiBtnDetect',true);
  try{
    const prompt=wwPromptText('查AI')+'\n\n【待分析文字】\n'+text.slice(0,3000);
    const result=await callAI(prompt,S.apiConfig);
    // Parse scores from the AI response
    const scores=parseAiScores(result);
    const disclaimer='\n\n────────────────\n⚠ 以上分析仅供参考，不作为任何正式判定依据。AI检测工具本身存在较大误判率。';
    showAiQuickResult('⊕ AI特征分析报告\n⚠ 仅供参考，不构成正式判定',result+disclaimer,'detect');
    // Show radar chart with parsed scores
    showAiDetectionResult(scores,result);
  }catch(e){showToast('✕',e.message||'检测失败');}
  setLoading('aiBtnDetect',false);
}


// ═══ Toast ═══
let toastTimer;function showToast(i,m){document.getElementById('toastIcon').textContent=i;document.getElementById('toastMsg').textContent=m;const t=document.getElementById('toast');t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200);}


// ═══ Mobile Navigation ═══
function swMobileTab(tab,btn){
  document.querySelectorAll('#bottomNav .btab').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  document.querySelectorAll('.mobile-panel').forEach(p=>p.classList.remove('on'));
  if(tab==='editor'){
    document.querySelector('.editor-area').style.display='';
  }else{
    document.querySelector('.editor-area').style.display='none';
    const p=document.getElementById('mp-'+tab);
    if(p)p.classList.add('on');
    if(tab==='outline')renderMpOutline();if(tab==='chapters')renderMpChapter();if(tab==='chars')renderMpChar();if(tab==='ai')renderMpAi();
  }
}
function backToEditor(){const btn=document.querySelector('#bottomNav .btab');if(btn)swMobileTab('editor',btn);}
function renderMpOutline(){if(!S.proj)return;const el=document.getElementById('mpOutlineList');if(!S.proj.outlines.length){el.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-hint)">'+t('sb-empty-outline')+'</div>';return;}el.innerHTML=S.proj.outlines.map(o=>'<div class="outline-item'+(S.active&&S.active.type==='outline'&&S.active.id===o.id?' active':'')+'" onclick="loadOutlineContent('+o.id+');backToEditor()"><span class="oi-icon"><svg class="ic ic-sm"><use href="#ic-outline"/></svg></span><span class="oi-text">'+o.title+'</span><span class="oi-count">'+(o.content?countWords(o.content):0)+t('ps-units-2')+'</span></div>').join('');}
function renderMpChapter(){if(!S.proj)return;const el=document.getElementById('mpChapterList');if(!S.proj.chapters.length){el.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-hint)">'+t('sb-empty-chapter')+'</div>';return;}el.innerHTML=S.proj.chapters.map(c=>'<div class="outline-item'+(S.active&&S.active.type==='chapter'&&S.active.id===c.id?' active':'')+'" onclick="loadChapterContent('+c.id+');backToEditor()"><span class="oi-icon"><svg class="ic ic-sm"><use href="#ic-chapter"/></svg></span><span class="oi-text">'+c.title+'</span><span class="oi-count">'+(c.word_count||0)+t('ps-units-2')+'</span></div>').join('');}
function renderMpChar(){if(!S.proj)return;const el=document.getElementById('mpCharList');if(!S.proj.characters.length){el.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-hint)">'+t('sb-empty-char')+'</div>';return;}el.innerHTML=S.proj.characters.map(c=>'<div class="char-card" onclick="loadCharContent('+c.id+');backToEditor()"><div class="char-name">'+c.name+'</div><span class="char-role">'+c.role+'</span><div class="char-desc">'+(c.personality||t('char-no-desc'))+'</div></div>').join('');}
function renderMpAi(){const el=document.getElementById('mpAiModeGrid');if(!el||el.children.length>0)return;const g={};for(const[k,v]of Object.entries(AI_MODES)){if(!g[v.group])g[v.group]=[];g[v.group].push(k);}let h='';for(const[label,keys]of Object.entries(g)){h+='<div class="mode-group" data-mode-group="'+label+'"><div class="mode-group-title">'+t('grp-'+label)+'</div><div class="mode-grid">';for(const k of keys)h+='<button class="mode-btn'+(S.aiMode===k?' selected':'')+'" data-mode="'+k+'" onclick="selectMode(this,\''+k+'\')"><span class="micon">'+wwAiModeIcon(k)+'</span>'+t('mode-'+k)+'</button>';h+='</div></div>';}el.innerHTML=h;if(typeof renderMpMultiSlots==='function')renderMpMultiSlots();}
async function doGenerateMobile(){const ac=S.apiConfig;if(!aiHasConfig(ac)){showToast('⚙',t('toast-no-api'));openModal('apiModal');return;}const ed=document.getElementById('mainEditor'),content=ed.value.slice(-1000)||'';const extra=document.getElementById('mpAiPrompt')?.value.trim()||'';if(!content&&!extra){showToast('✎',t('toast-no-content'));return;}const lm={short:'100字以内',mid:'200-300字',long:'400-600字',xl:'800字以上'},tm={low:'保持严谨',mid:'适度创意',high:'大胆想象'};const md=AI_MODES[S.aiMode]||{p:'请处理以下内容：'};let prompt=(typeof wwPromptText==='function'?wwPromptText(S.aiMode):md.p)+'\n\n'+content+'\n\n【输出要求】'+lm[S.aiLen]+'。'+tm[S.aiTemp]+'。';if(S.proj)prompt+='\n\n【项目信息】\n'+buildCtx();if(extra)prompt+='\n\n【额外指令】'+extra;let sysPrompt='你是一位专业的中文写作助手。';const memCtx=buildMemoryContext();if(memCtx)sysPrompt+='\n\n'+memCtx;const btn=document.getElementById('mpGenerateBtn');btn.classList.add('loading');btn.textContent=t('ap-gen-ing');try{const r=await callAI(prompt,ac,sysPrompt);S.lastArpResult=r;document.getElementById('arpText').textContent=r;document.getElementById('arpMode').textContent=S.aiMode;document.getElementById('aiResultPopup').classList.add('show');addHistory(S.aiMode,r);}catch(e){showToast('✕',e.message||'失败');}finally{btn.classList.remove('loading');btn.innerHTML='<span>★</span><span data-i18n="ap-gen">'+t('ap-gen')+'</span>';}}

// ═══ Cookie Consent & Privacy ═══
function showPrivacyModal(){document.getElementById('privacyModal').classList.add('show');}
function closePrivacyModal(){document.getElementById('privacyModal').classList.remove('show');}
function switchPrivTab(tab,el){document.querySelectorAll('.priv-panel').forEach(p=>p.style.display='none');document.querySelectorAll('.priv-tab').forEach(t=>t.classList.remove('active'));document.getElementById('privTab-'+tab).style.display='block';el.classList.add('active');}
function acceptCookie(){localStorage.setItem('ww_cookie_consent','1');document.getElementById('cookieBanner').classList.remove('show');}
(function(){
  if(!localStorage.getItem('ww_cookie_consent')){document.getElementById('cookieBanner').classList.add('show');}
})();
