// ═══ IndexedDB ═══
const DB_NAME='WritingWorkshop',DB_VER=5;let db;
function ensureIndex(store,name,keyPath,options={unique:false}){if(!store.indexNames.contains(name))store.createIndex(name,keyPath,options);}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VER);r.onupgradeneeded=e=>{const d=e.target.result;let st;if(!d.objectStoreNames.contains('projects'))d.createObjectStore('projects',{keyPath:'id',autoIncrement:true});st=d.objectStoreNames.contains('outlines')?e.target.transaction.objectStore('outlines'):d.createObjectStore('outlines',{keyPath:'id',autoIncrement:true});ensureIndex(st,'project_id','project_id');st=d.objectStoreNames.contains('characters')?e.target.transaction.objectStore('characters'):d.createObjectStore('characters',{keyPath:'id',autoIncrement:true});ensureIndex(st,'project_id','project_id');st=d.objectStoreNames.contains('chapters')?e.target.transaction.objectStore('chapters'):d.createObjectStore('chapters',{keyPath:'id',autoIncrement:true});ensureIndex(st,'project_id','project_id');st=d.objectStoreNames.contains('notes')?e.target.transaction.objectStore('notes'):d.createObjectStore('notes',{keyPath:'id',autoIncrement:true});ensureIndex(st,'project_id','project_id');st=d.objectStoreNames.contains('aiHistory')?e.target.transaction.objectStore('aiHistory'):d.createObjectStore('aiHistory',{keyPath:'id',autoIncrement:true});ensureIndex(st,'project_id','project_id');st=d.objectStoreNames.contains('aiMemories')?e.target.transaction.objectStore('aiMemories'):d.createObjectStore('aiMemories',{keyPath:'id',autoIncrement:true});ensureIndex(st,'project_id','project_id');};r.onsuccess=e=>{db=e.target.result;res(db);};r.onerror=e=>rej(e.target.error);});}
function dbPut(s,v){return new Promise((r,j)=>{const t=db.transaction(s,'readwrite');const q=t.objectStore(s).put(v);let result;t.oncomplete=()=>r(result);t.onabort=()=>j(t.error||q.error||new Error('浏览器存储事务已中止'));t.onerror=()=>j(t.error||q.error||new Error('浏览器存储写入失败'));q.onsuccess=()=>{result=q.result;};q.onerror=()=>j(q.error);});}
function dbGet(s,id){return new Promise((r,j)=>{const t=db.transaction(s,'readonly');const q=t.objectStore(s).get(id);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});}
function dbDel(s,id){return new Promise((r,j)=>{const t=db.transaction(s,'readwrite');const q=t.objectStore(s).delete(id);t.oncomplete=()=>r();t.onabort=()=>j(t.error||q.error||new Error('浏览器存储事务已中止'));t.onerror=()=>j(t.error||q.error||new Error('浏览器存储删除失败'));q.onerror=()=>j(q.error);});}
function dbAll(s){return new Promise((r,j)=>{const t=db.transaction(s,'readonly');const q=t.objectStore(s).getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});}
function dbByIndex(s,f,v){return new Promise((r,j)=>{const t=db.transaction(s,'readonly');const st=t.objectStore(s);if(st.indexNames.contains(f)){const q=st.index(f).getAll(v);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);return;}const a=[];const q=st.openCursor();q.onsuccess=e=>{const c=e.target.result;if(c){if(c.value[f]===v)a.push(c.value);c.continue();}else r(a);};q.onerror=()=>j(q.error);});}

// ═══ Writing Workshop runtime and backend bridge ═══
let WW_BROWSER_API_MODE=location.hostname.endsWith('github.io')||new URLSearchParams(location.search).get('api_mode')==='browser';
window.wwUsesBrowserStorage=()=>WW_BROWSER_API_MODE;
function syncServiceEntryVisibility(){
  for(const id of ['serviceConsoleBtn','workflowServiceLink']){
    const element=document.getElementById(id);
    if(element)element.hidden=WW_BROWSER_API_MODE;
  }
}
window.wwSyncServiceEntryVisibility=syncServiceEntryVisibility;
async function detectBrowserApiMode(){
  const forced=new URLSearchParams(location.search).get('api_mode');
  if(forced==='browser')return true;
  if(forced==='backend')return false;
  if(location.hostname.endsWith('github.io'))return true;
  try{
    const response=await fetch('/api/health',{cache:'no-store'});
    if(!response.ok)return true;
    const data=await response.json().catch(()=>null);
    return data?.status!=='ok';
  }catch(_){
    return true;
  }
}
function usesBrowserAPI(conf){return !!(conf&&(conf.transport==='browser'||(WW_BROWSER_API_MODE&&conf.key&&conf.key!=='backend')));}
function apiStorageDescription(){return WW_BROWSER_API_MODE?'API Key、桥令牌与自定义地址只保存在当前浏览器；未配置桥时直连模型服务，配置桥时经你的 HTTPS Go 桥转送。':'API Key 保存到当前自部署后端；浏览器通过同源 /api 请求。';}
async function apiJSON(url,opts={}){
  const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){
    if(r.status===404&&location.hostname.endsWith('github.io'))throw new Error('当前 Pages 未连接 Go 后端；请使用 Docker 自部署版执行 API 与 Skill');
    const error=new Error(typeof d.error==='string'?d.error:(d.error?.message||('HTTP '+r.status)));
    error.status=r.status;error.payload=d;throw error;
  }
  return d;
}
async function loadBackendConfig(){
  try{
    const cfgResp=await apiJSON('/api/config');
    const cfg=cfgResp?.config||cfgResp;
    if(cfg?.provider&&!S.apiConfig.provider){
      const pc=cfg.providers?.[cfg.provider]||{};
      S.apiConfig={
        provider:cfg.provider,
        model:cfg.model||'',
        key:'backend',
        baseUrl:pc.base_url||'',
        type:pc.type||'openai',
        protocol:pc.protocol||'auto',
        authMode:pc.auth_mode||'auto',
        timeout:Number(pc.request_timeout_ms||60000),
        contextLimit:Number(cfg.context_window||0),
        customHeaders:'',
        bodyOverrides:Object.keys(pc.extra_body||{}).length?JSON.stringify(pc.extra_body,null,2):'',
        exactEndpoint:!!pc.exact_endpoint,
        bridgeUrl:'',
        bridgeToken:'',
        transport:'backend'
      };
      localStorage.setItem('ww_api',JSON.stringify(S.apiConfig));
    }
  }catch(_){}
}
async function importProjectFromBackend(){
  try{
    const projects=await apiJSON('/api/projects');
    if(!Array.isArray(projects)||!projects.length)throw new Error('后端没有可导入的项目');
    const p=projects[0],now=Date.now();
    const projectId=await dbPut('projects',{name:p.name||'当前项目',genre:'writing-workshop',description:p.premise||p.description||'',world_setting:'',goal:2000,total_chapters:p.total_chapters||0,created_at:now,updated_at:now});
    const chapters=await apiJSON('/api/chapters').catch(()=>[]);
    for(const ch of chapters){
      const detail=await apiJSON('/api/chapters?chapter='+encodeURIComponent(ch.chapter)).catch(()=>ch);
      await dbPut('chapters',{project_id:projectId,title:detail.title||ch.title||('第 '+ch.chapter+' 章'),content:detail.content||'',word_count:detail.word_count||0,sort_order:ch.chapter-1,created_at:now,updated_at:now});
    }
    const chars=await apiJSON('/api/characters').catch(()=>[]);
    for(const c of chars){
      await dbPut('characters',{project_id:projectId,name:c.name||'',role:c.role||'',personality:(c.traits||[]).join('、'),background:c.arc||'',appearance:'',skills:'',created_at:now});
    }
    await loadProjects();
    await loadProject(projectId);
    closeModal('projectModal');
    showToast('✓','已从自部署后端导入项目');
  }catch(e){showToast('✕',e.message);}
}

// ═══ State ═══
function loadStoredApiConfig(){
  let stored={};
  try{stored=JSON.parse(localStorage.getItem('ww_api')||'{}')||{};}catch(_){}
  return stored;
}
function reconcileStoredApiConfig(){
  let stored=loadStoredApiConfig();
  if(WW_BROWSER_API_MODE&&stored.key&&stored.key!=='backend'){
    stored.transport='browser';
    localStorage.setItem('ww_api',JSON.stringify(stored));
  }else if(stored.key&&stored.key!=='backend'&&stored.transport!=='browser'){
    stored={provider:stored.provider||'',model:stored.model||'',baseUrl:'',key:'backend'};
    localStorage.setItem('ww_api',JSON.stringify(stored));
  }
  S.apiConfig=stored;
}
const S={proj:null,active:null,editCharId:null,aiMode:'润色',aiTemp:'mid',aiLen:'long',apiConfig:loadStoredApiConfig(),autoSave:true,unsaved:false,editorRevision:0,wordGoal:2000,curFontSize:16,lastArpResult:'',aiRunSnapshot:null,multiRunSnapshot:null,selectedProvider:'claude',previewMode:false,projects:[],aiMemories:[],pendingMemoryMeta:null};


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
  const manual=Number(S.apiConfig?.contextLimit||0);
  if(manual>0)return manual;
  if(!model)return null;
  for(const[k,v]of Object.entries(MODEL_CONTEXT_LIMITS)){
    if(model.includes(k)||k.includes(model))return v;
  }
  return null;
}
const AI_CONTEXT_MODES=new Set(['smart','current','selection','full']);
function getAIContextMode(){const value=localStorage.getItem('ww_ai_context_mode')||'smart';return AI_CONTEXT_MODES.has(value)?value:'smart';}
function setAIContextMode(value){const mode=AI_CONTEXT_MODES.has(value)?value:'smart';localStorage.setItem('ww_ai_context_mode',mode);for(const id of ['aiContextMode','mpAiContextMode']){const el=document.getElementById(id);if(el&&el.value!==mode)el.value=mode;}refreshLongBookMemoryUI();updateContextBar();}
function liveProjectChapters(){
  if(!S.proj)return[];
  const editor=document.getElementById('mainEditor');
  return(S.proj.chapters||[]).map(chapter=>S.active?.type==='chapter'&&S.active.id===chapter.id?{...chapter,title:document.getElementById('chapterTitle')?.value||chapter.title,content:editor?.value||chapter.content||''}:chapter);
}
function liveProjectBundle(){
  if(!S.proj)return null;
  const editor=document.getElementById('mainEditor'),title=document.getElementById('chapterTitle')?.value||'';
  const bundle={...S.proj,project:{...(S.proj.project||{})},outlines:(S.proj.outlines||[]).map(item=>({...item})),characters:(S.proj.characters||[]).map(item=>({...item}))};
  if(S.active?.type==='world')bundle.project.world_setting=editor?.value||'';
  if(S.active?.type==='outline'){
    const outline=bundle.outlines.find(item=>item.id===S.active.id);
    if(outline){outline.title=title||outline.title;outline.content=editor?.value||'';}
  }
  if(S.active?.type==='character'){
    const character=bundle.characters.find(item=>item.id===S.active.id);
    if(character)Object.assign(character,parseCharacterDocument(editor?.value||'',character),{name:title||character.name});
  }
  return bundle;
}
function projectFactPacket(){return WWProjectContext.build(liveProjectBundle());}
function projectLongBookMemories(){return S.proj?S.aiMemories.filter(memory=>memory.project_id===S.proj.project.id&&memory.source==='longbook'&&memory.enabled!==false):[];}
function currentBookDigest(){return projectLongBookMemories().filter(memory=>memory.kind==='book_digest').sort((a,b)=>(b.built_at||b.updated_at||0)-(a.built_at||a.updated_at||0))[0]||null;}
function currentFoundationDigest(){return projectLongBookMemories().filter(memory=>memory.kind==='foundation_digest').sort((a,b)=>(b.updated_at||b.created_at||0)-(a.updated_at||a.created_at||0))[0]||null;}
function buildProjectAIContext(options={}){
  if(!S.proj)return{text:'',full:true,fresh:true,packet:null,memory:null,warning:''};
  const packet=projectFactPacket(),memory=currentFoundationDigest();
  const fresh=!!memory?.content&&memory.source_hash===packet.sourceHash;
  const preferDigest=options.preferDigest!==false&&packet.sourceText.length>30000;
  if(preferDigest&&fresh)return{text:`【项目正式事实包 · 分层压缩】\n以下内容由系统完整分块读取世界观、大纲和人物卡后生成；大纲仍是规划，不代表正文已经发生。\n${memory.content}\n【/项目正式事实包】`,full:false,fresh:true,packet,memory,warning:''};
  const warning=preferDigest&&!fresh?'项目世界观、大纲与人物资料超过 3 万字符，且分层项目记忆尚未建立或已经过期；请先点击“更新全书记忆”，系统会完整分块读取后再执行写作':'';
  if(options.validate&&warning)throw new Error(warning);
  return{text:packet.text,full:true,fresh,packet,memory,warning};
}
function longBookMemoryFreshness(chapters=liveProjectChapters(),memories=projectLongBookMemories()){
  const digest=memories.filter(memory=>memory.kind==='book_digest').sort((a,b)=>(b.built_at||b.updated_at||0)-(a.built_at||a.updated_at||0))[0]||null;
  const foundationPacket=projectFactPacket(),foundation=memories.filter(memory=>memory.kind==='foundation_digest').sort((a,b)=>(b.updated_at||b.created_at||0)-(a.updated_at||a.created_at||0))[0]||null;
  const foundationFresh=!!foundation?.content&&foundation.source_hash===foundationPacket.sourceHash;
  const summaries=memories.filter(memory=>memory.kind==='chapter_summary');
  const byChapter=new Map(summaries.map(memory=>[String(memory.chapter_id),memory]));
  const ordered=chapters.map(chapter=>byChapter.get(String(chapter.id))||null);
  const freshIds=new Set(chapters.filter((chapter,index)=>ordered[index]?.source_hash===WWLongBookMemory.fingerprint(`${chapter.title}\n${chapter.content||''}`)).map(chapter=>String(chapter.id)));
  const coverageHash=ordered.every(Boolean)?WWLongBookMemory.fingerprint(`${foundationPacket.sourceHash}|${ordered.map(memory=>memory.source_hash).join('|')}`):'';
  const complete=!!(chapters.length&&digest&&foundationFresh&&freshIds.size===chapters.length&&digest.foundation_hash===foundationPacket.sourceHash&&digest.coverage_hash===coverageHash);
  return{digest,foundation,foundationFresh,foundationPacket,summaries,freshIds,complete,staleCount:Math.max(0,chapters.length-freshIds.size)};
}
function buildAIWritingContext(mode=getAIContextMode()){
  const editor=document.getElementById('mainEditor');
  const start=editor?.selectionStart||0,end=editor?.selectionEnd||0;
  const selection=start!==end?(editor?.value||'').slice(start,end).trim():'';
  const current=(editor?.value||'').trim();
  if(mode==='selection')return{text:selection,label:'当前选区',mode,complete:false,warning:selection?'':'请先在编辑器中选择需要处理的原文'};
  if(mode==='current')return{text:current,label:S.active?.type==='chapter'?'当前章节':'当前文档',mode,complete:false,warning:''};
  const chapters=liveProjectChapters();
  if(mode==='full'){
    const text=chapters.map((chapter,index)=>`【${index+1}. ${chapter.title||'未命名章节'}】\n${chapter.content||''}`).join('\n\n');
    return{text,label:`全书原文 · ${chapters.length} 章`,mode,complete:true,warning:chapters.length?'':'当前项目没有正文章节'};
  }
  const blocks=[];
  const memoryState=longBookMemoryFreshness(chapters),digest=memoryState.digest;
  if(digest?.content)blocks.push(`【全书分层记忆 · 完整覆盖 ${digest.chapter_count||digest.covered_chapter_ids?.length||0} 章】\n${digest.content}`);
  const activeIndex=S.active?.type==='chapter'?chapters.findIndex(chapter=>chapter.id===S.active.id):-1;
  if(activeIndex>=0){
    const wanted=new Set([activeIndex-2,activeIndex-1,activeIndex+1].filter(index=>index>=0&&index<chapters.length));
    const related=projectLongBookMemories().filter(memory=>memory.kind==='chapter_summary'&&wanted.has(Number(memory.coverage_index))).sort((a,b)=>Number(a.coverage_index)-Number(b.coverage_index));
    if(related.length)blocks.push('【相邻章节压缩记忆】\n'+related.map(memory=>`${memory.chapter_title||memory.title}\n${memory.content}`).join('\n\n'));
  }
  if(current)blocks.push(`【${S.active?.type==='chapter'?'当前章节完整原文':'当前文档'}】\n${current}`);
  const warning=memoryState.complete?'':digest?`${memoryState.foundationFresh?'设定/大纲已同步':'设定/大纲记忆待更新'}${memoryState.staleCount?'；另有 '+memoryState.staleCount+' 章待更新':''}；本次保留当前文档完整原文`:'尚未建立全书记忆；项目设定与大纲仍会直接进入请求，长篇资料请先更新分层记忆';
  if(warning)blocks.unshift(`【记忆覆盖状态】\n${warning}`);
  return{text:blocks.join('\n\n'),label:'智能长篇上下文',mode,complete:memoryState.complete,warning};
}
function buildGenerationRequest(extra='',options={validate:true}){
  const context=buildAIWritingContext();
  if(options.validate&&context.warning&&(!context.text||context.mode==='selection'))throw new Error(context.warning);
  const lm={short:'100字以内',mid:'200-300字',long:'400-600字',xl:'800字以上'},tm={low:'保持严谨',mid:'适度创意',high:'大胆想象'};
  const md=AI_MODES[S.aiMode]||{p:'请处理以下内容：'};
  let prompt=(typeof wwPromptText==='function'?wwPromptText(S.aiMode):md.p)+`\n\n【阅读上下文 · ${context.label}】\n${context.text}`+'\n\n【输出要求】'+lm[S.aiLen]+'。'+tm[S.aiTemp]+'。';
  const projectContext=buildProjectAIContext({validate:options.validate});
  if(projectContext.text)prompt+='\n\n'+projectContext.text;
  if(extra)prompt+='\n\n【额外指令】'+extra;
  let systemPrompt=typeof wwSystemPrompt==='function'?wwSystemPrompt():'你是一位专业的中文写作助手。';
  const memory=buildMemoryContext();if(memory)systemPrompt+='\n\n'+memory;
  const tokens=estimateTokens(prompt+'\n\n'+systemPrompt);
  const limit=getContextLimit(S.apiConfig?.model||'');
  const task=WWAITaskContract.taskForSkill(S.aiMode);
  const reserve=limit?Math.min(task.maxTokens,Math.max(1024,Math.floor(limit*.18))):task.maxTokens;
  if(options.validate&&context.mode==='full'&&!limit)throw new Error('全书原文模式需要先在 API 设置中填写模型上下文上限；否则无法判断是否会截断');
  if(options.validate&&limit&&tokens+reserve>limit*.96)throw new Error(`本次约 ${tokens.toLocaleString()} tokens，连同输出预留将超过 ${limit.toLocaleString()} 上限。请使用“智能长篇”并先更新全书记忆`);
  return{prompt,systemPrompt,context,projectContext,tokens,limit};
}
function updateContextBar(){
  const ac=S.apiConfig||{};
  if(!document.getElementById('mainEditor'))return;
  const desktopExtra=document.getElementById('aiPrompt')?.value.trim()||'';
  const mobileExtra=document.getElementById('mpAiPrompt')?.value.trim()||'';
  const isMobile=window.matchMedia?.('(max-width: 560px)').matches;
  const extra=(isMobile?mobileExtra:desktopExtra)||(isMobile?desktopExtra:mobileExtra);
  const request=buildGenerationRequest(extra,{validate:false});
  const promptTokens=request.tokens;
  const limit=request.limit;
  const hasLimit=Number(limit)>0;
  const pctRaw=hasLimit?Math.min(100,promptTokens/limit*100):0;
  const pctLabel=!hasLimit?'—':pctRaw===0?'0%':pctRaw<1?'<1%':(pctRaw<10?pctRaw.toFixed(1):Math.round(pctRaw))+'%';
  const kStr=promptTokens>1000?(promptTokens/1000).toFixed(1)+'k':String(promptTokens);
  const lStr=hasLimit?(limit>1000?(limit/1000).toFixed(0)+'k':String(limit)):'未知';
  const level=pctRaw>80?'danger':pctRaw>50?'warning':'normal';
  const color=level==='danger'?'var(--red)':level==='warning'?'var(--gold)':'var(--accent)';
  [
    {bar:'ctxBar',text:'ctxText',percent:'ctxPercent',model:'ctxModel'},
    {bar:'mpCtxBar',text:'mpCtxText',percent:'mpCtxPercent',model:'mpCtxModel'}
  ].forEach(target=>{
    const bar=document.getElementById(target.bar),txt=document.getElementById(target.text);
    const percent=document.getElementById(target.percent),model=document.getElementById(target.model);
    if(bar){
      bar.style.width=pctRaw+'%';
      bar.style.background=color;
      bar.classList.toggle('has-usage',promptTokens>0);
      const track=bar.parentElement;
      track?.setAttribute('aria-valuenow',pctRaw.toFixed(2));
      track?.setAttribute('aria-valuetext',hasLimit?kStr+' / '+lStr+' tokens，'+pctLabel:kStr+' tokens，上限未知');
      const meter=bar.closest('.ai-context-meter');
      if(meter)meter.dataset.level=level;
    }
    if(txt){txt.textContent=hasLimit?'约 '+kStr+' / '+lStr+' tokens':'约 '+kStr+' tokens · 上限未知';txt.style.color=level==='normal'?'var(--text-muted)':color;}
    if(percent)percent.textContent=pctLabel;
    if(model)model.textContent=(ac.model||'未选择模型')+' · 上限 '+lStr;
  });
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
  "mod-api-sub":"Pages 使用浏览器本地自定义 API；自部署版默认由后端保管密钥。",
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
  "sb-empty-notes":"暂无笔记，点击下方按钮创建",
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
  "form-api-key-hint":"Pages 保存于当前浏览器；自部署版保存到后端",
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
  "mod-api-sub":"Pages uses a browser-local custom API; self-hosted mode stores keys on its backend.",
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
  "sb-empty-notes":"No notes yet. Create one below.",
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
  "form-api-key-hint":"Stored in this browser on Pages, or by the self-hosted backend",
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
  "mod-api-sub":"Pages はブラウザー内のカスタム API を使用し、セルフホスト版はバックエンドにキーを保存します。",
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
  "sb-empty-notes":"メモはまだありません。下から作成できます。",
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
  "form-api-key-hint":"Pages ではブラウザー、セルフホスト版ではバックエンドに保存",
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
  "mod-api-sub":"Pages는 브라우저 로컬 사용자 지정 API를 사용하고, 자체 호스팅 모드는 백엔드에 키를 저장합니다.",
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
  "sb-empty-notes":"아직 메모가 없습니다. 아래에서 만들어 보세요.",
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
  "form-api-key-hint":"Pages에서는 이 브라우저, 자체 호스팅에서는 백엔드에 저장",
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
  "sb-empty-notes":"Aucune note. Créez-en une ci-dessous.",
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
  "form-api-key-hint":"Stockée par le backend auto-hébergé",
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
  "sb-empty-notes":"Aún no hay notas. Crea una abajo.",
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
  "form-api-key-hint":"Guardada por el backend autoalojado",
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
  "sb-notes":"Notizen",
  "sb-add-outline":"＋ Gliederung hinzufügen",
  "sb-add-chapter":"＋ Kapitel hinzufügen",
  "sb-add-char":"＋ Charakter hinzufügen",
  "sb-empty-outline":"Keine Gliederungen",
  "sb-empty-chapter":"Keine Kapitel",
  "sb-empty-char":"Keine Charaktere",
  "sb-empty-notes":"Noch keine Notizen. Unten können Sie eine erstellen.",
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
  "form-api-key-hint":"Vom selbst gehosteten Backend gespeichert",
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
  "sb-notes":"Заметки",
  "sb-add-outline":"＋ Добавить план",
  "sb-add-chapter":"＋ Добавить главу",
  "sb-add-char":"＋ Добавить персонажа",
  "sb-empty-outline":"Планов нет",
  "sb-empty-chapter":"Глав нет",
  "sb-empty-char":"Персонажей нет",
  "sb-empty-notes":"Заметок пока нет. Создайте первую ниже.",
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
  "form-api-key-hint":"Хранится на самостоятельно размещённом сервере",
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
async function initApp(){
  WW_BROWSER_API_MODE=await detectBrowserApiMode();
  syncServiceEntryVisibility();
  reconcileStoredApiConfig();
  await openDB();
  if(!WW_BROWSER_API_MODE)await loadBackendConfig();
  renderAiModeGrid();
  renderMultiSlots();
  await loadProjects();
  await loadMemories();
  await renderHistory();
  setInterval(()=>{if(S.autoSave&&S.unsaved)saveDoc({silent:true}).catch(()=>{});},30000);
  const ed=document.getElementById('mainEditor');
  ed.addEventListener('input',onEditorInput);
  ed.addEventListener('select',updateContextBar);
  ed.addEventListener('keyup',updateContextBar);
  ed.addEventListener('mouseup',updateContextBar);
  ed.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveDoc();}});
  document.getElementById('focusEditor').addEventListener('input',()=>{document.getElementById('focusInfo').textContent=countWords(document.getElementById('focusEditor').value)+' 字 · Esc 退出';});
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    const focus=document.getElementById('focusOverlay');
    if(focus?.classList.contains('on'))closeFocus();
    closeAiResult();
  });
  window.addEventListener('beforeunload',e=>{
    if(!S.unsaved)return;
    e.preventDefault();
    e.returnValue='';
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'&&S.unsaved)saveDoc({silent:true}).catch(()=>{});
  });
  if(S.projects.length>0)await loadProject(S.projects[0].id);
  updateAllStats();
  updateContextBar();
  requestPersistentStorage();
}
document.addEventListener('DOMContentLoaded',()=>{/* lock handled in IIFE above */});

// ═══ Editor ═══
let editorTimer;
function markEditorDirty(){
  S.unsaved=true;
  S.editorRevision=(S.editorRevision||0)+1;
  document.getElementById('saveBtn')?.classList.add('unsaved');
  clearTimeout(editorTimer);
  editorTimer=setTimeout(()=>{
    if(S.autoSave)saveDoc({silent:true}).catch(()=>{});
    updateContextBar();
  },3000);
}
function onEditorInput(markDirty=true){
  const txt=document.getElementById('mainEditor').value,w=countWords(txt);
  document.getElementById('editorWords').textContent=w;
  document.getElementById('totalWordsBar').textContent=w;
  const ps=txt.split(/\n\n+/).filter(p=>p.trim()).length||1;
  document.getElementById('paraCount').textContent=ps;
  document.getElementById('paraCountBar').textContent=ps;
  document.getElementById('sentCount').textContent=(txt.match(/[。！？.!?]/g)||[]).length;
  document.getElementById('readTime').textContent=Math.max(1,Math.ceil(w/300));
  updateGoal();
  if(markDirty!==false)markEditorDirty();
  if(S.previewMode)document.getElementById('previewPane').innerHTML=renderMD(txt);
}
function onTitleInput(){markEditorDirty();updateContextBar();}
async function flushActiveDocument(){
  if(!S.unsaved||!S.active||!S.proj)return true;
  try{
    for(let attempt=0;attempt<3&&S.unsaved;attempt++){
      if(await saveDoc({silent:true}))return true;
    }
    if(!S.unsaved)return true;
    showToast('✕','编辑内容仍在变化，已阻止切换；请停止输入后重试');
    return false;
  }catch(error){
    showToast('✕','保存失败，已阻止切换：'+(error.message||error));
    return false;
  }
}
function setEditorDocument(title,text){
  clearTimeout(editorTimer);
  S.editorRevision=(S.editorRevision||0)+1;
  document.getElementById('chapterTitle').value=title||'';
  document.getElementById('mainEditor').value=text||'';
  S.unsaved=false;
  document.getElementById('saveBtn')?.classList.remove('unsaved');
  onEditorInput(false);
  updateContextBar();
}
async function requestPersistentStorage(){
  if(!navigator.storage?.persist)return;
  try{
    const persisted=await navigator.storage.persisted?.();
    if(!persisted)await navigator.storage.persist();
  }catch(_){}
}
function countWords(t){return t.replace(/\s/g,'').length;}
function updateGoal(){const w=countWords(document.getElementById('mainEditor').value),p=Math.min(100,Math.round(w/S.wordGoal*100));document.getElementById('goalFill').style.width=p+'%';document.getElementById('goalText').textContent=w+'/'+S.wordGoal;document.getElementById('goalTextBar').textContent=w+'/'+S.wordGoal;document.getElementById('todayWords').textContent=w;}
function updateAllStats(){document.getElementById('totalWords').textContent=countWords(document.getElementById('mainEditor').value);updateGoal();}
function formatText(c){document.execCommand(c);document.getElementById('mainEditor').focus();}
function changeFontSize(d){S.curFontSize=Math.max(12,Math.min(24,S.curFontSize+d));document.getElementById('mainEditor').style.fontSize=S.curFontSize+'px';document.getElementById('fontSizeDisplay').textContent=S.curFontSize+'px';}
function insertDivider(){const e=document.getElementById('mainEditor'),p=e.selectionStart,i='\n\n────────────────\n\n';e.value=e.value.slice(0,p)+i+e.value.slice(p);e.selectionStart=e.selectionEnd=p+i.length;onEditorInput();}
function insertQuote(){const e=document.getElementById('mainEditor'),p=e.selectionStart,s=e.value.slice(e.selectionStart,e.selectionEnd),i=s?'「'+s+'」':'「」';e.value=e.value.slice(0,p)+i+e.value.slice(e.selectionEnd);onEditorInput();}
function exportText(){const text=document.getElementById('mainEditor').value,name=document.getElementById('chapterTitle').value||t('default-doc-title'),blob=new Blob([text],{type:'text/plain;charset=utf-8'}),a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('↓',t('toast-exported'));}
function toggleAutoSave(){S.autoSave=!S.autoSave;document.getElementById('autoSaveToggle').classList.toggle('active',S.autoSave);showToast(S.autoSave?'⚡':'⏸',S.autoSave?t('toast-autosave-on'):t('toast-autosave-off'));}
function renderMD(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/^### (.+)$/gm,'<h3 style="font-size:18px;font-weight:700;margin:12px 0 6px">$1</h3>').replace(/^## (.+)$/gm,'<h2 style="font-size:20px;font-weight:700;margin:12px 0 6px">$1</h2>').replace(/^# (.+)$/gm,'<h1 style="font-size:24px;font-weight:700;margin:12px 0 6px">$1</h1>').replace(/^> (.+)$/gm,'<blockquote style="border-left:3px solid var(--accent);padding-left:12px;color:var(--text-secondary)">$1</blockquote>').replace(/^---$/gm,'<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/`(.+?)`/g,'<code style="background:var(--bg-card);padding:1px 4px;border-radius:3px">$1</code>').replace(/\n/g,'<br>');}
function togglePreview(){S.previewMode=!S.previewMode;const ed=document.getElementById('mainEditor'),pv=document.getElementById('previewPane'),b=document.getElementById('previewBtn');if(S.previewMode){pv.innerHTML=renderMD(ed.value);pv.style.display='block';ed.style.display='none';b.classList.add('active');}else{pv.style.display='none';ed.style.display='block';b.classList.remove('active');}}


// ═══ Focus ═══
function openFocus(){document.getElementById('focusEditor').value=document.getElementById('mainEditor').value;document.getElementById('focusOverlay').classList.add('on');document.getElementById('focusEditor').focus();}
function closeFocus(){
  const overlay=document.getElementById('focusOverlay');
  if(!overlay?.classList.contains('on'))return;
  document.getElementById('mainEditor').value=document.getElementById('focusEditor').value;
  overlay.classList.remove('on');
  onEditorInput();
}


// ═══ Sidebar ═══
function switchSidebar(t,el){document.querySelectorAll('.nav-tab').forEach(x=>x.classList.remove('active'));el.classList.add('active');['outline','chapters','chars','notes'].forEach(x=>{document.getElementById('tab-'+x).style.display=x===t?'block':'none';});}

// ═══ Projects ═══
async function loadProjects(){S.projects=await dbAll('projects');S.projects.sort((a,b)=>(b.updated_at||0)-(a.updated_at||0));if(S.projects.length>0&&!S.proj)await loadProject(S.projects[0].id);}
async function loadProject(id){
  if(!(await flushActiveDocument()))return false;
  const p=await dbGet('projects',id);
  if(!p)return false;
  const [os,cs,chs,notes]=await Promise.all([
    dbByIndex('outlines','project_id',id),
    dbByIndex('characters','project_id',id),
    dbByIndex('chapters','project_id',id),
    dbByIndex('notes','project_id',id)
  ]);
  os.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  chs.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  notes.sort((a,b)=>(b.updated_at||b.created_at||0)-(a.updated_at||a.created_at||0));
  S.proj={project:p,outlines:os,characters:cs,chapters:chs,notes};
  S.active=null;
  S.wordGoal=p.goal||2000;
  document.getElementById('currentProjectName').textContent=p.name;
  document.querySelector('.project-selector')?.setAttribute('title',p.name);
  renderOutlineList();
  renderChapterList();
  renderCharList();
  renderNoteList();
  renderMemoryList();
  await renderHistory();
  await window.workflowRenderHistory?.();
  if(chs.length>0)await loadChapterContent(chs[0].id);
  else if(p.world_setting)await loadWorldContent();
  else if(os.length>0)await loadOutlineContent(os[0].id);
  else if(notes.length>0)await loadNoteContent(notes[0].id);
  else setEditorDocument('','');
  refreshLongBookMemoryUI();
  showToast('📁',p.name);
  return true;
}
async function createProject(){const name=document.getElementById('newProjectName').value.trim();if(!name){showToast('✕',t('toast-enter-name'));return;}if(!(await flushActiveDocument()))return;const g=[...document.querySelectorAll('#genreGrid .genre-chip.on')].map(e=>e.textContent),now=Date.now();const id=await importProjectBundleAtomic({version:6,project:{name,genre:g[0]||t('genre-uncategorized'),description:document.getElementById('newProjectDesc').value.trim(),world_setting:document.getElementById('newProjectWorld').value.trim(),goal:parseInt(document.getElementById('dailyGoal').value)||2000,created_at:now,updated_at:now},outlines:[{title:t('default-chapter-title'),content:'',sort_order:0,created_at:now}],characters:[],chapters:[],notes:[],memories:[],history:[],categories:[]});closeModal('newProjectModal');await loadProjects();await loadProject(id);showToast('📁',t('toast-created')+': '+name);document.getElementById('newProjectName').value='';}
async function selectProjectFromList(id){if(await loadProject(id))closeModal('projectModal');}
function renderProjectList(){const el=document.getElementById('projectList');if(!S.projects.length){el.innerHTML='<div style="text-align:center;padding:30px;color:var(--text-muted)">'+t('ps-none')+'</div>';return;}el.innerHTML=S.projects.map(p=>'<div class="project-list-item" onclick="selectProjectFromList('+Number(p.id)+')"><div class="pli-name">'+escapeHtml(p.name)+'</div><div class="pli-meta">'+escapeHtml(p.genre)+' · '+new Date(p.created_at).toLocaleDateString(currentLang)+'</div></div>').join('');}
async function exportProject(){
  if(!S.proj)return showToast('✕',t('toast-no-proj'));
  if(!(await flushActiveDocument()))return;
  const projectId=S.proj.project.id;
  const history=await dbByIndex('aiHistory','project_id',projectId);
  const d={version:6,exported_at:new Date().toISOString(),project:S.proj.project,outlines:S.proj.outlines,characters:S.proj.characters,chapters:S.proj.chapters,notes:S.proj.notes||[],memories:S.aiMemories.filter(m=>m.project_id===projectId),history,categories:window.wwCategoriesExport?.()||[],prompt_skills:window.wwPromptSkillsExport?.()||null,corpus:window.wwCorpusExport?.()||null};
  const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),a=document.createElement('a'),url=URL.createObjectURL(b);
  a.href=url;
  a.download=(S.proj.project.name||t('default-doc-title'))+'.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  showToast('↓',t('toast-exported'));
}
function cloneWithoutId(v){const x={...(v||{})};delete x.id;return x;}
// ═══ DOCX Parser (minimal ZIP XML extraction) ═══
const MAX_IMPORT_FILES=50;
const MAX_IMPORT_FILE_BYTES=25*1024*1024;
const MAX_IMPORT_TOTAL_BYTES=100*1024*1024;
const MAX_DOCX_TEXT_BYTES=40*1024*1024;
const MAX_PROJECT_BUNDLE_ENTRIES=20000;
function migrateProjectBundle(data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('无效的项目备份');
  const sourceVersion=Number.isInteger(Number(data.version))?Number(data.version):1;
  if(sourceVersion<1||sourceVersion>6)throw new Error('不支持的项目备份版本: '+String(data.version));
  const migrated={...data};
  migrated.version=6;
  migrated.source_version=sourceVersion;
  migrated.outlines=Array.isArray(data.outlines)?data.outlines:[];
  migrated.characters=Array.isArray(data.characters)?data.characters:[];
  migrated.chapters=Array.isArray(data.chapters)?data.chapters:[];
  migrated.notes=Array.isArray(data.notes)?data.notes:[];
  migrated.memories=Array.isArray(data.memories)?data.memories:(Array.isArray(data.aiMemories)?data.aiMemories:[]);
  migrated.history=Array.isArray(data.history)?data.history:(Array.isArray(data.aiHistory)?data.aiHistory:[]);
  migrated.categories=Array.isArray(data.categories)?data.categories:(Array.isArray(data.custom_categories)?data.custom_categories:[]);
  migrated.prompt_skills=data.prompt_skills||data.promptSkills||null;
  migrated.corpus=data.corpus||data.corpus_profiles||null;
  return migrated;
}
function validateProjectBundle(data){
  data=migrateProjectBundle(data);
  if(!data.project||typeof data.project!=='object'||Array.isArray(data.project))throw new Error('无效的项目备份');
  if(data.project.name!=null&&typeof data.project.name!=='string')throw new Error('项目名称必须是文本');
  const keys=['outlines','characters','chapters','notes','memories','history','categories'];
  let total=0;
  for(const key of keys){
    if(!Array.isArray(data[key]))throw new Error('项目备份字段 '+key+' 必须是数组');
    if(data[key].some(item=>!item||typeof item!=='object'||Array.isArray(item)))throw new Error('项目备份字段 '+key+' 包含无效条目');
    total+=data[key].length;
  }
  if(total>MAX_PROJECT_BUNDLE_ENTRIES)throw new Error('项目备份条目过多，最多 '+MAX_PROJECT_BUNDLE_ENTRIES+' 条');
  return data;
}
function importProjectBundleAtomic(data,projectOverride={}){
  data=validateProjectBundle(data);
  const now=Date.now();
  const project={...cloneWithoutId(data.project),...projectOverride,created_at:projectOverride.created_at||data.project.created_at||now,updated_at:now};
  const stores=['projects','outlines','characters','chapters','notes','aiMemories','aiHistory'];
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(stores,'readwrite');
    let projectId=null;
    const fail=()=>reject(tx.error||new Error('项目导入事务失败，未写入任何内容'));
    tx.onabort=fail;
    tx.onerror=fail;
    tx.oncomplete=()=>resolve(projectId);
    const projectReq=tx.objectStore('projects').put(project);
    projectReq.onerror=()=>{try{tx.abort();}catch(_){}};
    projectReq.onsuccess=()=>{
      projectId=projectReq.result;
      try{
        const idMaps={outline:new Map(),character:new Map(),chapter:new Map(),note:new Map()};
        let pendingChildren=0;
        let historyQueued=false;
        const queueHistory=()=>{
          if(historyQueued)return;
          historyQueued=true;
          const store=tx.objectStore('aiHistory');
          for(const row of data.history||[]){
            const next={...cloneWithoutId(row),project_id:projectId};
            const activeMap=idMaps[next.active_type];
            if(activeMap?.has(next.active_id))next.active_id=activeMap.get(next.active_id);
            store.put(next);
          }
        };
        const childDone=()=>{
          pendingChildren--;
          if(pendingChildren===0)queueHistory();
        };
        const putRows=(storeName,rows,activeType,transform=row=>row)=>{
          const store=tx.objectStore(storeName);
          for(const row of rows||[]){
            pendingChildren++;
            const oldId=row.id;
            const request=store.put({...cloneWithoutId(transform(row)),project_id:projectId});
            request.onsuccess=()=>{
              if(activeType&&oldId!=null)idMaps[activeType].set(oldId,request.result);
              childDone();
            };
          }
        };
        putRows('outlines',data.outlines,'outline');
        putRows('characters',data.characters,'character');
        putRows('notes',data.notes,'note');
        putRows('aiMemories',data.memories,null);
        putRows('chapters',data.chapters,'chapter',row=>({
          ...row,
          title:row.title||'未命名章节',
          word_count:row.word_count||countWords(row.content||''),
          sort_order:Number.isFinite(Number(row.sort_order))?Number(row.sort_order):0
        }));
        if(pendingChildren===0)queueHistory();
      }catch(_){
        try{tx.abort();}catch(_){}
      }
    };
  });
}
async function parseDocx(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  let eocdOffset = -1;
  for (let i = arrayBuffer.byteLength - 22; i >= Math.max(0, arrayBuffer.byteLength - 65576); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset < 0) return '';
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  if(cdOffset+cdSize>arrayBuffer.byteLength)return'';
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
      if(localOffset+30>arrayBuffer.byteLength)return'';
      const lhNameLen = view.getUint16(localOffset + 26, true);
      const lhExtraLen = view.getUint16(localOffset + 28, true);
      docOffset = localOffset + 30 + lhNameLen + lhExtraLen;
      docSize = compSize;
      docMethod = method;
      break;
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  if (docOffset < 0 || docOffset+docSize>arrayBuffer.byteLength) return '';
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
      let expanded=0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        expanded+=value.length;
        if(expanded>MAX_DOCX_TEXT_BYTES){await reader.cancel();return'';}
        chunks.push(value);
      }
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
// ═══ Type-aware document import & chapter splitting ═══
const IMPORT_TYPE_LABELS={manuscript:'正文章节',outline:'大纲',world_setting:'世界观',note:'笔记/资料'};
function normalizeImportDocumentType(value){
  const type=String(value||'').trim().toLowerCase().replace(/[\s.-]+/g,'_');
  if(['outline','outlines','plot_outline','大纲'].includes(type))return'outline';
  if(['world','worldbuilding','world_setting','setting','世界观','设定'].includes(type))return'world_setting';
  if(['note','notes','reference','material','笔记','资料'].includes(type))return'note';
  if(['chapter','chapters','manuscript','body','novel','正文','章节'].includes(type))return'manuscript';
  return'';
}
function parseImportHint(text){
  const source=String(text||'');
  const match=source.match(/\[WRITING_WORKSHOP_IMPORT_HINT_V1\]([\s\S]*?)\[END_IMPORT_HINT\]/i);
  if(!match)return{};
  const hint={};
  match[1].split(/\r?\n/).forEach(line=>{
    const separator=line.indexOf('=');
    if(separator<1)return;
    hint[line.slice(0,separator).trim().toLowerCase()]=line.slice(separator+1).trim();
  });
  return hint;
}
function stripImportEnvelope(text){
  return String(text||'')
    .replace(/\[WRITING_WORKSHOP_IMPORT_HINT_V1\][\s\S]*?\[END_IMPORT_HINT\]\s*/ig,'')
    .replace(/^\[(?:OUTLINE|WORLD_SETTING|MANUSCRIPT|NOTE)_CONTENT_(?:BEGIN|END)\]\s*$/gim,'')
    .replace(/\r\n?/g,'\n')
    .replace(/^\s+|\s+$/g,'');
}
function importFileBase(fileName){return String(fileName||'').replace(/\.[^.]+$/,'').trim()||'未命名资料';}
function cleanImportedTitle(fileName){
  return importFileBase(fileName)
    .replace(/[_\s-]*(?:仅作大纲|仅作设定|禁止计入章节).*$/,'')
    .replace(/[_\s-]+$/,'')||importFileBase(fileName);
}
function classifyImportDocument(fileName,text){
  const hint=parseImportHint(text);
  const hinted=normalizeImportDocumentType(hint.document_type||hint.type||hint.target);
  if(hinted)return{type:hinted,reason:'文件内类型标记',projectName:String(hint.project||'').trim()};
  if(/world[_\s.-]*setting|project\.world[_\s.-]*setting/i.test(String(hint.target||'')))return{type:'world_setting',reason:'文件内目标标记',projectName:String(hint.project||'').trim()};
  const base=importFileBase(fileName);
  if(/(?:世界观|世界设定|地域空间|地域母本|world\s*(?:building|setting)?)/i.test(base))return{type:'world_setting',reason:'文件名识别',projectName:''};
  if(/(?:项目大纲|剧情大纲|故事大纲|大纲|outline|plot[_\s-]*plan)/i.test(base))return{type:'outline',reason:'文件名识别',projectName:''};
  if(/(?:人物|角色|人设|笔记|资料|参考|考据|character|cast|note|reference)/i.test(base))return{type:'note',reason:'文件名识别',projectName:''};
  if(/(?:正文|章节|稿件|manuscript|chapter|novel)/i.test(base))return{type:'manuscript',reason:'文件名识别',projectName:''};
  const head=stripImportEnvelope(text).slice(0,2400);
  if(/(?:《[^》]+》)?世界(?:观|设定)|九大地域|权威口径|地域核心/.test(head))return{type:'world_setting',reason:'本地内容识别',projectName:''};
  if(/(?:《[^》]+》)?项目大纲|总主线|人物弧线|中期主线|终局方向/.test(head))return{type:'outline',reason:'本地内容识别',projectName:''};
  return{type:'manuscript',reason:'默认按正文处理',projectName:''};
}
function chapterTitleFromLine(line){
  const title=String(line||'').trim().replace(/^#{1,6}\s+/,'').trim();
  if(!title||title.length>100)return'';
  const suffix='(?:[\\s　:：｜|·.．\\-—]+.{0,80})?';
  const chineseNumber='[一二三四五六七八九十百千万零〇两\\d]+';
  if(new RegExp(`^第${chineseNumber}(?:章|回|节|篇)${suffix}$`).test(title))return title;
  if(new RegExp(`^(?:序章|楔子|引子|前言|终章|尾声|后记)${suffix}$`).test(title))return title;
  if(new RegExp(`^(?:chapter|section)\\s+\\d+${suffix}$`,'i').test(title))return title;
  return'';
}
function splitIntoChapters(text) {
  const source=String(text||'').replace(/\r\n?/g,'\n').trim();
  if(!source)return[{title:'未命名章节',content:'',word_count:0}];
  const headings=[];
  let offset=0;
  for(const line of source.split('\n')){
    const title=chapterTitleFromLine(line);
    if(title)headings.push({title,start:offset,end:offset+line.length});
    offset+=line.length+1;
  }
  if(headings.length){
    const chapters=[];
    const preContent=source.slice(0,headings[0].start).trim();
    if(countWords(preContent)>50)chapters.push({title:'序章',content:preContent,word_count:countWords(preContent)});
    headings.forEach((heading,index)=>{
      const contentEnd=index+1<headings.length?headings[index+1].start:source.length;
      const content=source.slice(heading.end,contentEnd).trim();
      if(content||heading.title)chapters.push({title:heading.title,content,word_count:countWords(content)});
    });
    if(chapters.length)return chapters;
  }
  return[{title:'全文',content:source,word_count:countWords(source)}];
}
function inferImportProjectName(sources){
  const hinted=sources.map(source=>source.projectName).filter(Boolean);
  if(hinted.length)return hinted[0];
  if(sources.length===1)return sources[0].fileBase;
  const prefixes=sources.map(source=>source.fileBase.split(/[_\s-]+/)[0]).filter(Boolean);
  if(prefixes.length===sources.length&&prefixes.every(prefix=>prefix===prefixes[0])&&prefixes[0].length>1)return prefixes[0];
  return sources[0]?.fileBase||'未命名项目';
}
function buildImportDataFromSources(sources,name=''){
  const chapters=[],outlines=[],notes=[],worldParts=[];
  for(const source of sources){
    const content=source.content||'';
    if(source.type==='outline')outlines.push({title:source.title,content,sort_order:outlines.length});
    else if(source.type==='world_setting')worldParts.push({title:source.title,content});
    else if(source.type==='note')notes.push({title:source.title,content,sort_order:notes.length});
    else{
      const split=splitIntoChapters(content);
      split.forEach(chapter=>chapters.push({
        title:split.length===1&&chapter.title==='全文'?source.title:chapter.title,
        content:chapter.content,
        word_count:chapter.word_count||countWords(chapter.content||''),
        sort_order:chapters.length
      }));
    }
  }
  const world_setting=worldParts.map((part,index)=>worldParts.length>1?`【${part.title}】\n${part.content}`:part.content).join('\n\n');
  return{
    name:name||inferImportProjectName(sources),chapters,outlines,notes,world_setting,
    world_setting_sources:worldParts.length,sources,created_at:Date.now()
  };
}
// ═══ Import Preview & Confirm ═══
let pendingImportData = null;
function showImportPreview(importData) {
  pendingImportData = importData;
  const totalWords=(importData.chapters||[]).reduce((sum,chapter)=>sum+(chapter.word_count||countWords(chapter.content||'')),0);
  const chapterCount=(importData.chapters||[]).length;
  const outlineCount=(importData.outlines||[]).length;
  const worldCount=importData.world_setting_sources||0;
  const noteCount=(importData.notes||[]).length;
  let h = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:16px">';
  h += '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px">';
  h += '<div><div style="font-size:24px;font-weight:700;color:var(--accent)">' + chapterCount + '</div><div style="font-size:11px;color:var(--text-hint)">章节</div></div>';
  h += '<div><div style="font-size:24px;font-weight:700;color:var(--accent)">' + outlineCount + '</div><div style="font-size:11px;color:var(--text-hint)">大纲</div></div>';
  h += '<div><div style="font-size:24px;font-weight:700;color:var(--accent)">' + worldCount + '</div><div style="font-size:11px;color:var(--text-hint)">世界观资料</div></div>';
  h += '<div><div style="font-size:24px;font-weight:700;color:var(--accent)">' + noteCount + '</div><div style="font-size:11px;color:var(--text-hint)">笔记资料</div></div>';
  h += '<div><div style="font-size:24px;font-weight:700;color:var(--accent)">' + totalWords + '</div><div style="font-size:11px;color:var(--text-hint)">正文字数</div></div>';
  h += '</div>';
  if(importData.sources?.length){
    h+='<div style="font-size:12px;font-weight:700;margin:4px 0 8px">资料分流（可修改）</div><div style="max-height:180px;overflow:auto">';
    importData.sources.forEach((source,index)=>{
      const options=Object.entries(IMPORT_TYPE_LABELS).map(([value,label])=>'<option value="'+value+'"'+(source.type===value?' selected':'')+'>'+label+'</option>').join('');
      h+='<div style="display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)"><div style="min-width:0"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escapeHtml(source.fileName)+'</div><div style="font-size:10px;color:var(--text-hint)">'+escapeHtml(source.reason||'手动指定')+'</div></div><select class="form-input" style="padding:7px" onchange="setPendingImportSourceType('+index+',this.value)">'+options+'</select></div>';
    });
    h+='</div>';
  }
  if (chapterCount === 0) {
    h += '<div style="font-size:12px;color:var(--text-hint);margin-top:12px">当前没有正文章节；可以只导入大纲、世界观或笔记。</div>';
  } else if (chapterCount <= 10) {
    h += '<div style="font-size:12px;font-weight:700;margin:12px 0 6px">正文章节预览</div><div style="max-height:140px;overflow-y:auto">';
    importData.chapters.forEach((c, i) => {
      h += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border)">';
      h += '<span style="color:var(--text-muted)">' + (i + 1) + '.</span>';
      h += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(c.title || '未命名') + '</span>';
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
function setPendingImportSourceType(index,type){
  if(!pendingImportData?.sources?.[index])return;
  const normalized=normalizeImportDocumentType(type);
  if(!normalized)return;
  const projectName=document.getElementById('importProjectName')?.value.trim()||pendingImportData.name;
  const autoAnalyze=document.getElementById('importAutoAnalyzeVal')?.value||'1';
  pendingImportData.sources[index].type=normalized;
  pendingImportData.sources[index].reason='手动指定';
  showImportPreview(buildImportDataFromSources(pendingImportData.sources,projectName));
  document.getElementById('importAutoAnalyzeVal').value=autoAnalyze;
}
async function confirmImport() {
  if (!pendingImportData) return;
  const data = pendingImportData;
  const projectName = document.getElementById('importProjectName').value.trim() || data.name || '未命名项目';
  const autoAnalyze = document.getElementById('importAutoAnalyzeVal').value === '1';
  closeModal('importPreviewModal');
  try {
    const now = Date.now();
    const id=await importProjectBundleAtomic({
      version:6,
      project:{
        name:projectName,
        genre:data.genre||t('genre-uncategorized'),
        description:data.description||'',
        world_setting:data.world_setting||'',
        goal:data.goal||2000,
        created_at:data.created_at||now,
        updated_at:now
      },
      outlines:data.outlines||[],
      characters:data.characters||[],
      chapters:data.chapters||[],
      notes:data.notes||[],
      memories:data.memories||[],
      history:[],
      categories:[]
    });
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
  const totalBytes=[...files].reduce((sum,file)=>sum+(file.size||0),0);
  if(files.length>MAX_IMPORT_FILES){showToast('✕','一次最多导入 '+MAX_IMPORT_FILES+' 个文件');e.target.value='';return;}
  if([...files].some(file=>(file.size||0)>MAX_IMPORT_FILE_BYTES)||totalBytes>MAX_IMPORT_TOTAL_BYTES){showToast('✕','导入文件过大：单文件最多 25 MiB，总计最多 100 MiB');e.target.value='';return;}
  // Single JSON file: direct import (original behavior)
  if (files.length === 1 && files[0].name.toLowerCase().endsWith('.json')) {
    try {
      const f = files[0];
      const raw = await f.text();
      const d = validateProjectBundle(JSON.parse(raw));
      const id=await importProjectBundleAtomic(d);
      const importWarnings=[];
      if (d.categories && window.wwCategoriesImport) {
        try { window.wwCategoriesImport(d.categories); }
        catch (categoryError) { importWarnings.push('自定义分类未导入');console.warn('Category import skipped:', categoryError); }
      }
      if (d.prompt_skills && window.wwPromptSkillsImport) {
        try { window.wwPromptSkillsImport(d.prompt_skills, { merge: true, silent: true }); }
        catch (promptError) { importWarnings.push('Prompt Skill 未导入');console.warn('Prompt Skill import skipped:', promptError); }
      }
      if (d.corpus && window.wwCorpusImport) {
        try { window.wwCorpusImport(d.corpus); }
        catch (corpusError) { importWarnings.push('语料校准档案未导入');console.warn('Corpus import skipped:', corpusError); }
      }
      await loadProjects();
      await loadProject(id);
      showToast(importWarnings.length?'!':'↓',importWarnings.length?t('toast-imported')+'；'+importWarnings.join('、'):t('toast-imported'));
    } catch (err) { showToast('✕', err.message); }
    e.target.value = '';
    return;
  }
  // Multi-file or non-JSON: classify locally before creating project records.
  const sources=[];
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
      const classification=classifyImportDocument(f.name,text);
      sources.push({
        fileName:f.name,fileBase:importFileBase(f.name),title:cleanImportedTitle(f.name),
        content:stripImportEnvelope(text),type:classification.type,reason:classification.reason,
        projectName:classification.projectName||''
      });
    } catch (err) {
      console.warn('Failed to read file:', f.name, err);
      showToast('✕', '读取失败: ' + f.name);
    }
  }
  if(!sources.length){showToast('✕','未检测到有效内容');e.target.value='';return;}
  showImportPreview(buildImportDataFromSources(sources));
  e.target.value = '';
}

function collectProjectText(proj){
  if(!proj)return'';
  const parts=[];
  const p=proj.project||{};
  if(p.name)parts.push('项目：'+p.name);
  if(p.genre)parts.push('类型：'+p.genre);
  if(p.description)parts.push('简介：'+String(p.description).slice(0,1200));
  (proj.characters||[]).forEach(c=>parts.push('【已有人物】'+[c.name,c.role,c.personality,c.background,c.appearance,c.skills].filter(Boolean).join(' / ')));
  if(p.world_setting)parts.push('【世界观资料，不是章节】\n'+String(p.world_setting).slice(0,5000));
  (proj.outlines||[]).slice(0,4).forEach(o=>parts.push('【已有大纲，不是章节】'+(o.title||'')+'\n'+String(o.content||'').slice(0,4000)));
  (proj.chapters||[]).slice(0,12).forEach(c=>parts.push('【已解析正文章节】'+(c.title||'')+'\n'+String(c.content||'').slice(0,1400)));
  (proj.notes||[]).slice(0,4).forEach(note=>parts.push('【笔记资料，不是章节】'+(note.title||'')+'\n'+String(note.content||'').slice(0,1200)));
  return parts.join('\n\n').slice(0,24000);
}
function parseAiImportAnalysis(text){
  const raw=(text||'').replace(/```json|```/g,'').trim();
  const m=raw.match(/\{[\s\S]*\}/);
  if(!m)return null;
  try{return JSON.parse(m[0]);}catch{return null;}
}
function fallbackImportAnalysis(proj){
  const chapters=proj.chapters||[];
  const outlines=[];
  if(!(proj.outlines||[]).length&&chapters.length){
    outlines.push({title:'章节目录',content:chapters.map((chapter,index)=>(index+1)+'. '+(chapter.title||t('chapter-new'))).join('\n')});
  }
  return{outlines,characters:[],chapters:[]};
}
async function applyImportAnalysis(projectId,analysis){
  if(!analysis)return 0;
  const [os,cs]=await Promise.all([dbByIndex('outlines','project_id',projectId),dbByIndex('characters','project_id',projectId)]);
  const now=Date.now();let added=0;
  const outlineTitles=new Set(os.map(o=>(o.title||'').trim().toLowerCase()));
  if(!os.length){
    for(const [i,o] of (analysis.outlines||[]).slice(0,12).entries()){
      const title=String(o.title||t('outline-new')).trim().slice(0,80);
      if(!title||outlineTitles.has(title.toLowerCase()))continue;
      await dbPut('outlines',{project_id:projectId,title,content:String(o.content||o.summary||'').trim(),sort_order:os.length+i,created_at:now,updated_at:now});
      outlineTitles.add(title.toLowerCase());added++;
    }
  }
  const charNames=new Set(cs.map(c=>(c.name||'').trim().toLowerCase()));
  for(const c of (analysis.characters||[]).slice(0,24)){
    const name=String(c.name||'').trim().slice(0,40);
    if(!name||charNames.has(name.toLowerCase()))continue;
    await dbPut('characters',{project_id:projectId,name,role:String(c.role||'').slice(0,30),personality:String(c.personality||'').slice(0,500),background:String(c.background||'').slice(0,800),appearance:String(c.appearance||'').slice(0,500),skills:String(c.skills||'').slice(0,500),created_at:now});
    charNames.add(name.toLowerCase());added++;
  }
  // AI may summarize or label imported prose, but summaries are never project chapters.
  // Only the local parser and explicit project JSON are allowed to create chapter records.
  return added;
}
async function autoAnalyzeImportedProject(projectId){
  const p=await dbGet('projects',projectId);if(!p)return;
  const proj={project:p,outlines:await dbByIndex('outlines','project_id',projectId),characters:await dbByIndex('characters','project_id',projectId),chapters:await dbByIndex('chapters','project_id',projectId),notes:await dbByIndex('notes','project_id',projectId)};
  const source=collectProjectText(proj);if(!source.trim())return;
  showToast('⊕',t('toast-import-scan'));
  let analysis=null;
  if(aiHasConfig(S.apiConfig)){
    try{
      const needsOutline=!proj.outlines.length;
      const prompt='请分析以下已经由本地导入器分流的写作项目，只补全明确缺失的人物'+(needsOutline?'和一份项目大纲':'')+'。只输出严格 JSON，不要 Markdown。JSON 格式：{"outlines":[{"title":"","content":""}],"characters":[{"name":"","role":"","personality":"","background":"","appearance":"","skills":""}]}。硬性规则：标为“已有大纲”“世界观资料”“笔记资料”的内容都不是正文章节；现有章节已由本地解析完成；不得输出 chapters 字段，不得把章节摘要、标题列表或规划节点写成正文，不得补写原文。已有大纲时 outlines 必须为空；人物未知字段留空，不要猜测。\n\n'+source;
      analysis=parseAiImportAnalysis(await callAITask('import.analysis',prompt,S.apiConfig,'你是写作项目导入分析助手。你只能整理明确人物事实，并在缺少大纲时生成大纲；你无权创建、改写或补写正文章节。'));
      if(analysis){analysis.chapters=[];if(!needsOutline)analysis.outlines=[];}
    }catch(err){console.warn('import analysis failed',err);}
  }
  if(!analysis)analysis=fallbackImportAnalysis(proj);
  const added=await applyImportAnalysis(projectId,analysis);
  if(added>0){await loadProjects();await loadProject(projectId);showToast('★',t('toast-import-scan-done'));}
  else showToast('✓',t('toast-import-scan-done'));
}



// ═══ Outlines ═══
function worldSettingRow(mobile=false){
  const active=S.active?.type==='world',count=countWords(S.proj?.project?.world_setting||'');
  return'<div class="outline-item'+(active?' active':'')+'" onclick="loadWorldContent()'+(mobile?';backToEditor()':'')+'"><span class="oi-icon"><svg class="ic ic-sm"><use href="#ic-globe"/></svg></span><span class="oi-text">世界观与硬设定</span><span class="oi-count">'+count+t('ps-units-2')+'</span></div>';
}
function renderOutlineList(){if(!S.proj)return;const el=document.getElementById('outlineList');const empty=S.proj.outlines.length?'':'<div style="text-align:center;padding:14px;color:var(--text-hint);font-size:12px">'+t('sb-empty-outline')+'</div>';el.innerHTML=worldSettingRow()+empty+S.proj.outlines.map(o=>'<div class="outline-item'+(S.active&&S.active.type==='outline'&&S.active.id===o.id?' active':'')+'" onclick="loadOutlineContent('+Number(o.id)+')"><span class="oi-icon"><svg class="ic ic-sm"><use href="#ic-outline"/></svg></span><span class="oi-text">'+escapeHtml(o.title)+'</span><span class="oi-count">'+(o.content?countWords(o.content):0)+t('ps-units-2')+'</span><button class="oi-del" onclick="event.stopPropagation();delOutline('+Number(o.id)+')">✕</button></div>').join('');}
async function loadWorldContent(){
  if(!S.proj)return false;
  if(S.active?.type==='world')return true;
  if(!(await flushActiveDocument()))return false;
  S.active={type:'world',id:S.proj.project.id,data:S.proj.project};
  setEditorDocument('世界观与硬设定',S.proj.project.world_setting||'');
  renderOutlineList();renderMpOutline();
  return true;
}
async function addOutline(){if(!S.proj)return showToast('✕',t('toast-no-proj'));const now=Date.now(),id=await dbPut('outlines',{project_id:S.proj.project.id,title:t('outline-new'),content:'',sort_order:S.proj.outlines.length,created_at:now});S.proj.outlines.push({id,project_id:S.proj.project.id,title:t('outline-new'),content:'',sort_order:S.proj.outlines.length});renderOutlineList();showToast('✓',t('toast-added'));}
async function loadOutlineContent(id){
  if(S.active?.type==='outline'&&S.active.id===id)return true;
  if(!(await flushActiveDocument()))return false;
  const o=S.proj.outlines.find(x=>x.id===id);
  if(!o)return false;
  S.active={type:'outline',id,data:o};
  setEditorDocument(o.title,o.content||'');
  renderOutlineList();
  return true;
}
async function delOutline(id){
  if(!confirm(t('confirm-delete')))return;
  await dbDel('outlines',id);
  S.proj.outlines=S.proj.outlines.filter(x=>x.id!==id);
  if(S.active?.type==='outline'&&S.active.id===id){S.active=null;setEditorDocument('','');}
  renderOutlineList();
  showToast('✕',t('toast-deleted'));
}


// ═══ Chapters ═══
function renderChapterList(){if(!S.proj)return;const el=document.getElementById('chapterList');if(!S.proj.chapters.length){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:12px">'+t('sb-empty-chapter')+'</div>';return;}el.innerHTML=S.proj.chapters.map(c=>'<div class="outline-item'+(S.active&&S.active.type==='chapter'&&S.active.id===c.id?' active':'')+'" onclick="loadChapterContent('+Number(c.id)+')"><span class="oi-icon"><svg class="ic ic-sm"><use href="#ic-chapter"/></svg></span><span class="oi-text">'+escapeHtml(c.title)+'</span><span class="oi-count">'+(c.word_count||0)+t('ps-units-2')+'</span><button class="oi-del" onclick="event.stopPropagation();delChapter('+Number(c.id)+')">✕</button></div>').join('');}
async function addChapter(){if(!S.proj)return showToast('✕',t('toast-no-proj'));const now=Date.now(),id=await dbPut('chapters',{project_id:S.proj.project.id,title:t('chapter-new'),content:'',word_count:0,sort_order:S.proj.chapters.length,created_at:now,updated_at:now});S.proj.chapters.push({id,project_id:S.proj.project.id,title:t('chapter-new'),content:'',word_count:0});renderChapterList();showToast('✓',t('toast-added'));}
async function loadChapterContent(id){
  if(S.active?.type==='chapter'&&S.active.id===id)return true;
  if(!(await flushActiveDocument()))return false;
  const c=S.proj.chapters.find(x=>x.id===id);
  if(!c)return false;
  S.active={type:'chapter',id,data:c};
  setEditorDocument(c.title,c.content||'');
  renderChapterList();
  return true;
}
async function delChapter(id){
  if(!confirm(t('confirm-delete')))return;
  await dbDel('chapters',id);
  S.proj.chapters=S.proj.chapters.filter(x=>x.id!==id);
  if(S.active?.type==='chapter'&&S.active.id===id){S.active=null;setEditorDocument('','');}
  renderChapterList();
  showToast('✕',t('toast-deleted'));
}

// ═══ Notes ═══
function renderNoteList(){
  if(!S.proj)return;
  const el=document.getElementById('noteList');
  const notes=S.proj.notes||[];
  if(!notes.length){el.innerHTML='<div class="sidebar-empty">'+t('sb-empty-notes')+'</div>';return;}
  el.innerHTML=notes.map(note=>'<div class="outline-item'+(S.active&&S.active.type==='note'&&S.active.id===note.id?' active':'')+'" onclick="loadNoteContent('+Number(note.id)+')"><span class="oi-icon"><svg class="ic ic-sm"><use href="#ic-note"/></svg></span><span class="oi-text">'+escapeHtml(note.title||'未命名笔记')+'</span><span class="oi-count">'+countWords(note.content||'')+t('ps-units-2')+'</span><button class="oi-del" onclick="event.stopPropagation();delNote('+Number(note.id)+')">✕</button></div>').join('');
}
async function addNote(){
  if(!S.proj)return showToast('✕',t('toast-no-proj'));
  const now=Date.now();
  const note={project_id:S.proj.project.id,title:'新笔记',content:'',created_at:now,updated_at:now};
  note.id=await dbPut('notes',note);
  S.proj.notes.unshift(note);
  renderNoteList();
  await loadNoteContent(note.id);
  showToast('✓',t('toast-added'));
}
async function loadNoteContent(id){
  if(S.active?.type==='note'&&S.active.id===id)return true;
  if(!(await flushActiveDocument()))return false;
  const note=S.proj?.notes?.find(item=>item.id===id);
  if(!note)return false;
  S.active={type:'note',id,data:note};
  setEditorDocument(note.title||'',note.content||'');
  renderNoteList();
  return true;
}
async function delNote(id){
  if(!confirm(t('confirm-delete')))return;
  await dbDel('notes',id);
  S.proj.notes=S.proj.notes.filter(item=>item.id!==id);
  if(S.active&&S.active.type==='note'&&S.active.id===id){
    S.active=null;
    setEditorDocument('','');
  }
  renderNoteList();
  renderMpNote();
  showToast('✕',t('toast-deleted'));
}

// ═══ Characters ═══
function renderCharList(){if(!S.proj)return;const el=document.getElementById('charList');if(!S.proj.characters.length){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:12px">'+t('sb-empty-char')+'</div>';return;}el.innerHTML=S.proj.characters.map(c=>'<div class="char-card" onclick="loadCharContent('+Number(c.id)+')"><div class="char-name">'+escapeHtml(c.name)+'</div><span class="char-role">'+escapeHtml(c.role)+'</span><div class="char-desc">'+escapeHtml(c.personality||c.background||t('char-no-desc'))+'</div><div class="char-actions"><button class="char-act-btn" onclick="event.stopPropagation();editChar('+Number(c.id)+')">'+t('action-edit')+'</button><button class="char-act-btn" onclick="event.stopPropagation();delChar('+Number(c.id)+')">'+t('action-delete')+'</button></div></div>').join('');}
function characterDocument(c){
  return '【'+(c.role||'配角')+'】'+(c.name||'')+
    '\n\n性格：'+(c.personality||'')+
    '\n\n背景：'+(c.background||'')+
    '\n\n外貌：'+(c.appearance||'')+
    '\n\n技能：'+(c.skills||'');
}
function parseCharacterDocument(text,fallback){
  const source=String(text||'');
  const role=source.match(/^\s*【([^】]+)】/)?.[1]?.trim()||fallback.role||'配角';
  const section=name=>{
    const match=source.match(new RegExp('(?:^|\\n)'+name+'[：:]([\\s\\S]*?)(?=\\n\\s*(?:性格|背景|外貌|技能)[：:]|$)'));
    return match?match[1].trim():'';
  };
  return{role,personality:section('性格'),background:section('背景'),appearance:section('外貌'),skills:section('技能')};
}
async function loadCharContent(id){
  if(S.active?.type==='character'&&S.active.id===id)return true;
  if(!(await flushActiveDocument()))return false;
  const c=S.proj.characters.find(x=>x.id===id);
  if(!c)return false;
  S.active={type:'character',id,data:c};
  setEditorDocument(c.name,characterDocument(c));
  renderCharList();
  return true;
}
async function editChar(id){
  if(!(await flushActiveDocument()))return;
  const c=S.proj.characters.find(x=>x.id===id);if(!c)return;
  S.editCharId=id;
  document.getElementById('charModalTitle').textContent='✎ 编辑人物';
  document.getElementById('charName').value=c.name;
  document.querySelectorAll('#charRoleGrid .genre-chip').forEach(ch=>{ch.classList.toggle('on',ch.textContent===c.role);});
  document.getElementById('charPers').value=c.personality||'';
  document.getElementById('charBack').value=c.background||'';
  document.getElementById('charLook').value=c.appearance||'';
  document.getElementById('charSkill').value=c.skills||'';
  openModal('charModal');
}
async function saveChar(){
  const name=document.getElementById('charName').value.trim();
  if(!name){showToast('✕',t('toast-enter-char-name'));return;}
  const role=document.querySelector('#charRoleGrid .genre-chip.on')?.textContent||'配角';
  const existing=S.editCharId?S.proj.characters.find(item=>item.id===S.editCharId):null;
  const now=Date.now();
  const d={project_id:S.proj.project.id,name,role,personality:document.getElementById('charPers').value,background:document.getElementById('charBack').value,appearance:document.getElementById('charLook').value,skills:document.getElementById('charSkill').value,created_at:existing?.created_at||now,updated_at:now};
  if(S.editCharId)d.id=S.editCharId;
  await dbPut('characters',d);
  S.editCharId=null;
  closeModal('charModal');
  await loadProject(S.proj.project.id);
  showToast('●',name+' '+t('toast-saved'));
  document.getElementById('charName').value='';
  document.getElementById('charPers').value='';
  document.getElementById('charBack').value='';
  document.getElementById('charLook').value='';
  document.getElementById('charSkill').value='';
  document.getElementById('charModalTitle').textContent=t('mod-char');
}
async function delChar(id){
  if(!confirm(t('confirm-delete')))return;
  await dbDel('characters',id);
  S.proj.characters=S.proj.characters.filter(x=>x.id!==id);
  if(S.active?.type==='character'&&S.active.id===id){S.active=null;setEditorDocument('','');}
  renderCharList();
  showToast('✕',t('toast-deleted'));
}


// ═══ Save ═══
let saveInFlight=null;
let saveInFlightRevision=-1;
let queuedSaveOptions=null;
function saveDoc(options={}){
  if(!S.active||!S.proj)return Promise.resolve(true);
  const revision=S.editorRevision||0;
  if(saveInFlight){
    if(revision!==saveInFlightRevision){
      queuedSaveOptions={silent:options?.silent===true};
    }
    return saveInFlight;
  }
  saveInFlightRevision=revision;
  const task=saveDocOnce(options);
  saveInFlight=task.finally(()=>{
    saveInFlight=null;
    if(queuedSaveOptions){
      const next=queuedSaveOptions;
      queuedSaveOptions=null;
      saveDoc(next).catch(error=>console.error('queued save failed',error));
    }
  });
  return saveInFlight;
}
async function saveDocOnce(options={}){
  if(!S.active||!S.proj)return true;
  const silent=options?.silent===true;
  const btn=document.getElementById('saveBtn');
  btn?.classList.add('saving');
  const text=document.getElementById('mainEditor').value;
  const title=document.getElementById('chapterTitle').value.trim();
  const revision=S.editorRevision||0;
  const activeType=S.active.type;
  const activeId=S.active.id;
  const now=Date.now();
  try{
    if(S.active.type==='world'){
      S.proj.project.world_setting=text;
      S.proj.project.updated_at=now;
      await dbPut('projects',{...S.proj.project});
      renderOutlineList();renderMpOutline();
    }else if(S.active.type==='outline'){
      const o=S.proj.outlines.find(x=>x.id===S.active.id);
      if(!o)throw new Error('当前大纲已不存在');
      Object.assign(o,{title:title||'未命名大纲',content:text,updated_at:now});
      await dbPut('outlines',{...o});
      renderOutlineList();
    }else if(S.active.type==='chapter'){
      const c=S.proj.chapters.find(x=>x.id===S.active.id);
      if(!c)throw new Error('当前章节已不存在');
      Object.assign(c,{title:title||'未命名章节',content:text,word_count:countWords(text),updated_at:now});
      await dbPut('chapters',{...c});
      renderChapterList();
    }else if(S.active.type==='note'){
      const note=S.proj.notes.find(x=>x.id===S.active.id);
      if(!note)throw new Error('当前笔记已不存在');
      Object.assign(note,{title:title||'未命名笔记',content:text,updated_at:now});
      await dbPut('notes',{...note});
      S.proj.notes.sort((a,b)=>(b.updated_at||0)-(a.updated_at||0));
      renderNoteList();
      renderMpNote();
    }else if(S.active.type==='character'){
      const character=S.proj.characters.find(x=>x.id===S.active.id);
      if(!character)throw new Error('当前人物已不存在');
      const parsed=parseCharacterDocument(text,character);
      Object.assign(character,parsed,{name:title||character.name||'未命名人物',updated_at:now});
      await dbPut('characters',{...character});
      renderCharList();
    }else{
      throw new Error('当前资料类型不支持保存');
    }
    S.proj.project.updated_at=now;
    await dbPut('projects',S.proj.project);
    refreshLongBookMemoryUI();
    const savedCurrent=S.active?.type===activeType&&S.active?.id===activeId&&(S.editorRevision||0)===revision;
    if(savedCurrent){
      S.unsaved=false;
      clearTimeout(editorTimer);
      btn?.classList.remove('unsaved');
      if(!silent)showToast('💾','已保存');
    }
    return savedCurrent;
  }catch(error){
    S.unsaved=true;
    btn?.classList.add('unsaved');
    if(!silent)showToast('✕','保存失败：'+(error.message||error));
    throw error;
  }finally{
    btn?.classList.remove('saving');
  }
}

// ═══ AI Modes ═══
const AI_MODES={'润色':{icon:'◇',group:'基础',p:'请对以下文字进行润色，提升语言的流畅度、文学性和表达力，保持原意和风格：'},'扩写':{icon:'↑',group:'基础',p:'请对以下文字进行扩写，增加细节描写、画面感和情感层次：'},'缩写':{icon:'↓',group:'基础',p:'请对以下文字进行精炼缩写，保留核心内容，简洁有力：'},'改写':{icon:'↻',group:'基础',p:'请用不同的表达方式改写以下文字，保持核心意思：'},'续写':{icon:'→',group:'基础',p:'请根据以下内容自然地续写下文，保持风格和情节逻辑：'},'补写':{icon:'⊞',group:'基础',p:'请为以下内容填补缺失的过渡或细节部分：'},'对话':{icon:'❝',group:'描写',p:'请为以下场景创作自然生动的对话，符合人物性格：'},'心理':{icon:'◉',group:'描写',p:'请为以下内容增加细腻的人物心理描写：'},'环境':{icon:'❋',group:'描写',p:'请为以下内容增加生动的环境和氛围描写：'},'战斗':{icon:'⚡',group:'描写',p:'请将以下内容改写为紧张刺激的战斗场景描写：'},'古风':{icon:'◎',group:'风格',p:'请将以下内容改写为古典文学风格：'},'现代':{icon:'▣',group:'风格',p:'请将以下内容改写为现代白话文风格：'},'幽默':{icon:'♪',group:'风格',p:'请将以下内容改写得轻松幽默：'},'悬疑':{icon:'⊕',group:'风格',p:'请将以下内容改写为悬疑神秘风格：'},'唯美':{icon:'✿',group:'风格',p:'请将以下内容改写为唯美诗意风格：'},'霸气':{icon:'△',group:'风格',p:'请将以下内容改写为霸气豪迈风格：'},'分析':{icon:'≡',group:'分析',p:'请分析以下文字的结构、节奏和表达问题：'},'校对':{icon:'✓',group:'分析',p:'请检查以下文字的错别字、语病和标点错误：'},'节奏':{icon:'♫',group:'分析',p:'请分析以下文字的叙事节奏：'},'情感':{icon:'♥',group:'分析',p:'请分析以下文字的情感层次和情绪弧度：'},'大纲':{icon:'☰',group:'创作',p:'请根据以下信息生成详细的故事大纲：'},'人物':{icon:'◉',group:'创作',p:'请根据以下信息生成详细的人物档案：'},'伏笔':{icon:'⊹',group:'创作',p:'请为以下故事设计3-5个巧妙的伏笔：'},'转折':{icon:'⇄',group:'创作',p:'请为以下故事情节设计2-3个出乎意料的转折：'},'结局':{icon:'■',group:'创作',p:'请为以下故事提供3种不同风格的结局：'},'翻译':{icon:'⊕',group:'工具',p:'请将以下中文内容翻译为英文：'},'总结':{icon:'✎',group:'工具',p:'请为以下内容生成简洁摘要：'},'标题':{icon:'¶',group:'工具',p:'请为以下内容生成5个吸引人的标题：'},'降AI':{icon:'▷',group:'工具',p:'请将以下AI生成的文字重写为自然的人类写作风格。要求：1.使用口语化、不规则的句式 2.加入个人化的表达和语气词 3.偶尔使用短句或碎片化表达 4.避免完美排比和过度修饰 5.添加一些即兴感和不完美感 6.保持核心意思不变 7.让文字读起来像真人随手写的，而不是AI精心构造的。输出重写后的全文：'},'查AI':{icon:'⊕',group:'工具',p:'请分析以下文字的AI生成特征。从句式规律性、词汇丰富度、情感自然度、结构完美度、口语化程度、重复冗余度六个维度各给0-100评分，给出综合AI概率评估和具体特征描述。⚠️ 仅供参考，不构成正式判定。文字：'}};
function renderAiModeGrid(){const el=document.getElementById('aiModeGrid'),g={};for(const[k,v]of Object.entries(AI_MODES)){if(!g[v.group])g[v.group]=[];g[v.group].push(k);}let h='';for(const[label,keys]of Object.entries(g)){h+='<div class="mode-group" data-mode-group="'+label+'"><div class="mode-group-title">'+t('grp-'+label)+'</div><div class="mode-grid">';for(const k of keys)h+='<button class="mode-btn'+(S.aiMode===k?' selected':'')+'" data-mode="'+k+'" onclick="selectMode(this,\''+k+'\')"><span class="micon">'+wwAiModeIcon(k)+'</span>'+t('mode-'+k)+'</button>';h+='</div></div>';}el.innerHTML=h;}
function selectMode(btn,m){document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');S.aiMode=m;updateContextBar();}
function setTemp(v,btn){btn.parentElement.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');S.aiTemp=v;}
function setLen(v,btn){btn.parentElement.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');S.aiLen=v;}


// ═══ API ═══
const PROVIDERS={claude:{url:'https://api.anthropic.com/v1/messages',model:'claude-sonnet-4-20250514',type:'anthropic'},openai:{url:'https://api.openai.com/v1/chat/completions',model:'gpt-4o',type:'openai'},deepseek:{url:'https://api.deepseek.com/v1/chat/completions',model:'deepseek-chat',type:'openai'},xiaomi:{url:'https://api.xiaomimimo.com/v1/chat/completions',model:'mimo-v2.5-pro',type:'openai'},qwen:{url:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',model:'qwen-plus',type:'openai'},zhipu:{url:'https://open.bigmodel.cn/api/paas/v4/chat/completions',model:'glm-4-flash',type:'openai'},moonshot:{url:'https://api.moonshot.cn/v1/chat/completions',model:'moonshot-v1-8k',type:'openai'},siliconflow:{url:'https://api.siliconflow.cn/v1/chat/completions',model:'deepseek-ai/DeepSeek-V3',type:'openai'},openrouter:{url:'https://openrouter.ai/api/v1/chat/completions',model:'anthropic/claude-sonnet-4',type:'openai'},gemini:{url:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',model:'gemini-2.0-flash',type:'openai'},grok:{url:'https://api.x.ai/v1/chat/completions',model:'grok-3',type:'openai'},custom:{url:'',model:'',type:'openai'}};
const TRANSIENT_ERRORS=[429,500,502,503,504];
function _isTransient(err){const m=err.message?.match?.(/HTTP (\d+)/);return m&&TRANSIENT_ERRORS.includes(+m[1]);}
async function _sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function aiHasConfig(conf){
  if(!conf)return false;
  if(usesBrowserAPI(conf)){
    const p=PROVIDERS[conf.provider]||PROVIDERS.custom;
    const protocol=WWApiAdapter.inferProtocol({...conf,type:conf.type||p.type});
    const auth=WWApiAdapter.resolveAuthMode(conf,protocol);
    const hasAuth=auth==='none'||!!conf.key;
    return !!(hasAuth&&conf.provider&&(conf.provider!=='custom'||(conf.baseUrl&&conf.model)));
  }
  return !!conf.provider;
}
function providerEndpoint(conf,p){
  const protocol=WWApiAdapter.inferProtocol({...conf,type:conf.type||p.type});
  return WWApiAdapter.normalizeEndpoint(conf.baseUrl,protocol,p.url,!!conf.exactEndpoint);
}
function _parseMessages(prompt,systemPrompt){const msgs=[];if(systemPrompt)msgs.push({role:'system',content:systemPrompt});msgs.push({role:'user',content:prompt});return msgs;}
function _runtimeConfig(conf,p){
  return{
    ...conf,
    model:conf.model||p.model,
    type:conf.type||p.type,
    fallbackUrl:p.url,
    timeoutMs:Number(conf.timeout||60000),
    browserDirect:true
  };
}
async function _backendRequest(conf,msgs){
  const timeout=Math.max(5000,Number(conf.timeout||60000));
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch('/api/ai',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({provider:conf.provider,model:conf.model||'',messages:msgs}),
      signal:controller.signal
    });
    const raw=await response.text();
    let data={};
    try{data=raw?JSON.parse(raw):{};}catch(_){data=raw;}
    if(!response.ok||data?.error){
      const detail=typeof data==='string'?data:(data?.error?.message||data?.error||data?.message||response.statusText);
      throw new Error('HTTP '+response.status+': '+String(detail||'后端请求失败').slice(0,600));
    }
    const text=WWApiAdapter.parseResponse(data);
    if(!text)throw new Error('后端返回成功，但没有识别到文本内容');
    return{text,usage:WWApiAdapter.parseUsage(data)};
  }catch(error){
    if(error?.name==='AbortError')throw new Error('请求超时或已中断');
    if(/^HTTP \d+:/.test(error?.message||'')||String(error?.message||'').includes('没有识别到文本内容'))throw error;
    throw new Error('无法连接同源后端：请检查服务是否启动、反向代理和网络设置');
  }finally{clearTimeout(timer);}
}
async function _backendStream(conf,msgs,onChunk){
  const timeout=Math.max(5000,Number(conf.timeout||60000));
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch('/api/ai/stream',{
      method:'POST',
      headers:{'Content-Type':'application/json',Accept:'text/event-stream'},
      body:JSON.stringify({provider:conf.provider,model:conf.model||'',messages:msgs}),
      signal:controller.signal
    });
    if(!response.ok){
      const raw=await response.text();
      let data={};
      try{data=raw?JSON.parse(raw):{};}catch(_){data=raw;}
      const detail=typeof data==='string'?data:(data?.error?.message||data?.error||data?.message||response.statusText);
      throw new Error('HTTP '+response.status+': '+String(detail||'后端请求失败').slice(0,600));
    }
    if(!response.body)throw new Error('当前浏览器不支持流式响应');
    const reader=response.body.getReader();
    const decoder=new TextDecoder();
    let buffer='',text='',usage=null;
    const consume=record=>{
      const eventName=record.split(/\r?\n/).find(line=>line.startsWith('event:'))?.slice(6).trim();
      const dataLines=record.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim());
      if(!dataLines.length)return;
      let data={};
      try{data=JSON.parse(dataLines.join('\n'));}catch(_){return;}
      if(eventName==='delta'&&data.text){text+=data.text;if(onChunk)onChunk(data.text);}
      if(eventName==='done'&&data.usage)usage=WWApiAdapter.parseUsage(data);
      if(eventName==='error')throw new Error(data.error||'后端流式请求失败');
    };
    while(true){
      const{value,done}=await reader.read();
      buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});
      const records=buffer.split(/\r?\n\r?\n/);
      buffer=records.pop()||'';
      records.forEach(consume);
      if(done)break;
    }
    if(buffer.trim())consume(buffer);
    if(!text)throw new Error('后端流式连接已结束，但没有返回文本');
    return{text,usage};
  }catch(error){
    if(error?.name==='AbortError')throw new Error('请求超时或已中断');
    if(error instanceof TypeError)throw new Error('无法连接同源后端：请检查服务、反向代理和网络设置');
    throw error;
  }finally{
    clearTimeout(timer);
  }
}
async function callAI(prompt,conf,systemPrompt,options={}){
  const pr=conf.provider||'claude',p=PROVIDERS[pr]||PROVIDERS.custom;
  const msgs=_parseMessages(prompt,systemPrompt);
  const direct=usesBrowserAPI(conf);
  let lastErr=null;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const result=direct
        ?await WWApiAdapter.request(_runtimeConfig(conf,p),msgs,{maxTokens:Number(options.maxTokens||2000)})
        :await _backendRequest(conf,msgs);
      if(result.usage)updateUsageDisplay(result.usage);
      return result.text;
    }catch(e){lastErr=e;if(_isTransient(e)&&attempt<2){await _sleep(1000*Math.pow(2,attempt));continue;}throw e;}
  }
  throw lastErr;
}
async function callAIStream(prompt,conf,systemPrompt,onChunk,options={}){
  if(!usesBrowserAPI(conf)){
    const result=await _backendStream(conf,_parseMessages(prompt,systemPrompt),onChunk);
    if(result.usage)updateUsageDisplay(result.usage);
    return result.text;
  }
  const pr=conf.provider||'claude',p=PROVIDERS[pr]||PROVIDERS.custom;
  const result=await WWApiAdapter.stream(
    _runtimeConfig(conf,p),
    _parseMessages(prompt,systemPrompt),
    {maxTokens:Number(options.maxTokens||2000),onChunk}
  );
  if(result.usage)updateUsageDisplay(result.usage);
  return result.text;
}
async function callAITask(taskId,prompt,conf,systemPrompt){
  const task=WWAITaskContract.record(taskId,prompt,systemPrompt,false);
  return callAI(prompt,conf,systemPrompt,{maxTokens:task.maxTokens});
}
async function callAITaskStream(taskId,prompt,conf,systemPrompt,onChunk){
  const task=WWAITaskContract.record(taskId,prompt,systemPrompt,true);
  return callAIStream(prompt,conf,systemPrompt,onChunk,{maxTokens:task.maxTokens});
}
function showStreamingResult(elementId){const el=document.getElementById(elementId);if(!el)return;el.textContent='';el.classList.add('streaming-cursor');}
function hideStreamingCursor(){const el=document.getElementById('arpText');if(el)el.classList.remove('streaming-cursor');}
function updateUsageDisplay(usage){
  const total=(usage.input||0)+(usage.output||0);
  const totalStr=total>1000?(total/1000).toFixed(1)+'k':total;
  const inStr=(usage.input||0)>1000?((usage.input||0)/1000).toFixed(1)+'k':usage.input||0;
  const outStr=(usage.output||0)>1000?((usage.output||0)/1000).toFixed(1)+'k':usage.output||0;
  ['ctxUsedText','mpCtxUsedText'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    el.textContent='上次实际：输入 '+inStr+' · 输出 '+outStr+' · 合计 '+totalStr+' tokens';
    el.hidden=false;
  });
}
function buildCtx(options={}){return buildProjectAIContext({validate:options.validate!==false,preferDigest:options.preferDigest!==false}).text;}


// ═══ AI Memory ═══
function buildMemoryContext(){
  if(!S.proj||!S.aiMemories.length)return'';
  const projMem=S.aiMemories.filter(m=>m.project_id===S.proj.project.id&&m.enabled!==false&&m.source!=='longbook').sort((a,b)=>(b.updated_at||b.created_at||0)-(a.updated_at||a.created_at||0)).slice(0,40);
  if(!projMem.length)return'';
  const lines=[];let chars=0;
  for(const memory of projMem){const line='['+(memory.category||'note')+(memory.source?' · '+memory.source:'')+'] '+(memory.title?memory.title+'：':'')+memory.content;if(chars+line.length>16000)break;lines.push(line);chars+=line.length;}
  if(lines.length<projMem.length)lines.push(`[另有 ${projMem.length-lines.length} 条人工记忆因本次预算未自动注入]`);
  return'【项目记忆 — 按来源与分类参考】\n'+lines.join('\n');
}
function writingSystemPrompt(){let prompt=typeof wwSystemPrompt==='function'?wwSystemPrompt():'你是一位专业的中文写作助手。';const memory=buildMemoryContext();if(memory)prompt+='\n\n'+memory;return prompt;}
async function loadMemories(){
  if(!db)return;
  S.aiMemories=await dbAll('aiMemories');
  renderMemoryList();
  refreshLongBookMemoryUI();
}
function refreshLongBookMemoryUI(message=''){
  const mode=getAIContextMode();for(const id of ['aiContextMode','mpAiContextMode']){const select=document.getElementById(id);if(select)select.value=mode;}
  const chapters=liveProjectChapters(),memories=projectLongBookMemories(),state=longBookMemoryFreshness(chapters,memories),digest=state.digest;
  const factsLabel=state.foundationFresh?`设定/大纲已同步 ${Number(state.foundation.source_chars||0).toLocaleString()} 字`:`设定/大纲待读取 ${Number(state.foundationPacket.sourceText.length||0).toLocaleString()} 字`;
  const status=message||(digest?`${factsLabel} · 正文 ${state.freshIds.size}/${chapters.length} 章${state.staleCount?' · '+state.staleCount+' 章待更新':''} · 全书记忆 ${Number(digest.compressed_chars||digest.content?.length||0).toLocaleString()} 字`:`${factsLabel} · 正文 ${chapters.length} 章尚未建立全书记忆`);
  for(const id of ['longContextStatus','mpLongContextStatus','longBookMemoryStatus']){const el=document.getElementById(id);if(el)el.textContent=status;}
  const arcMemories=memories.filter(memory=>memory.kind==='arc_summary').sort((a,b)=>Number(a.coverage_start)-Number(b.coverage_start));
  const summary=document.getElementById('longBookMemoryAuditSummary'),list=document.getElementById('longBookMemoryAuditList');
  if(summary)summary.textContent=`压缩记录 · ${state.foundation?1:0} 项目事实 / ${state.summaries.length} 章 / ${arcMemories.length} 阶段 / ${digest?1:0} 全书`;
  if(list){
    const rows=[];
    if(state.foundation)rows.push(`<div class="longbook-audit-row"><span>${escapeHtml(state.foundation.title||'项目资料记忆')}</span><span>${Number(state.foundation.chunks||1)} 块 · ${Number(state.foundation.source_chars||0).toLocaleString()} 字 · ${state.foundationFresh?'已同步':'待更新'}</span></div>`);
    rows.push(...state.summaries.sort((a,b)=>Number(a.coverage_index)-Number(b.coverage_index)).map(memory=>`<div class="longbook-audit-row"><span>${escapeHtml(memory.chapter_title||memory.title||'章节记忆')}</span><span>${Number(memory.chunks||1)} 块 · ${Number(memory.source_chars||0).toLocaleString()} 字 · ${state.freshIds.has(String(memory.chapter_id))?'已同步':'待更新'}</span></div>`));
    rows.push(...arcMemories.map(memory=>`<div class="longbook-audit-row"><span>${escapeHtml(memory.title||'阶段记忆')}</span><span>第 ${Number(memory.coverage_start)+1}–${Number(memory.coverage_end)+1} 章</span></div>`));
    if(digest)rows.push(`<div class="longbook-audit-row"><span>${escapeHtml(digest.title||'全书记忆')}</span><span>${Number(digest.compressed_chars||digest.content?.length||0).toLocaleString()} 字 · ${state.complete?'已同步':'待更新'}</span></div>`);
    list.innerHTML=rows.join('')||'更新全书记忆后，可在这里核对每章和每个阶段的覆盖记录。';
  }
}
function setLongBookMemoryBusy(busy){for(const id of ['longBookMemoryBtn']){const button=document.getElementById(id);if(button){button.disabled=busy;button.textContent=busy?'正在分批阅读…':'读取全书并更新';}}document.querySelectorAll('.long-context-head button').forEach(button=>{button.disabled=busy;button.textContent=busy?'阅读中…':button.closest('.long-context-control-mobile')?'更新记忆':'更新全书记忆';});}
async function updateLongBookMemory(){
  if(!S.proj)return showToast('✕',t('toast-no-proj'));
  if(!aiHasConfig(S.apiConfig)){showToast('⚙',t('toast-no-api'));openModal('apiModal');return;}
  if(!(await flushActiveDocument()))return;
  const chapters=liveProjectChapters();
  const existing=projectLongBookMemories();
  const foundation=projectFactPacket();
  const estimatedCalls=WWLongBookMemory.estimateRequests({chapters,foundation,existingMemories:existing});
  if(!confirm(`将先完整分块读取世界观、大纲和人物卡（${foundation.sourceText.length.toLocaleString()} 字符），再读取全部 ${chapters.length} 章，预计约 ${estimatedCalls} 次模型请求；未改资料与章节会复用已有记忆。原始资料和正文不会写入记忆，只保存压缩结果。继续吗？`))return;
  setLongBookMemoryBusy(true);
  try{
    const result=await WWLongBookMemory.build({
      chapters,
      foundation,
      existingMemories:existing,
      onProgress:progress=>{if(progress.phase==='foundation')refreshLongBookMemoryUI(`读取项目设定与大纲${progress.reused?'（复用）':'（分块压缩）'}`);else if(progress.phase==='chapter')refreshLongBookMemoryUI(`读取章节 ${progress.chapterIndex+1}/${progress.chapterCount} · ${progress.title}${progress.reused?'（复用）':''}`);else if(progress.phase==='arc')refreshLongBookMemoryUI(`压缩阶段 ${progress.arcIndex+1}/${progress.arcCount}`);else refreshLongBookMemoryUI('正在合并全书记忆…');},
      summarize:({taskId,prompt})=>callAITask(taskId,prompt,S.apiConfig,'你是长篇小说记忆压缩器。必须忠于输入、保留因果和人物知识边界、标出矛盾与不确定项，禁止补写剧情。')
    });
    const now=Date.now(),all=[result.foundationMemory,...result.chapterMemories,...result.arcMemories,result.digestMemory].filter(Boolean),existingByKey=new Map(existing.map(memory=>[memory.longbook_key,memory]));
    const keep=new Set();
    for(const memory of all){
      const previous=existingByKey.get(memory.longbook_key),row={...(previous||{}),...memory,project_id:S.proj.project.id,scope:'project',created_at:previous?.created_at||now,updated_at:now};
      if(previous?.id)row.id=previous.id;
      await dbPut('aiMemories',row);keep.add(memory.longbook_key);
    }
    for(const memory of existing){if(!keep.has(memory.longbook_key))await dbDel('aiMemories',memory.id);}
    await loadMemories();
    refreshLongBookMemoryUI(`已读取设定/大纲 ${result.stats.foundationChars.toLocaleString()} 字符 · 正文 ${result.stats.chapterCount} 章 · 新分析 ${result.stats.analyzedChapters} 章 · 复用 ${result.stats.reusedChapters} 章`);
    setAIContextMode('smart');
    showToast('✓','全书分层记忆已更新');
  }catch(error){refreshLongBookMemoryUI('更新失败：'+String(error.message||error).slice(0,160));showToast('✕',error.message||'全书记忆更新失败');}
  finally{setLongBookMemoryBusy(false);}
}
function renderMemoryList(){
  const el=document.getElementById('memoryList');
  if(!el)return;
  const projMem=S.proj?S.aiMemories.filter(m=>m.project_id===S.proj.project.id&&(m.source!=='longbook'||m.kind==='book_digest')):[];
  if(!projMem.length){
    el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-hint);font-size:12px">暂无记忆条目<br><span style="font-size:11px;opacity:0.7">添加记忆后，AI会自动参考这些信息</span></div>';
    return;
  }
  const cats={plot:'☐ 剧情',style:'✎ 风格',world:'◆ 世界观',char:'● 人物',note:'📝 备注',rule:'─ 规则'};
  el.innerHTML=projMem.map(m=>{
    const sync=m.backend_sync_status==='failed'?' · 后台待同步':(m.backend_sync_status==='stale'?' · 后台未更新':(m.backend_id?' · 后台已关联':''));
    return '<div class="char-card" data-memory-id="'+Number(m.id)+'" style="position:relative"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:6px"><span style="font-size:10px;padding:1px 6px;border-radius:10px;background:var(--accent-glow);color:var(--accent)">'+escapeHtml(cats[m.category]||(window.wwCategoryLabel?window.wwCategoryLabel(m.category):m.category))+(m.source?' · '+escapeHtml(m.source):'')+escapeHtml(sync)+'</span><div style="display:flex;gap:4px;flex-shrink:0" class="mem-actions"><button class="char-act-btn" onclick="event.stopPropagation();editMemory('+Number(m.id)+')">'+t('action-edit')+'</button><button class="char-act-btn" onclick="event.stopPropagation();delMemory('+Number(m.id)+')">'+t('action-delete')+'</button></div></div>'+(m.title?'<div style="font-size:12px;font-weight:700;margin-bottom:3px">'+escapeHtml(m.title)+'</div>':'')+'<div style="font-size:12px;color:var(--text-secondary);line-height:1.6">'+escapeHtml(m.content)+'</div></div>';
  }).join('');
}
const BUILTIN_MEMORY_CATEGORIES={plot:'剧情',style:'风格',world:'世界观',char:'人物',note:'备注',rule:'规则'};
function newBackendMemoryId(){return'memory-browser-'+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));}
function memoryCategoryKey(chip){
  if(!chip)return'note';
  if(chip.dataset.categoryId)return chip.dataset.categoryId;
  const label=chip.textContent.trim();
  return Object.entries(BUILTIN_MEMORY_CATEGORIES).find(([,name])=>label.endsWith(name))?.[0]||'note';
}
async function saveMemory(){
  const content=document.getElementById('memContent').value.trim();
  if(!content){showToast('✕',t('toast-enter-memory'));return;}
  const catEl=document.querySelector('#memCatGrid .genre-chip.on');
  const catKey=memoryCategoryKey(catEl);
  const titleInput=document.getElementById('memTitle');
  try{
    await remember(content,{...(S.pendingMemoryMeta||{}),id:S.editMemoryId||undefined,title:titleInput?titleInput.value.trim():(S.pendingMemoryMeta?.title||''),category:catKey,backend:!!document.getElementById('memBackend')?.checked});
    S.editMemoryId=null;S.pendingMemoryMeta=null;
    document.getElementById('memContent').value='';if(document.getElementById('memTitle'))document.getElementById('memTitle').value='';if(document.getElementById('memBackend'))document.getElementById('memBackend').checked=false;
    closeModal('memoryModal');
  }catch(e){showToast('✕',e.message);}
}

async function remember(content,options={}){
  const value=String(content||'').trim();
  if(!value)throw new Error('记忆内容不能为空');
  if(!S.proj)throw new Error(t('toast-no-proj'));
  const projectId=S.proj.project.id,projectName=S.proj.project.name;
  const now=Date.now();
  const existing=options.id?S.aiMemories.find(m=>m.id===options.id&&m.project_id===projectId):null;
  if(options.id&&!existing)throw new Error('当前项目中找不到这条记忆，已阻止跨项目覆盖');
  const hasTitle=Object.prototype.hasOwnProperty.call(options,'title');
  const wantsBackend=!!options.backend&&!WW_BROWSER_API_MODE;
  const row={...(existing||{}),project_id:projectId,category:options.category||existing?.category||'note',title:hasTitle?String(options.title||'').trim():String(existing?.title||'').trim(),content:value,source:options.source||existing?.source||'manual',scope:options.scope||existing?.scope||'project',enabled:options.enabled??existing?.enabled??true,created_at:existing?.created_at||now,updated_at:now};
  if(wantsBackend){row.backend_id=row.backend_id||newBackendMemoryId();row.backend_sync_status='pending';}
  if(options.id)row.id=options.id;
  const id=await dbPut('aiMemories',row);row.id=row.id||id;
  let backendError=null;
  if(wantsBackend){
    try{
      const response=await apiJSON('/api/memories',{method:'POST',body:JSON.stringify({id:row.backend_id,title:row.title,content:row.content,category:row.category,source:row.source,scope:row.scope,project:projectName,enabled:row.enabled})});
      row.backend_id=response.memory?.id||row.backend_id||'';
      row.backend_sync_status='synced';row.backend_synced_at=Date.now();delete row.backend_sync_error;
      await dbPut('aiMemories',row);
    }catch(error){
      backendError=error;row.backend_sync_status='failed';row.backend_sync_error=String(error.message||error).slice(0,300);await dbPut('aiMemories',row);
    }
  }else if(existing?.backend_id&&!WW_BROWSER_API_MODE){
    row.backend_sync_status='stale';row.backend_sync_error='本次只更新了浏览器记忆，Go 后台仍保留上一个版本';await dbPut('aiMemories',row);
  }
  await loadMemories();
  if(backendError)showToast('!','本地记忆已保存；Go 后台写入失败，可编辑后重试：'+row.backend_sync_error);
  else showToast('◆',wantsBackend?'已写入项目记忆与后台记忆':'记忆已保存');
  updateContextBar();return{...row,backend_error:backendError};
}

function stageMemory(content,options={}){
  if(!S.proj){showToast('✕',t('toast-no-proj'));return;}
  S.editMemoryId=null;S.pendingMemoryMeta={source:options.source||'manual',scope:options.scope||'project',title:options.title||'',category:options.category||'note'};
  const input=document.getElementById('memContent');if(input)input.value=String(content||'');
  const title=document.getElementById('memTitle');if(title)title.value=options.title||'';
  const backend=document.getElementById('memBackend');if(backend)backend.checked=!!options.backend&&!WW_BROWSER_API_MODE;
  document.querySelectorAll('#memCatGrid .genre-chip').forEach(chip=>chip.classList.toggle('on',chip.dataset.categoryId===S.pendingMemoryMeta.category||chip.textContent.includes(({plot:'剧情',style:'风格',world:'世界观',char:'人物',note:'备注',rule:'规则'})[S.pendingMemoryMeta.category]||'备注')));
  openModal('memoryModal');
}
async function delMemory(id){
  const memory=S.proj?S.aiMemories.find(item=>item.id===id&&item.project_id===S.proj.project.id):null;
  if(!memory){showToast('✕','当前项目中找不到这条记忆，已阻止跨项目删除');await loadMemories();return;}
  if(!confirm('删除此记忆？'))return;
  if(memory.backend_id&&!WW_BROWSER_API_MODE){
    try{await apiJSON('/api/memories?id='+encodeURIComponent(memory.backend_id),{method:'DELETE'});}
    catch(error){if(error.status!==404){showToast('✕','Go 后台删除失败，本地记忆已保留：'+(error.message||error));return;}}
  }
  await dbDel('aiMemories',id);
  S.aiMemories=S.aiMemories.filter(m=>m.id!==id);
  renderMemoryList();
  showToast('✕',t('toast-deleted'));
  updateContextBar();
}
function editMemory(id){
  const m=S.proj?S.aiMemories.find(x=>x.id===id&&x.project_id===S.proj.project.id):null;
  if(!m){showToast('✕','当前项目中找不到这条记忆，已阻止跨项目编辑');loadMemories();return;}
  S.editMemoryId=id;
  S.pendingMemoryMeta={source:m.source||'manual',scope:m.scope||'project',title:m.title||'',category:m.category||'note'};
  if(document.getElementById('memTitle'))document.getElementById('memTitle').value=m.title||'';
  document.getElementById('memContent').value=m.content;
  const backend=document.getElementById('memBackend');if(backend)backend.checked=!WW_BROWSER_API_MODE&&!!(m.backend_id||m.backend_sync_status==='failed');
  const catMap2={plot:'☐ 剧情',style:'✎ 风格',world:'◆ 世界观',char:'● 人物',note:'📝 备注',rule:'─ 规则'};
  document.querySelectorAll('#memCatGrid .genre-chip').forEach(c=>c.classList.toggle('on',c.dataset.categoryId===m.category||c.textContent===catMap2[m.category]));
  openModal('memoryModal');
}
window.wwRemember=remember;
window.wwStageMemory=stageMemory;
function toggleMemCat(el){el.parentElement.querySelectorAll('.genre-chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');}
function selectProvider(el,p){el.parentElement.querySelectorAll('.provider-chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');S.selectedProvider=p;const cur=el.closest('.provider-grid').id;const d={claude:'claude-sonnet-4-20250514',openai:'gpt-4o',deepseek:'deepseek-chat',xiaomi:'mimo-v2.5-pro',qwen:'qwen-plus',zhipu:'glm-4-flash',moonshot:'moonshot-v1-8k',siliconflow:'deepseek-ai/DeepSeek-V3',openrouter:'anthropic/claude-sonnet-4',gemini:'gemini-2.0-flash',grok:'grok-3',custom:''};const modelEl=cur==='sProviderGrid'?document.getElementById('sApiModel'):document.getElementById('apiModel');const urlEl=cur==='sProviderGrid'?document.getElementById('sApiBaseUrl'):document.getElementById('apiBaseUrl');if(modelEl)modelEl.placeholder=d[p]||'填写目标模型名';if(urlEl)urlEl.placeholder=PROVIDERS[p]?.url||'https://api.example.com/v1';}
function apiFormConfig(prefix=''){
  const fieldStem=prefix?prefix+'Api':'api';
  const fieldValue=name=>{
    const field=document.getElementById(fieldStem+name);
    if(!field)throw new Error('API 设置表单不完整：缺少 '+fieldStem+name);
    return field.value.trim();
  };
  const key=fieldValue('Key');
  const baseUrl=fieldValue('BaseUrl');
  const provider=S.selectedProvider||'claude';
  const protocol=fieldValue('Protocol')||'auto';
  const authMode=fieldValue('AuthMode')||'auto';
  const timeoutSeconds=Math.max(5,Math.min(600,Number(fieldValue('Timeout')||60)));
  const contextLimit=Math.max(0,Number(fieldValue('ContextLimit')||0));
  const customHeaders=fieldValue('Headers');
  const bodyOverrides=fieldValue('BodyOverrides');
  const bridgeUrl=fieldValue('BridgeUrl');
  const bridgeToken=fieldValue('BridgeToken');
  const exactEndpoint=!!document.getElementById(fieldStem+'ExactEndpoint')?.checked;
  const clearKey=!!document.getElementById(fieldStem+'ClearKey')?.checked;
  const clearHeaders=!!document.getElementById(fieldStem+'ClearHeaders')?.checked;
  WWApiAdapter.parseCustomHeaders(customHeaders);
  WWApiAdapter.parseBodyOverrides(bodyOverrides);
  const providerType=PROVIDERS[provider]?.type||'openai';
  const inferred=WWApiAdapter.inferProtocol({provider,protocol,type:providerType,baseUrl});
  return{provider,key:key||(WW_BROWSER_API_MODE?'':'backend'),model:fieldValue('Model'),baseUrl,type:WWApiAdapter.protocolType(inferred),protocol,authMode,timeout:timeoutSeconds*1000,contextLimit,customHeaders,bodyOverrides,exactEndpoint,bridgeUrl,bridgeToken,clearKey,clearHeaders,transport:WW_BROWSER_API_MODE?'browser':'backend'};
}
async function persistApiConfig(conf){
  if(WW_BROWSER_API_MODE){
    if(conf.clearKey)conf.key='';
    if(conf.clearHeaders)conf.customHeaders='';
    const protocol=WWApiAdapter.inferProtocol(conf);
    if(WWApiAdapter.resolveAuthMode(conf,protocol)!=='none'&&!conf.key)throw new Error('当前鉴权方式需要填写 API Key；无密钥服务请选择“无鉴权”');
    if(conf.provider==='custom'&&!conf.baseUrl)throw new Error('自定义服务需要填写 Base URL');
    if(conf.provider==='custom'&&!conf.model)throw new Error('自定义服务需要填写模型名称');
    apiRequestInspection(conf);
    const stored={...conf};
    delete stored.clearKey;
    delete stored.clearHeaders;
    S.apiConfig=stored;
    localStorage.setItem('ww_api',JSON.stringify(stored));
    return;
  }
  const headers=WWApiAdapter.parseCustomHeaders(conf.customHeaders);
  const bodyOverrides=WWApiAdapter.parseBodyOverrides(conf.bodyOverrides);
  await apiJSON('/api/config',{method:'POST',body:JSON.stringify({
    provider:conf.provider,
    model:conf.model,
    type:conf.type,
    protocol:conf.protocol,
    auth_mode:conf.authMode,
    request_timeout_ms:conf.timeout,
    context_window:conf.contextLimit,
    exact_endpoint:conf.exactEndpoint,
    api_key:conf.key==='backend'?'':conf.key,
    clear_api_key:conf.clearKey,
    base_url:conf.baseUrl,
    extra:conf.clearHeaders?{}:(Object.keys(headers).length?{headers}:undefined),
    extra_body:bodyOverrides
  })});
  S.apiConfig={provider:conf.provider,key:'backend',model:conf.model,baseUrl:conf.baseUrl,type:conf.type,protocol:conf.protocol,authMode:conf.authMode,timeout:conf.timeout,contextLimit:conf.contextLimit,customHeaders:'',bodyOverrides:conf.bodyOverrides,exactEndpoint:conf.exactEndpoint,bridgeUrl:'',bridgeToken:'',transport:'backend'};
  localStorage.setItem('ww_api',JSON.stringify(S.apiConfig));
}
function apiRequestInspection(conf){
  const p=PROVIDERS[conf.provider]||PROVIDERS.custom;
  return WWApiAdapter.inspectRequest(_runtimeConfig(conf,p),_parseMessages('Reply with exactly: OK',''),{maxTokens:64,stream:false});
}
function renderApiDiagnostic(prefix,conf,error){
  const target=document.getElementById(prefix?'sApiDiagnostic':'apiDiagnostic');
  if(!target)return null;
  const lines=[];
  let inspection=null;
  try{
    inspection=apiRequestInspection(conf);
    if(inspection.transport==='bridge'){
      lines.push('HTTPS 桥 URL: '+inspection.endpoint);
      lines.push('桥后上游 URL: '+inspection.upstreamEndpoint);
    }else{
      lines.push('最终 URL: '+inspection.endpoint);
    }
    lines.push('协议: '+inspection.protocol+' · 方法: '+inspection.method);
    lines.push('请求头（密钥已隐藏）:\n'+JSON.stringify(inspection.headers,null,2));
    lines.push('请求体:\n'+JSON.stringify(inspection.body,null,2));
    const multiplierMatch=String(conf.model||'').match(/^(.+?)(\d+(?:\.\d+)?x)$/i);
    if(multiplierMatch&&/(?:luna|sol|terra|opus|sonnet|haiku)$/i.test(multiplierMatch[1])){
      lines.push('模型提醒: 末尾“'+multiplierMatch[2]+'”看起来像价格/额度倍率，不一定属于模型 ID；请点“获取模型”核对。');
    }
  }catch(prepareError){
    if(!error)error=prepareError;
  }
  if(error){
    const meta=['阶段: '+(error.stage||'unknown')];
    if(error.status)meta.push('HTTP: '+error.status);
    if(error.endpoint&&!inspection)meta.push('最终 URL: '+error.endpoint);
    if(error.upstreamEndpoint&&!inspection)meta.push('桥后上游: '+error.upstreamEndpoint);
    if(error.protocol&&!inspection)meta.push('协议: '+error.protocol);
    lines.push('失败诊断: '+meta.join(' · '));
    lines.push('错误: '+String(error.message||error));
  }
  target.textContent=lines.join('\n\n');
  target.hidden=false;
  return inspection;
}
function previewApiRequest(prefix=''){
  try{
    const conf=apiFormConfig(prefix);
    renderApiDiagnostic(prefix,conf,null);
  }catch(error){
    const fallback={provider:S.selectedProvider||'custom',model:'',baseUrl:'',protocol:'auto'};
    renderApiDiagnostic(prefix,fallback,error);
  }
}
async function loadApiModels(prefix=''){
  const result=document.getElementById(prefix?'sTestResult':'testResult');
  result.className='test-result ok';result.textContent='⟳ 正在读取模型列表...';
  try{
    const conf=apiFormConfig(prefix);
    let models=[],endpoint='';
    if(WW_BROWSER_API_MODE){
      const p=PROVIDERS[conf.provider]||PROVIDERS.custom;
      const response=await WWApiAdapter.listModels(_runtimeConfig(conf,p));
      models=response.models;endpoint=response.endpoint;
    }else{
      const response=await apiJSON('/api/models');
      models=response.models?.[conf.provider]||[];endpoint='同源 /api/models';
    }
    if(!models.length)throw new Error('没有读取到可选模型；请确认 Key、Base URL 和服务端模型权限');
    const list=document.getElementById(prefix?'sApiModelList':'apiModelList');
    list.replaceChildren(...models.map(model=>{const option=document.createElement('option');option.value=model;return option;}));
    const input=document.getElementById((prefix?prefix+'Api':'api')+'Model');
    const original=input.value.trim();
    const multiplierMatch=original.match(/^(.+?)(\d+(?:\.\d+)?x)$/i);
    const corrected=multiplierMatch&&models.includes(multiplierMatch[1])?multiplierMatch[1]:'';
    if(corrected)input.value=corrected;
    const current=input.value.trim();
    const known=!current||models.includes(current);
    result.className='test-result '+(known?'ok':'fail');
    result.textContent=corrected
      ?'✓ 已读取 '+models.length+' 个模型，并把倍率标签从模型 ID 中移除：'+corrected
      :(known?'✓ 已读取 '+models.length+' 个模型 · '+endpoint:'! 已读取 '+models.length+' 个模型，但当前值不在列表；请从候选中选择');
  }catch(error){
    result.className='test-result fail';result.textContent='✕ '+(error.message||error);
  }
}
async function testApi(){
  const r=document.getElementById('testResult');r.className='test-result ok';r.textContent='⟳ '+t('mod-api-test')+'...';
  let conf;
  try{
    conf=apiFormConfig();renderApiDiagnostic('',conf,null);
    if(!WW_BROWSER_API_MODE)await persistApiConfig(conf);
    const result=await callAITask('api.connection','Reply with exactly: OK',conf);
    r.className='test-result ok';r.textContent='✓ '+result.slice(0,30);
  }catch(e){
    if(conf)renderApiDiagnostic('',conf,e);
    r.className='test-result fail';r.textContent='✗ '+e.message;
  }
}
async function saveApi(){try{await persistApiConfig(apiFormConfig());if(!WW_BROWSER_API_MODE)document.getElementById('apiKey').value='';closeModal('apiModal');showToast('✓',t('toast-saved'));}catch(e){showToast('✕',e.message);}}
function loadApiFields(prefix,c){const stem=prefix?prefix+'Api':'api';document.getElementById(stem+'Key').value=c.key==='backend'?'':(c.key||'');document.getElementById(stem+'Model').value=c.model||'';document.getElementById(stem+'BaseUrl').value=c.baseUrl||'';document.getElementById(stem+'Protocol').value=c.protocol||'auto';document.getElementById(stem+'AuthMode').value=c.authMode||'auto';document.getElementById(stem+'Timeout').value=Math.round(Number(c.timeout||60000)/1000);document.getElementById(stem+'ContextLimit').value=Number(c.contextLimit||0)||'';document.getElementById(stem+'Headers').value=c.customHeaders||'';document.getElementById(stem+'BodyOverrides').value=c.bodyOverrides||'';document.getElementById(stem+'BridgeUrl').value=c.bridgeUrl||'';document.getElementById(stem+'BridgeToken').value=c.bridgeToken||'';document.getElementById(stem+'ExactEndpoint').checked=!!c.exactEndpoint;const clearKey=document.getElementById(stem+'ClearKey'),clearHeaders=document.getElementById(stem+'ClearHeaders');if(clearKey)clearKey.checked=false;if(clearHeaders)clearHeaders.checked=false;const diagnostic=document.getElementById(prefix?'sApiDiagnostic':'apiDiagnostic');if(diagnostic){diagnostic.hidden=true;diagnostic.textContent='';}}
function loadApiUI(){const c=S.apiConfig;if(c.provider){const el=document.querySelector('.provider-chip[onclick*="'+c.provider+'"]');if(el)selectProvider(el,c.provider);}loadApiFields('',c);const notice=document.getElementById('apiStorageNotice');if(notice)notice.textContent=apiStorageDescription();}

function makeEditorSnapshot(){
  const ed=document.getElementById('mainEditor');
  return{
    project_id:S.proj?.project?.id||null,
    active_type:S.active?.type||null,
    active_id:S.active?.id||null,
    title:document.getElementById('chapterTitle').value,
    document:ed.value,
    selection_start:ed.selectionStart,
    selection_end:ed.selectionEnd,
    captured_at:Date.now()
  };
}
function isSameEditorTarget(snapshot){
  return !!snapshot&&snapshot.project_id===(S.proj?.project?.id||null)&&snapshot.active_type===(S.active?.type||null)&&snapshot.active_id===(S.active?.id||null);
}
function isEditorSnapshotCurrent(snapshot){
  return isSameEditorTarget(snapshot)&&snapshot.document===document.getElementById('mainEditor').value;
}
async function saveWriteSnapshot(mode,applyMode,result,snapshot){
  return addHistory(mode+' · 写入前快照',result,{apply_mode:applyMode,original_document:snapshot.document,original_title:snapshot.title,project_id:snapshot.project_id,active_type:snapshot.active_type,active_id:snapshot.active_id,is_snapshot:true});
}

// ═══ AI Generate ═══
async function doGenerate(){
  const ac=S.apiConfig;if(!aiHasConfig(ac)){showToast('⚙',t('toast-no-api'));openModal('apiModal');return;}
  const extra=document.getElementById('aiPrompt').value.trim();let request;
  try{request=buildGenerationRequest(extra);}catch(error){showToast('✕',error.message);return;}
  if(!request.context.text&&!extra){showToast('✎',t('toast-no-content'));return;}
  S.aiRunSnapshot=makeEditorSnapshot();
  const btn=document.getElementById('generateBtn');btn.classList.add('loading');document.getElementById('generateBtnIcon').innerHTML='<div class="spinner"></div>';document.getElementById('generateBtnText').textContent=t('ap-gen-ing');
  try{showStreamingResult('arpText');const arpEl=document.getElementById('arpText');document.getElementById('arpMode').textContent=S.aiMode;document.getElementById('aiResultPopup').classList.add('show');let fullResult='';await callAITaskStream('skill.'+S.aiMode,request.prompt,ac,request.systemPrompt,(chunk)=>{fullResult+=chunk;arpEl.textContent=fullResult;});S.lastArpResult=fullResult;await addHistory(S.aiMode,fullResult,{project_id:S.aiRunSnapshot.project_id,active_type:S.aiRunSnapshot.active_type,active_id:S.aiRunSnapshot.active_id,context_mode:request.context.mode,context_tokens:request.tokens});}
  catch(e){showToast('✕',e.message||'请求失败');}
  finally{hideStreamingCursor();btn.classList.remove('loading');document.getElementById('generateBtnIcon').innerHTML='<svg class="ic ic-sm"><use href="icons/ai-mode-icons.svg#mode-workshop"/></svg>';document.getElementById('generateBtnText').textContent=t('ap-gen');}
}
async function arpAction(action){const text=S.lastArpResult,ed=document.getElementById('mainEditor');if(action==='copy'){navigator.clipboard.writeText(text).then(()=>showToast('✓',t('toast-copied')));return;}if(action==='memory'){stageMemory(text,{title:'AI 候选 · '+S.aiMode,category:'note',source:'writing'});return;}const snapshot=S.aiRunSnapshot||makeEditorSnapshot();if(!isSameEditorTarget(snapshot)){showToast('✕','生成后已切换文档，请复制结果或返回原文档后重试');return;}if(action==='replace'&&!isEditorSnapshotCurrent(snapshot)){showToast('✕','正文已在生成期间变化，为避免覆盖已阻止替换');return;}await saveWriteSnapshot(S.aiMode,action,text,makeEditorSnapshot());if(action==='replace'){const s=snapshot.selection_start,e=snapshot.selection_end;if(s!==e)ed.value=snapshot.document.slice(0,s)+text+snapshot.document.slice(e);else ed.value=text;showToast('✓','已替换');}else if(action==='append'){ed.value+='\n\n'+text;showToast('✓','已追加');}else if(action==='insert'){const p=ed.selectionStart;ed.value=ed.value.slice(0,p)+text+ed.value.slice(p);showToast('✓','已插入');}onEditorInput();closeAiResult();}
function closeAiResult(){document.getElementById('aiResultPopup').classList.remove('show');}


// ═══ Multi-AI ═══
const SLOT_PRESETS={xiaomi:{url:'https://api.xiaomimimo.com/v1/chat/completions',model:'mimo-v2.5-pro'},claude:{url:'https://api.anthropic.com/v1/messages',model:'claude-sonnet-4-20250514'},openai:{url:'https://api.openai.com/v1/chat/completions',model:'gpt-4o'},deepseek:{url:'https://api.deepseek.com/v1/chat/completions',model:'deepseek-chat'},qwen:{url:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',model:'qwen-plus'},openrouter:{url:'https://openrouter.ai/api/v1/chat/completions',model:'anthropic/claude-sonnet-4'},siliconflow:{url:'https://api.siliconflow.cn/v1/chat/completions',model:'deepseek-ai/DeepSeek-V3'},gemini:{url:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',model:'gemini-2.0-flash'},grok:{url:'https://api.x.ai/v1/chat/completions',model:'grok-3'}};
function loadSlot(n){
  let slot={};
  try{slot=JSON.parse(localStorage.getItem('ww_slot'+n)||'{}')||{};}catch(_){}
  if(Object.prototype.hasOwnProperty.call(slot,'key')||Object.prototype.hasOwnProperty.call(slot,'url')){
    delete slot.key;
    delete slot.url;
    localStorage.setItem('ww_slot'+n,JSON.stringify(slot));
  }
  return slot;
}
function slotReadyForRun(slot){
  return !!(slot?.enabled&&(WW_BROWSER_API_MODE?(slot.model||S.apiConfig?.model):slot.preset));
}
function slotRequestConfig(slot){
  if(WW_BROWSER_API_MODE){
    return{...S.apiConfig,model:String(slot.model||S.apiConfig.model||'').trim(),transport:'browser'};
  }
  return{key:'backend',provider:slot.preset,model:slot.model,baseUrl:'',transport:'backend'};
}
function renderMultiSlots(){
  const el=document.getElementById('multiSlots');
  const hasMainKey=aiHasConfig(S.apiConfig);
  let h='<div id="multiSummary" class="multi-summary" style="display:none"></div><div id="multiSlotList">';
  for(let i=1;i<=3;i++){
    const s=loadSlot(i);
    if(i===1&&hasMainKey&&!s._touched)s.enabled=true;
    const enabled=s.enabled;
    const presetName=s.preset||'';
    const displayName=WW_BROWSER_API_MODE?(S.apiConfig.provider||'当前 API'):(presetName?(SLOT_PRESETS[presetName]?presetName:'自定义'):'未配置');
    const modelDisplay=s.model||SLOT_PRESETS[presetName]?.model||(WW_BROWSER_API_MODE?S.apiConfig.model:'');
    h+='<div class="multi-slot'+(enabled?' slot-active':'')+'" id="multiSlot'+i+'">';
    h+='<div class="slot-header">';
    h+='<div class="slot-info"><span class="slot-num">'+i+'</span><span class="slot-provider-badge">'+displayName+'</span>';
    if(modelDisplay)h+='<span class="slot-model-name">'+modelDisplay+'</span>';
    h+='</div>';
    h+='<button class="slot-toggle'+(enabled?' on':'')+'" onclick="toggleSlot('+i+')"></button>';
    h+='</div>';
    h+='<div class="slot-fields'+(enabled?' show':'')+'" id="slotFields'+i+'">';
    if(!WW_BROWSER_API_MODE){
      h+='<select class="slot-select" onchange="applySlotPreset('+i+',this.value)"><option value="">自定义</option>';
      for(const[k]of Object.entries(SLOT_PRESETS))h+='<option value="'+k+'"'+(s.preset===k?' selected':'')+'>'+k+'</option>';
      h+='</select>';
    }
    h+='<div class="slot-server-note">'+(WW_BROWSER_API_MODE?'Pages 槽位复用当前 API、Key 与 HTTPS 桥，只切换模型':'密钥与 Base URL 由自部署后端管理')+'</div>';
    h+='<input class="slot-input" id="slotModel'+i+'" placeholder="Model" value="'+escapeHtml(s.model||(WW_BROWSER_API_MODE?S.apiConfig.model:''))+'" onchange="saveSlot('+i+')">';
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
  if(p&&SLOT_PRESETS[p])document.getElementById('slotModel'+n).value=SLOT_PRESETS[p].model;
  saveSlot(n);
  const badge=document.querySelector('#multiSlot'+n+' .slot-provider-badge');
  const mName=document.querySelector('#multiSlot'+n+' .slot-model-name');
  if(badge)badge.textContent=p||(SLOT_PRESETS[p]?'自定义':'未配置');
  if(mName)mName.textContent=(p&&SLOT_PRESETS[p])?SLOT_PRESETS[p].model:((document.getElementById('slotModel'+n)?.value)||'');
}
function saveSlot(n){
  const toggle=document.querySelector('#multiSlot'+n+' .slot-toggle');
  const s={enabled:toggle?toggle.classList.contains('on'):false,preset:document.querySelector('#slotFields'+n+' .slot-select')?.value||'',model:document.getElementById('slotModel'+n)?.value||'',_touched:true};
  localStorage.setItem('ww_slot'+n,JSON.stringify(s));
}
async function doMultiGenerate(){
  const ac=S.apiConfig;
  if(!aiHasConfig(ac)){showToast('⚙',t('toast-no-api'));openModal('apiModal');return;}
  S.multiRunSnapshot=makeEditorSnapshot();
  const extra=document.getElementById('aiPrompt')?.value?.trim();
  let request;
  try{request=buildGenerationRequest(extra);}catch(error){showToast('✕',error.message);return;}
  const prompt=request.prompt,sysPrompt=request.systemPrompt;
  const promises=[];
  const results=[];
  for(let i=1;i<=3;i++){
    const s=loadSlot(i);
    if(!slotReadyForRun(s)){results.push({i,skipped:true});continue;}
    const r=document.getElementById('slotResult'+i);
    const meta=document.getElementById('slotMeta'+i);
    const actions=document.getElementById('slotActions'+i);
    if(r){r.innerHTML='<div class="slot-loading"><div class="spinner"></div> 生成中...</div>';r.classList.remove('has-content');r.dataset.state='loading';}
    if(meta)meta.style.display='none';
    if(actions)actions.style.display='none';
    const conf=slotRequestConfig(s);
    results.push({i,conf});
  }
  for(const r of results){
    if(r.skipped)continue;
    const p=(async()=>{
      const start=performance.now();
      const text=await callAITask('multi.desktop',prompt,r.conf,sysPrompt);
      const elapsed=Math.round(performance.now()-start);
      const wc=text.replace(/\s/g,'').length;
      const el=document.getElementById('slotResult'+r.i);
      const meta=document.getElementById('slotMeta'+r.i);
      const actions=document.getElementById('slotActions'+r.i);
      if(el){el.textContent=text;el.classList.add('has-content');el.dataset.state='success';}
      if(meta){meta.innerHTML='<span>⏱ '+elapsed+'ms</span><span>📝 '+wc+'字</span>';meta.style.display='flex';}
      if(actions)actions.style.display='flex';
      r.text=text;r.time=elapsed;r.wc=wc;r.done=true;
    })().catch(e=>{
      const el=document.getElementById('slotResult'+r.i);
      if(el){el.textContent='✕ '+e.message;el.classList.remove('has-content');el.dataset.state='error';}
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
async function applySlotToEditor(n){
  const r=document.getElementById('slotResult'+n);
  if(!r||r.dataset.state!=='success'||!r.textContent){showToast('✕','该槽位没有可应用的成功结果');return;}
  const snapshot=S.multiRunSnapshot||makeEditorSnapshot();
  if(!isSameEditorTarget(snapshot)){showToast('✕','生成后已切换文档，请复制结果或返回原文档');return;}
  const ed=document.getElementById('mainEditor');
  const text=r.textContent;
  await saveWriteSnapshot('多模型槽位 '+n,'insert',text,makeEditorSnapshot());
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
async function applyAllSlots(){
  const parts=[];
  for(let i=1;i<=3;i++){
    const r=document.getElementById('slotResult'+i);
    if(r&&r.dataset.state==='success'&&r.textContent&&r.classList.contains('has-content'))parts.push(r.textContent);
  }
  if(!parts.length){showToast('✎','没有可应用的结果');return;}
  const snapshot=S.multiRunSnapshot||makeEditorSnapshot();
  if(!isSameEditorTarget(snapshot)){showToast('✕','生成后已切换文档，请复制结果或返回原文档');return;}
  const ed=document.getElementById('mainEditor');
  const text=parts.join('\n\n---\n\n');
  await saveWriteSnapshot('多模型全部结果','insert',text,makeEditorSnapshot());
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
    if(r){r.textContent='';r.classList.remove('has-content');delete r.dataset.state;}
    if(meta)meta.style.display='none';
    if(actions)actions.style.display='none';
  }
  const summary=document.getElementById('multiSummary');
  if(summary)summary.style.display='none';
  document.querySelectorAll('.multi-slot').forEach(el=>el.classList.remove('slot-best'));
  S.multiRunSnapshot=null;
}


// ═══ History ═══
async function addHistory(mode,textValue,extra={}){const id=await dbPut('aiHistory',{mode,text:String(textValue||'').slice(0,200000),time:Date.now(),project_id:S.proj?.project?.id||null,...extra});renderHistory();return id;}
async function renderHistory(){if(!db)return;const el=document.getElementById('historyList');if(!el)return;const projectId=S.proj?.project?.id;if(!projectId){el.innerHTML='<div class="history-empty">☐ '+t('hist-empty')+'</div>';return;}const items=await dbByIndex('aiHistory','project_id',projectId);items.sort((a,b)=>(b.time||0)-(a.time||0));if(!items.length){el.innerHTML='<div class="history-empty">☐ '+t('hist-empty')+'</div>';return;}el.innerHTML=items.slice(0,50).map(h=>'<div class="history-item" onclick="restoreHistory('+Number(h.id)+')"><div class="hi-meta"><span class="hi-mode">'+escapeHtml(h.mode||'')+'</span><span class="hi-time">'+new Date(h.time).toLocaleString(currentLang)+'</span></div><div class="hi-preview">'+escapeHtml((h.text||'').slice(0,100))+'</div>'+(h.original_document!=null?'<button class="history-restore-btn" onclick="event.stopPropagation();restoreEditorSnapshot('+Number(h.id)+')">恢复写入前</button>':'')+'</div>').join('');}
async function restoreHistory(id){const item=await dbGet('aiHistory',Number(id));if(!item)return;S.lastArpResult=item.text||'';S.aiRunSnapshot=makeEditorSnapshot();document.getElementById('arpText').textContent=S.lastArpResult;document.getElementById('arpMode').textContent=item.mode||'';document.getElementById('aiResultPopup').classList.add('show');}
async function restoreEditorSnapshot(id){const item=await dbGet('aiHistory',Number(id));if(!item||item.original_document==null)return;if(item.project_id!==(S.proj?.project?.id||null)||item.active_type!==(S.active?.type||null)||item.active_id!==(S.active?.id||null)){showToast('✕','请先打开产生该快照的原文档');return;}if(!confirm('恢复到 AI 写入前的正文？当前未保存修改会被替换。'))return;document.getElementById('mainEditor').value=item.original_document;document.getElementById('chapterTitle').value=item.original_title||document.getElementById('chapterTitle').value;onEditorInput();showToast('✓','已恢复写入前正文');}
async function clearHistory(){if(!S.proj||!confirm('清空当前项目的历史？'))return;const items=await dbByIndex('aiHistory','project_id',S.proj.project.id);for(const i of items)await dbDel('aiHistory',i.id);renderHistory();showToast('✕','当前项目历史已清空');}


// ═══ AI Tabs ═══
function switchAiTab(t,el){document.querySelectorAll('.ai-tab').forEach(x=>x.classList.remove('active'));el.classList.add('active');['modes','multi','memory','history'].forEach(x=>{document.getElementById('aiTab-'+x).style.display=x===t?'block':'none';});document.getElementById('aiRequestDock')?.classList.toggle('is-hidden',t!=='modes');if(t==='modes')updateContextBar();if(t==='memory')renderMemoryList();if(t==='multi')renderMultiSlots();}

// ═══ Mobile Multi-AI ═══
function renderMpMultiSlots(){
  const el=document.getElementById('mpMultiSlots');if(!el)return;
  const hasMainKey=aiHasConfig(S.apiConfig);
  let h='';
  for(let i=1;i<=3;i++){
    const s=loadSlot(i);
    if(i===1&&hasMainKey&&!s._touched)s.enabled=true;
    const enabled=s.enabled;
    const presetName=s.preset||'';
    const displayName=WW_BROWSER_API_MODE?(S.apiConfig.provider||'当前 API'):(presetName?(SLOT_PRESETS[presetName]?presetName:'自定义'):'未配置');
    h+='<div class="multi-slot'+(enabled?' slot-active':'')+'" style="margin-bottom:8px">';
    h+='<div class="slot-header"><div class="slot-info"><span class="slot-num">'+i+'</span><span class="slot-provider-badge">'+displayName+'</span></div>';
    h+='<button class="slot-toggle'+(enabled?' on':'')+'" onclick="toggleMpSlot('+i+')"></button></div>';
    if(enabled){
      h+='<div style="margin-top:6px">';
      if(!WW_BROWSER_API_MODE){
        h+='<select class="slot-select" onchange="applySlotPreset('+i+',this.value);renderMpMultiSlots()"><option value="">自定义</option>';
        for(const[k]of Object.entries(SLOT_PRESETS))h+='<option value="'+k+'"'+(s.preset===k?' selected':'')+'>'+k+'</option>';
        h+='</select>';
      }
      h+='<div class="slot-server-note">'+(WW_BROWSER_API_MODE?'Pages 槽位复用当前 API、Key 与 HTTPS 桥，只切换模型':'密钥由自部署后端管理')+'</div>';
      h+='<input class="slot-input" placeholder="Model" value="'+escapeHtml(s.model||(WW_BROWSER_API_MODE?S.apiConfig.model:''))+'" onchange="saveMpSlot('+i+',this.value,\'model\')">';
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
  const s=loadSlot(n);
  s.enabled=isOn;localStorage.setItem('ww_slot'+n,JSON.stringify(s));
  renderMpMultiSlots();
}
function saveMpSlot(n,val,key){
  const s=loadSlot(n);
  s[key]=val;s._touched=true;localStorage.setItem('ww_slot'+n,JSON.stringify(s));
}
async function doMultiGenerateMobile(){
  const ac=S.apiConfig;if(!aiHasConfig(ac)){showToast('⚙',t('toast-no-api'));openModal('apiModal');return;}
  const extra=document.getElementById('mpAiPrompt')?.value?.trim();
  let request;
  try{request=buildGenerationRequest(extra);}catch(error){showToast('✕',error.message);return;}
  const prompt=request.prompt,sysPrompt=request.systemPrompt;
  const tasks=[];
  for(let i=1;i<=3;i++){
    const s=loadSlot(i);
    if(!slotReadyForRun(s))continue;
    tasks.push({i,conf:slotRequestConfig(s)});
  }
  if(!tasks.length){showToast('✕','请至少启用一个已选择 Provider 的槽位');return;}
  showToast('⟳','并行生成中...');
  const results=await Promise.allSettled(tasks.map(async({i,conf})=>{
    const t0=Date.now();
    try{const r=await callAITask('multi.mobile',prompt,conf,sysPrompt);return{i,text:r,time:Date.now()-t0};}
    catch(e){return{i,text:'✕ '+e.message,time:Date.now()-t0};}
  }));
  for(const r of results){
    const d=r.value||r.reason;if(!d)continue;
    const el=document.getElementById('mpSlotResult'+d.i);
    const meta=document.getElementById('mpSlotMeta'+d.i);
    if(el){
      const failed=String(d.text||'').startsWith('✕ ');
      el.textContent=d.text;
      el.classList.toggle('has-content',!failed);
      el.dataset.state=failed?'error':'success';
    }
    if(meta){meta.style.display='block';meta.textContent=d.text.replace(/\s/g,'').length+'字 · '+(d.time/1000).toFixed(1)+'s';}
  }
  showToast('✓','对比完成');
}

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

    const result = await callAITask('analysis.deep-check', '分析以下文本：\n\n' + content, S.apiConfig, systemPrompt);

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
let reduceAiSnapshot = null;

async function smartReduceAi(intensity = 'medium') {
  if (!aiHasConfig(S.apiConfig)) {
    showToast('✕', t('toast-no-api'));
    return;
  }

  const ed = document.getElementById('mainEditor');
  const selected = ed.value.slice(ed.selectionStart, ed.selectionEnd).trim();
  const content = selected || ed.value.trim();
  reduceAiSnapshot = makeEditorSnapshot();

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

直接输出改写后的文本，不要解释。\n\n${buildCtx()}`;

    showStreamingResult('reduceAiResult');
    const resultEl = document.getElementById('reduceAiResult');
    document.getElementById('reduceAiModal').style.display = 'flex';

    let fullResult = '';
    await callAITaskStream('humanize.smart', '请改写以下文本：\n\n' + content, S.apiConfig, systemPrompt, (chunk) => {
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

async function applyReduceAi() {
  if (!S.lastReduceAiResult) return;

  const snapshot=reduceAiSnapshot||makeEditorSnapshot();
  if(!isSameEditorTarget(snapshot)){showToast('✕','生成后已切换文档，请复制结果或返回原文档');return;}
  if(!isEditorSnapshotCurrent(snapshot)){showToast('✕','正文已在生成期间变化，为避免覆盖已阻止应用');return;}
  const ed = document.getElementById('mainEditor');
  const start = snapshot.selection_start;
  const end = snapshot.selection_end;
  await saveWriteSnapshot('智能降 AI','replace',S.lastReduceAiResult,makeEditorSnapshot());

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
  S.aiRunSnapshot=makeEditorSnapshot();
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

  const readingContext=buildAIWritingContext('smart');
  const context = readingContext.text || content;

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

    const result = await callAITask('continuation.suggest', '请依据项目正式事实、世界规则、大纲规划与现有正文，为以下内容提供3个续写方向。不得把尚未发生的大纲节点写成已经发生：\n\n' + buildCtx() + '\n\n【阅读上下文】\n' + context, S.apiConfig, systemPrompt);

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
  S.aiRunSnapshot=makeEditorSnapshot();
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
    const result = await callAITask('style.learn', '分析以下文本的写作风格：\n\n' + sample, S.apiConfig, systemPrompt);

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
  ['lang','api','theme','rules'].forEach(t=>{document.getElementById('settingsTab-'+t).style.display=t===tab?'block':'none';});
  if(tab==='rules')loadRulesPanel();
}

function initSettingsModal(){
  // Highlight current language
  document.querySelectorAll('.lang-card').forEach(c=>{c.classList.toggle('active',c.getAttribute('onclick')?.includes("'"+currentLang+"'"));});
  // Load API settings into settings modal fields
  const c=S.apiConfig;
  if(c.provider){const el=document.querySelector('#sProviderGrid .provider-chip[onclick*="'+c.provider+'"]');if(el)selectProvider(el,c.provider);}
  loadApiFields('s',c);
  const notice=document.getElementById('settingsApiStorageNotice');if(notice)notice.textContent=apiStorageDescription();
  // Highlight current theme
  const isLight=document.body.classList.contains('light');
  document.getElementById('themeCardDark').classList.toggle('active',!isLight);
  document.getElementById('themeCardLight').classList.toggle('active',isLight);
  // Reset to lang tab
  openSettingsTab('lang',document.querySelector('.settings-tab'));
}

let currentRulesPayload=null;
async function loadRulesPanel(){
  try{
    const data=await apiJSON('/api/rules');
    currentRulesPayload=data;
    document.getElementById('rulesRaw').value=data.custom||data.preferences||'';
    const grid=document.getElementById('rulesPresetGrid');
    grid.innerHTML=(data.presets||[]).map(p=>`<div class="provider-chip" onclick="applyRulePreset('${p.id}')">${p.name}</div>`).join('');
  }catch(e){
    document.getElementById('rulesPresetGrid').innerHTML='<div style="color:var(--text-muted);font-size:12px">规则加载失败</div>';
  }
}
async function applyRulePreset(id){
  const p=(currentRulesPayload?.presets||[]).find(x=>x.id===id);
  if(!p)return;
  document.getElementById('rulesRaw').value=p.content||'';
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
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='ainovel-rules.json';a.click();
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
  r.className='test-result ok';r.textContent='⟳ '+t('mod-api-test')+'...';
  let conf;
  try{conf=apiFormConfig('s');renderApiDiagnostic('s',conf,null);}catch(e){renderApiDiagnostic('s',{provider:S.selectedProvider||'custom',model:'',baseUrl:'',protocol:'auto'},e);r.className='test-result fail';r.textContent='✕ '+e.message;return;}
  const prepare=WW_BROWSER_API_MODE?Promise.resolve():persistApiConfig(conf);
  prepare.then(()=>callAITask('api.connection','Reply with exactly: OK',conf)).then(txt=>{
    r.className='test-result ok';r.textContent='✓ '+txt.slice(0,60);
  }).catch(e=>{
    let msg=e.message||'Error';
    if(msg.includes('429'))msg+=' (请求过于频繁，请稍后再试)';
    if(msg.includes('403'))msg+=' (API Key 无权限，请检查 Key 是否正确)';
    if(msg.includes('401')||msg.includes('invalid'))msg+=' (API Key 无效)';
    renderApiDiagnostic('s',conf,e);
    r.className='test-result fail';r.textContent='✕ '+msg;
  });
}

function saveSettings(){
  const c=apiFormConfig('s');
  if(!c.key&&!c.model&&!c.baseUrl&&!S.apiConfig.provider){closeModal('settingsModal');showToast('✓',t('mod-save'));return;}
  persistApiConfig(c).then(()=>{
    if(!WW_BROWSER_API_MODE)document.getElementById('sApiKey').value='';
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
  const bnavKeys=['bnav-editor','bnav-outline','bnav-chapters','bnav-chars','bnav-ai','nav-notes'];
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
      document.querySelectorAll('#apiModal .btn-test[data-i18n="form-api-test"]').forEach(b=>b.textContent=t('form-api-test'));
      // Translate model placeholder
      const modelInput=document.getElementById('apiModel');
      if(modelInput)modelInput.placeholder=t('form-api-model-ph');
      // Translate buttons
      document.querySelectorAll('#apiModal .btn-cancel[data-i18n="form-cancel"]').forEach(b=>b.textContent=t('form-cancel'));
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
  let storageLine='';
  try{
    const estimate=await navigator.storage?.estimate?.();
    const persisted=await navigator.storage?.persisted?.();
    const formatBytes=value=>value>=1024*1024?(value/1024/1024).toFixed(1)+' MiB':Math.ceil((value||0)/1024)+' KiB';
    if(estimate)storageLine='<div>▣ 浏览器存储：'+formatBytes(estimate.usage)+' / '+formatBytes(estimate.quota)+' · '+(persisted?'已持久保留':'可能由浏览器清理，请定期导出')+'</div>';
  }catch(_){}
  if(!S.proj){el.innerHTML='<div style="color:var(--text-hint)">'+t('ps-none')+'</div>'+storageLine;return;}
  const p=S.proj.project;
  const totalWords=S.proj.chapters.reduce((s,c)=>s+(c.word_count||0),0);
  const totalChars=S.proj.characters.length;
  const totalOutlines=S.proj.outlines.length;
  const totalChapters=S.proj.chapters.length;
  const totalNotes=(S.proj.notes||[]).length;
  const created=new Date(p.created_at).toLocaleDateString(currentLang);
  const updated=p.updated_at?new Date(p.updated_at).toLocaleDateString(currentLang):'-';
  el.innerHTML='<div>📁 '+t('ps-project')+' <b>'+escapeHtml(p.name)+'</b></div><div>◎ '+t('ps-genre')+' '+escapeHtml(p.genre||'-')+'</div><div>📝 '+t('ps-words')+' <b>'+totalWords+'</b> '+t('ps-units-2')+'</div><div>☐ '+t('ps-outlines')+' '+totalOutlines+' '+t('ps-units-1')+t('ps-chapters')+' '+totalChapters+' '+t('ps-units-1')+'</div><div>● '+t('ps-chars')+' '+totalChars+' '+t('ps-units-1')+' · ✎ 笔记 '+totalNotes+' '+t('ps-units-1')+'</div><div>◎ '+t('ps-goal')+' '+S.wordGoal+' '+t('ps-units-2')+'</div><div>◷ '+t('ps-created')+' '+created+' · '+t('ps-updated')+' '+updated+'</div>'+storageLine;
}
async function changePassword(){
  localStorage.removeItem('ww_pwd_hash');
  showToast('i','本地游客模式不提供密码设置');
}
// Hook: render stats when profile modal opens
(function(){const orig=openModal;openModal=function(id){orig(id);if(id==='profileModal')renderProfileStats();};})();


// ═══ AI Quick Tools ═══
let aiQuickLastResult='',aiQuickMode='',aiQuickSnapshot=null,aiPresLevel='medium',aiDetectScores=null;
function aiCheckApi(){const ac=S.apiConfig;if(!aiHasConfig(ac)){showToast('⚙',t('toast-no-api'));openModal('apiModal');return false;}return true;}
function showAiQuickResult(title,text,mode){aiQuickLastResult=text;aiQuickMode=mode;document.getElementById('aiQuickResultTitle').textContent=title;document.getElementById('aiQuickResultText').textContent=text;document.getElementById('aiQuickResult').style.display='block';document.getElementById('aiRadarWrap').style.display='none';document.getElementById('aiDiffWrap').style.display='none';document.getElementById('aiSentencesWrap').style.display='none';}
function closeAiQuickResult(){document.getElementById('aiQuickResult').style.display='none';aiQuickLastResult='';aiQuickMode='';aiQuickSnapshot=null;aiDetectScores=null;document.getElementById('aiRadarWrap').style.display='none';document.getElementById('aiDiffWrap').style.display='none';document.getElementById('aiSentencesWrap').style.display='none';document.getElementById('presLevelBar').style.display='none';}
async function aiQuickApply(){if(!aiQuickLastResult)return;const snapshot=aiQuickSnapshot||makeEditorSnapshot();if(!isSameEditorTarget(snapshot)){showToast('✕','生成后已切换文档，请复制结果或返回原文档');return;}if((aiQuickMode==='proofread'||aiQuickMode==='humanize'||aiQuickMode==='title')&&!isEditorSnapshotCurrent(snapshot)){showToast('✕','正文已在生成期间变化，为避免覆盖已阻止应用');return;}await saveWriteSnapshot('快捷工具 · '+aiQuickMode,aiQuickMode,aiQuickLastResult,makeEditorSnapshot());if(aiQuickMode==='title'){document.getElementById('chapterTitle').value=aiQuickLastResult;S.unsaved=true;showToast('✓',t('toast-title-applied'));closeAiQuickResult();return;}const ed=document.getElementById('mainEditor');if(aiQuickMode==='proofread'||aiQuickMode==='humanize'){ed.value=aiQuickLastResult;onEditorInput();showToast('✓',aiQuickMode==='humanize'?t('toast-humanize-applied'):t('toast-proofread-applied'));}else if(aiQuickMode==='inspire'){const pos=ed.selectionStart;ed.value=ed.value.slice(0,pos)+'\n\n'+aiQuickLastResult+'\n'+ed.value.slice(pos);onEditorInput();showToast('✓',t('toast-inspire-inserted'));}closeAiQuickResult();}
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
      html+='<span class="diff-del">'+escapeHtml(l)+'</span>';
    }
  }
  for(const l of aSet){
    if(l&&l.length>2&&!bSet.has(l)){
      if(!hasIns){html+='<div class="diff-header" style="color:#2a2">✓ 新增/改写：</div>';hasIns=true;}
      html+='<span class="diff-ins">'+escapeHtml(l)+'</span>';
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
  aiQuickSnapshot=makeEditorSnapshot();
  setLoading('aiBtnProof',true);
  try{
    const ctx=S.proj?buildCtx()+'\n\n':'';
    const prompt=wwPromptText('校对')+'\n\n'+ctx+'【原文】\n'+text;
    const result=await callAITask('quick.proofread',prompt,S.apiConfig,writingSystemPrompt());
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
  aiQuickSnapshot=makeEditorSnapshot();
  setLoading('aiBtnTitle',true);
  try{
    const ctx=S.proj?buildCtx()+'\n\n':'';
    const prompt=wwPromptText('标题')+'\n\n'+ctx+'【内容】\n'+text.slice(0,2000);
    const result=await callAITask('quick.title',prompt,S.apiConfig,writingSystemPrompt());
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
  aiQuickSnapshot=makeEditorSnapshot();
  setLoading('aiBtnInspire',true);
  try{
    const ctx=S.proj?buildCtx()+'\n\n':'';
    const selectedText=text.slice(document.getElementById('mainEditor').selectionStart,document.getElementById('mainEditor').selectionEnd).trim();
    const content=selectedText||text.slice(-800);
    const prompt=wwPromptText('实时灵感')+'\n\n'+ctx+(title?'【当前标题】'+title+'\n':'')+'【当前断点】\n'+(content||'（空文档，请先给出可确认的开篇方向）');
    const result=await callAITask('quick.inspiration',prompt,S.apiConfig,writingSystemPrompt());
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
  aiQuickSnapshot=makeEditorSnapshot();
  setLoading('aiBtnResearch',true);
  try{
    const ctx=S.proj?buildCtx()+'\n\n':'';
    const content=selectedText||text.slice(-500);
    const prompt=wwPromptText('资料搜索')+'\n\n'+ctx+(title?'【当前标题】'+title+'\n':'')+'【内容或关键词】\n'+(content||'请先列出需要作者补充的研究主题');
    const result=await callAITask('quick.research',prompt,S.apiConfig,writingSystemPrompt());
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
  aiQuickSnapshot=makeEditorSnapshot();
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
    const result=await callAITask('quick.humanize',prompt,S.apiConfig,writingSystemPrompt());
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
  aiQuickSnapshot=makeEditorSnapshot();
  setLoading('aiBtnDetect',true);
  try{
    const prompt=wwPromptText('查AI')+'\n\n【待分析文字】\n'+text.slice(0,3000);
    const result=await callAITask('quick.detect',prompt,S.apiConfig,writingSystemPrompt());
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
    if(tab==='outline')renderMpOutline();if(tab==='chapters')renderMpChapter();if(tab==='chars')renderMpChar();if(tab==='notes')renderMpNote();if(tab==='ai')renderMpAi();
  }
}
function backToEditor(){const btn=document.querySelector('#bottomNav .btab');if(btn)swMobileTab('editor',btn);}
function renderMpOutline(){if(!S.proj)return;const el=document.getElementById('mpOutlineList');const empty=S.proj.outlines.length?'':'<div style="text-align:center;padding:20px;color:var(--text-hint)">'+t('sb-empty-outline')+'</div>';el.innerHTML=worldSettingRow(true)+empty+S.proj.outlines.map(o=>'<div class="outline-item'+(S.active&&S.active.type==='outline'&&S.active.id===o.id?' active':'')+'" onclick="loadOutlineContent('+Number(o.id)+');backToEditor()"><span class="oi-icon"><svg class="ic ic-sm"><use href="#ic-outline"/></svg></span><span class="oi-text">'+escapeHtml(o.title)+'</span><span class="oi-count">'+(o.content?countWords(o.content):0)+t('ps-units-2')+'</span></div>').join('');}
function renderMpChapter(){if(!S.proj)return;const el=document.getElementById('mpChapterList');if(!S.proj.chapters.length){el.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-hint)">'+t('sb-empty-chapter')+'</div>';return;}el.innerHTML=S.proj.chapters.map(c=>'<div class="outline-item'+(S.active&&S.active.type==='chapter'&&S.active.id===c.id?' active':'')+'" onclick="loadChapterContent('+Number(c.id)+');backToEditor()"><span class="oi-icon"><svg class="ic ic-sm"><use href="#ic-chapter"/></svg></span><span class="oi-text">'+escapeHtml(c.title)+'</span><span class="oi-count">'+(c.word_count||0)+t('ps-units-2')+'</span></div>').join('');}
function renderMpChar(){if(!S.proj)return;const el=document.getElementById('mpCharList');if(!S.proj.characters.length){el.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-hint)">'+t('sb-empty-char')+'</div>';return;}el.innerHTML=S.proj.characters.map(c=>'<div class="char-card" onclick="loadCharContent('+Number(c.id)+');backToEditor()"><div class="char-name">'+escapeHtml(c.name)+'</div><span class="char-role">'+escapeHtml(c.role)+'</span><div class="char-desc">'+escapeHtml(c.personality||t('char-no-desc'))+'</div></div>').join('');}
function renderMpNote(){if(!S.proj)return;const el=document.getElementById('mpNoteList');if(!el)return;const notes=S.proj.notes||[];if(!notes.length){el.innerHTML='<div class="sidebar-empty">'+t('sb-empty-notes')+'</div>';return;}el.innerHTML=notes.map(note=>'<div class="outline-item" onclick="loadNoteContent('+Number(note.id)+');backToEditor()"><span class="oi-icon"><svg class="ic ic-sm"><use href="#ic-note"/></svg></span><span class="oi-text">'+escapeHtml(note.title||'未命名笔记')+'</span><span class="oi-count">'+countWords(note.content||'')+t('ps-units-2')+'</span></div>').join('');}
function renderMpAi(){const el=document.getElementById('mpAiModeGrid');if(!el||el.children.length>0)return;const g={};for(const[k,v]of Object.entries(AI_MODES)){if(!g[v.group])g[v.group]=[];g[v.group].push(k);}let h='';for(const[label,keys]of Object.entries(g)){h+='<div class="mode-group" data-mode-group="'+label+'"><div class="mode-group-title">'+t('grp-'+label)+'</div><div class="mode-grid">';for(const k of keys)h+='<button class="mode-btn'+(S.aiMode===k?' selected':'')+'" data-mode="'+k+'" onclick="selectMode(this,\''+k+'\')"><span class="micon">'+wwAiModeIcon(k)+'</span>'+t('mode-'+k)+'</button>';h+='</div></div>';}el.innerHTML=h;if(typeof renderMpMultiSlots==='function')renderMpMultiSlots();}
async function doGenerateMobile(){
  const ac=S.apiConfig;if(!aiHasConfig(ac)){showToast('⚙',t('toast-no-api'));openModal('apiModal');return;}
  const extra=document.getElementById('mpAiPrompt')?.value.trim()||'';let request;
  try{request=buildGenerationRequest(extra);}catch(error){showToast('✕',error.message);return;}
  if(!request.context.text&&!extra){showToast('✎',t('toast-no-content'));return;}
  S.aiRunSnapshot=makeEditorSnapshot();const btn=document.getElementById('mpGenerateBtn');btn.classList.add('loading');btn.textContent=t('ap-gen-ing');
  try{const r=await callAITask('skill.'+S.aiMode,request.prompt,ac,request.systemPrompt);S.lastArpResult=r;document.getElementById('arpText').textContent=r;document.getElementById('arpMode').textContent=S.aiMode;document.getElementById('aiResultPopup').classList.add('show');await addHistory(S.aiMode,r,{project_id:S.aiRunSnapshot.project_id,active_type:S.aiRunSnapshot.active_type,active_id:S.aiRunSnapshot.active_id,context_mode:request.context.mode,context_tokens:request.tokens});}
  catch(e){showToast('✕',e.message||'失败');}
  finally{btn.classList.remove('loading');btn.innerHTML='<span><svg class="ic ic-sm"><use href="icons/ai-mode-icons.svg#mode-workshop"/></svg></span><span data-i18n="ap-gen">'+t('ap-gen')+'</span>';}
}

// ═══ Cookie Consent & Privacy ═══
function showPrivacyModal(){document.getElementById('privacyModal').classList.add('show');}
function closePrivacyModal(){document.getElementById('privacyModal').classList.remove('show');}
function switchPrivTab(tab,el){document.querySelectorAll('.priv-panel').forEach(p=>p.style.display='none');document.querySelectorAll('.priv-tab').forEach(t=>t.classList.remove('active'));document.getElementById('privTab-'+tab).style.display='block';el.classList.add('active');}
function acceptCookie(){localStorage.setItem('ww_cookie_consent','1');document.getElementById('cookieBanner').classList.remove('show');}
(function(){
  if(!localStorage.getItem('ww_cookie_consent')){document.getElementById('cookieBanner').classList.add('show');}
})();

// ═══ Recursive Writing Panel ═══
function openRecursivePanel(){
  const ov = document.getElementById('recursiveOverlay');
  ov.classList.add('show');
  resetRecursivePanel();
}
function closeRecursivePanel(){
  if(RecursiveEngine.isRunning()){
    if(!confirm('正在运行中，确定关闭？')) return;
    RecursiveEngine.cancel();
  }
  document.getElementById('recursiveOverlay').classList.remove('show');
}
function resetRecursivePanel(){
  document.getElementById('recInput').value='';
  document.getElementById('recInput').style.display='flex';
  document.getElementById('recStartBtn').style.display='block';
  document.getElementById('recPlanArea').style.display='none';
  document.getElementById('recOutputBody').innerHTML='<div style="text-align:center;padding:40px;color:var(--text-hint)">等待规划完成...</div>';
  document.getElementById('recOutputActions').style.display='none';
  document.getElementById('recProgressFill').style.width='0%';
  document.getElementById('recStatusText').textContent='就绪';
}
let _recArticle='',_recSnapshot=null;
function startRecursive(){
  const prompt=document.getElementById('recInput').value.trim();
  if(!prompt){showToast('✎','请输入写作需求');return;}
  document.getElementById('recInput').style.display='none';
  document.getElementById('recStartBtn').style.display='none';
  document.getElementById('recPlanArea').style.display='block';
  document.getElementById('recOutputActions').style.display='none';
  _recArticle='';
  _recSnapshot=makeEditorSnapshot();
  RecursiveEngine.run(prompt, onRecursiveProgress).then(result=>{
    if(result){
      document.getElementById('recOutputActions').style.display='flex';
    }
  }).catch(e=>{
    showToast('✕',e.message||'递归写作失败');
  });
}
function onRecursiveProgress(type,data){
  const statusEl=document.getElementById('recStatusText');
  const fillEl=document.getElementById('recProgressFill');
  const dagEl=document.getElementById('recDag');
  const outputEl=document.getElementById('recOutputBody');
  switch(type){
    case 'status':
      statusEl.textContent=data.text;
      document.getElementById('recSpinner').style.display='block';
      break;
    case 'plan':
      document.getElementById('recPlanArea').innerHTML=renderRecPlan(data);
      document.getElementById('recPlanGoal').textContent=data.goal||'';
      fillEl.style.width='5%';
      break;
    case 'task-start':
      statusEl.textContent=`${data.icon} ${data.label}: ${data.goal.slice(0,50)}...`;
      fillEl.style.width=Math.round(data.completed/data.total*100)+'%';
      dagEl.classList.add('running');
      markDagNode(data.id,'active');
      break;
    case 'task-done':
      fillEl.style.width=Math.round(data.completed/data.total*100)+'%';
      markDagNode(data.id,'done');
      if(data.completed>=data.total) dagEl.classList.remove('running');
      break;
    case 'design-done':
      appendDesignOutput(data);
      break;
    case 'article-update':
      _recArticle=data.text;
      updateArticleOutput(data.fragment);
      break;
    case 'done':
      statusEl.textContent='✅ 完成！';
      fillEl.style.width='100%';
      document.getElementById('recSpinner').style.display='none';
      break;
    case 'error':
      statusEl.textContent='❌ '+data.message;
      dagEl.classList.remove('running');
      document.getElementById('recSpinner').style.display='none';
      break;
  }
}
function renderRecPlan(plan){
  let h=`<div class="rec-plan-title">📋 任务规划</div>`;
  h+=`<div class="rec-plan-goal" id="recPlanGoal">${escapeHtml(plan.goal||'')}</div>`;
  h+=`<div class="rec-dag" id="recDag">`;
  for(const t of Array.isArray(plan.sub_tasks)?plan.sub_tasks:[]){
    const safeId=String(t.id??'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40);
    const taskType=t.task_type==='think'?'think':'write';
    const depStr=Array.isArray(t.dependency)&&t.dependency.length?'依赖: '+t.dependency.map(d=>'<code>#'+escapeHtml(String(d))+'</code>').join(' '):'';
    h+=`<div class="rec-dag-node" id="recNode-${safeId}">
      <div class="rec-dag-icon ${taskType}" id="recIcon-${safeId}">${taskType==='think'?'🎨':'✍️'}</div>
      <div class="rec-dag-info">
        <div class="rec-dag-type ${taskType}">${taskType==='think'?'设计':'写作'} #${escapeHtml(String(t.id??''))}</div>
        <div class="rec-dag-goal">${escapeHtml(t.goal||'')}</div>
        ${depStr?'<div class="rec-dag-dep">'+depStr+'</div>':''}
      </div>
    </div>`;
  }
  h+=`</div>`;
  return h;
}
function markDagNode(id,state){
  const icon=document.getElementById('recIcon-'+id);
  if(icon){icon.classList.remove('active','done');if(state)icon.classList.add(state);}
}
function appendDesignOutput(data){
  const el=document.getElementById('recOutputBody');
  const div=document.createElement('div');
  div.className='design-block';
  div.innerHTML=`<div class="design-title">🎨 ${escapeHtml(data.goal||'')}</div><div class="design-content">${escH(data.result||'')}</div>`;
  el.appendChild(div);
  el.scrollTop=el.scrollHeight;
}
function updateArticleOutput(fragment){
  const el=document.getElementById('recOutputBody');
  let artEl=el.querySelector('.article-wrap');
  if(!artEl){
    const hr=document.createElement('hr');
    hr.className='article-sep';
    el.appendChild(hr);
    artEl=document.createElement('div');
    artEl.className='article-wrap';
    artEl.innerHTML=`<div style="font-size:11px;font-weight:600;color:var(--green);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">✍️ 正文</div><div class="article-text" id="recArticleText"></div>`;
    el.appendChild(artEl);
  }
  const artText=el.querySelector('#recArticleText');
  if(artText)artText.textContent=_recArticle;
  el.scrollTop=el.scrollHeight;
}
async function insertRecResult(){
  if(!_recArticle){showToast('✎','没有可插入的正文结果');return;}
  const snapshot=_recSnapshot||makeEditorSnapshot();
  if(!isSameEditorTarget(snapshot)){showToast('✕','生成后已切换文档，请复制结果或返回原文档');return;}
  const ed=document.getElementById('mainEditor');
  await saveWriteSnapshot('递归创作','insert',_recArticle,makeEditorSnapshot());
  const p=ed.selectionStart;
  const prefix=ed.value.slice(0,p);
  const suffix=ed.value.slice(p);
  ed.value=prefix+(prefix.endsWith('\n')||!prefix?'':'\n\n')+_recArticle+'\n'+suffix;
  onEditorInput();
  closeRecursivePanel();
  showToast('✓','已插入编辑器');
}
function copyRecResult(){
  navigator.clipboard.writeText(_recArticle).then(()=>showToast('✓','已复制'));
}
function escH(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');}
