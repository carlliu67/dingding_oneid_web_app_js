import { v4 as uuidv4 } from 'uuid';
import { CookieJar } from 'tough-cookie';
import { logger } from '../util/logger.js';
import serverConfig from '../server_config.js';
import { configAccessControl, okResponse, failResponse } from '../server_util.js';
import { dbGetIdToken, dbDeleteIdToken, dbInsertIdToken } from '../db/sqlite.js';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { isLogin, getUserid } from '../dingtalkapi/dingtalkAuth.js';

const USER_INFO_KEY = 'user_info'

// 生成IDToken
async function generateIDToken(userid) {
    var idToken
    var currentTime = Math.floor(Date.now() / 1000);
    var data = await dbGetIdToken(userid);
    if (data) {
        if (data.expired > currentTime + 30) {
            idToken = data.idToken;
            logger.info("idToken: ", idToken);
            return idToken;
        } else {
            dbDeleteIdToken(userid);
        }
    }
    var expired = currentTime + 300 // 过期时间为300秒;
    // 拼接 key 目录下的 rsa_private_key.pem 文件的完整路径
    const privateKeyPath = path.join(process.cwd(), 'server', 'key', 'rsa_private_key.pem');
    // 读取私钥文件
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    // 定义 JWT 负载
    const payload = {
        sub: userid,
        iss: 'meeting',
        // testAppInstanceId: 'testAppInstanceId',
        // tnt: 'tn-d2938ed3ba854db0a80c658a53d8d6b4',
        iat: Math.floor(Date.now() / 1000), // 生成时间
        exp: expired
    };
    // 定义 JWT 头部
    const header = {
        // kid: 'meeting###',
        typ: 'JWT',
        alg: 'RS256'
    };
    // 生成 JWT 串
    idToken = jwt.sign(payload, privateKey, { algorithm: 'RS256', header: header });
    dbInsertIdToken(userid, idToken, expired);
    logger.info("idToken: ", idToken);
    return idToken;
}

// 提取公共部分
async function generateUrl(urlString, userid, action) {
    const idToken = await generateIDToken(userid);
    // logger.info(`idToken: ${idToken}`);
    logger.info(`urlString: ${urlString}`);

    // 免登前缀（固定字符串）
    const SdkUrl = serverConfig.wemeetSSOURL;

    // 构造JSON字符串（使用模板字符串简化拼接）
    const meetingSource = JSON.stringify({
        action: action,
        params: {
            meeting_url: urlString,
            mode: "1"
        }
    });

    // Base64编码（JS内置方法）
    const meetingBase64 = Buffer.from(meetingSource).toString('base64');

    // 拼接免登链接（模板字符串优化可读性）
    const joinUrl = `${SdkUrl}?action=${meetingBase64}&id_token=${idToken}`;
    logger.info(`免登入会链接 ${joinUrl}`);

    return joinUrl;
}

// 生成免登跳转链接jumpUrl
async function generateJumpUrl(base64EncodedMeetingUrl, userid) {
    const urlString = Buffer.from(base64EncodedMeetingUrl, 'base64').toString('utf-8');
    // return await generateUrl(urlString, userid, 'jump');
    const idToken = await generateIDToken(userid);
    // logger.info(`idToken: ${idToken}`);
    logger.info(`urlString: ${urlString}`);

    // 免登前缀（固定字符串）
    const SdkUrl = serverConfig.wemeetSSOURL;

    // 构造JSON字符串（使用模板字符串简化拼接）
    const meetingSource = JSON.stringify({
        action: 'jump',
        params: {
            redirect_url: urlString,
            mode: "1"
        }
    });

    // Base64编码（JS内置方法）
    // const meetingBase64 = Buffer.from(meetingSource).toString('base64');

    // URL encode
    const encoded = encodeURIComponent(meetingSource); 

    // 拼接免登链接（模板字符串优化可读性）
    const joinUrl = `${SdkUrl}?id_token=${idToken}&action=${encoded}`;
    logger.info(`免登入会链接 ${joinUrl}`);

    return joinUrl;
}

// 生成免登跳转链接joinUrl
async function generateJoinUrl(urlString, userid) {
    //return await generateUrl(urlString, userid, 'join');
    const idToken = await generateIDToken(userid);
    // logger.info(`idToken: ${idToken}`);
    logger.info(`urlString: ${urlString}`);

    // 免登前缀（固定字符串）
    const SdkUrl = serverConfig.wemeetSSOURL;

    // 构造JSON字符串（使用模板字符串简化拼接）
    const meetingSource = JSON.stringify({
        action: 'join',
        params: {
            meeting_url: urlString,
            mode: "1"
        }
    });

    // Base64编码（JS内置方法）
    // const meetingBase64 = Buffer.from(meetingSource).toString('base64');

    // URL encode
    const encoded = encodeURIComponent(meetingSource); 

    // 拼接免登链接（模板字符串优化可读性）
    const joinUrl = `${SdkUrl}?id_token=${idToken}&action=${encoded}`;
    logger.info(`免登入会链接 ${joinUrl}`);

    return joinUrl;
}

//处理生成scheme免登url请求
async function handleGenerateJoinScheme(ctx) {
    logger.info("\n-------------------[获取scheme免登url BEGIN]-----------------------------");
    configAccessControl(ctx);

    if (isLogin(ctx) === false) {
        ctx.body = failResponse("用户未登录，请先登录");
        logger.info("-------------------[获取scheme免登url 用户未登录 END]-----------------------------\n");
        return;
    }

    let meetingCode = ctx.query["meetingCode"] || "";

    const cookieJar = new CookieJar();
    const userid = getUserid(ctx);
    var initialUrl = await generateJoinUrl("https://meeting.tencent.com", userid);
    let userCode = "";
    let schemeUrl = "";

    while (true) {
        let response = await fetch(initialUrl, {
            redirect: 'manual',
            headers: { 'Cookie': await cookieJar.getCookieString(initialUrl) }
        });

        var redirectUrl = response.headers.get('location');
        logger.info("redirectUrl: " + redirectUrl);
        // 如果redirectUrl为null，说明没有更多重定向，退出循环
        if (!redirectUrl) {
            logger.warn("No redirect URL found, exiting loop");
            break;
        }
        // 添加对redirectUrl为null的检查
        if (redirectUrl.includes('user_code')) {
            const urlParams = new URLSearchParams(redirectUrl.split('?')[1]);
            userCode = urlParams.get('user_code');
            logger.info("user_code: " + userCode);
            break;
        }
        
        // 更新 Cookie
        const setCookieHeaders = response.headers.getSetCookie();
        if (setCookieHeaders) {
            for (const cookieHeader of setCookieHeaders) {
                await cookieJar.setCookie(cookieHeader, initialUrl);
            }
        }
        
        // 处理重定向
        if ([302, 303].includes(response.status)) {
            redirectUrl = response.headers.get('location');
            logger.info(`Redirecting to: ${redirectUrl}`);
            initialUrl = redirectUrl;
            continue;
        } else {
            break;
        }
    }
    if (userCode) {
        const launchId = uuidv4().replace(/-/g, '').substring(0, 16);
        if (meetingCode.length === 0) {
            schemeUrl = `wemeet://auth/sso?sso_auth_code=${userCode}`;
        } else {
            schemeUrl = `wemeet://page/inmeeting?meeting_code=${meetingCode.replace(/-/g, '')}&token=&launch_id=${launchId}&user_code=${userCode}`;
        }
        
        ctx.body = okResponse(schemeUrl);
        logger.info("schemeUrl: " + schemeUrl);
        logger.info("-------------------[获取scheme免登url END]-----------------------------\n");
    } else {
        ctx.body = failResponse("generate scheme url fail");
        logger.error("-------------------[获取scheme免登url END]-----------------------------\n");
    }
}

//处理生成免登跳转链接请求
async function handleGenerateJumpUrl(ctx) {
    logger.info("\n-------------------[获取免登url BEGIN]-----------------------------");
    configAccessControl(ctx);

    if (isLogin(ctx) === false) {
        ctx.body = failResponse("用户未登录，请先登录");
        logger.info("-------------------[获取免登url 用户未登录 END]-----------------------------\n");
        return;
    }
    let originUrl = ctx.query["meetingUrl"] || "";
    if (originUrl.length === 0) {
        ctx.body = failResponse("originUrl is empty, please retry!!!");
        return;
    }

    const cookieJar = new CookieJar();
    const userid = getUserid(ctx);
    var initialUrl = await generateJumpUrl(originUrl, userid);
    let ssoAuthCode = "";
    let jumpUrl = "";

    while (true) {
        let response = await fetch(initialUrl, {
            redirect: 'manual',
            headers: { 'Cookie': await cookieJar.getCookieString(initialUrl) }
        });

        var redirectUrl = response.headers.get('location');
        logger.info("redirectUrl: " + redirectUrl);
        if (redirectUrl.includes('sso_auth_code')) {
            const urlParams = new URLSearchParams(redirectUrl.split('?')[1]);
            ssoAuthCode = urlParams.get('sso_auth_code');
            logger.info("sso_auth_code: " + ssoAuthCode);
            jumpUrl = redirectUrl;
            break;
        }

        // 更新 Cookie
        const setCookieHeaders = response.headers.getSetCookie();
        if (setCookieHeaders) {
            for (const cookieHeader of setCookieHeaders) {
                await cookieJar.setCookie(cookieHeader, initialUrl);
            }
        }

        // 处理重定向
        if ([302, 303].includes(response.status)) {
            redirectUrl = response.headers.get('location');
            logger.info(`Redirecting to: ${redirectUrl}`);
            initialUrl = redirectUrl;
            continue;
        } else {
            break;
        }
    }
    if (jumpUrl) {
        ctx.body = okResponse(jumpUrl);
        logger.info("jumpUrl: " + jumpUrl);
        logger.info("-------------------[获取免登url END]-----------------------------\n");
    } else {
        ctx.body = failResponse("generate jump url fail");
        logger.error("-------------------[获取免登url END]-----------------------------\n");
    }
}

//处理生成scheme免登url请求
async function handleGenerateJoinUrl(ctx) {
    logger.info("\n-------------------[获取免登入会url BEGIN]-----------------------------");
    configAccessControl(ctx);

    if (isLogin(ctx) === false) {
        ctx.body = failResponse("用户未登录，请先登录");
        logger.info("-------------------[获取免登入会url 用户未登录 END]-----------------------------\n");
        return;
    }
    let originUrl = ctx.query["meetingUrl"] || "";
    if (originUrl.length === 0) {
        ctx.body = failResponse("originUrl is empty, please retry!!!");
        return;
    }

    const userid = getUserid(ctx);
    const joinUrl = await generateJoinUrl(originUrl, userid);
    ctx.body = okResponse(joinUrl);
    logger.info("joinUrl: " + joinUrl);
    logger.info("-------------------[获取免登url END]-----------------------------\n");
    return;
}

export {
    handleGenerateJoinScheme,
    handleGenerateJumpUrl,
    handleGenerateJoinUrl,
};