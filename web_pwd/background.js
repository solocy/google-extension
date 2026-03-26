// background.js
// Simple storage and message routing for WebPwd prototype

const STORAGE_KEYS = {
  CREDENTIALS: 'webpwd_credentials',
  FOLDERS: 'webpwd_folders',
  SETTINGS: 'webpwd_settings',
  PENDING_FILL: 'webpwd_pending_fill',
  PENDING_SAVE: 'webpwd_pending_save'
};

const DEFAULT_SETTINGS = { autoFillEnabled: true, language: 'zh' };
const pendingAutoFill = new Map(); // tabId -> {credential, submit}
const pendingSave = new Map(); // promptId -> {credential, folders, hasConflict, windowId, expiresAt, timeoutHandle}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function createDefaultFolder() {
  return { id: uuid(), name: '默认', parentId: null, color: '#4caf50', createdAt: Date.now() };
}

function normalizeLanguage(language) {
  return language === 'en' ? 'en' : 'zh';
}

function normalizeLoginUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    return parsed.toString();
  } catch (err) {
    return rawUrl;
  }
}

function getPageOrigin(rawUrl) {
  if (!rawUrl) return '';
  try {
    return new URL(rawUrl).origin;
  } catch (err) {
    return rawUrl;
  }
}

function getCredentialLoginUrl(credential) {
  return normalizeLoginUrl(credential?.urlPattern || '');
}

function isCredentialMatchedPage(credential, pageUrl, origin) {
  const normalizedPageUrl = normalizeLoginUrl(pageUrl);
  if (credential.urlPattern) {
    return getCredentialLoginUrl(credential) === normalizedPageUrl;
  }
  return !!origin && credential.origin === origin;
}

function sortCredentialsForPage(credentials) {
  return [...credentials].sort((left, right) => {
    const leftOrder = typeof left.sortOrder === 'number' ? left.sortOrder : Number.MAX_SAFE_INTEGER;
    const rightOrder = typeof right.sortOrder === 'number' ? right.sortOrder : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return (left.createdAt || 0) - (right.createdAt || 0);
  });
}

function getCredentialsForPage(credentials, pageUrl, origin) {
  return sortCredentialsForPage(credentials.filter((credential) => isCredentialMatchedPage(credential, pageUrl, origin)));
}

async function loadBaseStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.CREDENTIALS, STORAGE_KEYS.FOLDERS, STORAGE_KEYS.SETTINGS], (res) => {
      // 确保 res 是对象
      if (!res || typeof res !== 'object') {
        resolve({
          credentials: [],
          folders: [],
          settings: {}
        });
        return;
      }
      resolve({
        credentials: res[STORAGE_KEYS.CREDENTIALS] || [],
        folders: res[STORAGE_KEYS.FOLDERS] || [],
        settings: res[STORAGE_KEYS.SETTINGS] || {}
      });
    });
  });
}

async function getDatabaseWithDefaults() {
  const raw = await loadBaseStorage();
  let folders = raw.folders;
  const storedSettings = raw.settings || {};
  const settings = Object.assign({}, DEFAULT_SETTINGS, storedSettings, {
    language: normalizeLanguage(storedSettings.language)
  });
  let needsSave = false;

  if (!folders.length) {
    folders = [createDefaultFolder()];
    needsSave = true;
  }
  if (typeof storedSettings.autoFillEnabled !== 'boolean') {
    needsSave = true;
  }
  if (normalizeLanguage(storedSettings.language) !== storedSettings.language) {
    needsSave = true;
  }
  if (needsSave) {
    await saveAll(raw.credentials, folders, settings);
  }
  return { credentials: raw.credentials, folders, settings };
}

async function saveAll(creds, folders, settings) {
  const obj = {};
  obj[STORAGE_KEYS.CREDENTIALS] = creds;
  obj[STORAGE_KEYS.FOLDERS] = folders;
  obj[STORAGE_KEYS.SETTINGS] = settings;
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

async function persistPendingAutoFill() {
  const snapshot = {};
  pendingAutoFill.forEach((value, tabId) => {
    snapshot[tabId] = value;
  });
  return new Promise((resolve) => chrome.storage.local.set({ [STORAGE_KEYS.PENDING_FILL]: snapshot }, resolve));
}

async function persistPendingSave() {
  const snapshot = {};
  pendingSave.forEach((value, promptId) => {
    snapshot[promptId] = {
      credential: value.credential,
      folders: value.folders,
      hasConflict: value.hasConflict,
      windowId: value.windowId || null,
      expiresAt: value.expiresAt || null
    };
  });
  return new Promise((resolve) => chrome.storage.local.set({ [STORAGE_KEYS.PENDING_SAVE]: snapshot }, resolve));
}

async function loadPendingAutoFill() {
  const data = await new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.PENDING_FILL], (res) => {
      // 确保 res 是对象，避免 undefined
      if (!res || typeof res !== 'object') {
        resolve({});
        return;
      }
      resolve(res[STORAGE_KEYS.PENDING_FILL] || {});
    });
  });
  pendingAutoFill.clear();
  if (data && typeof data === 'object') {
    Object.entries(data).forEach(([tabId, info]) => {
      pendingAutoFill.set(Number(tabId), info);
    });
  }
}

function scoreCredential(credential, origin, href) {
  if (!credential) return 0;
  let score = 0;
  const normalizedHref = normalizeLoginUrl(href);

  if (credential.urlPattern) {
    if (getCredentialLoginUrl(credential) === normalizedHref) {
      score += 100;
    } else {
      return 0;
    }
  } else if (credential.origin && credential.origin === origin) {
    score += 10;
  } else {
    return 0;
  }

  if (credential.urlPattern) {
    try {
      const target = new URL(credential.urlPattern);
      if (href === target.href) score += 40;
      else if (target.origin === origin) {
        score += 20;
        if (target.pathname && href.startsWith(target.origin + target.pathname)) score += 10;
      }
    } catch (err) {
      // ignore invalid pattern
    }
  }
  if (credential.formSelector && href.includes(credential.formSelector)) {
    score += 5;
  }
  if (credential.usernameSelector || credential.passwordSelector) {
    score += 3;
  }
  return score;
}

function pickBestCredential(credentials, origin, href) {
  let best = null;
  let bestScore = 0;
  credentials.forEach((c) => {
    const score = scoreCredential(c, origin, href);
    // 只有分数大于0才考虑（即origin必须匹配）
    if (score > 0 && (score > bestScore || (score === bestScore && c.updatedAt > (best?.updatedAt || 0)))) {
      bestScore = score;
      best = c;
    }
  });
  return best;
}

// 检查是否已保存相同的凭证（同一账号同一密码）
function findDuplicateCredential(credentials, username, password, pageUrl, origin) {
  return credentials.find(c =>
    c.username === username &&
    c.password === password &&
    isCredentialMatchedPage(c, pageUrl, origin)
  );
}

function findAccountCredential(credentials, username, pageUrl, origin) {
  return credentials.find(c =>
    c.username === username &&
    isCredentialMatchedPage(c, pageUrl, origin)
  );
}


async function loadPendingSave() {
  const data = await new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.PENDING_SAVE], (res) => {
      if (!res || typeof res !== 'object') {
        resolve({});
        return;
      }
      resolve(res[STORAGE_KEYS.PENDING_SAVE] || {});
    });
  });
  pendingSave.clear();
  if (data && typeof data === 'object') {
    Object.entries(data).forEach(([promptId, info]) => {
      pendingSave.set(promptId, Object.assign({}, info, { timeoutHandle: null }));
    });
  }
}

function clearPendingSaveTimeout(entry) {
  if (!entry || !entry.timeoutHandle) return;
  clearTimeout(entry.timeoutHandle);
  entry.timeoutHandle = null;
}

async function cleanupPendingSave(promptId, shouldCloseWindow) {
  const entry = pendingSave.get(promptId);
  if (!entry) return;

  clearPendingSaveTimeout(entry);
  pendingSave.delete(promptId);
  await persistPendingSave();

  if (shouldCloseWindow && typeof entry.windowId === 'number') {
    await new Promise((resolve) => {
      chrome.windows.remove(entry.windowId, () => {
        resolve();
      });
    });
  }
}

function schedulePendingSaveTimeout(promptId) {
  const entry = pendingSave.get(promptId);
  if (!entry) return;

  clearPendingSaveTimeout(entry);

  const remainingMs = Math.max(0, (entry.expiresAt || Date.now()) - Date.now());
  entry.timeoutHandle = setTimeout(() => {
    cleanupPendingSave(promptId, true).catch(() => {
      // 忽略自动关闭失败
    });
  }, remainingMs);
}

async function getPopupBounds(anchorWindowId) {
  const fallbackBounds = {
    width: 360,
    height: 280
  };

  if (typeof anchorWindowId !== 'number') {
    return fallbackBounds;
  }

  const anchorWindow = await new Promise((resolve) => {
    chrome.windows.get(anchorWindowId, {}, (win) => {
      if (chrome.runtime.lastError || !win) {
        resolve(null);
        return;
      }
      resolve(win);
    });
  });

  if (!anchorWindow) {
    return fallbackBounds;
  }

  const width = 360;
  const height = 280;
  const marginRight = 24;
  const marginBottom = 72;
  const left = Math.max(0, (anchorWindow.left || 0) + Math.max(0, (anchorWindow.width || width) - width - marginRight));
  const top = Math.max(0, (anchorWindow.top || 0) + Math.max(0, (anchorWindow.height || height) - height - marginBottom));

  return {
    width,
    height,
    left,
    top
  };
}

async function createSavePrompt(credential, folders, hasConflict, anchorWindowId) {
  const promptId = uuid();
  const expiresAt = Date.now() + 5000;

  pendingSave.set(promptId, {
    credential,
    folders,
    hasConflict,
    windowId: null,
    expiresAt,
    timeoutHandle: null
  });
  await persistPendingSave();

  const popupUrl = chrome.runtime.getURL(`save_prompt.html?promptId=${encodeURIComponent(promptId)}`);
  const popupBounds = await getPopupBounds(anchorWindowId);
  let createdWindow;
  try {
    createdWindow = await new Promise((resolve, reject) => {
      chrome.windows.create({
        url: popupUrl,
        type: 'popup',
        width: popupBounds.width,
        height: popupBounds.height,
        left: popupBounds.left,
        top: popupBounds.top,
        focused: false
      }, (win) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(win);
      });
    });
  } catch (err) {
    pendingSave.delete(promptId);
    await persistPendingSave();
    throw err;
  }

  const entry = pendingSave.get(promptId);
  if (!entry) {
    return { promptId, expiresAt };
  }

  entry.windowId = createdWindow && typeof createdWindow.id === 'number' ? createdWindow.id : null;
  await persistPendingSave();
  schedulePendingSaveTimeout(promptId);

  return { promptId, expiresAt, windowId: entry.windowId };
}

async function storeCredentialEntry(payload) {
  const db = await getDatabaseWithDefaults();
  const creds = db.credentials;
  const normalizedUrl = normalizeLoginUrl(payload.url || payload.urlPattern || '');
  const origin = payload.origin || getPageOrigin(normalizedUrl);
  const existingIndex = creds.findIndex((credential) => (
    credential.username === payload.username &&
    isCredentialMatchedPage(credential, normalizedUrl, origin)
  ));

  if (existingIndex !== -1) {
    const current = creds[existingIndex];
    const updatedEntry = Object.assign({}, current, {
      title: payload.title || current.title || origin,
      username: payload.username,
      password: payload.password,
      origin,
      urlPattern: normalizedUrl || current.urlPattern || null,
      formSelector: payload.formSelector || current.formSelector || null,
      usernameSelector: payload.usernameSelector || current.usernameSelector || null,
      passwordSelector: payload.passwordSelector || current.passwordSelector || null,
      tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : (current.tags || []),
      folderId: payload.folderId || current.folderId || (db.folders[0] && db.folders[0].id) || null,
      updatedAt: Date.now()
    });
    creds[existingIndex] = updatedEntry;
    await saveAll(creds, db.folders, db.settings);
    return updatedEntry;
  }

  const entry = {
    id: uuid(),
    title: payload.title || origin,
    username: payload.username,
    password: payload.password,
    origin,
    urlPattern: normalizedUrl || null,
    formSelector: payload.formSelector || null,
    usernameSelector: payload.usernameSelector || null,
    passwordSelector: payload.passwordSelector || null,
    tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : [],
    folderId: payload.folderId || (db.folders[0] && db.folders[0].id) || null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  creds.push(entry);
  await saveAll(creds, db.folders, db.settings);
  return entry;
}
// 检查是否存在同一登录页、同一账号但不同密码
function findConflictingCredential(credentials, username, password, pageUrl, origin) {
  return credentials.find(c =>
    c.username === username &&
    c.password !== password &&
    isCredentialMatchedPage(c, pageUrl, origin)
  );
}

// Load pending fills on startup
loadPendingAutoFill().catch(() => {
  // 加载失败时继续运行，不阻止扩展功能
});

loadPendingSave().then(() => {
  pendingSave.forEach((_, promptId) => {
    schedulePendingSaveTimeout(promptId);
  });
}).catch(() => {
  // 加载失败时继续运行，不阻止扩展功能
});

// Tab updated listener to trigger auto-fill
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  const queued = pendingAutoFill.get(tabId);
  if (!queued) return;
  pendingAutoFill.delete(tabId);
  persistPendingAutoFill();

  // 延迟发送填充消息，确保 content script 已加载
  setTimeout(() => {
    chrome.tabs.sendMessage(tabId, {
      type: 'fillCredential',
      credential: queued.credential,
      submit: queued.submit
    }, () => {
      // 忽略发送失败
      if (chrome.runtime.lastError) {}
    });
  }, 500);
});

// Clean up closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  if (!pendingAutoFill.has(tabId)) return;
  pendingAutoFill.delete(tabId);
  persistPendingAutoFill();
});

chrome.windows.onRemoved.addListener((windowId) => {
  for (const [promptId, entry] of pendingSave.entries()) {
    if (entry.windowId === windowId) {
      cleanupPendingSave(promptId, false).catch(() => {
        // 忽略清理失败
      });
      break;
    }
  }
});

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  getDatabaseWithDefaults();
});

// Initialize on startup
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    getDatabaseWithDefaults();
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || !msg.type) return;

    if (msg.type === 'showSaveNotification') {
      try {
        const promptInfo = await createSavePrompt(msg.credential, msg.folders, msg.hasConflict, sender.tab && sender.tab.windowId);
        sendResponse({ success: true, promptId: promptInfo.promptId, expiresAt: promptInfo.expiresAt });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }

    } else if (msg.type === 'loginDetected') {
      const db = await getDatabaseWithDefaults();
      const username = msg.username || '';
      const password = msg.password || '';
      const pageUrl = normalizeLoginUrl(msg.url || '');
      const origin = msg.origin || getPageOrigin(pageUrl);

      // 检查是否已保存相同的凭证（同一账号同一密码）
      const duplicate = findDuplicateCredential(db.credentials, username, password, pageUrl, origin);
      if (duplicate) {
        // 相同凭证，不弹窗，直接响应
        sendResponse({
          acknowledged: true,
          isDuplicate: true,
          folders: db.folders,
          settings: db.settings
        });
        return;
      }

      // 检查是否存在相同账号但密码不同
      const conflict = findConflictingCredential(db.credentials, username, password, pageUrl, origin);

      // 正常弹窗
      sendResponse({
        acknowledged: true,
        isDuplicate: false,
        hasConflict: !!conflict,
        folders: db.folders,
        settings: db.settings,
        existingCredential: conflict || findAccountCredential(db.credentials, username, pageUrl, origin) || null
      });


    } else if (msg.type === 'storeCredential') {
      const payload = msg.credential;
      const entry = await storeCredentialEntry(payload);
      sendResponse({ success: true, entry });

    } else if (msg.type === 'getPendingSavePrompt') {
      const entry = pendingSave.get(msg.promptId);
      if (!entry) {
        sendResponse({ success: false, error: 'prompt_not_found' });
        return;
      }
      sendResponse({
        success: true,
        prompt: {
          credential: entry.credential,
          folders: entry.folders,
          hasConflict: entry.hasConflict,
          expiresAt: entry.expiresAt
        }
      });

    } else if (msg.type === 'resolvePendingSavePrompt') {
      const promptId = msg.promptId;
      const action = msg.action;
      const entry = pendingSave.get(promptId);

      if (!entry) {
        sendResponse({ success: false, error: 'prompt_not_found' });
        return;
      }

      if (action === 'save') {
        const credential = Object.assign({}, entry.credential, {
          folderId: msg.folderId || (entry.folders[0] && entry.folders[0].id) || null,
          title: (msg.title || '').trim() || entry.credential.title || entry.credential.origin
        });
        const savedEntry = await storeCredentialEntry(credential);
        await cleanupPendingSave(promptId, true);
        sendResponse({ success: true, saved: true, entry: savedEntry });
        return;
      }

      await cleanupPendingSave(promptId, true);
      sendResponse({ success: true, saved: false });

    } else if (msg.type === 'listCredentials') {
      const db = await getDatabaseWithDefaults();
      sendResponse({ credentials: db.credentials, folders: db.folders, settings: db.settings });

    } else if (msg.type === 'listFolders') {
      const db = await getDatabaseWithDefaults();
      sendResponse({ folders: db.folders });

    } else if (msg.type === 'findCredential') {
      const db = await getDatabaseWithDefaults();
      const best = pickBestCredential(db.credentials, msg.origin, msg.url);
      sendResponse({ credential: best, settings: db.settings });

    } else if (msg.type === 'findCredentialsForPage') {
      const db = await getDatabaseWithDefaults();
      const pageUrl = normalizeLoginUrl(msg.url || '');
      const origin = msg.origin || getPageOrigin(pageUrl);
      const credentials = getCredentialsForPage(db.credentials, pageUrl, origin);
      sendResponse({ credentials, settings: db.settings });

    } else if (msg.type === 'getCredentialsForOrigin') {
      const pageUrl = normalizeLoginUrl(msg.url || '');
      const origin = msg.origin || getPageOrigin(pageUrl);
      const db = await getDatabaseWithDefaults();
      const matches = getCredentialsForPage(db.credentials, pageUrl, origin);
      sendResponse({ credentials: matches });

    } else if (msg.type === 'fillRequest') {
      const tabId = sender.tab && sender.tab.id;
      if (tabId && msg.credential) {
        chrome.tabs.sendMessage(tabId, { type: 'fillCredential', credential: msg.credential, submit: !!msg.submit }, (r) => {
          sendResponse({ ok: true, result: r });
        });
        return;
      }
      sendResponse({ ok: false, error: 'no tab' });

    } else if (msg.type === 'openCredential') {
      const credential = msg.credential;
      const targetUrl = credential?.urlPattern || credential?.origin || 'about:blank';
      const submit = !!msg.submit;
      try {
        chrome.tabs.create({ url: targetUrl }, async (tab) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          if (tab && typeof tab.id === 'number') {
            pendingAutoFill.set(tab.id, { credential, submit });
            await persistPendingAutoFill();
          }
          sendResponse({ success: !!tab });
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }

    } else if (msg.type === 'createFolder') {
      const name = msg.name || 'New';
      const parentId = msg.parentId || null; // 支持指定父文件夹
      const db = await getDatabaseWithDefaults();
      const folder = { id: uuid(), name, parentId, color: null, createdAt: Date.now() };
      db.folders.push(folder);
      await saveAll(db.credentials, db.folders, db.settings);
      sendResponse({ folder });

    } else if (msg.type === 'deleteFolder') {
      const folderId = msg.folderId;
      const db = await getDatabaseWithDefaults();

      // 防止删除默认文件夹
      const folderToDelete = db.folders.find(f => f.id === folderId);
      if (folderToDelete && folderToDelete.name === '默认' && !folderToDelete.parentId) {
        sendResponse({ success: false, error: '无法删除默认文件夹' });
        return;
      }

      // 递归获取所有子文件夹ID
      function getDescendantFolderIds(parentId, folders) {
        const ids = [parentId];
        folders.filter(f => f.parentId === parentId).forEach(child => {
          ids.push(...getDescendantFolderIds(child.id, folders));
        });
        return ids;
      }
      const folderIdsToDelete = getDescendantFolderIds(folderId, db.folders);

      // 获取默认文件夹ID
      const defaultFolder = db.folders.find(f => f.name === '默认' && !f.parentId);
      const defaultFolderId = defaultFolder ? defaultFolder.id : (db.folders[0] && db.folders[0].id);

      // 将该文件夹及子文件夹下的凭证移到默认文件夹
      const updatedCreds = db.credentials.map(c => {
        if (folderIdsToDelete.includes(c.folderId)) {
          return Object.assign({}, c, { folderId: defaultFolderId, updatedAt: Date.now() });
        }
        return c;
      });

      // 删除文件夹及其所有子文件夹
      const updatedFolders = db.folders.filter(f => !folderIdsToDelete.includes(f.id));

      await saveAll(updatedCreds, updatedFolders, db.settings);
      sendResponse({ success: true });

    } else if (msg.type === 'deleteCredential') {
      const id = msg.id;
      const db = await getDatabaseWithDefaults();
      const creds = db.credentials.filter((c) => c.id !== id);
      await saveAll(creds, db.folders, db.settings);
      sendResponse({ success: true });

    } else if (msg.type === 'updateCredential') {
      const id = msg.id;
      const updates = msg.updates || {};
      const db = await getDatabaseWithDefaults();
      const creds = db.credentials.map((c) => {
        if (c.id === id) {
          return Object.assign({}, c, updates, { updatedAt: Date.now() });
        }
        return c;
      });
      await saveAll(creds, db.folders, db.settings);
      sendResponse({ success: true });

    } else if (msg.type === 'updateSettings') {
      const db = await getDatabaseWithDefaults();
      const settings = Object.assign(db.settings || {}, msg.settings || {}, {
        language: normalizeLanguage((msg.settings || {}).language ?? db.settings?.language)
      });
      await saveAll(db.credentials, db.folders, settings);
      sendResponse({ success: true, settings });

    } else if (msg.type === 'reorderFolder') {
      const { draggedId, targetId } = msg;
      const db = await getDatabaseWithDefaults();

      // 找到被拖动和目标文件夹
      const draggedFolder = db.folders.find(f => f.id === draggedId);
      const targetFolder = db.folders.find(f => f.id === targetId);

      if (draggedFolder && targetFolder) {
        // 获取同级文件夹（相同parentId）
        const parentId = draggedFolder.parentId;
        const siblings = db.folders
          .filter(f => f.parentId === parentId || (!f.parentId && !parentId))
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        const draggedIndex = siblings.findIndex(f => f.id === draggedId);
        const targetIndex = siblings.findIndex(f => f.id === targetId);

        if (draggedIndex !== -1 && targetIndex !== -1 && draggedIndex !== targetIndex) {
          // 从数组中移除被拖动的项
          const [removed] = siblings.splice(draggedIndex, 1);
          // 插入到目标位置
          siblings.splice(targetIndex, 0, removed);

          // 更新所有同级文件夹的sortOrder
          siblings.forEach((f, i) => {
            const folder = db.folders.find(ff => ff.id === f.id);
            if (folder) {
              folder.sortOrder = i;
            }
          });

          await saveAll(db.credentials, db.folders, db.settings);
        }
      }
      sendResponse({ success: true });

    } else if (msg.type === 'reorderCredential') {
      const { draggedId, targetId, folderId } = msg;
      const db = await getDatabaseWithDefaults();

      // 获取同文件夹下的凭证并排序
      const siblings = db.credentials
        .filter(c => c.folderId === folderId)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

      const draggedIndex = siblings.findIndex(c => c.id === draggedId);
      const targetIndex = siblings.findIndex(c => c.id === targetId);

      if (draggedIndex !== -1 && targetIndex !== -1 && draggedIndex !== targetIndex) {
        // 从数组中移除被拖动的项
        const [removed] = siblings.splice(draggedIndex, 1);
        // 插入到目标位置
        siblings.splice(targetIndex, 0, removed);

        // 更新所有同级凭证的sortOrder
        siblings.forEach((c, i) => {
          const cred = db.credentials.find(cc => cc.id === c.id);
          if (cred) {
            cred.sortOrder = i;
          }
        });

        await saveAll(db.credentials, db.folders, db.settings);
      }
      sendResponse({ success: true });
    }
  })();
  return true;
});
