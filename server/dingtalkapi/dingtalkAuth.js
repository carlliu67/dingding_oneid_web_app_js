import CryptoJS from 'crypto-js';
import axios from 'axios';

import { logger } from '../util/logger.js';
import serverConfig from '../server_config.js'; // 根据实际路径调整
import { configAccessControl, okResponse, failResponse, setCookie } from '../server_util.js';

const DD_JSTICKET_KEY = 'dd_jsticket'
const USER_INFO_KEY = 'user_info'

// 判断是否已登录
function isLogin(ctx) {
    const userInfo = ctx.session.userInfo
    const lkUserInfo = ctx.cookies.get(USER_INFO_KEY) || ''
    logger.info(`userInfo: ${JSON.stringify(userInfo)}`)
    logger.info(`lkUserInfo: ${JSON.stringify(lkUserInfo)}`)
    if (userInfo && lkUserInfo && userInfo.userid == lkUserInfo) {
        return true
    }
    return false
}

// 获取userid
function getUserid(ctx) {
    const lkUserInfo = ctx.cookies.get(USER_INFO_KEY) || ''
    return lkUserInfo
}

//处理免登请求，返回用户的user_access_token
async function getUserAccessToken(ctx) {

    logger.info("\n-------------------[接入服务端免登处理 BEGIN]-----------------------------")
    configAccessControl(ctx)
    logger.info(`接入服务方第① 步: 接收到前端免登请求`)
    if (isLogin(ctx)) {
        logger.info("接入服务方第② 步: 从Session中获取user_access_token信息，用户已登录")
        const userInfo = ctx.session.userInfo
        ctx.body = okResponse(userInfo)
        logger.info("-------------------[接入服务端免登处理 END]-----------------------------\n")
        return
    }

    let code = ctx.query["code"] || ""
    logger.info("接入服务方第② 步: 获取登录预授权码code")
    if (code.length == 0) { //code不存在
        ctx.body = failResponse("登录预授权码code is empty, please retry!!!")
        return
    }

    //【请求】app_access_token：https://api.dingtalk.com/v1.0/oauth2/{corpId}/token
    logger.info("接入服务方第③ 步: 根据AppID和App Secret请求应用授权凭证app_access_token")
    var corpId = serverConfig.dingtalkCorpId
    const internalRes = await axios.post('https://api.dingtalk.com/v1.0/oauth2/' + corpId + '/token', {
        "client_id": serverConfig.dingtalkClientId,
        "client_secret": serverConfig.dingtalkClientSecret,
        "grant_type": "client_credentials"
    }, { headers: { "Content-Type": "application/json" } })

    //logger.info("internalRes: ", internalRes)

    if (!internalRes.data.access_token) {
        ctx.body = failResponse("app access_token request error")
        return
    }

    logger.info("接入服务方第④ 步: 获得颁发的应用授权凭证app_access_token")
    const app_access_token = internalRes.data.access_token || ""

    logger.info("接入服务方第⑤ 步: 根据登录预授权码code和app_access_token请求用户信息")
    //【请求】user_access_token: POST https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=ACCESS_TOKEN
    const authenv1Res = await axios.post('https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=' + app_access_token, { 
         "code": code }, {
        headers: {
            "Content-Type": "application/json; charset=utf-8"
        }
    })

    if (authenv1Res.data.errcode != 0) {  //非0表示失败
        ctx.body = failResponse(`access_toke request error: ${authenv1Res.errmsg}`)
        return
    }

    logger.info("接入服务方第⑥ 步: 获取用户信息, 更新到Session，返回给前端")
    const resultUserInfo = authenv1Res.data.result
    if (resultUserInfo) {
        logger.info("userInfo: ", resultUserInfo)
        ctx.session.userInfo = resultUserInfo
        setCookie(ctx, USER_INFO_KEY, resultUserInfo.userid || '')
        ctx.body = okResponse(resultUserInfo)
    } else {
        setCookie(ctx, USER_INFO_KEY, '')
    }
    logger.info("-------------------[接入服务端免登处理 END]-----------------------------\n")
}

//处理鉴权参数请求，返回鉴权参数
async function getSignParameters(ctx) {

    logger.info("\n-------------------[接入方服务端鉴权处理 BEGIN]-----------------------------")
    //logger.info(ctx)
    configAccessControl(ctx)
    logger.info(`接入服务方第① 步: 接收到前端鉴权请求`)

    const url = ctx.query["url"] || ""
    const tickeString = ctx.cookies.get(DD_JSTICKET_KEY) || ""
    if (tickeString.length > 0) {
        logger.info(`接入服务方第② 步: Cookie中获取jsapi_ticket，计算JSAPI鉴权参数，返回`)
        const signParam = calculateSignParam(tickeString, url)
        ctx.body = okResponse(signParam)
        logger.info("-------------------[接入方服务端鉴权处理 END]-----------------------------\n")
        return
    }

    logger.info(`接入服务方第② 步: 未检测到jsapi_ticket，根据appKey和appSecret请求自建应用授权凭证access_token`)
    //【请求】tenant_access_token：https://api.dingtalk.com/v1.0/oauth2/accessToken
    const internalRes = await axios.post("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
        "appKey": serverConfig.dingtalkClientId,
        "appSecret": serverConfig.dingtalkClientSecret
    }, { headers: { "Content-Type": "application/json" } })
    //logger.info(`internalRes： `, internalRes)

    if (!internalRes.data) {
        ctx.body = failResponse('access_token request error')
        return
    }

    if (!internalRes.data.accessToken) {
        ctx.body = failResponse('access_token request error')
        return
    }

    logger.info(`接入服务方第③ 步: 获得颁发的自建应用授权凭证access_token`)
    const accessToken = internalRes.data.accessToken || ""

    logger.info(`接入服务方第④ 步: 请求JSAPI临时授权凭证`)
    //【请求】jsapi_ticket：https://api.dingtalk.com/v1.0/oauth2/jsapiTickets
    const ticketRes = await axios.post("https://api.dingtalk.com/v1.0/oauth2/jsapiTickets", {}, {
        headers: {
            "Content-Type": "application/json",
            'x-acs-dingtalk-access-token': accessToken,
        }
    })
    //logger.info(`ticketRes `, ticketRes)

    if (!ticketRes.data) {
        ctx.body = failResponse('get jssdk ticket request error')
        return
    }

    if (!ticketRes.data.jsapiTicket) {
        ctx.body = failResponse('get jssdk ticket request error')
        return
    }

    logger.info(`接入服务方第⑤ 步: 获得颁发的JSAPI临时授权凭证，更新到Cookie`)
    const newTicketString = ticketRes.data.jsapiTicket || ""
    if (newTicketString.length > 0) {
        setCookie(ctx, DD_JSTICKET_KEY, newTicketString)
    }

    logger.info(`接入服务方第⑥ 步: 计算出JSAPI鉴权参数，并返回给前端`)
    const signParam = calculateSignParam(newTicketString, url)
    ctx.body = okResponse(signParam)
    logger.info("-------------------[接入方服务端鉴权处理 END]-----------------------------\n")
}

//计算JSAPI鉴权参数
function calculateSignParam(jsticket, url) {
    try {
        const timestamp = (new Date()).getTime()
        const plain = `jsapi_ticket=${jsticket}&noncestr=${serverConfig.noncestr}&timestamp=${timestamp}&url=${decodeUrl(url)}`;
        const sha1 = crypto.createHash('sha256');
        sha1.update(plain, 'utf8');
        let signature = byteToHex(sha1.digest());
        const signParam = {
            "corpId": serverConfig.dingtalkCorpId,
            "agentId": serverConfig.dingtalkAgentId,
            "signature": signature,
            "noncestr": serverConfig.noncestr,
            "timestamp": timestamp,
        }
        return signParam
    } catch (error) {
        logger.error('Error in sign function:', error);
        throw error;
    }
}

// 字节数组转化成十六进制字符串
function byteToHex(buffer) {
    return buffer.toString('hex');
}

/**
 * 因为ios端上传递的url是encode过的，android是原始的url。开发者使用的也是原始url,
 * 所以需要把参数进行一般urlDecode
 *
 * @param {string} urlString
 * @returns {string} 解码后的URL
 */
function decodeUrl(urlString) {
    try {
        const parsedUrl = new URL(urlString);
        let urlBuffer = `${parsedUrl.protocol}:`;
        if (parsedUrl.host) {
            urlBuffer += `//${parsedUrl.host}`;
        }
        if (parsedUrl.pathname) {
            urlBuffer += parsedUrl.pathname;
        }
        if (parsedUrl.search) {
            urlBuffer += `?${decodeURIComponent(parsedUrl.search.substring(1))}`;
        }
        return urlBuffer;
    } catch (error) {
        logger.error('Error in decodeUrl function:', error);
        throw error;
    }
}


export {
    getUserAccessToken,
    getSignParameters,
    isLogin,
    getUserid
};