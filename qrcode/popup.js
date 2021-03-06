

function addScript(){
    document.write("<script language=javascript src='./readQrcode.js'></script>");
}
addScript();

function copyButton() {
    const value = document.getElementById("input");
    value.select();
    document.execCommand('copy');
}

function open() {
    const input = document.getElementById("input");
    chrome.tabs.captureVisibleTab(undefined, { format: 'png' }, (date)=> {
        qrcode.decode(date);
        qrcode.callback = function (res) {
            input.value = res;
        }
    })
}
open();

document.getElementById("copy").onclick = copyButton;

function skipButton() {
    const input = document.getElementById("input");
    chrome.runtime.sendMessage({cmd: input.value});
}

document.getElementById("skip").onclick = skipButton;
