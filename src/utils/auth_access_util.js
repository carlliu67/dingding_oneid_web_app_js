import axios from 'axios';
import clientConfig from '../config/client_config.js';
import Cookies from 'js-cookie';
import * as dd from 'dingtalk-jsapi'; // 此方式为整体加载，也可按需进行加载

const USER_INFO_KEY = 'user_info'

/// ---------------- JSAPI鉴权 部分 -------------------------

export async function handleJSAPIAccess() {

    console.log("\n----------[接入方网页JSAPI鉴权处理 BEGIN]----------")
    const url = encodeURIComponent(window.location.href.split("#")[0]);
    console.log("接入方前端[JSAPI鉴权处理]第① 步: 请求JSAPI鉴权参数")
    // 向接入方服务端发起请求，获取鉴权参数
    var desUrl = `${getOrigin(clientConfig.apiPort)}${clientConfig.getSignParametersPath}?url=${url}`
    console.log("desUrl: " + desUrl)
    try {
        const res = await axios.get(desUrl,
            { withCredentials: true }
        )
        if (!res.data) {
            console.error(`${clientConfig.getSignParametersPath} fail`)
            //complete(false)
            return
        }

        const data = res.data
        console.log("接入方前端[JSAPI鉴权处理]第② 步: 获得鉴权参数")
        if (!data) {
            console.error('获取参数失败')
            //complete(false)
            return
        }
        return data
        // configJSAPIAccess(data, complete)
    } catch (error) {
        console.error("JSAPI鉴权请求失败");
        if (error.response) {
            console.error("错误响应数据:", error.response.msg);
        }
        throw error; // 重新抛出错误以便调用方处理
    }
}

//config JSAPI鉴权
export function configJSAPIAccess(data) {
    //配置要使用的jsapi列表
    let jsApiList = [
        "openLink",
    ]
    console.log("接入方前端[JSAPI鉴权处理]第③ 步: 通过dd.config进行鉴权")
    dd.config({
        agentId: data.agentId, // 必填，微应用ID
        corpId: data.corpId,//必填，企业ID
        timeStamp: data.timeStamp, // 必填，生成签名的时间戳
        nonceStr: data.noncestr, // 必填，自定义固定字符串。
        signature: data.signature, // 必填，签名
        type:0,   //选填。0表示微应用的jsapi,1表示服务窗的jsapi；不填默认为0。该参数从dingtalk.js的0.8.3版本开始支持
        jsApiList :  jsApiList// 必填，需要使用的jsapi列表，注意：不要带dd。
    });
    
    dd.error(function (err) {
        alert('dd error: ' + JSON.stringify(err));
    })//该方法必须带上，用来捕获鉴权出现的异常信息，否则不方便排查出现的问题

    console.log('handleJSAPIAccess OK: ', true);
}

/// ---------------- 应用免登 部分 -------------------------
//处理用户免登逻辑
export function handleUserAuth(complete) {

    console.log("\n----------[接入方网页免登处理 BEGIN]----------")
    let lj_tokenString = Cookies.get(USER_INFO_KEY) || ""
    if (lj_tokenString.length > 0) {
        console.log("接入方前端[免登处理]第① 步: 用户已登录，请求后端验证...")
        requestUserAccessToken("", complete)
    } else {
        console.log("接入方前端[免登处理]第① 步: 依据App ID调用JSAPI dd.requestAuthCode 请求免登授权码")
        // console.log("corpId: " + clientConfig.corpId, "\nclientId: " + clientConfig.clientId)
        console.log("href: ", window.location.href); // 示例输出：https://example.com/path?query=1#hash
        dd.ready(function () {
            var corpId = clientConfig.corpId;
            var clientId = clientConfig.clientId;
            //console.log("dd.ready");
            //console.log("href: ", window.location.href); // 示例输出：https://example.com/path?query=1#hash
            // dd.ready参数为回调函数，在 环境准备就绪时触发，jsapi的调用需要保证在该回调函数触发后调用，否则无效。
            dd.runtime.permission.requestAuthCode({
                corpId: corpId,
                // clientId: clientId,
                onSuccess: function (info) {
                    const code = info.code
                    if (code.length <= 0) {
                        console.error('auth code为空')
                        complete()
                    } else {
                        requestUserAccessToken(code, complete)
                    }
                },
                onFail: function (err) {
                    complete()
                    console.error("dd.requestAuthCode", err)
                    //alert(JSON.stringify(err))
                }
            });
        });
    }
}

function requestUserAccessToken(code, complete) {

    // 获取user_access_token信息
    console.log("接入方前端[免登处理]第② 步: 去接入方服务端获取user_access_token信息")
    var desUrl = `${getOrigin(clientConfig.apiPort)}${clientConfig.getUserAccessTokenPath}?code=${code}`
    console.log("desUrl: " + desUrl)
    axios.get(desUrl,
        { withCredentials: true }   //调用时设置 请求带上cookie
    ).then(function (response) {  // ignore_security_alert
        if (!response.data && !response.data.data) {
            console.error(`${clientConfig.getUserAccessTokenPath} response is null`)
            console.error("接口调用返回信息: ", response)
            complete()
            return
        }
        const data = response.data.data
        console.log("data: ", data)
        if (data) {
            console.log("接入方前端[免登处理]第③ 步: 获取user_access_token信息")
            localStorage.setItem(USER_INFO_KEY, data)
            console.log("----------[接入网页方免登处理 END]----------\n")
            complete(data)
        } else {
            console.error("接入方前端[免登处理]第③ 步: 未获取user_access_token信息")
            complete()
            console.log("----------[接入网页方免登处理 END]----------\n")
        }
    }).catch(function (error) {
        console.error(`${clientConfig.getUserAccessTokenPath} error`)
        if (error.response) {
            console.error("错误响应数据: ", error.response.msg)
        }
        console.log("----------[接入网页方免登处理 END]----------\n")
        complete()
    })
}

export function getOrigin(apiPort) {
    // console.log('process.env', process.env)
    let hostname = window.location.hostname
    return `http://${hostname}:${apiPort}`
}



