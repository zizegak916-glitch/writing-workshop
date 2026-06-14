// ═══ Modals ═══
function openModal(id){document.getElementById(id).classList.add('show');if(id==='projectModal')renderProjectList();if(id==='apiModal')loadApiUI();if(id==='settingsModal')initSettingsModal();}
function closeModal(id){document.getElementById(id).classList.remove('show');}
function toggleGenre(el){el.parentElement.querySelectorAll('.genre-chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');}
document.querySelectorAll('.modal-overlay').forEach(o=>{o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('show');});});


// ═══ Theme ═══
function toggleTheme(){document.body.classList.toggle('light');const isLight=document.body.classList.contains('light');localStorage.setItem('ww_theme',isLight?'light':'dark');}
(function loadTheme(){if(localStorage.getItem('ww_theme')==='light'){document.body.classList.add('light');}})();
