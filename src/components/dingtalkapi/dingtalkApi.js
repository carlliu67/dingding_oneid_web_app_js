import * as dd from 'dingtalk-jsapi'; // 此方式为整体加载，也可按需进行加载

function openSchema(url, closePage = false) {
    dd.biz.util.openLink({
        url: url,//要打开链接的地址
        onSuccess: function (result) {
            /**/
        },
        onFail: function (err) { }
    })
    // window.location.href = url;
    if (closePage) {
        // pc端关闭页面
        dd.biz.navigation.quit({
            message: "quit message",//退出信息，传递给openModal或者openSlidePanel的onSuccess函数的result参数
            onSuccess : function(result) {
                /**/
            },
            onFail : function() {}
        })
        // setTimeout(() => {
        //     // pc端关闭页面
        //     dd.biz.navigation.quit({
        //         message: "quit message",//退出信息，传递给openModal或者openSlidePanel的onSuccess函数的result参数
        //         onSuccess : function(result) {
        //             /**/
        //         },
        //         onFail : function() {}
        //     })
        //     // 移动端关闭页面
        //     // dd.biz.navigation.close({
        //     //     onSuccess : function(result) {
        //     //         /*result结构
        //     //         {}
        //     //         */
        //     //     },
        //     //     onFail : function(err) {}
        //     // })
        // }, 15000);
    }
}

export { openSchema }