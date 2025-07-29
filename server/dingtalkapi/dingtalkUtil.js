import axios from 'axios';
import serverConfig from '../server_config.js';
import { logger } from '../util/logger.js';
import { dbInsertUserinfo, dbGetUserinfoByUserid } from '../db/sqlite.js';

// 定义一个函数用于将秒级时间戳转换为 ISO - 8601 格式
function convertSecondsToISO(seconds) {
    // 将秒级时间戳转换为毫秒级时间戳
    const milliseconds = seconds * 1000;
    // 创建 Date 对象
    const date = new Date(milliseconds);
    // 使用 toISOString 方法获取 ISO - 8601 格式的字符串
    return date.toISOString();
}

function formatTimeRange(startTimestamp, endTimestamp) {
    // 将秒级时间戳转为毫秒（Date 对象需要毫秒）
    const startDate = new Date(startTimestamp * 1000);
    const endDate = new Date(endTimestamp * 1000);

    // 辅助函数：补零确保两位数显示
    const padZero = num => num.toString().padStart(2, '0');

    // 格式化日期部分 (XXXX年XX月XX日)
    const formatDate = date => {
        const year = date.getFullYear();
        const month = padZero(date.getMonth() + 1); // 月份从0开始需+1
        const day = padZero(date.getDate());
        return `${year}年${month}月${day}日`;
    };

    // 格式化时间部分 (XX:XX)
    const formatTime = date =>
        `${padZero(date.getHours())}:${padZero(date.getMinutes())}`;

    // 判断是否同一天
    const isSameDay =
        startDate.getFullYear() === endDate.getFullYear() &&
        startDate.getMonth() === endDate.getMonth() &&
        startDate.getDate() === endDate.getDate();

    // 组合结果
    if (isSameDay) {
        return `${formatDate(startDate)}${formatTime(startDate)} - ${formatTime(endDate)}`;
    } else {
        return `${formatDate(startDate)}${formatTime(startDate)} - ${formatDate(endDate)}${formatTime(endDate)}`;
    }
}

// 生成打开普通页面的Applink
function genUrlAppLink(url) {
    //return ` https://applink.feishu.cn/client/web_app/open?appId= ${ appId } &lk_target_url= ${ encodeURIComponent ( targetUrl ) } `
    //return 'https://applink.dingtalk.com/page/h5_app_open?target=panel&appId=' + appId + '&corpId=' + corpId + '&appType=2&path=' + encodeURIComponent(uri)
    return 'https://applink.dingtalk.com/page/link?target=fullScreen&targetDesktop=workbench&url=' + encodeURIComponent(url)
}

// 生成打开H5应用的Applink
function genH5AppLink(uri) {
    var appId = serverConfig.dingtalkAgentId
    var corpId = serverConfig.dingtalkCorpId
    //return `https://applink.feishu.cn/client/web_app/open?appId= ${ appId } &lk_target_url= ${ encodeURIComponent ( targetUrl ) } `
    return 'https://applink.dingtalk.com/page/h5_app_open?appId=' + appId + '&corpId=' + corpId + '&appType=2&path=' + encodeURIComponent(uri)
}

// 应用的access token有效期为2小时，需要定时刷新
let interAccessToken = null;
let interAccessTokenTime = 0;

// 获取 access_token
async function getInterAccessToken() {
    if (interAccessToken && interAccessTokenTime + 7000 > Math.floor(Date.now() / 1000)) {
        logger.info("access_token: ", interAccessToken)
        return interAccessToken
    }
    try {
        const internalRes = await axios.post('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
            "appKey": serverConfig.dingtalkClientId,
            "appSecret": serverConfig.dingtalkClientSecret,
        }, { headers: { "Content-Type": "application/json" } })

        if (!internalRes.data.accessToken) {
            logger.error("获取 access_token 失败")
            return
        }

        interAccessToken = internalRes.data.accessToken
        interAccessTokenTime = Math.floor(Date.now() / 1000)
        logger.info("access_token: ", interAccessToken)
        return interAccessToken
    } catch (error) {
        logger.error("获取 access_token 失败", error.message, "stack:", error.stack);
    }
}

// 应用的access token有效期为2小时，需要定时刷新
let accessToken = null;
let accessTokenTime = 0;
// 获取 access_token
async function getAccessToken() {
    if (accessToken && accessTokenTime + 7000 > Math.floor(Date.now() / 1000)) {
        logger.info("access_token get time: ", accessTokenTime);
        return accessToken;
    }
    try {
        const internalRes = await axios.post('https://api.dingtalk.com/v1.0/oauth2/' + serverConfig.dingtalkCorpId + '/token', {
            "client_id": serverConfig.dingtalkClientId,
            "client_secret": serverConfig.dingtalkClientSecret,
            "grant_type": "client_credentials"
        }, { headers: { "Content-Type": "application/json" } })
        if (!internalRes.data.access_token) {
            logger.error("获取 access_token 失败");
            return null;
        }

        accessToken = internalRes.data.access_token;
        accessTokenTime = Math.floor(Date.now() / 1000);
        logger.info("access_token get time: ", accessTokenTime, "expires_in: ", internalRes.data.expires_in);
        return accessToken;
    } catch (error) {
        logger.error("获取 access_token 失败", error.message, "stack:", error.stack);
        return null;
    }
}

// userid转换为unionid
async function getUnionIdByUserid(userid) {
    var data = await dbGetUserinfoByUserid(userid);
    if (data) {
        return data.unionid;
    }

    var access_token = await getInterAccessToken();
    if (!access_token) {
        return null;
    }

    try {
        const internalRes = await axios.post('https://oapi.dingtalk.com/topapi/v2/user/get?access_token=' + access_token,
            {
                "userid": userid
            }, { headers: { "Content-Type": "application/json" } })

        if (!internalRes.data || internalRes.data.errcode != 0) {
            logger.warn("queryUserDetail失败，errcode", internalRes.data.errcode, "errmsg", internalRes.data.errmsg)
            return null;
        }
        logger.info("queryUserDetail result: ", internalRes.data);
        dbInsertUserinfo(userid, internalRes.data.result.unionid, internalRes.data.result.name);
        return internalRes.data.result.unionid;
    } catch (error) {
        logger.error("userid转换为unionid时发生异常:", error.message, "stack:", error.stack);
        return null;
    }
}

// 根据unionid获取用户userid
async function queryUserIdByUnionId(unionid) {
    var access_token = await getInterAccessToken();
    if (!access_token) {
        return null;
    }

    try {
        const internalRes = await axios.post('https://oapi.dingtalk.com/topapi/user/getbyunionid?access_token=' + access_token,
            {
                "unionid": unionid
            }, { headers: { "Content-Type": "application/json" } })

        //logger.info("internalRes: ", internalRes)

        if (!internalRes.data) {
            logger.error("根据unionid获取用户userid失败")
            return null;
        }
        logger.info("queryUserIdByUnionId result: ", internalRes.data);
        return internalRes.data.result.userid;
    } catch (error) {
        logger.error("根据unionid获取用户userid失败", error.message, "stack:", error.stack);
        return null;
    }

}

export {
    convertSecondsToISO,
    formatTimeRange,
    genUrlAppLink,
    genH5AppLink,
    getInterAccessToken,
    getAccessToken,
    getUnionIdByUserid
};