// background.js
// Simple storage and message routing for WebPwd prototype

const STORAGE_KEYS = {
  CREDENTIALS: 'webpwd_credentials',
  FOLDERS: 'webpwd_folders',
  SETTINGS: 'webpwd_settings',
  PENDING_FILL: 'webpwd_pending_fill'
};

const DEFAULT_SETTINGS = { autoFillEnabled: true };
const pendingAutoFill = new Map(); // tabId -> {credential, submit}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function createDefaultFolder() {
  return { id: uuid(), name: '默认', color: '#4caf50', createdAt: Date.now() };
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
  const settings = Object.assign({}, DEFAULT_SETTINGS, storedSettings);
  let needsSave = false;

  if (!folders.length) {
    folders = [createDefaultFolder()];
    needsSave = true;
  }
  if (typeof storedSettings.autoFillEnabled !== 'boolean') {
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
  if (credential.origin && credential.origin === origin) {
    score += 50;
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
    if (score > bestScore || (score === bestScore && c.updatedAt > (best?.updatedAt || 0))) {
      bestScore = score;
      best = c;
    }
  });
  return best;
}

// 检查是否已保存相同的凭证（同一账号同一密码）
function findDuplicateCredential(credentials, username, password, origin) {
  return credentials.find(c =>
    c.username === username &&
    c.password === password &&
    c.origin === origin
  );
}

// 检查是否存在相同账号但不同密码
function findConflictingCredential(credentials, username, password, origin) {
  return credentials.find(c =>
    c.username === username &&
    c.password !== password &&
    c.origin === origin
  );
}

// Load pending fills on startup
loadPendingAutoFill().catch(() => {
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

    if (msg.type === 'loginDetected') {
      const db = await getDatabaseWithDefaults();
      const username = msg.username || '';
      const password = msg.password || '';
      const origin = msg.origin || '';

      // 检查是否已保存相同的凭证（同一账号同一密码）
      const duplicate = findDuplicateCredential(db.credentials, username, password, origin);
      if (duplicate) {
        // 相同凭证，不弹窗，直接响应
        sendResponse({
          acknowledged: true,
          isDuplicate: true,
          folders: db.folders
        });
        return;
      }

      // 检查是否存在相同账号但密码不同
      const conflict = findConflictingCredential(db.credentials, username, password, origin);

      // 正常弹窗
      sendResponse({
        acknowledged: true,
        isDuplicate: false,
        hasConflict: !!conflict,
        folders: db.folders
      });


    } else if (msg.type === 'storeCredential') {
      const payload = msg.credential;
      const db = await getDatabaseWithDefaults();
      const creds = db.credentials;
      const entry = {
        id: uuid(),
        title: payload.title || payload.origin,
        username: payload.username,
        password: payload.password,
        origin: payload.origin,
        urlPattern: payload.url || null,
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
      sendResponse({ success: true, entry });

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

    } else if (msg.type === 'getCredentialsForOrigin') {
      const origin = msg.origin;
      const db = await getDatabaseWithDefaults();
      const matches = db.credentials.filter((c) => c.origin === origin || (c.urlPattern && origin === new URL(c.urlPattern, origin).origin));
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
      const db = await getDatabaseWithDefaults();
      const folder = { id: uuid(), name, color: null, createdAt: Date.now() };
      db.folders.push(folder);
      await saveAll(db.credentials, db.folders, db.settings);
      sendResponse({ folder });

    } else if (msg.type === 'deleteFolder') {
      const folderId = msg.folderId;
      const db = await getDatabaseWithDefaults();

      // 防止删除默认文件夹
      const folderToDelete = db.folders.find(f => f.id === folderId);
      if (folderToDelete && folderToDelete.name === '默认') {
        sendResponse({ success: false, error: '无法删除默认文件夹' });
        return;
      }

      // 获取默认文件夹ID
      const defaultFolder = db.folders.find(f => f.name === '默认');
      const defaultFolderId = defaultFolder ? defaultFolder.id : (db.folders[0] && db.folders[0].id);

      // 将该文件夹下的凭证移到默认文件夹
      const updatedCreds = db.credentials.map(c => {
        if (c.folderId === folderId) {
          return Object.assign({}, c, { folderId: defaultFolderId, updatedAt: Date.now() });
        }
        return c;
      });

      // 删除文件夹
      const updatedFolders = db.folders.filter(f => f.id !== folderId);

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
      const settings = Object.assign(db.settings || {}, msg.settings || {});
      await saveAll(db.credentials, db.folders, settings);
      sendResponse({ success: true, settings });
    }
  })();
  return true;
});
