// ═══ Settings Modal ═══
async function apiJSON(url,opts={}){
  const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
  return d;
}

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
