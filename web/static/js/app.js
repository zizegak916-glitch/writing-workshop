// ═══ Lock ═══
async function handleLock(){showApp();}
function showApp(){const lock=document.getElementById('lockScreen');if(lock)lock.style.display='none';document.getElementById('app').classList.add('visible');localStorage.removeItem('ww_pwd_hash');if(!db)initApp();}
function clearPwd(){if(confirm('确定重置？将清除所有数据。')){localStorage.clear();indexedDB.deleteDatabase(DB_NAME);location.reload();}}
function lockApp(){showToast('i','本地游客模式无需本地锁定');showApp();}

// Boot directly into local guest mode. Old password hashes are ignored and removed.
function bootApp(){localStorage.removeItem('ww_pwd_hash');showApp();}


// ═══ Init ═══
async function initApp(){await openDB();renderAiModeGrid();renderMultiSlots();await loadProjects();await loadMemories();renderHistory();setInterval(()=>{if(S.autoSave&&S.unsaved)saveDoc();},30000);const ed=document.getElementById('mainEditor');ed.addEventListener('input',onEditorInput);ed.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveDoc();}});document.getElementById('focusEditor').addEventListener('input',()=>{document.getElementById('focusInfo').textContent=countWords(document.getElementById('focusEditor').value)+' 字 · Esc 退出';});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeFocus();closeAiResult();}});if(S.projects.length>0)await loadProject(S.projects[0].id);updateAllStats();}
document.addEventListener('DOMContentLoaded',bootApp);
