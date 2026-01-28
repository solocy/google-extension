// popup.js
// UI to list credentials by folder and send fill commands

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'onclick') e.addEventListener('click', attrs[k]);
    else if (k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  }
  return e;
}

async function sendMessage(msg) {
  return new Promise((res) => chrome.runtime.sendMessage(msg, (r) => res(r)));
}

// 记录文件夹展开状态
const folderExpandState = {};

async function refresh() {
  const r = await sendMessage({ type: 'listCredentials' });
  if (!r) {
    document.getElementById('credentials').innerHTML = '<div class="empty-state">无法连接到扩展后台<br><small>请刷新页面重试</small></div>';
    return;
  }
  const creds = r.credentials || [];
  const folders = r.folders || [];
  const settings = r.settings || { autoFillEnabled: true };

  const container = document.getElementById('credentials');
  container.innerHTML = '';

  // Group credentials by folder
  const folderMap = {};
  folders.forEach(f => {
    folderMap[f.id] = { folder: f, credentials: [] };
    // 初始化展开状态（默认展开）
    if (folderExpandState[f.id] === undefined) {
      folderExpandState[f.id] = true;
    }
  });

  creds.forEach(c => {
    const fid = c.folderId || (folders[0] && folders[0].id);
    if (fid && folderMap[fid]) {
      folderMap[fid].credentials.push(c);
    }
  });

  // Display all folders (including empty ones)
  Object.values(folderMap).forEach(({ folder, credentials }) => {
    const folderSection = el('div', { class: 'folder-section' });
    const isExpanded = folderExpandState[folder.id];

    // 文件夹头部（可点击展开/收起）
    const folderHeader = el('div', {
      class: 'folder-header' + (isExpanded ? ' expanded' : ' collapsed'),
      onclick: () => toggleFolder(folder.id)
    },
      el('span', { class: 'folder-arrow' }, isExpanded ? '▼' : '▶'),
      el('span', { class: 'folder-name' }, folder.name),
      el('span', { class: 'folder-count' }, `(${credentials.length})`),
      el('button', {
        class: 'btn-delete-folder',
        onclick: (e) => {
          e.stopPropagation(); // 防止触发展开/收起
          deleteFolder(folder.id, folder.name);
        }
      }, '删除')
    );
    folderSection.appendChild(folderHeader);

    // 凭证列表容器
    const credList = el('div', {
      class: 'folder-content',
      style: isExpanded ? '' : 'display: none;'
    });

    if (credentials.length === 0) {
      const emptyNote = el('div', { class: 'folder-empty' }, '暂无保存的网站');
      credList.appendChild(emptyNote);
    } else {
      credentials.forEach(c => {
        const item = el('div', { class: 'cred' },
          el('div', { class: 'cred-title' }, c.title || c.origin),
          el('div', { class: 'cred-username' }, c.username || ''),
          el('div', { class: 'cred-actions' },
            el('button', { onclick: () => fillCredential(c, false), class: 'btn-fill' }, '填充'),
            el('button', { onclick: () => fillCredential(c, true), class: 'btn-fill-login' }, '填充并登录'),
            el('button', { onclick: () => openAndLogin(c), class: 'btn-open' }, '打开并登录'),
            el('button', { onclick: () => deleteCredential(c.id), class: 'btn-delete' }, '删除')
          )
        );
        credList.appendChild(item);
      });
    }

    folderSection.appendChild(credList);
    container.appendChild(folderSection);
  });

  // 如果没有任何文件夹
  if (folders.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无文件夹<br><small>点击"新建文件夹"创建</small></div>';
  }

  document.getElementById('auto-fill').checked = !!settings.autoFillEnabled;
}

function toggleFolder(folderId) {
  folderExpandState[folderId] = !folderExpandState[folderId];
  refresh();
}

async function fillCredential(credential, submit) {
  const tabs = await new Promise(res => chrome.tabs.query({ active: true, currentWindow: true }, res));
  if (!tabs || !tabs[0]) {
    showStatus('没有活动标签页', false);
    return;
  }
  const tabId = tabs[0].id;

  chrome.tabs.sendMessage(tabId, { type: 'fillCredential', credential, submit }, (resp) => {
    if (chrome.runtime.lastError) {
      showStatus('填充失败：页面未加载完成或不支持', false);
      return;
    }
    showStatus(resp && resp.success ? (submit ? '已填充并尝试登录' : '已填充') : '填充失败', resp && resp.success);
  });
}

function showStatus(text, success = true) {
  const status = document.getElementById('status');
  status.textContent = text;
  status.style.color = success ? '#4caf50' : '#f44336';
  setTimeout(() => {
    status.textContent = '';
    status.style.color = '#4caf50';
  }, 2000);
}

async function openAndLogin(credential) {
  const result = await sendMessage({ type: 'openCredential', credential, submit: true });
  showStatus(result && result.success ? '正在打开并登录...' : '打开失败', result && result.success);
}

async function deleteCredential(id) {
  if (!confirm('确定要删除这个登录信息吗？')) return;
  await sendMessage({ type: 'deleteCredential', id });
  showStatus('已删除', true);
  refresh();
}

async function deleteFolder(folderId, folderName) {
  const message = `确定要删除文件夹"${folderName}"吗？\n该文件夹下的登录信息不会被删除，将移到默认文件夹。`;
  if (!confirm(message)) return;

  const result = await sendMessage({ type: 'deleteFolder', folderId });
  if (result && result.success) {
    showStatus('文件夹已删除', true);
    refresh();
  } else {
    showStatus('删除失败', false);
  }
}

async function createFolder() {
  const name = prompt('请输入文件夹名称:');
  if (!name) return;
  await sendMessage({ type: 'createFolder', name });
  showStatus('文件夹已创建', true);
  refresh();
}

async function toggleAutoFill(e) {
  await sendMessage({ type: 'updateSettings', settings: { autoFillEnabled: e.target.checked } });
  showStatus(e.target.checked ? '已启用自动填充' : '已禁用自动填充', true);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-new-folder').addEventListener('click', createFolder);
  document.getElementById('auto-fill').addEventListener('change', toggleAutoFill);
  refresh();
});
