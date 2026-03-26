(function () {
  const params = new URLSearchParams(window.location.search);
  const promptId = params.get('promptId');

  const countdownEl = document.getElementById('countdown');
  const siteTitleEl = document.getElementById('site-title');
  const usernameEl = document.getElementById('username');
  const conflictTipEl = document.getElementById('conflict-tip');
  const folderSelectEl = document.getElementById('folder-select');
  const titleInputEl = document.getElementById('title-input');
  const saveBtnEl = document.getElementById('save-btn');
  const ignoreBtnEl = document.getElementById('ignore-btn');
  const statusEl = document.getElementById('status');
  const promptBodyEl = document.getElementById('prompt-body');

  let expiresAt = 0;
  let countdownTimer = null;

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  }

  function setBusy(isBusy) {
    saveBtnEl.disabled = isBusy;
    ignoreBtnEl.disabled = isBusy;
    folderSelectEl.disabled = isBusy;
    titleInputEl.disabled = isBusy;
  }

  function showStatus(message, shouldClose) {
    statusEl.textContent = message;
    statusEl.classList.remove('hidden');
    if (shouldClose) {
      setTimeout(() => window.close(), 600);
    }
  }

  function updateCountdown() {
    const remaining = Math.max(0, expiresAt - Date.now());
    countdownEl.textContent = `${(remaining / 1000).toFixed(1)}s`;
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      setBusy(true);
      showStatus('提示已过期，即将关闭', true);
    }
  }

  function fillFolders(folders) {
    folderSelectEl.innerHTML = '';

    const folderMap = {};
    folders.forEach((folder) => {
      folderMap[folder.id] = { folder, children: [] };
    });

    const rootFolders = [];
    folders.forEach((folder) => {
      if (folder.parentId && folderMap[folder.parentId]) {
        folderMap[folder.parentId].children.push(folderMap[folder.id]);
      } else {
        rootFolders.push(folderMap[folder.id]);
      }
    });

    function appendOption(node, level) {
      const option = document.createElement('option');
      option.value = node.folder.id;
      option.textContent = `${'  '.repeat(level)}${level > 0 ? '└ ' : ''}${node.folder.name}`;
      folderSelectEl.appendChild(option);
      node.children.forEach((child) => appendOption(child, level + 1));
    }

    rootFolders.forEach((node) => appendOption(node, 0));
  }

  async function resolvePrompt(action) {
    if (!promptId) {
      showStatus('无效的提示请求', false);
      return;
    }

    setBusy(true);
    const response = await sendMessage({
      type: 'resolvePendingSavePrompt',
      promptId,
      action,
      folderId: folderSelectEl.value,
      title: titleInputEl.value
    });

    if (!response || response.success === false) {
      setBusy(false);
      showStatus('操作失败，请重试', false);
      return;
    }

    clearInterval(countdownTimer);
    promptBodyEl.classList.add('hidden');
    if (action === 'save') {
      showStatus('登录信息已保存', true);
    } else {
      showStatus('已忽略本次提示', true);
    }
  }

  async function init() {
    if (!promptId) {
      showStatus('缺少提示标识，窗口将关闭', true);
      setBusy(true);
      return;
    }

    const response = await sendMessage({ type: 'getPendingSavePrompt', promptId });
    if (!response || response.success === false || !response.prompt) {
      showStatus('提示已失效，窗口将关闭', true);
      setBusy(true);
      return;
    }

    const prompt = response.prompt;
    const credential = prompt.credential || {};
    const pageTitle = credential.title || credential.origin || credential.url || '(未知网站)';

    siteTitleEl.textContent = pageTitle;
    usernameEl.textContent = credential.username || '(空)';
    titleInputEl.value = pageTitle;
    expiresAt = prompt.expiresAt || Date.now() + 5000;

    fillFolders(prompt.folders || []);

    if (prompt.hasConflict) {
      conflictTipEl.classList.remove('hidden');
    }

    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 100);
  }

  saveBtnEl.addEventListener('click', () => resolvePrompt('save'));
  ignoreBtnEl.addEventListener('click', () => resolvePrompt('ignore'));

  window.addEventListener('beforeunload', () => {
    if (countdownTimer) {
      clearInterval(countdownTimer);
    }
  });

  init();
})();