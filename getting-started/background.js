chrome.contextMenus.create({'title':'解析二维码',"contexts":['all'], "id": "parent"});


chrome.contextMenus.onClicked.addListener(function (){
    console.log("解析二维码")

});