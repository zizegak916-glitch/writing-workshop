// ═══ AI Modes ═══
const AI_MODES={'润色':{icon:'◇',group:'基础',p:'请对以下文字进行润色，提升语言的流畅度、文学性和表达力，保持原意和风格：'},'扩写':{icon:'↑',group:'基础',p:'请对以下文字进行扩写，增加细节描写、画面感和情感层次：'},'缩写':{icon:'↓',group:'基础',p:'请对以下文字进行精炼缩写，保留核心内容，简洁有力：'},'改写':{icon:'↻',group:'基础',p:'请用不同的表达方式改写以下文字，保持核心意思：'},'续写':{icon:'→',group:'基础',p:'请根据以下内容自然地续写下文，保持风格和情节逻辑：'},'补写':{icon:'⊞',group:'基础',p:'请为以下内容填补缺失的过渡或细节部分：'},'对话':{icon:'❝',group:'描写',p:'请为以下场景创作自然生动的对话，符合人物性格：'},'心理':{icon:'◉',group:'描写',p:'请为以下内容增加细腻的人物心理描写：'},'环境':{icon:'❋',group:'描写',p:'请为以下内容增加生动的环境和氛围描写：'},'战斗':{icon:'⚡',group:'描写',p:'请将以下内容改写为紧张刺激的战斗场景描写：'},'古风':{icon:'◎',group:'风格',p:'请将以下内容改写为古典文学风格：'},'现代':{icon:'▣',group:'风格',p:'请将以下内容改写为现代白话文风格：'},'幽默':{icon:'♪',group:'风格',p:'请将以下内容改写得轻松幽默：'},'悬疑':{icon:'⊕',group:'风格',p:'请将以下内容改写为悬疑神秘风格：'},'唯美':{icon:'✿',group:'风格',p:'请将以下内容改写为唯美诗意风格：'},'霸气':{icon:'△',group:'风格',p:'请将以下内容改写为霸气豪迈风格：'},'分析':{icon:'≡',group:'分析',p:'请分析以下文字的结构、节奏和表达问题：'},'校对':{icon:'✓',group:'分析',p:'请检查以下文字的错别字、语病和标点错误：'},'节奏':{icon:'♫',group:'分析',p:'请分析以下文字的叙事节奏：'},'情感':{icon:'♥',group:'分析',p:'请分析以下文字的情感层次和情绪弧度：'},'大纲':{icon:'☰',group:'创作',p:'请根据以下信息生成详细的故事大纲：'},'人物':{icon:'◉',group:'创作',p:'请根据以下信息生成详细的人物档案：'},'伏笔':{icon:'⊹',group:'创作',p:'请为以下故事设计3-5个巧妙的伏笔：'},'转折':{icon:'⇄',group:'创作',p:'请为以下故事情节设计2-3个出乎意料的转折：'},'结局':{icon:'■',group:'创作',p:'请为以下故事提供3种不同风格的结局：'},'翻译':{icon:'⊕',group:'工具',p:'请将以下中文内容翻译为英文：'},'总结':{icon:'✎',group:'工具',p:'请为以下内容生成简洁摘要：'},'标题':{icon:'¶',group:'工具',p:'请为以下内容生成5个吸引人的标题：'},'降AI':{icon:'▷',group:'工具',p:'请将以下AI生成的文字重写为自然的人类写作风格。要求：1.使用口语化、不规则的句式 2.加入个人化的表达和语气词 3.偶尔使用短句或碎片化表达 4.避免完美排比和过度修饰 5.添加一些即兴感和不完美感 6.保持核心意思不变 7.让文字读起来像真人随手写的，而不是AI精心构造的。输出重写后的全文：'},'查AI':{icon:'⊕',group:'工具',p:'请分析以下文字的AI生成特征。从句式规律性、词汇丰富度、情感自然度、结构完美度、口语化程度、重复冗余度六个维度各给0-100评分，给出综合AI概率评估和具体特征描述。⚠️ 仅供参考，不构成正式判定。文字：'}};
function renderAiModeGrid(){const el=document.getElementById('aiModeGrid'),g={};for(const[k,v]of Object.entries(AI_MODES)){if(!g[v.group])g[v.group]=[];g[v.group].push(k);}let h='';for(const[label,keys]of Object.entries(g)){h+='<div class="mode-group"><div class="mode-group-title">'+t('grp-'+label)+'</div><div class="mode-grid">';for(const k of keys)h+='<button class="mode-btn'+(S.aiMode===k?' selected':'')+'" onclick="selectMode(this,\''+k+'\')"><span class="micon">'+AI_MODES[k].icon+'</span>'+t('mode-'+k)+'</button>';h+='</div></div>';}el.innerHTML=h;}
function selectMode(btn,m){document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');S.aiMode=m;updateContextBar();}
function setTemp(v,btn){btn.parentElement.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');S.aiTemp=v;}
function setLen(v,btn){btn.parentElement.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');S.aiLen=v;}


// ═══ API ═══
const PROVIDERS={claude:{url:'https://api.anthropic.com/v1/messages',model:'claude-sonnet-4-20250514',type:'claude'},openai:{url:'https://api.openai.com/v1/chat/completions',model:'gpt-4o',type:'openai'},deepseek:{url:'https://api.deepseek.com/v1/chat/completions',model:'deepseek-chat',type:'openai'},xiaomi:{url:'https://api.xiaomimimo.com/v1/chat/completions',model:'mimo-v2.5-pro',type:'openai'},qwen:{url:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',model:'qwen-plus',type:'openai'},zhipu:{url:'https://open.bigmodel.cn/api/paas/v4/chat/completions',model:'glm-4-flash',type:'openai'},moonshot:{url:'https://api.moonshot.cn/v1/chat/completions',model:'moonshot-v1-8k',type:'openai'},siliconflow:{url:'https://api.siliconflow.cn/v1/chat/completions',model:'deepseek-ai/DeepSeek-V3',type:'openai'},openrouter:{url:'https://openrouter.ai/api/v1/chat/completions',model:'anthropic/claude-sonnet-4',type:'openai'},gemini:{url:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',model:'gemini-2.0-flash',type:'gemini'},grok:{url:'https://api.x.ai/v1/chat/completions',model:'grok-3',type:'openai'},custom:{url:'',model:'',type:'openai'}};
async function apiJSON(url,opts={}){
  const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
  return d;
}
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
async function doGenerate(){const ac=S.apiConfig;if(!aiHasConfig(ac)){showToast('⚙',t('toast-no-api'));openModal('apiModal');return;}const ed=document.getElementById('mainEditor'),sel=ed.value.slice(ed.selectionStart,ed.selectionEnd).trim(),full=ed.value.trim(),extra=document.getElementById('aiPrompt').value.trim(),content=sel||full.slice(-1000);if(!content&&!extra){showToast('✎',t('toast-no-content'));return;}const lm={short:'100字以内',mid:'200-300字',long:'400-600字',xl:'800字以上'},tm={low:'保持严谨',mid:'适度创意',high:'大胆想象'};const md=AI_MODES[S.aiMode]||{p:'请处理以下内容：'};let prompt=md.p+'\n\n'+content+'\n\n【输出要求】'+lm[S.aiLen]+'。'+tm[S.aiTemp]+'。';if(S.proj)prompt+='\n\n【项目信息】\n'+buildCtx();if(extra)prompt+='\n\n【额外指令】'+extra;let sysPrompt='你是一位专业的中文写作助手。';const memCtx=buildMemoryContext();if(memCtx)sysPrompt+='\n\n'+memCtx;const btn=document.getElementById('generateBtn');btn.classList.add('loading');document.getElementById('generateBtnIcon').innerHTML='<div class="spinner"></div>';document.getElementById('generateBtnText').textContent=t('ap-gen-ing');try{showStreamingResult('arpText');const arpEl=document.getElementById('arpText');document.getElementById('arpMode').textContent=S.aiMode;document.getElementById('aiResultPopup').classList.add('show');let fullResult='';await callAIStream(prompt,ac,sysPrompt,(chunk)=>{fullResult+=chunk;arpEl.textContent=fullResult;});S.lastArpResult=fullResult;addHistory(S.aiMode,fullResult);}catch(e){showToast('✕',e.message||'请求失败');}finally{hideStreamingCursor();btn.classList.remove('loading');document.getElementById('generateBtnIcon').textContent='★';document.getElementById('generateBtnText').textContent=t('ap-gen');}}
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
  let prompt=md.p+'\n\n'+content+'\n\n【输出要求】'+(lm[S.aiLen]||'400-600字')+'。'+(tm[S.aiTemp]||'适度创意')+'。';
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
  let prompt=md.p+'\n\n'+content+'\n\n【输出要求】'+(lm[S.aiLen]||'400-600字')+'。'+(tm[S.aiTemp]||'适度创意')+'。';
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
