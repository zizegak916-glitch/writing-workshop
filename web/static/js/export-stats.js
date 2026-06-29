/* ===== 新增功能：导出/快捷键帮助/统计可视化 ===== */

// 1. 导出功能
function exportProject(format) {
    if (!S.proj || !S.proj.project) { showToast('✕', '请先打开一个项目'); return; }
    const chapters = S.proj.chapters || [];
    const title = S.proj.project.name || '未命名项目';
    
    if (format === 'txt') {
        let content = title + '\n' + '='.repeat(40) + '\n\n';
        chapters.forEach((ch, i) => {
            content += `第${i+1}章 ${ch.title || '未命名'}\n`;
            content += '-'.repeat(30) + '\n';
            content += (ch.content || '') + '\n\n';
        });
        downloadFile(content, `${title}.txt`, 'text/plain');
        showToast('✓', `已导出TXT (${chapters.length}章)`);
    } else if (format === 'md') {
        let content = `# ${title}\n\n`;
        chapters.forEach((ch, i) => {
            content += `## 第${i+1}章 ${ch.title || '未命名'}\n\n`;
            content += (ch.content || '') + '\n\n---\n\n';
        });
        downloadFile(content, `${title}.md`, 'text/markdown');
        showToast('✓', `已导出Markdown (${chapters.length}章)`);
    } else if (format === 'json') {
        const data = { title, chapters, exported_at: new Date().toISOString() };
        downloadFile(JSON.stringify(data, null, 2), `${title}.json`, 'application/json');
        showToast('✓', `已导出JSON (${chapters.length}章)`);
    }
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 2. 快捷键帮助面板
function showShortcuts() {
    let modal = document.getElementById('shortcutsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'shortcutsModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
        <div style="background:var(--bg-card,#1e1e2e);border-radius:12px;padding:24px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;color:var(--text,#e0e0e0)">
            <h3 style="margin:0 0 16px;font-size:18px">⌨️ 快捷键</h3>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr><td style="padding:6px 0"><kbd>Ctrl+S</kbd></td><td>保存文档</td></tr>
                <tr><td style="padding:6px 0"><kbd>Ctrl+Z</kbd></td><td>撤销</td></tr>
                <tr><td style="padding:6px 0"><kbd>Ctrl+Y</kbd></td><td>重做</td></tr>
                <tr><td style="padding:6px 0"><kbd>Ctrl+K</kbd></td><td>快捷键帮助</td></tr>
                <tr><td style="padding:6px 0"><kbd>Ctrl+E</kbd></td><td>导出当前章节</td></tr>
                <tr><td style="padding:6px 0"><kbd>Ctrl+B</kbd></td><td>加粗选中文本</td></tr>
                <tr><td style="padding:6px 0"><kbd>Ctrl+I</kbd></td><td>斜体选中文本</td></tr>
                <tr><td style="padding:6px 0"><kbd>Esc</kbd></td><td>关闭弹窗/退出专注模式</td></tr>
                <tr><td style="padding:6px 0"><kbd>Ctrl+Shift+E</kbd></td><td>导出TXT</td></tr>
                <tr><td style="padding:6px 0"><kbd>Ctrl+Shift+M</kbd></td><td>导出Markdown</td></tr>
            </table>
            <button onclick="this.closest('.modal-overlay').remove()" style="margin-top:16px;padding:8px 20px;border:none;border-radius:8px;background:var(--accent,#7c3aed);color:#fff;cursor:pointer">关闭</button>
        </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    }
}

// 3. 写作统计可视化 - CSS柱状图
function showWritingStats() {
    let modal = document.getElementById('statsModal');
    if (modal) modal.remove();
    
    // 从IndexedDB读取章节数据
    const stats = {};
    if (S.proj && S.proj.chapters) {
        S.proj.chapters.forEach(ch => {
            const words = (ch.content || '').replace(/\s/g, '').length;
            stats[ch.title || '未命名'] = words;
        });
    }
    
    const entries = Object.entries(stats);
    const maxWords = Math.max(...entries.map(e => e[1]), 1);
    
    let barsHTML = entries.map(([title, words]) => {
        const pct = Math.round(words / maxWords * 100);
        const color = words >= 2000 ? '#22c55e' : words >= 1000 ? '#eab308' : '#ef4444';
        return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">
            <span style="width:120px;font-size:12px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${title}</span>
            <div style="flex:1;height:20px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;transition:width 0.5s"></div>
            </div>
            <span style="width:60px;font-size:12px;color:${color}">${words}字</span>
        </div>`;
    }).join('');
    
    const totalWords = entries.reduce((sum, [, w]) => sum + w, 0);
    const avgWords = entries.length ? Math.round(totalWords / entries.length) : 0;
    
    modal = document.createElement('div');
    modal.id = 'statsModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
    <div style="background:var(--bg-card,#1e1e2e);border-radius:12px;padding:24px;max-width:550px;width:90%;max-height:80vh;overflow-y:auto;color:var(--text,#e0e0e0)">
        <h3 style="margin:0 0 8px;font-size:18px">📊 写作统计</h3>
        <div style="display:flex;gap:16px;margin-bottom:16px;font-size:13px;color:var(--text-hint,#999)">
            <span>总字数: <b style="color:var(--accent,#7c3aed)">${totalWords.toLocaleString()}</b></span>
            <span>章节数: <b>${entries.length}</b></span>
            <span>均字数: <b>${avgWords.toLocaleString()}</b></span>
        </div>
        ${barsHTML || '<p style="color:#999;text-align:center">暂无章节数据</p>'}
        <button onclick="this.closest('div[style]').parentElement.remove()" style="margin-top:16px;padding:8px 20px;border:none;border-radius:8px;background:var(--accent,#7c3aed);color:#fff;cursor:pointer">关闭</button>
    </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

// 4. 全局快捷键监听（在initApp中调用）
function initShortcuts() {
    document.addEventListener('keydown', e => {
        if (e.key === 'k' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
            e.preventDefault();
            showShortcuts();
        }
        if (e.key === 'e' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
            e.preventDefault();
            exportProject('txt');
        }
        if (e.key === 'm' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
            e.preventDefault();
            exportProject('md');
        }
    });
}
