// content_script.js
// 检测表单提交，从密码输入框直接捕获用户名/密码，发送到后台保存
// 支持自动填充已保存的登录信息

(function () {
    const SAVE_BANNER_ID = 'webpwd-save-banner';
    const SAVE_BANNER_STYLE_ID = 'webpwd-save-banner-style';
    const SAVE_TOAST_ID = 'webpwd-save-toast';
    const ACCOUNT_SWITCHER_ID = 'webpwd-account-switcher';
    const SAVE_BANNER_AUTO_CLOSE_MS = 10000;

    let autoFillAttempted = false;
    let pendingCredential = null;
    let currentLocale = 'zh';
    let accountSwitcherOutsideHandler = null;
    let currentAutoFilledCredentialKey = null;

    const I18N = {
        zh: {
            saveLoginInfo: '保存登录信息？',
            updatePassword: '更新密码？',
            site: '网站',
            username: '用户名',
            saveToFolder: '保存到文件夹',
            title: '标题',
            inputTitle: '输入标题',
            cancel: '取消',
            save: '保存',
            update: '更新',
            saveSuccess: '登录信息已保存',
            updateSuccess: '密码已更新',
            saveFailed: '保存失败，请重试',
            duplicateCredential: '相同账号密码已保存，本次不再提示。',
            updatePasswordHint: '检测到同一登录页的该账号密码已变化，是否更新为新密码？',
            newAccountHint: '检测到新的登录账号，可直接保存到当前页面。',
            otherAccounts: '其他账号',
            switchAccount: '切换账号',
            chooseAccount: '选择账号',
            currentAccount: '当前',
            emptyUsername: '(空)',
            switchedAccount: '已切换账号'
        },
        en: {
            saveLoginInfo: 'Save login info?',
            updatePassword: 'Update password?',
            site: 'Site',
            username: 'Username',
            saveToFolder: 'Save to folder',
            title: 'Title',
            inputTitle: 'Enter title',
            cancel: 'Cancel',
            save: 'Save',
            update: 'Update',
            saveSuccess: 'Login info saved',
            updateSuccess: 'Password updated',
            saveFailed: 'Save failed, please try again',
            duplicateCredential: 'This username and password are already saved.',
            updatePasswordHint: 'The password for this account on the same login page has changed. Update it?',
            newAccountHint: 'A new account was detected on this login page. Save it now.',
            otherAccounts: 'Other accounts',
            switchAccount: 'Switch account',
            chooseAccount: 'Choose an account',
            currentAccount: 'Current',
            emptyUsername: '(empty)',
            switchedAccount: 'Switched account'
        }
    };

    /**
     * 统一包装 runtime 消息发送，便于页面内卡片在保存时等待后台结果。
     * @param {object} message 发送到后台的消息体。
     * @returns {Promise<any>} 后台响应。
     */
    function sendRuntimeMessage(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, (response) => {
                resolve(response);
            });
        });
    }

    /**
     * 规范化语言值，仅允许中文和英文两种。
     * @param {string} language 语言标识。
     */
    function setLocale(language) {
        currentLocale = language === 'en' ? 'en' : 'zh';
    }

    /**
     * 获取当前语言下的文案。
     * @param {string} key 文案键名。
     * @returns {string} 当前语言文案。
     */
    function t(key) {
        return I18N[currentLocale][key] || I18N.zh[key] || key;
    }

    function removeAccountSwitcher() {
        const existing = document.getElementById(ACCOUNT_SWITCHER_ID);
        if (existing) {
            existing.remove();
        }
        if (accountSwitcherOutsideHandler) {
            document.removeEventListener('click', accountSwitcherOutsideHandler);
            accountSwitcherOutsideHandler = null;
        }
    }

    function getDisplayUsername(username) {
        return username || t('emptyUsername');
    }

    function isWebPwdInjectedElement(target) {
        if (!target || !(target instanceof Element)) {
            return false;
        }
        return !!target.closest(`#${SAVE_BANNER_ID}, #${SAVE_TOAST_ID}, #${ACCOUNT_SWITCHER_ID}`);
    }

    function getCredentialIdentity(credential) {
        if (!credential) return '';
        return `${credential.urlPattern || credential.origin || ''}|${credential.username || ''}`;
    }

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
            removeAccountSwitcher();
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
        if (document.getElementById(SAVE_BANNER_ID)) return;

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

        // 请求文件夹列表并直接在当前页面内展示保存卡片
        chrome.runtime.sendMessage({type: 'loginDetected', ...pendingCredential}, (response) => {
            if (chrome.runtime.lastError) {
                return;
            }
            if (response) {
                setLocale(response.settings && response.settings.language);
                // 如果是重复凭证（同一账号同一密码），不显示通知
                if (response.isDuplicate) {
                    return;
                }

                showSaveBanner({
                    ...pendingCredential,
                    hasConflict: response.hasConflict
                }, response.folders || []);
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

    /**
     * 注入页面内保存卡片所需样式，保证动画和视觉结构只注册一次。
     */
    function ensureBannerStyles() {
        if (document.getElementById(SAVE_BANNER_STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = SAVE_BANNER_STYLE_ID;
        style.textContent = `
            @keyframes webpwdCardSlideIn {
                from {
                    transform: translate3d(112%, 0, 0);
                    opacity: 0;
                }
                to {
                    transform: translate3d(0, 0, 0);
                    opacity: 1;
                }
            }

            @keyframes webpwdCardSlideOut {
                from {
                    transform: translate3d(0, 0, 0);
                    opacity: 1;
                }
                to {
                    transform: translate3d(112%, 0, 0);
                    opacity: 0;
                }
            }

            #${SAVE_BANNER_ID} {
                position: fixed;
                right: 20px;
                bottom: 20px;
                z-index: 2147483647;
                width: min(348px, calc(100vw - 24px));
                padding: 16px 16px 14px;
                border: 2px solid #2f80ed;
                border-radius: 12px;
                background: #ffffff;
                box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
                color: #333333;
                font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
                animation: webpwdCardSlideIn 0.24s ease-out;
            }

            #${SAVE_BANNER_ID}.is-closing {
                animation: webpwdCardSlideOut 0.2s ease-in forwards;
            }

            #${SAVE_BANNER_ID} *,
            #${SAVE_TOAST_ID} {
                box-sizing: border-box;
            }

            .webpwd-card-top {
                position: relative;
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 8px;
                margin-bottom: 14px;
            }

            .webpwd-card-heading {
                min-width: 0;
                padding-right: 24px;
            }

            .webpwd-card-title {
                margin: 0;
                color: #1a73e8;
                font-size: 15px;
                line-height: 1.4;
                font-weight: 700;
            }

            .webpwd-card-close {
                position: absolute;
                top: -2px;
                right: -2px;
                width: 22px;
                height: 22px;
                padding: 0;
                border: none;
                background: transparent;
                color: #8b8b8b;
                cursor: pointer;
                font-size: 18px;
                line-height: 1;
            }

            .webpwd-card-close:hover {
                color: #4b4b4b;
            }

            .webpwd-card-timer {
                display: none;
            }

            .webpwd-card-meta {
                display: block;
                margin-bottom: 12px;
            }

            .webpwd-card-meta-row {
                margin-bottom: 10px;
            }

            .webpwd-card-meta-row:last-child {
                margin-bottom: 0;
            }

            .webpwd-card-label {
                display: block;
                margin-bottom: 4px;
                color: #666666;
                font-size: 12px;
                font-weight: 600;
            }

            .webpwd-card-value {
                color: #444444;
                font-size: 13px;
                line-height: 1.5;
                word-break: break-word;
            }

            .webpwd-card-warning {
                margin-bottom: 12px;
                padding: 8px 10px;
                border: 1px solid #ffd38a;
                border-radius: 6px;
                background: #fff8ea;
                color: #a06000;
                font-size: 12px;
                line-height: 1.5;
            }

            .webpwd-card-field {
                margin-bottom: 12px;
            }

            .webpwd-card-field label {
                display: block;
                margin-bottom: 6px;
                color: #888888;
                font-size: 12px;
                font-weight: 500;
            }

            .webpwd-card-input,
            .webpwd-card-select {
                width: 100%;
                height: 38px;
                padding: 8px 12px;
                border: 1px solid #d9d9d9;
                border-radius: 4px;
                background: #ffffff;
                color: #333333;
                font-size: 13px;
                outline: none;
            }

            .webpwd-card-input:focus,
            .webpwd-card-select:focus {
                border-color: #2f80ed;
                box-shadow: 0 0 0 2px rgba(47, 128, 237, 0.12);
            }

            .webpwd-card-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                margin-top: 6px;
            }

            .webpwd-card-btn {
                min-width: 72px;
                height: 36px;
                padding: 0 14px;
                border-radius: 4px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: background-color 0.16s ease, border-color 0.16s ease, opacity 0.16s ease;
            }

            .webpwd-card-btn:disabled {
                opacity: 0.65;
                cursor: default;
            }

            .webpwd-card-btn-secondary {
                border: 1px solid #d9d9d9;
                background: #ffffff;
                color: #555555;
            }

            .webpwd-card-btn-secondary:hover:not(:disabled) {
                background: #f7f7f7;
            }

            .webpwd-card-btn-primary {
                border: 1px solid #1a73e8;
                background: #1a73e8;
                color: #ffffff;
            }

            .webpwd-card-btn-primary:hover:not(:disabled) {
                background: #1765cc;
                border-color: #1765cc;
            }

            #${SAVE_TOAST_ID} {
                position: fixed;
                right: 20px;
                bottom: 20px;
                z-index: 2147483647;
                padding: 10px 14px;
                border-radius: 6px;
                background: rgba(51, 51, 51, 0.96);
                color: #ffffff;
                font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
                font-size: 13px;
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.16);
            }

            #${ACCOUNT_SWITCHER_ID} {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 2147483646;
                min-width: 132px;
                font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
            }

            .webpwd-account-toggle {
                width: 100%;
                height: 34px;
                padding: 0 12px;
                border: 1px solid #d9d9d9;
                border-radius: 18px;
                background: rgba(255, 255, 255, 0.96);
                color: #333333;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.14);
            }

            .webpwd-account-menu {
                display: none;
                margin-top: 8px;
                padding: 6px;
                border: 1px solid #d9d9d9;
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.98);
                box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16);
            }

            .webpwd-account-menu.is-open {
                display: block;
            }

            .webpwd-account-item {
                display: block;
                width: 100%;
                padding: 10px 12px;
                border: 1px solid #d9d9d9;
                border-radius: 10px;
                background: #ffffff;
                color: #333333;
                text-align: left;
                font-size: 13px;
                cursor: pointer;
            }

            .webpwd-account-item:hover {
                background: #f5f8ff;
                color: #1a73e8;
                border-color: #bfd6fb;
            }

            .webpwd-account-item.is-current {
                border-color: #1a73e8;
                background: #eef5ff;
                color: #1a73e8;
            }

            .webpwd-account-item-label {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }

            .webpwd-account-current-tag {
                flex-shrink: 0;
                padding: 2px 6px;
                border-radius: 999px;
                background: #1a73e8;
                color: #ffffff;
                font-size: 10px;
                font-weight: 700;
            }

            @media (max-width: 640px) {
                #${SAVE_BANNER_ID},
                #${SAVE_TOAST_ID} {
                    right: 12px;
                    bottom: 12px;
                }

                #${ACCOUNT_SWITCHER_ID} {
                    top: 12px;
                    right: 12px;
                }

                #${SAVE_BANNER_ID} {
                    width: calc(100vw - 24px);
                }
            }
        `;
        document.head.appendChild(style);
        }

        /**
         * 把文件夹平铺成带层级缩进的下拉选项，保证页面内卡片与原数据结构一致。
         * @param {HTMLSelectElement} folderSelect 文件夹下拉框。
         * @param {Array} folders 文件夹列表。
         */
        function appendFolderOptions(folderSelect, folders) {
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

        function addFolderOptions(node, level) {
            const option = document.createElement('option');
            option.value = node.folder.id;
            option.textContent = `${'  '.repeat(level)}${level > 0 ? '└ ' : ''}${node.folder.name}`;
            folderSelect.appendChild(option);
            node.children.forEach((child) => addFolderOptions(child, level + 1));
        }

        rootFolders.forEach((node) => addFolderOptions(node, 0));
        }

        /**
         * 在当前页面右下角渲染固定保存卡片，并在 10 秒后自动退出。
         * @param {object} payload 待保存的登录信息。
         * @param {Array} folders 可选文件夹列表。
         */
        function showSaveBanner(payload, folders) {
        const existing = document.getElementById(SAVE_BANNER_ID);
        if (existing) return;

        ensureBannerStyles();

        const banner = document.createElement('div');
        banner.id = SAVE_BANNER_ID;

        const safeTitle = document.title || new URL(payload.url).hostname;
        const expiresAt = Date.now() + SAVE_BANNER_AUTO_CLOSE_MS;
        let countdownTimer = null;
        let isClosing = false;

        const closeBanner = () => {
            if (isClosing) {
            return;
            }
            isClosing = true;
            clearTimeout(autoCloseTimer);
            if (countdownTimer) {
            clearInterval(countdownTimer);
            }
            banner.classList.add('is-closing');
            setTimeout(() => banner.remove(), 260);
        };

        const autoCloseTimer = setTimeout(() => {
            closeBanner();
        }, SAVE_BANNER_AUTO_CLOSE_MS);

        const cardTop = document.createElement('div');
        cardTop.className = 'webpwd-card-top';

        const heading = document.createElement('div');
        heading.className = 'webpwd-card-heading';

        const title = document.createElement('div');
        title.className = 'webpwd-card-title';
        title.textContent = payload.hasConflict ? t('updatePassword') : t('saveLoginInfo');
        heading.appendChild(title);

        cardTop.appendChild(heading);

        const topActions = document.createElement('div');

        const countdown = document.createElement('div');
        countdown.className = 'webpwd-card-timer';
        topActions.appendChild(countdown);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'webpwd-card-close';
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.onclick = closeBanner;
        topActions.appendChild(closeBtn);
        cardTop.appendChild(topActions);
        banner.appendChild(cardTop);

        const meta = document.createElement('div');
        meta.className = 'webpwd-card-meta';

        const websiteRow = document.createElement('div');
        websiteRow.className = 'webpwd-card-meta-row';

        const websiteLabel = document.createElement('div');
        websiteLabel.className = 'webpwd-card-label';
        websiteLabel.textContent = t('site');
        websiteRow.appendChild(websiteLabel);

        const websiteValue = document.createElement('div');
        websiteValue.className = 'webpwd-card-value';
        websiteValue.textContent = safeTitle;
        websiteRow.appendChild(websiteValue);
        meta.appendChild(websiteRow);

        const userRow = document.createElement('div');
        userRow.className = 'webpwd-card-meta-row';

        const userLabel = document.createElement('div');
        userLabel.className = 'webpwd-card-label';
        userLabel.textContent = t('username');
        userRow.appendChild(userLabel);

        const userInfo = document.createElement('div');
        userInfo.className = 'webpwd-card-value';
        userInfo.textContent = getDisplayUsername(payload.username);
        userRow.appendChild(userInfo);
        meta.appendChild(userRow);

        banner.appendChild(meta);

        if (payload.hasConflict) {
            const conflictWarning = document.createElement('div');
            conflictWarning.className = 'webpwd-card-warning';
            conflictWarning.textContent = t('updatePasswordHint');
            banner.appendChild(conflictWarning);
        } else {
            const saveHint = document.createElement('div');
            saveHint.className = 'webpwd-card-warning';
            saveHint.textContent = t('newAccountHint');
            banner.appendChild(saveHint);
        }

        const folderGroup = document.createElement('div');
        folderGroup.className = 'webpwd-card-field';

        const folderLabel = document.createElement('label');
        folderLabel.textContent = t('saveToFolder');
        folderGroup.appendChild(folderLabel);

        const folderSelect = document.createElement('select');
        folderSelect.className = 'webpwd-card-select';
        appendFolderOptions(folderSelect, folders);

        folderGroup.appendChild(folderSelect);
        banner.appendChild(folderGroup);

        const titleGroup = document.createElement('div');
        titleGroup.className = 'webpwd-card-field';

        const titleLabel = document.createElement('label');
        titleLabel.textContent = t('title');
        titleGroup.appendChild(titleLabel);

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'webpwd-card-input';
        titleInput.placeholder = t('inputTitle');
        titleInput.value = safeTitle;
        titleGroup.appendChild(titleInput);
        banner.appendChild(titleGroup);

        const btnContainer = document.createElement('div');
        btnContainer.className = 'webpwd-card-actions';

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.textContent = t('cancel');
        btnCancel.className = 'webpwd-card-btn webpwd-card-btn-secondary';
        btnCancel.onclick = closeBanner;
        btnContainer.appendChild(btnCancel);

        const btnSave = document.createElement('button');
        btnSave.type = 'button';
        btnSave.textContent = payload.hasConflict ? t('update') : t('save');
        btnSave.className = 'webpwd-card-btn webpwd-card-btn-primary';
        btnSave.onclick = async function () {
            clearTimeout(autoCloseTimer);
            btnSave.disabled = true;
            btnCancel.disabled = true;
            closeBtn.disabled = true;
            folderSelect.disabled = true;
            titleInput.disabled = true;

            const credentialData = Object.assign({}, payload, {
            folderId: folderSelect.value,
            title: titleInput.value.trim() || payload.origin
            });

            const response = await sendRuntimeMessage({type: 'storeCredential', credential: credentialData});
            if (!response || response.success === false) {
            btnSave.disabled = false;
            btnCancel.disabled = false;
            closeBtn.disabled = false;
            folderSelect.disabled = false;
            titleInput.disabled = false;
                showToast(t('saveFailed'));
            return;
            }

            closeBanner();
            showToast(payload.hasConflict ? t('updateSuccess') : t('saveSuccess'));
        };
        btnContainer.appendChild(btnSave);

        banner.appendChild(btnContainer);

        function updateCountdown() {
            const remainingMs = Math.max(0, expiresAt - Date.now());
            countdown.textContent = `${(remainingMs / 1000).toFixed(1)}s`;
        }

        updateCountdown();
        countdownTimer = setInterval(updateCountdown, 100);
        (document.body || document.documentElement).appendChild(banner);
        }

        /**
         * 在页面右下角显示轻量提示，反馈保存结果。
         * @param {string} message 提示内容。
         */
        function showToast(message) {
        const existingToast = document.getElementById(SAVE_TOAST_ID);
        if (existingToast) {
            existingToast.remove();
        }

        ensureBannerStyles();

        const toast = document.createElement('div');
        toast.id = SAVE_TOAST_ID;
        toast.textContent = message;
        (document.body || document.documentElement).appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        }

    /**
     * 当同一登录页保存了多个账号时，在右上角展示精简的账号切换入口。
     * @param {Array} credentials 当前登录页可用账号列表。
     */
    function showAccountSwitcher(credentials) {
        removeAccountSwitcher();
        if (!Array.isArray(credentials) || credentials.length <= 1) {
            return;
        }

        ensureBannerStyles();

        const switcher = document.createElement('div');
        switcher.id = ACCOUNT_SWITCHER_ID;

        const toggleButton = document.createElement('button');
        toggleButton.type = 'button';
        toggleButton.className = 'webpwd-account-toggle';
        toggleButton.textContent = t('switchAccount');
        switcher.appendChild(toggleButton);

        const menu = document.createElement('div');
        menu.className = 'webpwd-account-menu';

        credentials.forEach((credential) => {
            const isCurrent = getCredentialIdentity(credential) === currentAutoFilledCredentialKey;
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `webpwd-account-item${isCurrent ? ' is-current' : ''}`;

            const itemLabel = document.createElement('span');
            itemLabel.className = 'webpwd-account-item-label';

            const usernameText = document.createElement('span');
            usernameText.textContent = getDisplayUsername(credential.username);
            itemLabel.appendChild(usernameText);

            if (isCurrent) {
                const currentTag = document.createElement('span');
                currentTag.className = 'webpwd-account-current-tag';
                currentTag.textContent = t('currentAccount');
                itemLabel.appendChild(currentTag);
            }

            item.appendChild(itemLabel);
            item.onclick = () => {
                currentAutoFilledCredentialKey = getCredentialIdentity(credential);
                fillCredentialDirectly(credential, false);
                removeAccountSwitcher();
                showAccountSwitcher(credentials);
                showToast(`${t('switchedAccount')}: ${getDisplayUsername(credential.username)}`);
            };
            menu.appendChild(item);
        });
        switcher.appendChild(menu);

        toggleButton.onclick = (event) => {
            event.stopPropagation();
            menu.classList.toggle('is-open');
        };

        accountSwitcherOutsideHandler = (event) => {
            if (!switcher.contains(event.target)) {
                menu.classList.remove('is-open');
            }
        };
        setTimeout(() => {
            if (accountSwitcherOutsideHandler) {
                document.addEventListener('click', accountSwitcherOutsideHandler);
            }
        }, 0);

        (document.body || document.documentElement).appendChild(switcher);
    }

    function applyDefaultCredential(credentials) {
        if (!Array.isArray(credentials) || credentials.length === 0) {
            return;
        }

        currentAutoFilledCredentialKey = getCredentialIdentity(credentials[0]);
        fillCredentialDirectly(credentials[0], false);
        showAccountSwitcher(credentials);
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

        if (isWebPwdInjectedElement(btn)) return;

        removeAccountSwitcher();

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

        if (isWebPwdInjectedElement(target)) return;

        // 检查是否点击了可能的登录按钮
        const btn = target.closest('button, input[type="submit"], a, [role="button"]');
        if (!btn) return;

        // 检查按钮文本是否包含登录相关关键词
        const text = (btn.textContent || '').toLowerCase();
        const commonLoginWords = ['登录', '登入', 'login', 'signin', '确定', 'submit', '提交', 'ok'];
        const isLoginBtn = commonLoginWords.some(word => text.includes(word));

        if (!isLoginBtn) return;

        removeAccountSwitcher();

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

    function tryAutoFill() {
        if (autoFillAttempted) return;
        autoFillAttempted = true;

        const pwd = document.querySelector('input[type=password]');
        if (!pwd) return;

        chrome.runtime.sendMessage({
            type: 'findCredentialsForPage',
            origin: window.location.origin,
            url: window.location.href
        }, (response) => {
            // 检查错误
            if (chrome.runtime.lastError) {
                return;
            }
            if (response && response.settings) {
                setLocale(response.settings.language);
            }
            if (response && Array.isArray(response.credentials) && response.credentials.length > 0 && response.settings && response.settings.autoFillEnabled) {
                // 同一登录页默认填充第一个账号，并在有多个账号时显示下拉切换入口
                applyDefaultCredential(response.credentials);
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

    window.addEventListener('pagehide', removeAccountSwitcher);
    window.addEventListener('beforeunload', removeAccountSwitcher);


})();
