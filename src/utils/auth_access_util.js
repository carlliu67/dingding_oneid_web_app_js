import axios from 'axios';
import clientConfig from '../config/client_config.js';
import Cookies from 'js-cookie';
import * as dd from 'dingtalk-jsapi'; // 此方式为整体加载，也可按需进行加载
import { frontendLogger } from './logger.js';

const USER_INFO_KEY = 'user_info'

/// ---------------- JSAPI鉴权 部分 -------------------------

export async function handleJSAPIAccess() {

    frontendLogger.info("接入方网页JSAPI鉴权处理开始");
    const url = encodeURIComponent(window.location.href.split("#")[0]);
    frontendLogger.info("接入方前端[JSAPI鉴权处理]第① 步: 请求JSAPI鉴权参数");
    // 向接入方服务端发起请求，获取鉴权参数
    var desUrl = `${getOrigin(clientConfig.apiPort)}${clientConfig.getSignParametersPath}?url=${url}`
    frontendLogger.info("desUrl: " + desUrl, { url: desUrl });
    frontendLogger.info("请求完整URL", { url: desUrl });
    frontendLogger.info("请求配置: withCredentials: true");
    try {
        const res = await axios.get(desUrl,
            { 
                withCredentials: true,
                timeout: 10000,  // 设置10秒超时
                headers: {
                    'Origin': window.location.origin
                }
            }
        )
        frontendLogger.info("JSAPI鉴权响应状态码", { status: res.status });
        frontendLogger.info("JSAPI鉴权响应头", { headers: res.headers });
        frontendLogger.info("JSAPI鉴权响应数据", { data: res.data });
        
        if (!res.data) {
            frontendLogger.error(`${clientConfig.getSignParametersPath} fail`);
            return null
        }

        // 检查响应格式
        if (res.data.code !== 0) {
            frontendLogger.error('服务器返回错误', { code: res.data.code, msg: res.data.msg });
            return null
        }

        const data = res.data.data
        frontendLogger.info("接入方前端[JSAPI鉴权处理]第② 步: 获得鉴权参数");
        if (!data) {
            frontendLogger.error('获取参数失败');
            return null
        }
        return data
        // configJSAPIAccess(data, complete)
    } catch (error) {
        frontendLogger.error("JSAPI鉴权请求失败");
        
        // 判断错误类型
        let errorType = "未知错误";
        if (error.code === 'ECONNABORTED') {
            errorType = "请求超时";
        } else if (error.message.includes('Network Error')) {
            errorType = "网络错误";
        } else if (error.response) {
            errorType = `服务器响应错误 (${error.response.status})`;
        } else if (error.request) {
            errorType = "请求已发送但无响应";
        }
        
        frontendLogger.error("错误类型", { type: errorType });
        frontendLogger.error("错误详情", { 
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code
        });
        if (error.response) {
            frontendLogger.error("错误响应状态码", { status: error.response.status });
            frontendLogger.error("错误响应头", { headers: error.response.headers });
            frontendLogger.error("错误响应数据", { data: error.response.msg || error.response.data });
        } else if (error.request) {
            frontendLogger.error("请求已发送但无响应", { request: error.request });
        } else {
            frontendLogger.error("请求配置错误", { config: error.config });
        }
        throw error; // 重新抛出错误以便调用方处理
    }
}

//config JSAPI鉴权
export function configJSAPIAccess(data) {
    return new Promise((resolve, reject) => {
        //配置要使用的jsapi列表
        let jsApiList = [
            "openLink",
            "complexChoose",
            "chooseStaffForPC"
        ]
        frontendLogger.info("接入方前端[JSAPI鉴权处理]第③ 步: 通过dd.config进行鉴权");
        
        // 添加鉴权成功回调
        dd.ready(function() {
            frontendLogger.info('JSAPI鉴权成功', { 
                agentId: data.agentId,
                corpId: data.corpId,
                timeStamp: data.timeStamp,
                nonceStr: data.nonceStr
            });
            frontendLogger.info('handleJSAPIAccess OK', { success: true });
            resolve(true); // 鉴权成功，resolve Promise
        });
        
        // 添加鉴权失败回调
        dd.error(function(error) {
            frontendLogger.error('JSAPI鉴权失败', { 
                error: error,
                errorMessage: error.errorMessage,
                errorCode: error.errorCode,
                agentId: data.agentId,
                corpId: data.corpId,
                timeStamp: data.timeStamp,
                nonceStr: data.nonceStr,
                signature: data.signature
            });
            
            // 尝试提供更多调试信息
            frontendLogger.error('调试信息', {
                url: window.location.href,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            });
            reject(error); // 鉴权失败，reject Promise
        });
        
        dd.config({
            agentId: data.agentId, // 必填，微应用ID
            corpId: data.corpId,//必填，企业ID
            timeStamp: data.timeStamp, // 必填，生成签名的时间戳
            nonceStr: data.nonceStr, // 必填，自定义固定字符串。修正参数名，与服务端保持一致
            signature: data.signature, // 必填，签名
            type: 0,   //选填。0表示微应用的jsapi,1表示服务窗的jsapi；不填默认为0。该参数从dingtalk.js的0.8.3版本开始支持
            jsApiList: jsApiList// 必填，需要使用的jsapi列表，注意：不要带dd。
        });
    });
}

/// ---------------- 应用免登 部分 -------------------------
//处理用户免登逻辑
export function handleUserAuth(complete) {

    frontendLogger.info("接入方网页免登处理开始");
    let lj_tokenString = Cookies.get(USER_INFO_KEY) || ""
    if (lj_tokenString.length > 0) {
        frontendLogger.info("接入方前端[免登处理]第① 步: 用户已登录，请求后端验证...");
        requestUserAccessToken("", complete)
    } else {
        frontendLogger.info("接入方前端[免登处理]第① 步: 依据App ID调用JSAPI dd.requestAuthCode 请求免登授权码");
        // console.log("corpId: " + clientConfig.corpId, "\nclientId: " + clientConfig.clientId)
        frontendLogger.info("href", { href: window.location.href }); // 示例输出：https://example.com/path?query=1#hash
        dd.ready(function () {
            var corpId = clientConfig.corpId;
            // var clientId = clientConfig.clientId;
            //console.log("dd.ready");
            //console.log("href: ", window.location.href); // 示例输出：https://example.com/path?query=1#hash
            // dd.ready参数为回调函数，在 环境准备就绪时触发，jsapi的调用需要保证在该回调函数触发后调用，否则无效。
            dd.runtime.permission.requestAuthCode({
                corpId: corpId,
                // clientId: clientId,
                onSuccess: function (info) {
                    const code = info.code
                    if (code.length <= 0) {
                        frontendLogger.error('auth code为空');
                        complete(null)
                    } else {
                        requestUserAccessToken(code, complete)
                    }
                },
                onFail: function (err) {
                    frontendLogger.error("dd.requestAuthCode", { error: err });
                    complete(null)
                }
            });
        });
    }
}

function requestUserAccessToken(code, complete) {

    // 获取user_access_token信息
    frontendLogger.info("接入方前端[免登处理]第② 步: 去接入方服务端获取user_access_token信息");
    var desUrl = `${getOrigin(clientConfig.apiPort)}${clientConfig.getUserAccessTokenPath}?code=${code}`
    frontendLogger.info("desUrl", { url: desUrl });
    frontendLogger.info("请求完整URL", { url: desUrl });
    frontendLogger.info("请求配置: withCredentials: true");
    axios.get(desUrl,
        { 
            withCredentials: true,   //调用时设置 请求带上cookie
            timeout: 10000,  // 设置10秒超时
            headers: {
                'Origin': window.location.origin
            }
        }
    ).then(function (response) {  // ignore_security_alert
        frontendLogger.info("收到响应，状态码", { status: response.status });
        frontendLogger.info("响应头", { headers: response.headers });
        frontendLogger.info("响应数据", { data: response.data });
        if (!response.data) {
            frontendLogger.error(`${clientConfig.getUserAccessTokenPath} response.data is null`);
            frontendLogger.error("接口调用返回信息", { response: response });
            complete()
            return
        }
        if (!response.data.data) {
            frontendLogger.error(`${clientConfig.getUserAccessTokenPath} response.data.data is null`);
            frontendLogger.error("接口调用返回信息", { response: response });
            complete()
            return
        }
        const data = response.data.data
        frontendLogger.info("data", { data: data });
        if (data) {
            frontendLogger.info("接入方前端[免登处理]第③ 步: 获取user_access_token信息");
            localStorage.setItem(USER_INFO_KEY, data)
            frontendLogger.info("接入方网页方免登处理结束");
            complete(data)
        } else {
            frontendLogger.error("接入方前端[免登处理]第③ 步: 未获取user_access_token信息");
            complete()
            frontendLogger.info("接入方网页方免登处理结束");
        }
    }).catch(function (error) {
        frontendLogger.error("获取用户访问令牌失败", { 
            path: clientConfig.getUserAccessTokenPath,
            message: error.message,
            code: error.code
        });
        
        // 判断错误类型
        let errorType = "未知错误";
        if (error.code === 'ECONNABORTED') {
            errorType = "请求超时";
        } else if (error.message.includes('Network Error')) {
            errorType = "网络错误";
        } else if (error.response) {
            errorType = `服务器响应错误 (${error.response.status})`;
        } else if (error.request) {
            errorType = "请求已发送但无响应";
        }
        
        frontendLogger.error("错误类型", { type: errorType });
        frontendLogger.error("错误详情", { 
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code
        });
        if (error.response) {
            frontendLogger.error("错误响应状态码", { status: error.response.status });
            frontendLogger.error("错误响应头", { headers: error.response.headers });
            frontendLogger.error("错误响应数据", { data: error.response.msg || error.response.data });
        } else if (error.request) {
            frontendLogger.error("请求已发送但无响应", { request: error.request });
        } else {
            frontendLogger.error("请求配置错误", { config: error.config });
        }
        frontendLogger.info("接入方网页方免登处理结束");
        complete(null)
    })
}

export function getOrigin(apiPort) {
    // 使用相对路径，确保请求发送到当前域名下的指定端口
    let hostname = window.location.hostname;
    frontendLogger.info(`构建API URL: ${clientConfig.serverProtocol}://${hostname}:${apiPort}`);
    return clientConfig.serverProtocol + `://${hostname}:${apiPort}`;
}

// 移动端检测函数
export function isMobileDevice() {
  const userAgent = navigator.userAgent || window.opera;
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
}