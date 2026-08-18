import axios from 'axios';
import crypto from 'crypto';

import { logger } from '../util/logger.js';
import serverConfig from '../config/server_config.js';
import { configAccessControl, okResponse, failResponse, setCookie } from '../server_util.js';
import { getAccessToken, getInterAccessToken, searchUserByKeyword, getUserDetailByUserid, queryUserIdByUnionId } from './dingtalkUtil.js';
import { getUserAuthFromRedis, setUserAuthToRedis } from '../db/redis.js';
import dbAdapter from '../db/db_adapter.js';

const DD_JSTICKET_KEY = 'dd_jsticket'
const USER_INFO_KEY = 'user_info'

// 判断是否已登录
async function isLogin(ctx) {
    const userInfo = ctx.session.userInfo
    const lkUserInfo = ctx.cookies.get(USER_INFO_KEY) || ''
    
    // 本地Session中存在用户信息
    if (userInfo && lkUserInfo && userInfo.userid == lkUserInfo) {
        logger.debug(`本地Session中找到用户信息: ${JSON.stringify(userInfo)}`)
        return true
    }
    
    // 本地Session中没有用户信息，尝试从Redis获取
    if (lkUserInfo) {
        logger.debug(`本地Session中未找到用户信息，尝试从Redis获取用户信息: ${lkUserInfo}`)
        const redisUserInfo = await getUserAuthFromRedis(lkUserInfo);
        if (redisUserInfo) {
            // 将Redis中的用户信息恢复到本地Session
            ctx.session.userInfo = redisUserInfo;
            logger.debug(`从Redis恢复用户信息到Session: ${JSON.stringify(redisUserInfo)}`)
            return true
        }
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
    if (await isLogin(ctx)) {
        logger.debug("接入服务方第② 步: 从Session中获取user_access_token信息，用户已登录")
        const userInfo = ctx.session.userInfo
        // 更新用户最后登录时间（用于定期清理判断）
        if (userInfo && userInfo.userid) {
            dbAdapter.dbUpdateUserLoginTime(userInfo.userid).catch(err => {
                logger.debug('更新用户登录时间失败（用户可能尚未在users表中）:', err.message);
            });
        }
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
        ctx.body = failResponse('app access_token request error')
        logger.error('app_access_token request error')
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
            ctx.body = failResponse(`access_token request error: ${authenv1Res.data.errmsg}`)
            return
        }

        logger.debug("接入服务方第⑤ 步: 获取用户信息, 更新到Session和Redis，返回给前端")
        const resultUserInfo = authenv1Res.data.result
        if (resultUserInfo) {
            logger.debug("userInfo: ", resultUserInfo)
            ctx.session.userInfo = resultUserInfo
            setCookie(ctx, USER_INFO_KEY, resultUserInfo.userid || '')
            
            // 将用户信息存储到Redis
            await setUserAuthToRedis(resultUserInfo.userid, resultUserInfo);

            // 更新用户最后登录时间（用于定期清理判断）
            if (resultUserInfo.userid) {
                dbAdapter.dbUpdateUserLoginTime(resultUserInfo.userid).catch(err => {
                    logger.debug('更新用户登录时间失败（用户可能尚未在users表中）:', err.message);
                });
            }
            
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
    try {
        const timeStamp = Math.floor(Date.now()).toString(); // 转换为字符串类型
        logger.debug(`计算签名使用的URL: ${url}`);
        
        const plain = `jsapi_ticket=${jsticket}&noncestr=${serverConfig.wemeetAPPID}&timestamp=${timeStamp}&url=${decodeUrl(url)}`;
        logger.debug(`签名原文: ${plain}`);
        
        const sha1 = crypto.createHash('sha1');
        sha1.update(plain, 'utf8');
        let signature = byteToHex(sha1.digest());
        
        const signParam = {
            "corpId": serverConfig.dingtalkCorpId,
            "agentId": serverConfig.dingtalkAgentId,
            "signature": signature,
            "nonceStr": serverConfig.wemeetAPPID,
            "timeStamp": timeStamp,
        }
        
        logger.debug(`生成的签名参数: ${JSON.stringify(signParam)}`);
        return signParam;
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


// 处理搜索用户请求
// 前端传入搜索关键词(query)，后端调用钉钉通讯录搜索接口获取匹配的用户userId列表
// 再批量查询每个用户的详情(姓名等)，返回给前端展示
async function handleSearchUser(ctx) {
    logger.debug("\n-------------------[搜索用户 BEGIN]-----------------------------");
    configAccessControl(ctx);

    if (!(await isLogin(ctx))) {
        ctx.body = failResponse("用户未登录，请先登录");
        logger.debug("-------------------[搜索用户 用户未登录 END]-----------------------------\n");
        return;
    }

    const query = ctx.query["query"] || "";
    if (!query || query.trim().length === 0) {
        ctx.body = failResponse("搜索关键词不能为空");
        return;
    }

    const size = parseInt(ctx.query["size"]) || 20;
    const offset = parseInt(ctx.query["offset"]) || 0;

    try {
        logger.info(`搜索用户: query="${query}", offset=${offset}, size=${size}`);

        // 第一步：调用钉钉通讯录搜索接口获取userId列表
        const searchResult = await searchUserByKeyword(query.trim(), offset, size);
        if (!searchResult || !searchResult.list || searchResult.list.length === 0) {
            logger.debug("搜索用户结果为空");
            ctx.body = okResponse({ hasMore: false, totalCount: 0, users: [] });
            return;
        }

        logger.debug(`搜索到 ${searchResult.list.length} 个用户userId，开始批量获取用户详情`);

        // 第二步：批量查询每个userId的用户详情（姓名等）
        const userDetails = await Promise.all(
            searchResult.list.map(userid => getUserDetailByUserid(userid))
        );

        // 过滤掉查询失败的结果，组装返回数据
        const users = userDetails
            .filter(detail => detail !== null)
            .map(detail => ({
                userid: detail.userid,
                name: detail.name || detail.userid,
                avatar: detail.avatar || "",             // 头像URL
                jobnumber: detail.job_number || "",      // 工号（钉钉API返回字段名为job_number）
            }));

        logger.info(`搜索用户完成: 匹配${searchResult.list.length}个，成功获取详情${users.length}个`);

        ctx.body = okResponse({
            hasMore: searchResult.hasMore || false,
            totalCount: searchResult.totalCount || users.length,
            users,
        });
    } catch (error) {
        logger.error("搜索用户处理失败:", error.message, "stack:", error.stack);
        ctx.body = failResponse("搜索用户失败");
    }

    logger.debug("-------------------[搜索用户 END]-----------------------------\n");
}

// OAuth2网页授权流程：通过URL code换取用户完整信息
// 适用场景：从钉钉管理后台跳转时，URL携带的code是OAuth2授权码（非免登auth code）
// 流程：code → userAccessToken → unionId → userid → 用户详情
async function getUserInfoByOAuth2Code(code) {
    try {
        // 第一步：用code换取userAccessToken
        const tokenRes = await axios.post('https://api.dingtalk.com/v1.0/oauth2/userAccessToken', {
            clientId: serverConfig.dingtalkClientId,
            clientSecret: serverConfig.dingtalkClientSecret,
            code: code,
            grantType: 'authorization_code'
        }, {
            headers: { "Content-Type": "application/json" }
        });

        if (!tokenRes.data || !tokenRes.data.accessToken) {
            logger.error("OAuth2换取userAccessToken失败:", tokenRes.data);
            return null;
        }

        const userAccessToken = tokenRes.data.accessToken;
        logger.debug("OAuth2 userAccessToken获取成功");

        // 第二步：用userAccessToken获取用户信息（unionId等）
        const meRes = await axios.get('https://api.dingtalk.com/v1.0/contact/users/me', {
            headers: { "x-acs-dingtalk-access-token": userAccessToken }
        });

        if (!meRes.data || !meRes.data.unionId) {
            logger.error("OAuth2获取用户信息失败:", meRes.data);
            return null;
        }

        const unionId = meRes.data.unionId;
        logger.debug("OAuth2获取到unionId:", unionId);

        // 第三步：用unionId换取userid
        const userid = await queryUserIdByUnionId(unionId);
        if (!userid) {
            logger.error("根据unionId获取userid失败");
            return null;
        }

        logger.debug("OAuth2获取到userid:", userid);

        // 第四步：用userid查询用户完整详情（包含admin字段）
        const userDetail = await getUserDetailByUserid(userid);
        if (!userDetail) {
            logger.error("查询用户详情失败");
            return null;
        }

        logger.info("OAuth2流程获取用户信息成功:", userDetail.name);
        return userDetail;
    } catch (error) {
        logger.error("OAuth2流程获取用户信息失败:", error.message, "stack:", error.stack);
        if (error.response) {
            logger.error("响应数据:", error.response.data);
        }
        return null;
    }
}

export {
    getUserAccessToken,
    getSignParameters,
    isLogin,
    getUserid,
    handleSearchUser
};