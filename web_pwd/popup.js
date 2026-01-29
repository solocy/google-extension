// popup.js
// UI to list credentials by folder and send fill commands

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'onclick') e.addEventListener('click', attrs[k]);
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k === 'draggable') e.draggable = attrs[k] === 'true';
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

// 拖拽状态
let draggedItem = null;
let draggedType = null; // 'folder' or 'credential'

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

  // 构建文件夹树形结构
  const folderMap = {};
  folders.forEach(f => {
    folderMap[f.id] = { folder: f, credentials: [], children: [] };
    // 初始化展开状态（默认收起）
    if (folderExpandState[f.id] === undefined) {
      folderExpandState[f.id] = false;
    }
  });

  // 将凭证分配到对应文件夹（按sortOrder排序）
  const sortedCreds = [...creds].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  sortedCreds.forEach(c => {
    const fid = c.folderId || (folders[0] && folders[0].id);
    if (fid && folderMap[fid]) {
      folderMap[fid].credentials.push(c);
    }
  });

  // 构建父子关系（按sortOrder排序）
  const rootFolders = [];
  folders.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(f => {
    if (f.parentId && folderMap[f.parentId]) {
      folderMap[f.parentId].children.push(folderMap[f.id]);
    } else {
      rootFolders.push(folderMap[f.id]);
    }
  });

  // 文件夹图标选择
  function getFolderIcon(folderName, level) {
    const name = folderName.toLowerCase();
    if (name.includes('工作') || name.includes('work')) return '💼';
    if (name.includes('个人') || name.includes('personal')) return '👤';
    if (name.includes('银行') || name.includes('bank') || name.includes('金融')) return '🏦';
    if (name.includes('社交') || name.includes('social')) return '💬';
    if (name.includes('购物') || name.includes('shop')) return '🛒';
    if (name.includes('游戏') || name.includes('game')) return '🎮';
    if (name.includes('邮箱') || name.includes('email') || name.includes('mail')) return '📧';
    if (name.includes('默认') || name.includes('default')) return '📁';
    if (level > 0) return '📂';
    return '📁';
  }

  // 递归渲染文件夹
  function renderFolderTree(folderData, level = 0, parentId = null) {
    const { folder, credentials, children } = folderData;
    const folderSection = el('div', {
      class: 'folder-section',
      'data-level': level.toString(),
      'data-folder-id': folder.id,
      draggable: 'true'
    });
    const isExpanded = folderExpandState[folder.id];

    // 拖拽事件
    folderSection.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      draggedItem = folder;
      draggedType = 'folder';
      folderSection.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', folder.id);
    });

    folderSection.addEventListener('dragend', () => {
      folderSection.classList.remove('dragging');
      draggedItem = null;
      draggedType = null;
      // 清理所有拖放指示
      document.querySelectorAll('.drag-over').forEach(elem => elem.classList.remove('drag-over'));
    });

    folderSection.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedType === 'folder' && draggedItem && draggedItem.id !== folder.id) {
        folderSection.classList.add('drag-over');
      } else if (draggedType === 'credential' && draggedItem) {
        // 允许凭证拖到文件夹
        folderSection.classList.add('drag-over');
      }
    });

    folderSection.addEventListener('dragleave', () => {
      folderSection.classList.remove('drag-over');
    });

    folderSection.addEventListener('drop', async (e) => {
      e.preventDefault();
      folderSection.classList.remove('drag-over');
      if (draggedType === 'folder' && draggedItem && draggedItem.id !== folder.id) {
        await reorderFolder(draggedItem.id, folder.id, parentId);
      } else if (draggedType === 'credential' && draggedItem) {
        await moveCredentialToFolder(draggedItem.id, folder.id);
      }
    });

    // 文件夹头部
    const folderHeader = el('div', {
      class: 'folder-header' + (isExpanded ? ' expanded' : ' collapsed')
    });

    // 文件夹头部也接收拖放（用于凭证拖入）
    folderHeader.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (draggedType === 'credential' && draggedItem) {
        folderHeader.classList.add('drag-over');
      }
    });

    folderHeader.addEventListener('dragleave', () => {
      folderHeader.classList.remove('drag-over');
    });

    folderHeader.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      folderHeader.classList.remove('drag-over');
      if (draggedType === 'credential' && draggedItem) {
        await moveCredentialToFolder(draggedItem.id, folder.id);
      }
    });

    // 拖拽手柄
    const dragHandle = el('span', { class: 'drag-handle' }, '⋮⋮');
    dragHandle.addEventListener('mousedown', (e) => e.stopPropagation());

    // 文件夹图标
    const folderIcon = el('span', { class: 'folder-icon' }, getFolderIcon(folder.name, level));

    // 展开箭头
    const arrow = el('span', { class: 'folder-arrow' }, '▼');

    // 文件夹名称
    const nameSpan = el('span', { class: 'folder-name' }, folder.name);

    // 数量标签
    const countSpan = el('span', { class: 'folder-count' }, `${credentials.length}`);

    // 操作按钮容器
    const actions = el('div', { class: 'folder-actions' });

    const addSubBtn = el('button', {
      class: 'btn-add-subfolder',
      onclick: (e) => {
        e.stopPropagation();
        createSubFolder(folder.id);
      }
    }, '+ 子文件夹');

    const deleteBtn = el('button', {
      class: 'btn-delete-folder',
      onclick: (e) => {
        e.stopPropagation();
        deleteFolder(folder.id, folder.name);
      }
    }, '删除');

    actions.appendChild(addSubBtn);
    actions.appendChild(deleteBtn);

    folderHeader.appendChild(dragHandle);
    folderHeader.appendChild(folderIcon);
    folderHeader.appendChild(arrow);
    folderHeader.appendChild(nameSpan);
    folderHeader.appendChild(countSpan);
    folderHeader.appendChild(actions);

    // 点击展开/收起
    folderHeader.addEventListener('click', (e) => {
      if (e.target.closest('.folder-actions')) return;
      toggleFolder(folder.id);
    });

    folderSection.appendChild(folderHeader);

    // 凭证列表容器
    const credList = el('div', {
      class: 'folder-content',
      style: isExpanded ? '' : 'display: none;'
    });

    if (credentials.length === 0 && children.length === 0) {
      const emptyNote = el('div', { class: 'folder-empty' }, '暂无保存的网站');
      credList.appendChild(emptyNote);
    } else {
      credentials.forEach((c) => {
        const item = el('div', {
          class: 'cred',
          'data-cred-id': c.id,
          draggable: 'true'
        });

        // 凭证拖拽事件
        item.addEventListener('dragstart', (e) => {
          e.stopPropagation();
          draggedItem = c;
          draggedType = 'credential';
          item.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', c.id);
        });

        item.addEventListener('dragend', () => {
          item.classList.remove('dragging');
          draggedItem = null;
          draggedType = null;
          // 清理所有拖放指示
          document.querySelectorAll('.drag-over').forEach(elem => elem.classList.remove('drag-over'));
        });

        item.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (draggedType === 'credential' && draggedItem && draggedItem.id !== c.id) {
            item.classList.add('drag-over');
          }
        });

        item.addEventListener('dragleave', () => {
          item.classList.remove('drag-over');
        });

        item.addEventListener('drop', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          item.classList.remove('drag-over');
          if (draggedType === 'credential' && draggedItem && draggedItem.id !== c.id) {
            await reorderCredential(draggedItem.id, c.id, folder.id);
          }
        });

        // 标题行 - 添加tooltip显示源网站
        const titleEl = el('div', { class: 'cred-title', title: c.origin || c.urlPattern || '' }, c.title || c.origin);
        item.appendChild(titleEl);

        // 用户名行
        const usernameEl = el('div', { class: 'cred-username' }, c.username || '(无用户名)');
        item.appendChild(usernameEl);

        // 密码行
        const passwordRow = el('div', { class: 'cred-password-row' });
        const passwordLabel = el('span', { class: 'cred-password-label' }, '');
        const passwordValue = el('span', { class: 'cred-password-value' }, '••••••••');
        passwordValue.dataset.hidden = 'true';
        passwordValue.dataset.password = c.password || '';

        const togglePwdBtn = el('button', {
          class: 'btn-toggle-pwd',
          onclick: (e) => {
            e.stopPropagation();
            const isHidden = passwordValue.dataset.hidden === 'true';
            if (isHidden) {
              passwordValue.textContent = passwordValue.dataset.password;
              passwordValue.dataset.hidden = 'false';
              togglePwdBtn.textContent = '隐藏';
            } else {
              passwordValue.textContent = '••••••••';
              passwordValue.dataset.hidden = 'true';
              togglePwdBtn.textContent = '显示';
            }
          }
        }, '显示');

        const editPwdBtn = el('button', {
          class: 'btn-edit-pwd',
          onclick: (e) => {
            e.stopPropagation();
            editPassword(c);
          }
        }, '修改');

        passwordRow.appendChild(passwordLabel);
        passwordRow.appendChild(passwordValue);
        passwordRow.appendChild(togglePwdBtn);
        passwordRow.appendChild(editPwdBtn);
        item.appendChild(passwordRow);

        // 操作按钮行
        const actionsEl = el('div', { class: 'cred-actions' },
          el('button', { onclick: () => fillCredential(c, false), class: 'btn-fill' }, '填充'),
          el('button', { onclick: () => fillCredential(c, true), class: 'btn-fill-login' }, '填充登录'),
          el('button', { onclick: () => openAndLogin(c), class: 'btn-open' }, '打开'),
          el('button', { onclick: () => deleteCredential(c.id), class: 'btn-delete' }, '删除')
        );
        item.appendChild(actionsEl);

        credList.appendChild(item);
      });
    }

    folderSection.appendChild(credList);

    // 递归渲染子文件夹
    if (isExpanded && children.length > 0) {
      const childrenContainer = el('div', { class: 'folder-children' });
      children.forEach(child => {
        childrenContainer.appendChild(renderFolderTree(child, level + 1, folder.id));
      });
      folderSection.appendChild(childrenContainer);
    }

    return folderSection;
  }

  // 渲染所有根级文件夹
  rootFolders.forEach(folderData => {
    container.appendChild(renderFolderTree(folderData, 0, null));
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

// 重新排序文件夹
async function reorderFolder(draggedId, targetId, parentId) {
  await sendMessage({
    type: 'reorderFolder',
    draggedId,
    targetId,
    parentId
  });
  refresh();
}

// 移动凭证到文件夹
async function moveCredentialToFolder(credId, folderId) {
  await sendMessage({
    type: 'updateCredential',
    id: credId,
    updates: { folderId }
  });
  showStatus('已移动到目标文件夹', true);
  refresh();
}

// 重新排序凭证
async function reorderCredential(draggedId, targetId, folderId) {
  await sendMessage({
    type: 'reorderCredential',
    draggedId,
    targetId,
    folderId
  });
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

async function editPassword(credential) {
  const newPassword = prompt('请输入新密码:', credential.password || '');
  if (newPassword === null) return; // 用户取消
  if (newPassword === credential.password) {
    showStatus('密码未修改', true);
    return;
  }

  await sendMessage({
    type: 'updateCredential',
    id: credential.id,
    updates: { password: newPassword }
  });
  showStatus('密码已更新', true);
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

async function createSubFolder(parentId) {
  const name = prompt('请输入子文件夹名称:');
  if (!name) return;
  await sendMessage({ type: 'createFolder', name, parentId });
  showStatus('子文件夹已创建', true);
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
