// ═══ Lock ═══
async function handleLock(){const v=document.getElementById('lockInput').value.trim();if(!v||v.length<4){showToast('✕',t('toast-pwd-short'));return;}const h=localStorage.getItem('ww_pwd_hash');if(!h){localStorage.setItem('ww_pwd_hash',await sha256(v));showToast('✓',t('toast-locked'));showApp();}else{if(await sha256(v)===h){showApp();}else{showToast('✕',t('toast-pwd-err'));document.getElementById('lockInput').value='';}}}
function showApp(){document.getElementById('lockScreen').style.display='none';document.getElementById('app').classList.add('visible');if(!db)initApp();}
function clearPwd(){if(confirm('确定重置？将清除所有数据。')){localStorage.clear();indexedDB.deleteDatabase(DB_NAME);location.reload();}}
function lockApp(){document.getElementById('lockScreen').style.display='flex';document.getElementById('app').classList.remove('visible');document.getElementById('lockInput').value='';}

// Boot after all script modules have loaded.
function bootApp(){document.getElementById('lockInput').addEventListener('keydown',e=>{if(e.key==='Enter')handleLock();});if(!localStorage.getItem('ww_pwd_hash')){document.getElementById('lockScreen').style.display='flex';document.getElementById('lockSub').textContent=t('lock-set');document.getElementById('lockBtn').textContent=t('lock-btn-set');document.getElementById('lockHint').innerHTML='';}else{showApp();}}


// ═══ Init ═══
async function initApp(){await openDB();renderAiModeGrid();renderMultiSlots();await loadProjects();await loadMemories();renderHistory();setInterval(()=>{if(S.autoSave&&S.unsaved)saveDoc();},30000);const ed=document.getElementById('mainEditor');ed.addEventListener('input',onEditorInput);ed.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveDoc();}});document.getElementById('focusEditor').addEventListener('input',()=>{document.getElementById('focusInfo').textContent=countWords(document.getElementById('focusEditor').value)+' 字 · Esc 退出';});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeFocus();closeAiResult();}});if(S.projects.length>0)await loadProject(S.projects[0].id);updateAllStats();}
document.addEventListener('DOMContentLoaded',bootApp);
