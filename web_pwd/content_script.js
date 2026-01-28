// content_script.js
// Detect form submit with password field, capture username/password and send to background
// 注意：fetch/XHR 拦截已移至 content_script_main.js（运行在MAIN世界中）

(function () {
    let autoFillAttempted = false;
    let pendingCredential = null;

    function findUsernameInput(form, passwordInput) {
        const inputs = Array.from(form.querySelectorAll('input'));
        const pwdIndex = inputs.indexOf(passwordInput);
        // Search backwards for text/email input
        for (let i = pwdIndex - 1; i >= 0; i--) {
            const t = inputs[i];
            if (!t) continue;
            const type = (t.getAttribute('type') || '').toLowerCase();
            if (type === 'text' || type === 'email' || type === 'username' || type === 'tel') return t;
            // 也检查 name 属性
            const name = (t.getAttribute('name') || '').toLowerCase();
            if (name.includes('user') || name.includes('account') || name.includes('login') || name.includes('email') || name.includes('phone')) return t;
        }
        // Fallback: search whole form for first text/email
        for (const t of inputs) {
            const type = (t.getAttribute('type') || '').toLowerCase();
            if (type === 'text' || type === 'email' || type === 'tel') return t;
        }
        // 最后尝试查找没有 type 的 input
        for (const t of inputs) {
            const type = (t.getAttribute('type') || '').toLowerCase();
            if (!type || type === 'text') return t;
        }
        return null;
    }

    function handleSubmit(e) {
        try {
            const form = e.target;
            const passwordInput = form.querySelector('input[type=password]');
            if (passwordInput && passwordInput.value) {
                // 立即捕获，不延迟
                captureAndShowBanner(passwordInput);
            }
        } catch (err) {
            // 提交处理错误
        }
    }

    // 立即捕获凭证并显示弹窗
    function captureAndShowBanner(passwordInput) {
        if (!passwordInput || !passwordInput.value) return;
        if (document.getElementById('webpwd-save-banner')) return;

        const form = passwordInput.closest('form') || passwordInput.form || document;
        const usernameInput = findUsernameInput(form, passwordInput);
        const username = usernameInput ? usernameInput.value : '';
        const password = passwordInput.value;

        if (!password) return;

        // 避免重复触发
        const cacheKey = `${window.location.origin}|${username}`;
        if (window._webpwd_last_submit === cacheKey) return;
        window._webpwd_last_submit = cacheKey;

        setTimeout(() => {
            if (window._webpwd_last_submit === cacheKey) {
                window._webpwd_last_submit = null;
            }
        }, 10000);

        // 立即保存待处理凭证（用于页面跳转时）
        pendingCredential = {
            type: 'loginDetected',
            origin: window.location.origin,
            url: window.location.href,
            username: username,
            password: password,
            title: document.title || new URL(window.location.href).hostname,
            formSelector: form !== document ? getSelector(form) : null,
            usernameSelector: usernameInput ? getSelector(usernameInput) : null,
            passwordSelector: getSelector(passwordInput)
        };

        // 请求文件夹列表并显示弹窗
        chrome.runtime.sendMessage({type: 'loginDetected', ...pendingCredential}, (response) => {
            if (chrome.runtime.lastError) {
                return;
            }
            if (response) {
                // 如果是重复凭证（同一账号同一密码），不显示弹窗
                if (response.isDuplicate) {
                    return;
                }

                // 正常显示弹窗
                if (response.folders) {
                    // 如果存在冲突（同一账号但密码不同），在弹窗中显示提示
                    pendingCredential.hasConflict = response.hasConflict;
                    showSaveBanner(pendingCredential, response.folders);
                }
            }
        });
    }

    function getSelector(el) {
        if (!el) return null;
        if (el.id) return `#${el.id}`;
        if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
        const path = [];
        while (el && el.nodeType === Node.ELEMENT_NODE && el.tagName.toLowerCase() !== 'html') {
            let selector = el.tagName.toLowerCase();
            if (el.className) {
                const cls = el.className.trim().split(/\s+/)[0];
                if (cls) selector += `.${cls}`;
            }
            path.unshift(selector);
            el = el.parentElement;
        }
        return path.length ? path.join(' > ') : null;
    }

    function showSaveBanner(payload, folders) {
        // 防止重复显示弹窗
        const existing = document.getElementById('webpwd-save-banner');
        if (existing) return; // 如果已存在弹窗，不再创建

        // 标记弹窗显示，防止页面卸载
        let bannerShown = true;
        const unloadHandler = (e) => {
            if (bannerShown) {
                e.preventDefault();
                e.returnValue = '还有未保存的登录信息，确定要离开吗？';
                return '还有未保存的登录信息，确定要离开吗？';
            }
        };
        window.addEventListener('beforeunload', unloadHandler);

        const banner = document.createElement('div');
        banner.id = 'webpwd-save-banner';
        banner.style.cssText = `
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
      background: #fff;
      border: 2px solid #1a73e8;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      min-width: 300px;
      max-width: 400px;
    `;

        const title = document.createElement('div');
        title.textContent = '保存登录信息？';
        title.style.cssText = 'font-weight: 600; margin-bottom: 12px; font-size: 15px; color: #1a73e8;';
        banner.appendChild(title);

        const userInfo = document.createElement('div');
        userInfo.textContent = `用户名: ${payload.username || '(空)'}`;
        userInfo.style.cssText = 'color: #666; margin-bottom: 12px; font-size: 13px;';
        banner.appendChild(userInfo);

        // 如果存在冲突，显示警告
        if (payload.hasConflict) {
            const conflictWarning = document.createElement('div');
            conflictWarning.textContent = '⚠️ 注意：该账号已保存，密码不同。保存后会覆盖之前的密码。';
            conflictWarning.style.cssText = `
        background: #fff3cd;
        border: 1px solid #ffeaa7;
        color: #856404;
        padding: 8px 10px;
        border-radius: 4px;
        margin-bottom: 12px;
        font-size: 12px;
      `;
            banner.appendChild(conflictWarning);
        }

        const folderGroup = document.createElement('div');
        folderGroup.style.cssText = 'margin-bottom: 12px;';

        const folderLabel = document.createElement('label');
        folderLabel.textContent = '保存到文件夹: ';
        folderLabel.style.cssText = 'font-size: 12px; color: #666; display: block; margin-bottom: 6px;';
        folderGroup.appendChild(folderLabel);

        const folderSelect = document.createElement('select');
        folderSelect.style.cssText = 'width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;';
        folders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            folderSelect.appendChild(option);
        });
        folderGroup.appendChild(folderSelect);
        banner.appendChild(folderGroup);

        const titleGroup = document.createElement('div');
        titleGroup.style.cssText = 'margin-bottom: 14px;';

        const titleLabel = document.createElement('label');
        titleLabel.textContent = '标题: ';
        titleLabel.style.cssText = 'font-size: 12px; color: #666; display: block; margin-bottom: 6px;';
        titleGroup.appendChild(titleLabel);

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.placeholder = '输入标题';
        // 使用页面标题作为默认值，和 Google 书签一样
        titleInput.value = document.title || new URL(payload.url).hostname;
        titleInput.style.cssText = 'width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;';
        titleGroup.appendChild(titleInput);
        banner.appendChild(titleGroup);

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

        const btnCancel = document.createElement('button');
        btnCancel.textContent = '取消';
        btnCancel.style.cssText = 'padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; cursor: pointer; font-size: 13px; font-weight: 500;';
        btnCancel.onmouseover = () => btnCancel.style.background = '#f5f5f5';
        btnCancel.onmouseout = () => btnCancel.style.background = '#fff';
        btnCancel.onclick = function () {
            bannerShown = false;
            window.removeEventListener('beforeunload', unloadHandler);
            banner.remove();
        };
        btnContainer.appendChild(btnCancel);

        const btnSave = document.createElement('button');
        btnSave.textContent = '保存';
        btnSave.style.cssText = 'padding: 8px 16px; border: none; border-radius: 4px; background: #1a73e8; color: #fff; cursor: pointer; font-size: 13px; font-weight: 600;';
        btnSave.onmouseover = () => btnSave.style.background = '#1557b0';
        btnSave.onmouseout = () => btnSave.style.background = '#1a73e8';
        btnSave.onclick = function () {
            const credentialData = Object.assign({}, payload, {
                folderId: folderSelect.value,
                title: titleInput.value.trim() || payload.origin
            });
            chrome.runtime.sendMessage({type: 'storeCredential', credential: credentialData});
            bannerShown = false;
            window.removeEventListener('beforeunload', unloadHandler);
            banner.remove();
            showToast('登录信息已保存');
        };
        btnContainer.appendChild(btnSave);

        banner.appendChild(btnContainer);
        document.body.appendChild(banner);
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483647;
      background: #323232;
      color: #fff;
      padding: 12px 20px;
      border-radius: 4px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg && msg.type === 'fillCredential' && msg.credential) {
            const filled = fillCredentialDirectly(msg.credential, msg.submit);
            sendResponse({success: filled});
            return true;
        }
    });

    function attach() {
        // 监听所有表单的 submit 事件
        const forms = Array.from(document.forms || []);
        forms.forEach(f => {
            if (!f._webpwd_attached) {
                f.addEventListener('submit', handleSubmit, true);
                f._webpwd_attached = true;
            }
        });

        // 监听所有可能的登录按钮点击（包括各种类型）
        const buttons = document.querySelectorAll(
            'button[type="submit"], input[type="submit"], button:not([type]), ' +
            '[role="button"], .login-btn, .submit-btn, .btn-login, .btn-submit, ' +
            'a[href*="login"], a[href*="signin"], button'
        );
        buttons.forEach(btn => {
            if (btn._webpwd_btn_attached) return;
            btn._webpwd_btn_attached = true;
            btn.addEventListener('click', handleButtonClick, true);
        });

        // 监听 Enter 键提交
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        passwordInputs.forEach(pwd => {
            if (!pwd._webpwd_key_attached) {
                pwd._webpwd_key_attached = true;
                pwd.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        setTimeout(() => captureAndShowBanner(pwd), 50);
                    }
                });
            }

            // 也监听密码框的 change 事件（某些 AJAX 表单可能会触发）
            if (!pwd._webpwd_change_attached) {
                pwd._webpwd_change_attached = true;
                pwd.addEventListener('change', () => {
                    if (pwd.value) {
                        // 延迟触发，确保用户已输入完成
                        setTimeout(() => {
                            if (pwd.value && !document.getElementById('webpwd-save-banner')) {
                                // 此时只是监听，不自动弹窗，等待提交
                            }
                        }, 500);
                    }
                });
            }
        });
    }

    function handleButtonClick(e) {
        // 立即执行，不延迟
        const btn = e.target.closest('button, input[type="submit"], a, [role="button"]');
        if (!btn) return;

        // 找到相关的密码输入框
        const form = btn.closest('form');
        let passwordInput = null;

        if (form) {
            passwordInput = form.querySelector('input[type="password"]');
        }

        // 如果表单中没有找到，在整个页面中查找
        if (!passwordInput) {
            passwordInput = document.querySelector('input[type="password"]');
        }

        if (passwordInput && passwordInput.value) {
            captureAndShowBanner(passwordInput);
        }
    }

    // 全局点击拦截
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (!target) return;

        // 检查是否点击了可能的登录按钮
        const btn = target.closest('button, input[type="submit"], a, [role="button"]');
        if (!btn) return;

        // 检查按钮文本是否包含登录相关关键词
        const text = (btn.textContent || '').toLowerCase();
        const commonLoginWords = ['登录', '登入', 'login', 'signin', '确定', 'submit', '提交', 'ok'];
        const isLoginBtn = commonLoginWords.some(word => text.includes(word));

        if (!isLoginBtn) return;

        // 找到密码框
        const form = btn.closest('form');
        let passwordInput = null;

        if (form) {
            passwordInput = form.querySelector('input[type="password"]');
        }

        if (!passwordInput) {
            passwordInput = document.querySelector('input[type="password"]');
        }

        if (passwordInput && passwordInput.value) {
            captureAndShowBanner(passwordInput);
        }
    }, true);

    function checkFormDataForPassword(formData, url) {
        try {
            let username = '';
            let password = '';

            // FormData.entries() 用于获取所有字段
            for (let [key, value] of formData.entries()) {
                const keyLower = key.toLowerCase();
                if (keyLower.includes('password') || keyLower.includes('pass') || keyLower.includes('pwd')) {
                    password = value;
                }
                if (keyLower.includes('user') || keyLower.includes('account') || keyLower.includes('login') ||
                    keyLower.includes('email') || keyLower.includes('name') || keyLower.includes('account')) {
                    username = value;
                }
            }

            if (password) {
                handlePasswordDetected(username, password, url);
            }
        } catch (err) {
            // FormData 处理错误
        }
    }

    function checkUrlEncodedData(data, url) {
        try {
            let params;
            try {
                params = new URLSearchParams(data);
            } catch (e) {
                params = new Map();
                const pairs = data.split('&');
                pairs.forEach(pair => {
                    const [key, value] = pair.split('=');
                    if (key && value) {
                        try {
                            params.set(decodeURIComponent(key), decodeURIComponent(value));
                        } catch (e) {
                            params.set(key, value);
                        }
                    }
                });
            }

            let username = '';
            let password = '';

            for (let [key, value] of params.entries()) {
                const keyLower = key.toLowerCase();
                if (keyLower.includes('password') || keyLower.includes('pass') || keyLower.includes('pwd')) {
                    password = value;
                }
                if (keyLower.includes('user') || keyLower.includes('account') || keyLower.includes('login') ||
                    keyLower.includes('email') || keyLower.includes('name') || keyLower.includes('phone')) {
                    username = value;
                }
            }

            if (password) {
                handlePasswordDetected(username, password, url);
            }
        } catch (err) {
            // URL Encoded 处理错误
        }
    }

    function handlePasswordDetected(username, password, url) {
        if (!password) return;
        if (document.getElementById('webpwd-save-banner')) return;

        const cacheKey = `${window.location.origin}|${username}`;
        if (window._webpwd_last_submit === cacheKey) return;
        window._webpwd_last_submit = cacheKey;

        setTimeout(() => {
            if (window._webpwd_last_submit === cacheKey) {
                window._webpwd_last_submit = null;
            }
        }, 10000);

        pendingCredential = {
            type: 'loginDetected',
            origin: window.location.origin,
            url: window.location.href,
            username: username,
            password: password,
            title: document.title || new URL(window.location.href).hostname,
            formSelector: null,
            usernameSelector: null,
            passwordSelector: null
        };

        chrome.runtime.sendMessage({type: 'loginDetected', ...pendingCredential}, (response) => {
            if (chrome.runtime.lastError) return;
            if (response) {
                if (response.isDuplicate) return;
                if (response.folders) {
                    pendingCredential.hasConflict = response.hasConflict;
                    showSaveBanner(pendingCredential, response.folders);
                }
            }
        });
    }

    function tryAutoFill() {
        if (autoFillAttempted) return;
        autoFillAttempted = true;

        const pwd = document.querySelector('input[type=password]');
        if (!pwd) return;

        chrome.runtime.sendMessage({
            type: 'findCredential',
            origin: window.location.origin,
            url: window.location.href
        }, (response) => {
            // 检查错误
            if (chrome.runtime.lastError) {
                return;
            }
            if (response && response.credential && response.settings && response.settings.autoFillEnabled) {
                // 直接填充，不需要再发消息
                fillCredentialDirectly(response.credential, false);
            }
        });
    }

    function fillCredentialDirectly(c, submit) {
        try {
            let filled = false;

            if (c.usernameSelector) {
                const u = document.querySelector(c.usernameSelector);
                if (u) {
                    u.value = c.username || '';
                    u.dispatchEvent(new Event('input', {bubbles: true}));
                    u.dispatchEvent(new Event('change', {bubbles: true}));
                    filled = true;
                }
            }
            if (c.passwordSelector) {
                const p = document.querySelector(c.passwordSelector);
                if (p) {
                    p.value = c.password || '';
                    p.dispatchEvent(new Event('input', {bubbles: true}));
                    p.dispatchEvent(new Event('change', {bubbles: true}));
                    filled = true;
                }
            }

            if (!filled || !c.usernameSelector || !c.passwordSelector) {
                const pwd = document.querySelector('input[type=password]');
                if (pwd) {
                    const form = pwd.form || pwd.closest('form') || document;
                    const u = findUsernameInput(form, pwd);
                    if (u) {
                        u.value = c.username || '';
                        u.dispatchEvent(new Event('input', {bubbles: true}));
                        u.dispatchEvent(new Event('change', {bubbles: true}));
                    }
                    pwd.value = c.password || '';
                    pwd.dispatchEvent(new Event('input', {bubbles: true}));
                    pwd.dispatchEvent(new Event('change', {bubbles: true}));
                    filled = true;
                }
            }

            if (submit && filled) {
                setTimeout(() => {
                    const pwd = document.querySelector('input[type=password]');
                    if (pwd) {
                        const form = pwd.form || pwd.closest('form');
                        if (form) {
                            form.submit();
                        } else {
                            const submitBtn = document.querySelector('button[type=submit], input[type=submit]');
                            if (submitBtn) submitBtn.click();
                        }
                    }
                }, 100);
            }

            return filled;
        } catch (err) {
            return false;
        }
    }

    attach();
    const observer = new MutationObserver(() => attach());
    observer.observe(document, {childList: true, subtree: true});

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(tryAutoFill, 300);
        });
    } else {
        setTimeout(tryAutoFill, 300);
    }

    // 监听来自 MAIN world (content_script_main.js) 的凭证检测事件
    window.addEventListener('webpwd-credential-detected', (event) => {
        try {
            const { username, password, url } = event.detail;
            handlePasswordDetected(username, password, url);
        } catch (err) {
            // 事件处理错误
        }
    });

    // 保留旧的事件监听（兼容性）
    window.addEventListener('webpwd-form-data', (event) => {
        try {
            checkFormDataForPassword(event.detail.body, event.detail.url);
        } catch (err) {
            // FormData 事件处理错误
        }
    });

    window.addEventListener('webpwd-url-encoded', (event) => {
        try {
            checkUrlEncodedData(event.detail.body, event.detail.url);
        } catch (err) {
            // URL Encoded 事件处理错误
        }
    });

})();
