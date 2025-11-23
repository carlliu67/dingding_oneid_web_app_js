import axios from 'axios';
import crypto from 'crypto';

import { logger } from '../util/logger.js';
import serverConfig from '../config/server_config.js';
import { configAccessControl, okResponse, failResponse, setCookie } from '../server_util.js';
import { getAccessToken, getInterAccessToken } from './dingtalkUtil.js';

const DD_JSTICKET_KEY = 'dd_jsticket'
const USER_INFO_KEY = 'user_info'

// 判断是否已登录
function isLogin(ctx) {
    const userInfo = ctx.session.userInfo
    const lkUserInfo = ctx.cookies.get(USER_INFO_KEY) || ''
    if (userInfo && lkUserInfo && userInfo.userid == lkUserInfo) {
        logger.debug(`userInfo: ${JSON.stringify(userInfo)}`)
        logger.debug(`lkUserInfo: ${JSON.stringify(lkUserInfo)}`)
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

    logger.debug("\n-------------------[接入服务端免登处理 BEGIN]-----------------------------")
    configAccessControl(ctx)
    logger.debug(`接入服务方第① 步: 接收到前端免登请求`)
    if (isLogin(ctx)) {
        logger.debug("接入服务方第② 步: 从Session中获取user_access_token信息，用户已登录")
        const userInfo = ctx.session.userInfo
        ctx.body = okResponse(userInfo)
        logger.debug("-------------------[接入服务端免登处理 END]-----------------------------\n")
        return
    }

    let code = ctx.query["code"] || ""
    logger.debug("接入服务方第② 步: 获取登录预授权码code")
    if (code.length == 0) { //code不存在
        ctx.body = failResponse("登录预授权码code is empty, please retry!!!")
        return
    }

    logger.debug("接入服务方第③步: 获得颁发的应用授权凭证app_access_token")
    const app_access_token = await getAccessToken();
    if (!app_access_token) {
        ctx.body = failResponse(`app access_token request error: ${error.message}`)
        logger.error(`app_access_token request error: ${error.message}`)
        return
    }

    logger.debug("接入服务方第④ 步: 根据登录预授权码code和app_access_token请求用户信息, code: ", code);
    try {
        //【请求】user_access_token: POST https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=ACCESS_TOKEN
        const authenv1Res = await axios.post('https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=' + app_access_token, {
            "code": code
        }, {
            headers: {
                "Content-Type": "application/json; charset=utf-8"
            }
        })

        if (authenv1Res.data.errcode != 0) {  //非0表示失败
            ctx.body = failResponse(`access_toke request error: ${authenv1Res.errmsg}`)
            return
        }

        logger.debug("接入服务方第⑤ 步: 获取用户信息, 更新到Session，返回给前端")
        const resultUserInfo = authenv1Res.data.result
        if (resultUserInfo) {
            logger.debug("userInfo: ", resultUserInfo)
            ctx.session.userInfo = resultUserInfo
            setCookie(ctx, USER_INFO_KEY, resultUserInfo.userid || '')
            ctx.body = okResponse(resultUserInfo)
        } else {
            setCookie(ctx, USER_INFO_KEY, '')
        }
    } catch (error) {
        logger.error("获取用户信息失败", error.message, "stack:", error.stack);
    }

    logger.debug("-------------------[接入服务端免登处理 END]-----------------------------\n")
}

//处理鉴权参数请求，返回鉴权参数
async function getSignParameters(ctx) {

    logger.debug("\n-------------------[接入方服务端鉴权处理 BEGIN]-----------------------------")
    //logger.debug(ctx)
    configAccessControl(ctx)
    logger.debug(`接入服务方第① 步: 接收到前端鉴权请求`)

    const url = ctx.query["url"] || ""
    const tickeString = ctx.cookies.get(DD_JSTICKET_KEY) || ""
    if (tickeString.length > 0) {
        logger.debug(`接入服务方第② 步: Cookie中获取jsapi_ticket，计算JSAPI鉴权参数，返回`)
        const signParam = calculateSignParam(tickeString, url)
        ctx.body = okResponse(signParam)
        logger.debug("-------------------[接入方服务端鉴权处理 END]-----------------------------\n")
        return
    }

    logger.debug(`接入服务方第③ 步: 获得颁发的自建应用授权凭证access_token`)
    try {
        const accessToken = await getInterAccessToken();
        if (!accessToken) {
            ctx.body = failResponse(`app access_token request error`)
            logger.error(`access_token request error`)
            return
        }

        logger.debug(`接入服务方第③ 步: 请求JSAPI临时授权凭证`)
        //【请求】jsapi_ticket：https://api.dingtalk.com/v1.0/oauth2/jsapiTickets
        const ticketRes = await axios.post("https://api.dingtalk.com/v1.0/oauth2/jsapiTickets", {}, {
            headers: {
                "Content-Type": "application/json",
                'x-acs-dingtalk-access-token': accessToken,
            }
        })
        //logger.debug(`ticketRes `, ticketRes)

        if (!ticketRes.data) {
            ctx.body = failResponse('get jssdk ticket request error')
            return
        }

        if (!ticketRes.data.jsapiTicket) {
            ctx.body = failResponse('get jssdk ticket request error')
            return
        }

        logger.debug(`接入服务方第④ 步: 获得颁发的JSAPI临时授权凭证，更新到Cookie`)
        const newTicketString = ticketRes.data.jsapiTicket || ""
        if (newTicketString.length > 0) {
            setCookie(ctx, DD_JSTICKET_KEY, newTicketString)
        }

        logger.debug(`接入服务方第⑤ 步: 计算出JSAPI鉴权参数，并返回给前端`)
        const signParam = calculateSignParam(newTicketString, url)
        ctx.body = okResponse(signParam)
    } catch (error) {
        logger.error("获取jsapi_ticket失败", error.message, "stack:", error.stack);
        ctx.body = failResponse('get jssdk ticket request error')
    }
    logger.debug("-------------------[接入方服务端鉴权处理 END]-----------------------------\n")
}

//计算JSAPI鉴权参数
function calculateSignParam(jsticket, url) {
    // logger.debug("calculateSignParam, jsticket: ", jsticket, "url: ", url, "decode url: ", decodeUrl(url));
    try {
        const timeStamp = Math.floor(Date.now()).toString(); // 转换为字符串类型
        const plain = `jsapi_ticket=${jsticket}&noncestr=${serverConfig.wemeetAPPID}&timestamp=${timeStamp}&url=${decodeUrl(url)}`;
        // logger.debug("plain: ", plain);
        const sha1 = crypto.createHash('sha256');
        sha1.update(plain, 'utf8');
        let signature = byteToHex(sha1.digest());
        const signParam = {
            "corpId": serverConfig.dingtalkCorpId,
            "agentId": serverConfig.dingtalkAgentId,
            "signature": signature,
            "nonceStr": serverConfig.wemeetAPPID,
            "timeStamp": timeStamp,
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
        // let urlBuffer = `${parsedUrl.protocol}:`;
        let urlBuffer = `${parsedUrl.protocol}`;
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