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

    function updatePreview() {
        output.innerHTML = markdownToHtml(input.value);
    }

    input.addEventListener('input', updatePreview);
    updatePreview(); // initial render
});