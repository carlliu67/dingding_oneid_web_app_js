import crypto from 'crypto';
import axios from 'axios';
import { logger } from '../util/logger.js';
import { configAccessControl, okResponse, failResponse } from '../server_util.js';
import serverConfig from '../server_config.js';
import { isLogin, getUserid } from '../dingtalkapi/dingtalkAuth.js';

const USER_INFO_KEY = 'user_info';
const WEMEET_VERSION = 'wemeet-dingtalk-js/v1.0.2'

/**
 * 生成签名函数
 * @param {string} secretKey - API密钥
 * @param {string} httpMethod - HTTP方法(GET/POST等)
 * @param {Object} headerParams - 请求头参数
 * @param {string} uri - 请求URI
 * @param {Object|string} body - 请求体
 * @returns {string} 生成的签名
 */
function generateSignature(secretKey, httpMethod, headerParams, uri, body) {
    const sortedHeader = Object.keys(headerParams)
        .sort()
        .map(key => `${key}=${headerParams[key]}`)
        .join('&');

    const stringToSign = [
        httpMethod.toUpperCase(),
        sortedHeader,
        uri,
        typeof body === 'string' ? body : JSON.stringify(body || '')
    ].join('\n');

    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(stringToSign);
    const hexDigest = hmac.digest('hex');

    return Buffer.from(hexDigest, 'utf8').toString('base64');
}

/**
 * 创建基础请求配置
 * @param {string} method - HTTP方法
 * @param {string} uri - 请求URI
 * @param {Object} [body] - 请求体
 * @returns {Object} 请求配置
 */
function createRequestConfig(method, uri, body = '') {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.floor(Math.random() * 10000);

    const headerParams = {
        'X-TC-Key': serverConfig.wemeetRestAPISecretID,
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Nonce': nonce.toString(),
    };

    const signature = generateSignature(
        serverConfig.wemeetRestAPISecretKey,
        method,
        headerParams,
        uri,
        body
    );

    return {
        method: method.toLowerCase(),
        url: serverConfig.wemeetRestAPIServerUrl + uri,
        headers: {
            'Content-Type': 'application/json',
            'Wemeet-Version': WEMEET_VERSION,
            'X-TC-Key': serverConfig.wemeetRestAPISecretID,
            'X-TC-Timestamp': timestamp,
            'X-TC-Nonce': nonce,
            'X-TC-Signature': signature,
            'X-TC-Registered': '1',
            'AppId': serverConfig.wemeetAPPID,
            'SdkId': serverConfig.wemeetRestAPISDKID,
        },
        ...(body && { data: typeof body === 'string' ? body : JSON.stringify(body) })
    };
}

/**
 * 处理API请求错误
 * @param {Error} error - 错误对象
 * @param {string} apiName - API名称
 */
function handleApiError(error, apiName) {
    if (error.response) {
        logger.error(`${apiName} 服务器响应错误: `, error.response.status, error.response.data);
    } else if (error.request) {
        logger.error(`${apiName} 未收到服务器响应: `, error.request);
    } else {
        logger.error(`${apiName} 请求设置时出错: `, error.message);
    }
}

/**
 * 查询会议
 * @param {string} meetingId - 会议ID
 * @param {string} userid - 用户ID
 * @returns {Promise<Object>} 会议信息
 */
async function queryMeetingById(meetingId, userid) {
    const uri = `/v1/meetings/${meetingId}?userid=${userid}&instanceid=1`;
    
    try {
        const requestConfig = createRequestConfig('GET', uri);
        logger.info("查询会议请求配置: ", requestConfig);
        
        const response = await axios(requestConfig);
        logger.info("查询会议结果: ", response.data);
        return response.data;
    } catch (error) {
        handleApiError(error, '查询会议');
        throw error;
    }
}

/**
 * 查询会议录制列表
 * @param {Object} webhookMeetingInfo - 会议信息
 * @returns {Promise<Object>} 录制列表
 */
async function queryMeetingRecordList(webhookMeetingInfo) {
    const startTime = webhookMeetingInfo.start_time - 24 * 60 * 60;
    const timestamp = Math.floor(Date.now() / 1000);
    const uri = `/v1/records?meeting_id=${webhookMeetingInfo.meeting_id}&start_time=${startTime}&end_time=${timestamp}&operator_id=${webhookMeetingInfo.creator.userid}&operator_id_type=1`;

    try {
        const requestConfig = createRequestConfig('GET', uri);
        logger.info("查询会议录制列表请求配置: ", requestConfig);
        
        const response = await axios(requestConfig);
        logger.info("查询会议录制列表结果: ", response.data);
        return response.data;
    } catch (error) {
        handleApiError(error, '查询会议录制列表');
        throw error;
    }
}

/**
 * 查询会议录制地址
 * @param {string} meeting_record_id - 录制ID
 * @param {string} operator_id - 操作人ID
 * @param {string} operator_id_type - 操作人ID类型
 * @returns {Promise<Object>} 录制地址
 */
async function queryMeetingRecordAddress(meeting_record_id, userid) {
    const uri = `/v1/addresses?meeting_record_id=${meeting_record_id}&userid=${userid}`;

    try {
        const requestConfig = createRequestConfig('GET', uri);
        logger.info("查询会议录制地址请求配置: ", requestConfig);
        
        const response = await axios(requestConfig);
        logger.info("查询会议录制地址结果: ", response.data);
        return response.data;
    } catch (error) {
        handleApiError(error, '查询会议录制地址');
        throw error;
    }
}

/**
 * 获取参会成员明细
 * @param {string} meetingId - 会议ID
 * @param {string} userid - 用户ID
 * @returns {Promise<Object>} 参会成员信息
 */
async function queryMeetingParticipants(meeting_id, userid) {
    const uri = `/v1/meetings/${meeting_id}/participants?userid=${userid}&size=100`;

    try {
        const requestConfig = createRequestConfig('GET', uri);
        logger.info("获取参会成员明细请求配置: ", requestConfig);
        
        const response = await axios(requestConfig);
        logger.info("获取参会成员明细结果: ", response.data);
        return response.data;
    } catch (error) {
        handleApiError(error, '获取参会成员明细');
        throw error;
    }
}

/**
 * 处理创建会议请求
 * @param {Object} ctx - Koa上下文
 */
async function handleCreateMeeting(ctx) {
    logger.info("\n-------------------[创建会议 BEGIN]-----------------------------");
    configAccessControl(ctx);
    
    if (isLogin(ctx) === false) {
        ctx.body = failResponse("用户未登录，请先登录");
        logger.info("-------------------[创建会议 用户未登录 END]-----------------------------\n");
        return;
    }

    try {
        const uri = "/v1/meetings";
        const meetingParams = JSON.parse(ctx.request.body.data);
        meetingParams.userid = getUserid(ctx);
        
        logger.info("发起创建会议请求，参数: ", meetingParams);
        
        const requestConfig = createRequestConfig('POST', uri, meetingParams);
        logger.info("创建会议请求配置: ", requestConfig);
        
        const response = await axios(requestConfig);
        ctx.body = okResponse(response.data);
    } catch (error) {
        if (error instanceof SyntaxError) {
            logger.error("解析请求body数据时出错: ", error);
            ctx.body = failResponse("请求数据格式错误");
        } else {
            logger.error("请求会议接口时出错: ", error);
            ctx.status = error.response?.status || 500;
            ctx.body = failResponse(error.response?.data || { message: '内部服务器错误' });
        }
    }
    
    logger.info("-------------------[创建会议 END]-----------------------------\n");
}

/**
 * 处理查询用户已结束会议列表请求
 * @param {Object} ctx - Koa上下文
 */
async function handleQueryUserEndedMeetingList(ctx) {
    logger.info("\n-------------------[查询用户已结束会议列表 BEGIN]-----------------------------");
    configAccessControl(ctx);
    
    if (isLogin(ctx) === false) {
        ctx.body = failResponse("用户未登录，请先登录");
        logger.info("-------------------[查询用户已结束会议列表 用户未登录 END]-----------------------------\n");
        return;
    }

    let page_size = ctx.query["page_size"] || "";
    if (page_size.length === 0) {
        ctx.body = failResponse("page_size is empty, please retry!!!");
        return;
    }

    let page = ctx.query["page"] || "";
    if (page.length === 0) {
        ctx.body = failResponse("page is empty, please retry!!!");
        return;
    }

    const uri = `/v1/history/meetings/${getUserid(ctx)}?page_size=${page_size}&page=${page}`;

    try {
        const requestConfig = createRequestConfig('GET', uri);
        logger.info("查询用户已结束会议列表请求配置: ", requestConfig);
        
        const response = await axios(requestConfig);
        logger.info("查询用户已结束会议列表结果: ", response.data);
        logger.info("-------------------[查询用户已结束会议列表 END]-----------------------------\n");
        ctx.body = okResponse(response.data);
        return;
    } catch (error) {
        handleApiError(error, '查询用户已结束会议列表');
        throw error;
    }
}

/**
 * 处理查询用户会议列表请求
 * @param {Object} ctx - Koa上下文
 */
async function handleQueryUserMeetingList(ctx) {
    logger.info("\n-------------------[查询用户会议列表 BEGIN]-----------------------------");
    configAccessControl(ctx);
    
    if (isLogin(ctx) === false) {
        ctx.body = failResponse("用户未登录，请先登录");
        logger.info("-------------------[查询用户会议列表 用户未登录 END]-----------------------------\n");
        return;
    }

    let pos = ctx.query["pos"] || "";
    if (pos.length === 0) {
        ctx.body = failResponse("pos is empty, please retry!!!");
        return;
    }

    let cursory = ctx.query["cursory"] || "";
    if (cursory.length === 0) {
        ctx.body = failResponse("cursory is empty, please retry!!!");
        return;
    }

    const uri = `/v1/meetings?userid=${getUserid(ctx)}&instanceid=1`;

    try {
        const requestConfig = createRequestConfig('GET', uri);
        logger.info("查询用户会议列表请求配置: ", requestConfig);
        
        const response = await axios(requestConfig);
        logger.info("查询用户会议列表结果: ", response.data);
        logger.info("-------------------[查询用户会议列表 END]-----------------------------\n");
        ctx.body = okResponse(response.data);
        return;
    } catch (error) {
        handleApiError(error, '查询用户会议列表');
        throw error;
    }
}

export {
    handleCreateMeeting,
    handleQueryUserEndedMeetingList,
    handleQueryUserMeetingList,
    queryMeetingById,
    queryMeetingRecordList,
    queryMeetingRecordAddress,
    queryMeetingParticipants
};
