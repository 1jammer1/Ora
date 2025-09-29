function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseInline(text) {
    // Code spans
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Images
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
    // Links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    // Autolinks
    text = text.replace(/<([^>]+)>/g, (match, url) => {
        if (url.match(/^https?:\/\//) || url.includes('@')) {
            return '<a href="' + (url.includes('@') ? 'mailto:' : '') + url + '">' + url + '</a>';
        }
        return match;
    });
    // Strikethrough
    text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    // Strong
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    // Em
    text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    text = text.replace(/_([^_\n]+)_/g, '<em>$1</em>');
    // Line breaks
    text = text.replace(/\n/g, '<br>');
    return text;
}

function parseMarkdown(md) {
    let lines = md.split('\n');
    let blocks = [];
    let i = 0;

    while (i < lines.length) {
        let line = lines[i].trim();
        let originalLine = lines[i];

        if (originalLine.match(/^#{1,6} /)) {
            let level = originalLine.match(/^#+/)[0].length;
            let text = originalLine.substring(level + 1);
            blocks.push({type: 'header', level, text});
            i++;
        } else if (originalLine.match(/^[-*_]{3,}$/)) {
            blocks.push({type: 'hr'});
            i++;
        } else if (originalLine.startsWith('>')) {
            let content = '';
            while (i < lines.length && lines[i].startsWith('>')) {
                content += lines[i].substring(1) + '\n';
                i++;
            }
            blocks.push({type: 'blockquote', content: parseMarkdown(content.trim())});
        } else if (originalLine.match(/^\d+\. /) || originalLine.startsWith('- ') || originalLine.startsWith('* ')) {
            let listType = originalLine.match(/^\d+\. /) ? 'ol' : 'ul';
            let items = [];
            while (i < lines.length && (lines[i].match(/^\d+\. /) || lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
                let itemText = lines[i].replace(/^(\d+\. |- |\* )/, '');
                let checked = null;
                if (itemText.match(/^\[ \]/)) {
                    checked = false;
                    itemText = itemText.replace(/^\[ \]\s*/, '');
                } else if (itemText.match(/^\[x\]/)) {
                    checked = true;
                    itemText = itemText.replace(/^\[x\]\s*/, '');
                }
                let nestedLines = [itemText];
                i++;
                while (i < lines.length && (lines[i].startsWith('  ') || lines[i].startsWith('\t'))) {
                    nestedLines.push(lines[i].trim());
                    i++;
                }
                // Parse the nested markdown for the list item. If it returns a single
                // paragraph block like "<p>...</p>", unwrap it so the content appears
                // inline next to the checkbox instead of on a new line.
                let nestedMd = nestedLines.join('\n');
                let nestedHtml = parseMarkdown(nestedMd);
                // If nestedHtml is exactly a single paragraph, remove the surrounding <p> tags.
                if (/^<p>[\s\S]*<\/p>$/.test(nestedHtml)) {
                    nestedHtml = nestedHtml.replace(/^<p>([\s\S]*)<\/p>$/, '$1');
                }
                items.push({html: nestedHtml, checked});
            }
            blocks.push({type: 'list', listType, items});
        } else if (originalLine.startsWith('```')) {
            let lang = originalLine.substring(3);
            let code = '';
            i++;
            while (i < lines.length && !lines[i].startsWith('```')) {
                code += lines[i] + '\n';
                i++;
            }
            i++;
            blocks.push({type: 'codeblock', lang, code: code.trim()});
        } else if (originalLine.startsWith('    ') || originalLine.startsWith('\t')) {
            let code = '';
            while (i < lines.length && (lines[i].startsWith('    ') || lines[i].startsWith('\t'))) {
                code += lines[i].substring(4) + '\n';
                i++;
            }
            blocks.push({type: 'codeblock', code: code.trim()});
        } else if (originalLine.includes('|') && i + 1 < lines.length && lines[i + 1].match(/^[\s|:-]+$/)) {
            let header = originalLine.split('|').map(s => s.trim()).filter(s => s);
            i++; // separator
            let rows = [];
            while (i < lines.length && lines[i].includes('|')) {
                rows.push(lines[i].split('|').map(s => s.trim()).filter(s => s));
                i++;
            }
            blocks.push({type: 'table', header, rows});
        } else if (line === '') {
            i++;
        } else {
            let para = '';
            while (i < lines.length && lines[i] !== '' && !isBlockStart(lines[i])) {
                para += lines[i] + '\n';
                i++;
            }
            if (para.trim()) {
                blocks.push({type: 'paragraph', text: para.trim()});
            }
        }
    }

    // Render to HTML
    let html = '';
    for (let block of blocks) {
        if (block.type === 'header') {
            html += `<h${block.level}>${parseInline(block.text)}</h${block.level}>`;
        } else if (block.type === 'hr') {
            html += '<hr>';
        } else if (block.type === 'blockquote') {
            html += '<blockquote>' + block.content + '</blockquote>';
        } else if (block.type === 'list') {
            html += '<' + block.listType + '>';
            for (let item of block.items) {
                html += '<li>' + (item.checked !== null ? '<input type="checkbox" ' + (item.checked ? 'checked ' : '') + 'disabled> ' : '') + item.html + '</li>';
            }
            html += '</' + block.listType + '>';
        } else if (block.type === 'codeblock') {
            if (block.lang) {
                html += `<pre><code class="language-${block.lang}">${escapeHtml(block.code)}</code></pre>`;
            } else {
                html += `<pre><code>${escapeHtml(block.code)}</code></pre>`;
            }
        } else if (block.type === 'table') {
            html += '<table><thead><tr>';
            for (let h of block.header) {
                html += '<th>' + parseInline(h) + '</th>';
            }
            html += '</tr></thead><tbody>';
            for (let row of block.rows) {
                html += '<tr>';
                for (let cell of row) {
                    html += '<td>' + parseInline(cell) + '</td>';
                }
                html += '</tr>';
            }
            html += '</tbody></table>';
        } else if (block.type === 'paragraph') {
            html += '<p>' + parseInline(block.text) + '</p>';
        }
    }
    return html;
}

function isBlockStart(line) {
    return line.match(/^#{1,6} /) || line.match(/^[-*_]{3,}$/) || line.startsWith('>') || line.match(/^\d+\. /) || line.startsWith('- ') || line.startsWith('* ') || line.startsWith('```') || line.startsWith('    ') || line.startsWith('\t');
}

function markdownToHtml(md) {
    return parseMarkdown(md);
}

document.addEventListener('DOMContentLoaded', function() {
    const input = document.getElementById('markdown-input');
    const output = document.getElementById('preview-output');
    const btnBold = document.getElementById('btn-bold');
    const btnItalic = document.getElementById('btn-italic');
    const btnH1 = document.getElementById('btn-h1');
    const btnLink = document.getElementById('btn-link');
    const btnList = document.getElementById('btn-list');
    const btnTask = document.getElementById('btn-task');
    const btnCode = document.getElementById('btn-code');
    const btnTheme = document.getElementById('btn-theme');
    const btnClear = document.getElementById('btn-clear');
    const resizer = document.getElementById('resizer');
    const panes = document.getElementById('panes');
    const fileBtn = document.getElementById('btn-file');
    const fileMenu = document.getElementById('file-menu');
    const fileNew = document.getElementById('file-new');
    const fileOpen = document.getElementById('file-open');
    const fileSave = document.getElementById('file-save');
    const fileSaveAs = document.getElementById('file-save-as');
    const fileSettings = document.getElementById('file-settings');
    const settingsModal = document.getElementById('settings-modal');
    const settingsSave = document.getElementById('settings-save');
    const settingTheme = document.getElementById('setting-theme');
    const settingFontsize = document.getElementById('setting-fontsize');

    // Theme persistence
    const THEME_KEY = 'md_theme';
    const CONTENT_KEY = 'md_content';
    function applyTheme(theme) {
        const root = document.documentElement;
        if (theme === 'light') root.classList.add('light');
        else root.classList.remove('light');
    }
    applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
    // Init settings select
    settingTheme && (settingTheme.value = (localStorage.getItem(THEME_KEY) || 'dark'));
    const FONT_KEY = 'md_font_px';
    const savedFont = parseInt(localStorage.getItem(FONT_KEY) || '14', 10);
    if (!isNaN(savedFont)) input.style.fontSize = savedFont + 'px';
    settingFontsize && (settingFontsize.value = String(savedFont));

    // Load persisted content
    input.value = localStorage.getItem(CONTENT_KEY) || '';

    // Debounce preview updates
    let t;
    // Keep a map of checkbox indices to source line numbers for toggle
    let checkboxMap = [];
    function updatePreview() {
        const md = input.value;
        // Build checkbox map by scanning lines
        checkboxMap = [];
        const lines = md.split('\n');
        for (let idx = 0; idx < lines.length; idx++) {
            const ln = lines[idx];
            if (/^\s*[-*+]\s+\[( |x|X)\]\s+/.test(ln)) {
                checkboxMap.push(idx);
            }
        }
        output.innerHTML = markdownToHtml(md);
        // Make checkboxes interactive
        const boxes = output.querySelectorAll('input[type="checkbox"][disabled]');
        boxes.forEach((box, i) => {
            box.removeAttribute('disabled');
            box.addEventListener('click', (e) => {
                e.preventDefault();
                const lineIndex = checkboxMap[i];
                if (lineIndex == null) return;
                const parts = input.value.split('\n');
                const line = parts[lineIndex];
                const toggled = line.replace(/^(\s*[-*+]\s+)\[( |x|X)\]/, (m, pre, state) => pre + (state.trim() ? '[ ]' : '[x]'));
                parts[lineIndex] = toggled;
                input.value = parts.join('\n');
                debouncedUpdate();
            }, { once: true });
        });
    }
    function debouncedUpdate() {
        clearTimeout(t); t = setTimeout(() => { updatePreview(); localStorage.setItem(CONTENT_KEY, input.value); }, 120);
    }

    input.addEventListener('input', debouncedUpdate);

    // Toolbar helpers
    function surroundSelection(before, after = before) {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const value = input.value;
        const sel = value.slice(start, end) || '';
        const newText = value.slice(0, start) + before + sel + after + value.slice(end);
        input.value = newText;
        const cursor = start + before.length + sel.length;
        input.focus();
        input.setSelectionRange(cursor, cursor);
        debouncedUpdate();
    }
    function insertLine(prefix, defaultText = '') {
        const start = input.selectionStart;
        const value = input.value;
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const insert = prefix + defaultText + '\n';
        input.value = value.slice(0, lineStart) + insert + value.slice(lineStart);
        const cursor = lineStart + insert.length;
        input.focus(); input.setSelectionRange(cursor, cursor);
        debouncedUpdate();
    }

    // Toolbar bindings
    btnBold?.addEventListener('click', () => surroundSelection('**'));
    btnItalic?.addEventListener('click', () => surroundSelection('*'));
    btnH1?.addEventListener('click', () => insertLine('# ', 'Heading'));
    btnLink?.addEventListener('click', () => surroundSelection('[', '](https://)'));
    btnList?.addEventListener('click', () => insertLine('- ', 'List item'));
    btnTask?.addEventListener('click', () => insertLine('- [ ] ', 'Task'));
    btnCode?.addEventListener('click', () => surroundSelection('```\n', '\n```'));
    btnClear?.addEventListener('click', () => { input.value = ''; debouncedUpdate(); });
    btnTheme?.addEventListener('click', () => {
        const isLight = document.documentElement.classList.toggle('light');
        localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (!e.ctrlKey) return;
        if (e.key.toLowerCase() === 'b') { e.preventDefault(); btnBold?.click(); }
        if (e.key.toLowerCase() === 'i') { e.preventDefault(); btnItalic?.click(); }
        if (e.key.toLowerCase() === 'k') { e.preventDefault(); btnLink?.click(); }
    });

    // Resizer behavior
    let dragging = false; let startX = 0; let leftWidth = 0;
    resizer?.addEventListener('mousedown', (e) => {
        dragging = true; startX = e.clientX; const rect = panes.getBoundingClientRect();
        const leftPane = document.getElementById('pane-editor');
        leftWidth = leftPane.getBoundingClientRect().width;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const delta = e.clientX - startX;
        const total = panes.getBoundingClientRect().width;
        const newLeft = Math.min(Math.max(leftWidth + delta, 200), total - 200);
        panes.style.gridTemplateColumns = `${newLeft}px 8px 1fr`;
    });
    window.addEventListener('mouseup', () => { if (dragging) { dragging = false; document.body.style.cursor = 'default'; }});

    // Initial render
    updatePreview();

    // ----- File Menu -----
    function closeMenus() { fileMenu?.setAttribute('hidden',''); }
    fileBtn?.addEventListener('click', (e) => {
        const isHidden = fileMenu.hasAttribute('hidden');
        if (isHidden) fileMenu.removeAttribute('hidden');
        else closeMenus();
        e.stopPropagation();
    });
    // Prevent closing when clicking inside menu
    fileMenu?.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => closeMenus());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

    let fileHandle = null; // For File System Access API
    async function saveToHandle(handle) {
        const writable = await handle.createWritable();
        await writable.write(input.value);
        await writable.close();
    }
    async function doSave() {
        try {
            if (window.showSaveFilePicker && !fileHandle) {
                fileHandle = await showSaveFilePicker({ types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }] });
            }
            if (fileHandle) { await saveToHandle(fileHandle); return; }
        } catch (e) { /* fall through to download */ }
        // Fallback: download
        const blob = new Blob([input.value], { type: 'text/markdown' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'document.md';
        a.click();
        URL.revokeObjectURL(a.href);
    }
    async function doSaveAs() {
        try {
            if (window.showSaveFilePicker) {
                fileHandle = await showSaveFilePicker({ types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }] });
                await saveToHandle(fileHandle); return;
            }
        } catch (e) { /* fallback */ }
        await doSave();
    }
    async function doOpen() {
        try {
            if (window.showOpenFilePicker) {
                const [handle] = await showOpenFilePicker({ types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }] });
                const file = await handle.getFile();
                const text = await file.text();
                input.value = text; debouncedUpdate(); fileHandle = handle; return;
            }
        } catch (e) { /* fallback */ }
        // Fallback: input type=file
        const picker = document.createElement('input');
        picker.type = 'file'; picker.accept = '.md,.markdown,.txt,text/markdown,text/plain';
        picker.addEventListener('change', async () => {
            const file = picker.files?.[0]; if (!file) return;
            const text = await file.text(); input.value = text; debouncedUpdate();
        });
        picker.click();
    }

    fileNew?.addEventListener('click', () => { input.value = ''; fileHandle = null; debouncedUpdate(); closeMenus(); });
    fileOpen?.addEventListener('click', async () => { await doOpen(); closeMenus(); });
    fileSave?.addEventListener('click', async () => { await doSave(); closeMenus(); });
    fileSaveAs?.addEventListener('click', async () => { await doSaveAs(); closeMenus(); });
    fileSettings?.addEventListener('click', () => { settingsModal?.removeAttribute('hidden'); closeMenus(); });

    // ----- Settings Modal -----
    settingsSave?.addEventListener('click', () => {
        const theme = settingTheme?.value || 'dark';
        applyTheme(theme); localStorage.setItem(THEME_KEY, theme);
        const size = parseInt(settingFontsize?.value || '14', 10);
        if (!isNaN(size)) { input.style.fontSize = size + 'px'; localStorage.setItem(FONT_KEY, String(size)); }
        settingsModal?.setAttribute('hidden','');
    });
    // Close on backdrop or any element with data-close
    settingsModal?.addEventListener('click', (e) => {
        const t = e.target;
        if (!t) return;
        if (t.dataset?.close !== undefined || t.classList?.contains('modal-backdrop')) {
            settingsModal?.setAttribute('hidden','');
        }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') settingsModal?.setAttribute('hidden',''); });
});