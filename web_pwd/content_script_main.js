// content_script_main.js
// 运行在主世界(MAIN world)中，用于拦截页面的fetch和XHR请求

(function() {
    'use strict';

    const PASSWORD_KEYWORDS = ['password', 'pass', 'pwd', 'passwd', '密码'];
    const USERNAME_KEYWORDS = ['user', 'username', 'account', 'login', 'email', 'name', 'phone', 'mobile', 'tel'];

    function containsPasswordKeyword(str) {
        if (!str) return false;
        const lower = str.toLowerCase();
        return PASSWORD_KEYWORDS.some(kw => lower.includes(kw));
    }

    function parseCredentials(data, contentType) {
        let username = '';
        let password = '';

        try {
            if (data instanceof FormData) {
                for (let [key, value] of data.entries()) {
                    const keyLower = key.toLowerCase();
                    if (PASSWORD_KEYWORDS.some(kw => keyLower.includes(kw))) {
                        password = value;
                    }
                    if (USERNAME_KEYWORDS.some(kw => keyLower.includes(kw)) && !password) {
                        username = value;
                    }
                }
            } else if (typeof data === 'string') {
                // 尝试JSON解析
                if (contentType && contentType.includes('application/json')) {
                    try {
                        const json = JSON.parse(data);
                        for (let key in json) {
                            const keyLower = key.toLowerCase();
                            if (PASSWORD_KEYWORDS.some(kw => keyLower.includes(kw))) {
                                password = json[key];
                            }
                            if (USERNAME_KEYWORDS.some(kw => keyLower.includes(kw))) {
                                username = json[key];
                            }
                        }
                    } catch (e) { /* JSON解析失败，尝试URL encoded */ }
                }

                // 尝试URL encoded解析
                if (!password) {
                    try {
                        const params = new URLSearchParams(data);
                        for (let [key, value] of params.entries()) {
                            const keyLower = key.toLowerCase();
                            if (PASSWORD_KEYWORDS.some(kw => keyLower.includes(kw))) {
                                password = value;
                            }
                            if (USERNAME_KEYWORDS.some(kw => keyLower.includes(kw))) {
                                username = value;
                            }
                        }
                    } catch (e) { /* URLSearchParams解析失败 */ }
                }
            }
        } catch (err) { /* 解析出错 */ }

        return { username, password };
    }

    function notifyCredentialDetected(username, password, url) {
        if (!password) return;
        window.dispatchEvent(new CustomEvent('webpwd-credential-detected', {
            detail: {
                username: username,
                password: password,
                url: url,
                origin: window.location.origin,
                title: document.title || window.location.hostname
            }
        }));
    }

    // 拦截 fetch
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        try {
            const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
            const options = init || {};
            const body = options.body;

            if (body) {
                let shouldCheck = body instanceof FormData || (typeof body === 'string' && containsPasswordKeyword(body));
                if (shouldCheck) {
                    const contentType = options.headers ?
                        (options.headers['Content-Type'] || options.headers['content-type'] || '') : '';
                    const cred = parseCredentials(body, contentType);
                    if (cred.password) {
                        notifyCredentialDetected(cred.username, cred.password, url);
                    }
                }
            }
        } catch (err) { /* 拦截出错 */ }

        return originalFetch.apply(this, arguments);
    };

    // 拦截 XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._webpwd_url = url;
        this._webpwd_headers = {};
        return originalXHROpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        if (this._webpwd_headers) {
            this._webpwd_headers[name] = value;
        }
        return originalXHRSetRequestHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(data) {
        try {
            if (data) {
                let shouldCheck = data instanceof FormData || (typeof data === 'string' && containsPasswordKeyword(data));
                if (shouldCheck) {
                    const contentType = this._webpwd_headers ?
                        (this._webpwd_headers['Content-Type'] || this._webpwd_headers['content-type'] || '') : '';
                    const cred = parseCredentials(data, contentType);
                    if (cred.password) {
                        notifyCredentialDetected(cred.username, cred.password, this._webpwd_url);
                    }
                }
            }
        } catch (err) { /* 拦截出错 */ }

        return originalXHRSend.apply(this, arguments);
    };

    // 拦截 navigator.sendBeacon
    if (navigator.sendBeacon) {
        const originalSendBeacon = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = function(url, data) {
            try {
                if (data && typeof data === 'string' && containsPasswordKeyword(data)) {
                    const cred = parseCredentials(data, '');
                    if (cred.password) {
                        notifyCredentialDetected(cred.username, cred.password, url);
                    }
                }
            } catch (err) { /* 拦截出错 */ }
            return originalSendBeacon(url, data);
        };
    }

})();
