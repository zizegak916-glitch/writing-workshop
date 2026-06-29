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
  if(lockSub){
    const stored=localStorage.getItem('ww_pwd_hash');
    lockSub.textContent=stored?t('lock-unlock'):t('lock-set');
  }
  const lockBtn=document.getElementById('lockBtn');
  if(lockBtn)lockBtn.textContent=localStorage.getItem('ww_pwd_hash')?t('lock-btn-unlock'):t('lock-btn-set');
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
      document.getElementById('oldPwd').placeholder=t('mod-oldpwd');
      document.getElementById('newPwd').placeholder=t('mod-newpwd');
      document.getElementById('newPwd2').placeholder=t('mod-newpwd2');
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
  const old=document.getElementById('oldPwd').value,new1=document.getElementById('newPwd').value,new2=document.getElementById('newPwd2').value;
  const stored=localStorage.getItem('ww_pwd_hash');
  if(stored){if(!old){showToast('✕',t('toast-enter-current-password'));return;}if(await sha256(old)!==stored){showToast('✕',t('toast-current-password-wrong'));return;}}
  if(!new1||new1.length<4){showToast('✕',t('toast-new-password-short'));return;}
  if(new1!==new2){showToast('✕',t('toast-password-mismatch'));return;}
  localStorage.setItem('ww_pwd_hash',await sha256(new1));
  document.getElementById('oldPwd').value='';document.getElementById('newPwd').value='';document.getElementById('newPwd2').value='';
  showToast('✓',t('toast-pwd-changed'));
}
// Hook: render stats when profile modal opens
(function(){const orig=openModal;openModal=function(id){orig(id);if(id==='profileModal')renderProfileStats();};})();


// ═══ AI Quick Tools ═══
let aiQuickLastResult='',aiQuickMode='',aiPresLevel='medium',aiDetectScores=null;
function aiCheckApi(){const ac=S.apiConfig;if(!ac.key){showToast('⚙',t('toast-no-api'));openModal('apiModal');return false;}return true;}
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
    scores.push(m?Math.min(100,Math.max(0,parseInt(m[1],10))):50);
  }
  return scores;
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
  aiDetectScores=scores;
  // Draw radar chart
  const canvas=document.getElementById('aiRadarCanvas');
  drawRadarChart(canvas,scores);
  document.getElementById('aiRadarWrap').style.display='flex';
  // Show text result
  document.getElementById('aiQuickResultText').textContent=text;
  // Parse AI-like sentences from the text
  const sentWrap=document.getElementById('aiSentencesWrap');
  sentWrap.innerHTML='';
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
    if(isAIFragged||found.size<8){
      if(found.has(frag))continue;
      found.add(frag);
    }
  }
  if(found.size>0){
    let html='<div class="sent-label">📌 点击句子在编辑器中定位并高亮</div>';
    let idx=0;
    for(const s of found){
      const esc=s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
      const short=esc.length>30?esc.slice(0,30)+'…':esc;
      html+='<span class="sent-btn" data-sent-idx="'+idx+'" onclick="highlightSentInEditor(this)" title="'+esc+'">'+short+'</span>';
      idx++;
    }
    sentWrap.innerHTML=html;
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

// ═══ Sentence-sentence similarity helper ═══
function isAIFragged(){return false;}

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
    const prompt='你是一位专业的中文校对编辑。请仔细检查以下文字中的错别字、语病、标点错误和不通顺的句子。\n\n请按以下格式输出：\n1. 先列出所有发现的问题（编号列出，标注原文和修正）\n2. 然后输出一段"修正后全文"，直接给出修正后的完整文字\n\n如果文字没有问题，请直接回复"✅ 未发现错误"。\n\n'+ctx+'原文：\n'+text;
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
    const prompt='你是一位资深编辑。请根据以下文字内容，生成5个吸引人的章节标题。要求：\n1. 每个标题简洁有力（不超过15字）\n2. 风格多样（有悬念型、诗意型、直白型等）\n3. 能概括核心内容或吸引读者\n\n请用编号列出，每行一个标题。\n\n'+ctx+'内容：\n'+text.slice(0,2000);
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
    const prompt='你是一位创意写作顾问。根据以下内容，提供3-5条创作灵感和建议，包括：\n1. 情节发展方向\n2. 人物互动建议\n3. 场景/氛围增强\n4. 可以添加的细节\n\n每条建议简洁具体，能直接用于写作。用emoji标注类型。\n\n'+ctx+(title?'当前标题：'+title+'\n':'')+'内容：\n'+(content||'（空文档，请提供通用创作灵感）');
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
    const prompt='你是一位知识渊博的研究助手。根据以下写作内容，提供相关的背景知识和参考资料，帮助作者丰富内容。包括：\n1. 相关的历史/文化/科学背景\n2. 可参考的经典作品或案例\n3. 专业术语解释\n4. 细节描写的素材建议\n\n请分点列出，简洁实用。\n\n'+ctx+(title?'当前标题：'+title+'\n':'')+'内容/关键词：\n'+(content||'请提供通用写作参考资料');
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
      light:'你是一位资深的中文作家。请对以下文字做轻微调整以降低AI检测率。仅修改最明显的AI特征句式，保留95%以上的原文风格和用词。输出完整的重写后全文，不要输出分析。',
      medium:'你是一位资深的中文作家。请将以下文字重写为自然的人类写作风格，降低AI检测率。具体要求：\n\n1. 使用口语化、不规则的句式，加入个人语气\n2. 偶尔用短句或碎片化表达打破完美节奏\n3. 避免过度排比、对仗和华丽辞藻堆砌\n4. 添加一些即兴感、犹豫感、口语化表达\n5. 可以适当加入"其实""说实话""怎么说呢"这类口语词\n6. 句子长短不一，有快有慢\n7. 保持核心内容和情节不变\n8. 输出的必须是完整的重写后全文，不要输出分析和说明',
      heavy:'你是一位资深的中文作家。请完全重写以下文字，彻底消除AI痕迹。要求：\n\n1. 从零开始用自己的话重述，不要保留原文句式\n2. 大量使用口语化表达、方言词汇、个人风格\n3. 句子高度不规则，长短交错\n4. 加入犹豫、自问自答、跳跃性思维\n5. 可以加入适当的重复、回溯\n6. 表达要有"瑕疵感"——语法不必完美\n7. 保持核心内容和情节不变\n8. 输出的必须是完整的重写后全文'
    };
    const prompt=levelPrompts[aiPresLevel]+'\n\n'+ctx+'原文：\n'+text;
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
    const prompt='你是一位文本分析专家。请分析以下文字的AI生成特征，给出详细报告。\n\n⚠️ 重要声明：本分析结果仅供参考，不构成任何权威判定。AI检测本身存在误判率，人类写作也可能被误判为AI。\n\n请从以下维度分析，每项给出0-100的评分（越高越像AI）：\n\n1. **句式规律性** — 句子长度和结构是否过于整齐规律\n2. **词汇丰富度** — 是否过度使用某些高频AI词汇（如"此外""值得注意的是""总而言之"等）\n3. **情感自然度** — 情感表达是否过于"得体"，缺少真实的情绪波动\n4. **结构完美度** — 段落和逻辑是否过于工整，像模板输出\n5. **口语化程度** — 是否缺少口语、方言、碎片句等人类特征\n6. **重复与冗余** — 人类写作常有适度重复和冗余，AI往往过于精炼\n\n请在每项后面直接写评分数字，格式如：\n句式规律性 — 75/100\n\n最后给出：\n- 综合AI概率评估（仅供参考）\n- 3-5条具体的AI特征描述\n- 如果想让文字更像人写，建议修改哪些方面\n\n格式要求：用清晰的编号和分隔线，便于阅读。\n\n待分析文字：\n'+text.slice(0,3000);
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
function renderMpAi(){const el=document.getElementById('mpAiModeGrid');if(!el||el.children.length>0)return;const g={};for(const[k,v]of Object.entries(AI_MODES)){if(!g[v.group])g[v.group]=[];g[v.group].push(k);}let h='';for(const[label,keys]of Object.entries(g)){h+='<div class="mode-group"><div class="mode-group-title">'+t('grp-'+label)+'</div><div class="mode-grid">';for(const k of keys)h+='<button class="mode-btn'+(S.aiMode===k?' selected':'')+'" onclick="selectMode(this,\''+k+'\')"><span class="micon">'+AI_MODES[k].icon+'</span>'+t('mode-'+k)+'</button>';h+='</div></div>';}el.innerHTML=h;if(typeof renderMpMultiSlots==='function')renderMpMultiSlots();}
async function doGenerateMobile(){const ac=S.apiConfig;if(!ac.key){showToast('⚙',t('toast-no-api'));openModal('apiModal');return;}const ed=document.getElementById('mainEditor'),content=ed.value.slice(-1000)||'';const extra=document.getElementById('mpAiPrompt')?.value.trim()||'';if(!content&&!extra){showToast('✎',t('toast-no-content'));return;}const lm={short:'100字以内',mid:'200-300字',long:'400-600字',xl:'800字以上'},tm={low:'保持严谨',mid:'适度创意',high:'大胆想象'};const md=AI_MODES[S.aiMode]||{p:'请处理以下内容：'};let prompt=md.p+'\n\n'+content+'\n\n【输出要求】'+lm[S.aiLen]+'。'+tm[S.aiTemp]+'。';if(S.proj)prompt+='\n\n【项目信息】\n'+buildCtx();if(extra)prompt+='\n\n【额外指令】'+extra;let sysPrompt='你是一位专业的中文写作助手。';const memCtx=buildMemoryContext();if(memCtx)sysPrompt+='\n\n'+memCtx;const btn=document.getElementById('mpGenerateBtn');btn.classList.add('loading');btn.textContent=t('ap-gen-ing');try{const r=await callAI(prompt,ac,sysPrompt);S.lastArpResult=r;document.getElementById('arpText').textContent=r;document.getElementById('arpMode').textContent=S.aiMode;document.getElementById('aiResultPopup').classList.add('show');addHistory(S.aiMode,r);}catch(e){showToast('✕',e.message||'失败');}finally{btn.classList.remove('loading');btn.innerHTML='<span>★</span><span data-i18n="ap-gen">'+t('ap-gen')+'</span>';}}

// ═══ Cookie Consent & Privacy ═══
function showPrivacyModal(){document.getElementById('privacyModal').classList.add('show');}
function closePrivacyModal(){document.getElementById('privacyModal').classList.remove('show');}
function switchPrivTab(tab,el){document.querySelectorAll('.priv-panel').forEach(p=>p.style.display='none');document.querySelectorAll('.priv-tab').forEach(t=>t.classList.remove('active'));document.getElementById('privTab-'+tab).style.display='block';el.classList.add('active');}
function acceptCookie(){localStorage.setItem('ww_cookie_consent','1');document.getElementById('cookieBanner').classList.remove('show');}
(function(){
  if(!localStorage.getItem('ww_cookie_consent')){document.getElementById('cookieBanner').classList.add('show');}
})();
