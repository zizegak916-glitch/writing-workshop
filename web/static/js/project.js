// ═══ Projects ═══
async function loadProjects(){S.projects=await dbAll('projects');S.projects.sort((a,b)=>(b.updated_at||0)-(a.updated_at||0));if(S.projects.length>0&&!S.proj)await loadProject(S.projects[0].id);}
async function loadProject(id){const p=await dbGet('projects',id);if(!p)return;const [os,cs,chs]=await Promise.all([dbByIndex('outlines','project_id',id),dbByIndex('characters','project_id',id),dbByIndex('chapters','project_id',id)]);os.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));chs.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));S.proj={project:p,outlines:os,characters:cs,chapters:chs};S.active=null;S.wordGoal=p.goal||2000;document.getElementById('currentProjectName').textContent=p.name;document.querySelector('.project-selector')?.setAttribute('title',p.name);renderOutlineList();renderChapterList();renderCharList();if(chs.length>0)loadChapterContent(chs[0].id);else if(os.length>0)loadOutlineContent(os[0].id);else{document.getElementById('mainEditor').value='';document.getElementById('chapterTitle').value='';}onEditorInput();showToast('📁',p.name);}
async function createProject(){const name=document.getElementById('newProjectName').value.trim();if(!name){showToast('✕',t('toast-enter-name'));return;}const g=[...document.querySelectorAll('#genreGrid .genre-chip.on')].map(e=>e.textContent),now=Date.now();const id=await dbPut('projects',{name,genre:g[0]||t('genre-uncategorized'),description:document.getElementById('newProjectDesc').value.trim(),world_setting:document.getElementById('newProjectWorld').value.trim(),goal:parseInt(document.getElementById('dailyGoal').value)||2000,created_at:now,updated_at:now});await dbPut('outlines',{project_id:id,title:t('default-chapter-title'),content:'',sort_order:0,created_at:now});closeModal('newProjectModal');await loadProjects();await loadProject(id);showToast('📁',t('toast-created')+': '+name);document.getElementById('newProjectName').value='';}
function renderProjectList(){const el=document.getElementById('projectList');if(!S.projects.length){el.innerHTML='<div style="text-align:center;padding:30px;color:var(--text-muted)">'+t('ps-none')+'</div>';return;}el.innerHTML=S.projects.map(p=>'<div class="project-list-item" onclick="loadProject('+p.id+');closeModal(\'projectModal\')"><div class="pli-name">'+p.name+'</div><div class="pli-meta">'+p.genre+' · '+new Date(p.created_at).toLocaleDateString(currentLang)+'</div></div>').join('');}
function exportProject(){if(!S.proj)return showToast('✕',t('toast-no-proj'));const d={version:1,project:S.proj.project,outlines:S.proj.outlines,characters:S.proj.characters,chapters:S.proj.chapters};const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(S.proj.project.name||t('default-doc-title'))+'.json';a.click();showToast('↓',t('toast-exported'));}
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
