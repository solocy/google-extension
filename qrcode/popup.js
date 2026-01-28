// 加载二维码识别库
function addScript() {
    document.write("<script language=javascript src='./readQrcode.js'></script>");
}
addScript();

// 存储识别到的所有二维码
var qrcodeResults = [];
var selectedIndex = -1;

// 判断内容类型
function getContentType(content) {
    if (!content) return 'Text';
    if (content.indexOf('http://') === 0 || content.indexOf('https://') === 0 || content.indexOf('ftp://') === 0) return 'URL';
    if (content.indexOf('mailto:') === 0) return 'Email';
    if (content.indexOf('tel:') === 0) return 'Tel';
    if (content.indexOf('WIFI:') === 0) return 'WiFi';
    return 'Text';
}

// 渲染二维码列表
function renderQRCodeList() {
    var listContainer = document.getElementById('qrcode-list');
    var resultSection = document.getElementById('result-section');
    var noQrcode = document.getElementById('no-qrcode');
    var loading = document.getElementById('loading');

    if (loading) loading.style.display = 'none';

    if (qrcodeResults.length === 0) {
        listContainer.innerHTML = '';
        noQrcode.style.display = 'block';
        resultSection.style.display = 'none';
        return;
    }

    noQrcode.style.display = 'none';
    resultSection.style.display = 'block';

    var html = '<div class="scan-count">Found ' + qrcodeResults.length + ' QR code(s)</div>';

    for (var index = 0; index < qrcodeResults.length; index++) {
        var result = qrcodeResults[index];
        var type = getContentType(result);
        var isSelected = index === selectedIndex;
        var escapedResult = result.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += '<div class="qrcode-item ' + (isSelected ? 'selected' : '') + '" data-index="' + index + '">' +
            '<span class="qrcode-index">' + (index + 1) + '</span>' +
            '<span class="qrcode-content" title="' + escapedResult + '">' + escapedResult + '</span>' +
            '<span class="qrcode-type">' + type + '</span>' +
            '</div>';
    }

    listContainer.innerHTML = html;

    // 绑定点击事件
    var items = document.querySelectorAll('.qrcode-item');
    for (var i = 0; i < items.length; i++) {
        (function(item) {
            item.addEventListener('click', function() {
                var idx = parseInt(this.getAttribute('data-index'));
                selectQRCode(idx);
            });
        })(items[i]);
    }

    // 默认选中第一个
    if (selectedIndex === -1 && qrcodeResults.length > 0) {
        selectQRCode(0);
    }
}

// 选择一个二维码
function selectQRCode(index) {
    selectedIndex = index;
    var input = document.getElementById('input');
    input.value = qrcodeResults[index];

    // 更新选中状态
    var items = document.querySelectorAll('.qrcode-item');
    for (var i = 0; i < items.length; i++) {
        if (i === index) {
            items[i].classList.add('selected');
        } else {
            items[i].classList.remove('selected');
        }
    }
}

// 复制按钮功能
function copyButton() {
    var value = document.getElementById("input");
    value.select();
    document.execCommand('copy');

    // 视觉反馈
    var btn = document.getElementById("copy");
    btn.classList.add('copied');
    setTimeout(function() {
        btn.classList.remove('copied');
    }, 1000);
}

// 扫描单个区域
function scanRegion(img, x, y, w, h, callback) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

    try {
        qrcode.width = canvas.width;
        qrcode.height = canvas.height;
        qrcode.imagedata = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var result = qrcode.process(ctx);
        if (result && result !== 'error decoding QR Code') {
            callback(result);
        }
    } catch(e) {
        // scan failed
    }
}

// 开始扫描
function startScan() {
    chrome.tabs.captureVisibleTab(undefined, { format: 'png' }, function(imageData) {
        if (chrome.runtime.lastError) {
            document.getElementById('loading').textContent = 'Screenshot failed';
            return;
        }

        var img = new Image();
        img.onload = function() {
            var results = [];
            var width = img.width;
            var height = img.height;

            // 先扫描整张图
            scanRegion(img, 0, 0, width, height, function(result) {
                if (results.indexOf(result) === -1) results.push(result);
            });

            // 扫描四个象限
            scanRegion(img, 0, 0, width/2, height/2, function(result) {
                if (results.indexOf(result) === -1) results.push(result);
            });
            scanRegion(img, width/2, 0, width/2, height/2, function(result) {
                if (results.indexOf(result) === -1) results.push(result);
            });
            scanRegion(img, 0, height/2, width/2, height/2, function(result) {
                if (results.indexOf(result) === -1) results.push(result);
            });
            scanRegion(img, width/2, height/2, width/2, height/2, function(result) {
                if (results.indexOf(result) === -1) results.push(result);
            });

            // 扫描3x3网格
            var cellW = width / 3;
            var cellH = height / 3;
            for (var row = 0; row < 3; row++) {
                for (var col = 0; col < 3; col++) {
                    scanRegion(img, col * cellW, row * cellH, cellW, cellH, function(result) {
                        if (results.indexOf(result) === -1) results.push(result);
                    });
                }
            }

            qrcodeResults = results;
            renderQRCodeList();
        };
        img.src = imageData;
    });
}

// 初始化
startScan();

document.getElementById("copy").onclick = copyButton;
