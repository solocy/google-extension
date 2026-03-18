// 检查是否是markdown文件
function isMarkdownFile() {
  const url = window.location.href;
  const contentType = document.contentType;

  // 检查URL扩展名
  if (url.match(/\.md$/i) || url.match(/\.markdown$/i)) {
    return true;
  }

  // 检查content-type
  if (contentType === 'text/plain' || contentType === 'text/markdown') {
    const path = window.location.pathname;
    if (path.match(/\.md$/i) || path.match(/\.markdown$/i)) {
      return true;
    }
  }

  return false;
}

// 渲染markdown
function renderMarkdown() {
  if (!isMarkdownFile()) {
    return;
  }

  // 获取原始文本内容
  const pre = document.querySelector('pre');
  let markdownText = '';

  if (pre) {
    markdownText = pre.textContent;
  } else {
    markdownText = document.body.textContent;
  }

  if (!markdownText.trim()) {
    return;
  }

  // 创建容器
  const container = document.createElement('div');
  container.className = 'markdown-viewer-container';

  // 创建头部工具栏
  const toolbar = document.createElement('div');
  toolbar.className = 'markdown-toolbar';
  toolbar.innerHTML = `
    <div class="toolbar-left">
      <span class="toolbar-title">📄 Markdown Viewer</span>
    </div>
    <div class="toolbar-right">
      <button id="toggle-raw" class="toolbar-btn">View Source</button>
      <button id="copy-content" class="toolbar-btn">Copy</button>
    </div>
  `;

  // 创建内容区域
  const content = document.createElement('div');
  content.className = 'markdown-content';

  try {
    // 使用marked.js渲染markdown
    content.innerHTML = marked.parse(markdownText);

    // 应用代码语法高亮
    if (typeof hljs !== 'undefined') {
      content.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }
  } catch (e) {
    content.innerHTML = `<pre>${markdownText}</pre>`;
  }

  // 替换body内容
  document.body.innerHTML = '';
  container.appendChild(toolbar);
  container.appendChild(content);
  document.body.appendChild(container);

  // 添加事件监听
  let showingRaw = false;
  const rawContent = markdownText;

  document.getElementById('toggle-raw').addEventListener('click', () => {
    if (showingRaw) {
      content.innerHTML = marked.parse(rawContent);
      // 重新应用语法高亮
      if (typeof hljs !== 'undefined') {
        content.querySelectorAll('pre code').forEach((block) => {
          hljs.highlightElement(block);
        });
      }
      document.getElementById('toggle-raw').textContent = 'View Source';
      content.className = 'markdown-content';
    } else {
      content.innerHTML = `<pre class="raw-markdown">${escapeHtml(rawContent)}</pre>`;
      document.getElementById('toggle-raw').textContent = 'View Rendered';
      content.className = 'markdown-content raw-mode';
    }
    showingRaw = !showingRaw;
  });

  document.getElementById('copy-content').addEventListener('click', () => {
    navigator.clipboard.writeText(rawContent).then(() => {
      const btn = document.getElementById('copy-content');
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    });
  });
}

// HTML转义函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 页面加载完成后执行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderMarkdown);
} else {
  renderMarkdown();
}
