import axios from 'axios';
import clientConfig from '../../config/client_config.js';
import { getOrigin } from '../../utils/auth_access_util.js';
import { openSchema } from '../dingtalkapi/dingtalkApi.js'
import { frontendLogger } from '../../utils/logger.js';

// 处理生成scheme免登url请求，一次性scheme链接，用于跳转到会议客户端
async function handleGenerateJoinScheme(meetingCode, closePage = false) {
    frontendLogger.info("\n----------[GenerateJoinScheme BEGIN]----------")
    try {
        // 这里不校验meetingCode，为空时表示直接唤起客户端

        frontendLogger.info("请求参数 - meetingCode", { meetingCode });

        const response = await axios.get(`${getOrigin(clientConfig.apiPort)}${clientConfig.generateJoinSchemePath}?meetingCode=${encodeURIComponent(meetingCode)}`,
            { withCredentials: true } // 调用时设置请求带上cookie
        );

        if (!response || !response.data) {
            frontendLogger.error(`${clientConfig.generateJoinSchemePath} response is null`);
            return;
        }
        const data = response.data;

        // 检查响应数据结构和状态
        if (data.code !== 0) {
            frontendLogger.error(`GenerateJoinScheme 失败`, { error: data.msg || '未知错误' });
            alert(`生成会议链接失败: ${data.msg || '未知错误'}`);
            return;
        }

        frontendLogger.info("GenerateJoinScheme: 成功", { data: data.data });
        frontendLogger.info("\n----------[GenerateJoinScheme]----------")

        // 确保data.data存在且为字符串
        if (data.data && typeof data.data === 'string') {
            openSchema(data.data, closePage);
        } else {
            frontendLogger.error("Invalid scheme URL format", { data: data.data });
            alert("生成的会议链接格式无效");
        }
    } catch (error) {
        frontendLogger.error(`${clientConfig.generateJoinSchemePath} error`, { error });
        if (error.response) {
            // 处理服务器返回的错误
            frontendLogger.error("错误响应数据", { data: error.response.data });
            const errorMsg = error.response.data?.msg || error.response.data?.errorMessage || "服务器错误";
            const errorCode = error.response.data?.errorCode || "未知错误码";
            frontendLogger.error(`错误代码: ${errorCode}, 错误信息: ${errorMsg}`, { errorCode, errorMsg });
            alert(`请求失败: ${errorMsg} (错误代码: ${errorCode})`);
        } else if (error.request) {
            // 处理请求发送失败的情况
            frontendLogger.error("未收到响应", { request: error.request });
            alert("网络请求失败，请检查网络连接");
        } else {
            // 处理其他错误
            frontendLogger.error("请求设置错误", { message: error.message });
            alert(`请求错误: ${error.message}`);
        }
    } finally {
        frontendLogger.info("----------[GenerateJoinScheme END]----------\n")
    }
}

// 处理生成免登跳转链接jumpUrl，用于跳转到会议页面
async function handleGenerateJumpUrl(base64EncodedMeetingUrl, closePage = false) {
    frontendLogger.info("\n----------[GenerateJumpUrl BEGIN]----------")
    try {
        const response = await axios.get(`${getOrigin(clientConfig.apiPort)}${clientConfig.generateJumpUrlPath}?meetingUrl=${base64EncodedMeetingUrl}`,
            { withCredentials: true } // 调用时设置请求带上cookie
        );

        if (!response || !response.data) {
            frontendLogger.error(`${clientConfig.generateJumpUrlPath} response is null`);
            return;
        }
        const data = response.data;
        if (data) {
            frontendLogger.info("GenerateJumpUrl: 成功")
        } else {
            frontendLogger.error("GenerateJumpUrl: 数据为空")
        }
        frontendLogger.info("\n----------[GenerateJumpUrl]----------", { data: data.data })
        openSchema(data.data, closePage);
    } catch (error) {
        frontendLogger.error(`${clientConfig.generateJumpUrlPath} error`, { error })
        if (error.response) {
            frontendLogger.error("错误响应数据", { data: error.response.msg || error.response.data });
        }
    } finally {
        frontendLogger.info("----------[GenerateJumpUrl END]----------\n")
    }
}

// 处理生成免登入会链接joinUrl，非一次性链接，用于跳转会议客户端加入会议
async function handleGenerateJoinUrl(meetingUrl, closePage = false) {
    frontendLogger.info("\n----------[GenerateJoinUrl BEGIN]----------")
    try {
        const response = await axios.get(`${getOrigin(clientConfig.apiPort)}${clientConfig.generateJoinUrlPath}?meetingUrl=${meetingUrl}`,
            { withCredentials: true } // 调用时设置请求带上cookie
        );

        if (!response || !response.data) {
            frontendLogger.error(`${clientConfig.generateJoinUrlPath} response is null`);
            return null;
        }
        const data = response.data;
        if (data) {
            frontendLogger.info("GenerateJoinUrl: 成功")
        } else {
            frontendLogger.error("GenerateJoinUrl: 数据为空")
        }
        frontendLogger.info("\n----------[GenerateJoinUrl]----------", { data: data.data })
        openSchema(data.data, closePage);
        return;
    } catch (error) {
        frontendLogger.error(`${clientConfig.generateJoinUrlPath} error`, { error })
        if (error.response) {
            frontendLogger.error("错误响应数据", { data: error.response.msg || error.response.data });
        }
        return;
    } finally {
        frontendLogger.info("----------[GenerateJoinUrl END]----------\n")
    }
}

async function handleCreateMeeting(meetingParamsStr) {
    frontendLogger.info("\n----------[创建会议 BEGIN]----------")
    const formData = new URLSearchParams();
    formData.append('data', meetingParamsStr);

    try {
        const response = await axios.post(`${getOrigin(clientConfig.apiPort)}${clientConfig.createMeetingPath}`,
            formData.toString(), // 请求体
            { withCredentials: true } // 调用时设置请求带上cookie
        );

        if (!response || !response.data) {
            frontendLogger.error(`${clientConfig.createMeetingPath} response is null`);
            return null;
        }
        const data = response.data;
        if (data) {
            frontendLogger.info("创建会议: 成功", { data })
        } else {
            frontendLogger.error("创建会议: 数据为空")
        }
        return data;
    } catch (error) {
        frontendLogger.error(`${clientConfig.createMeetingPath} error`, { error })
        if (error.response) {
            frontendLogger.error("错误响应数据", { data: error.response.data });
            // 如果有new_error_code，将错误信息返回给调用方
            if (error.response.data && error.response.data.msg && error.response.data.msg.error_info) {
                return error.response.data.msg.error_info;
            }
        }
        return null;
    } finally {
        frontendLogger.info("----------[创建会议 END]----------\n")
    }
}

async function handleQueryUserEndedMeetingList() {
    frontendLogger.info("\n----------[查询用户已结束会议列表 BEGIN]----------")
    try {
        var response = await axios.get(`${getOrigin(clientConfig.apiPort)}${clientConfig.queryUserEndedMeetingListPath}?page_size=20&page=1`,
            { withCredentials: true } // 调用时设置请求带上cookie
        );

        if (!response || !response.data) {
            frontendLogger.error(`${clientConfig.queryUserEndedMeetingListPath} response is null`);
            return null;
        }

        const data = response.data;
        if (data) {
            frontendLogger.info("查询用户已结束会议列表: 成功")
        } else {
            frontendLogger.error("查询用户已结束会议列表: 数据为空")
        }
        frontendLogger.info("----------[查询用户已结束会议列表 END]----------\n")
        return data.data;
    } catch (error) {
        frontendLogger.error(`${clientConfig.queryUserEndedMeetingListPath} error`, { error })
        if (error.response) {
            frontendLogger.error("错误响应数据", { data: error.response.msg || error.response.data });
        }
        return null;
    }
}

async function handleQueryUserMeetingList() {
    frontendLogger.info("\n----------[查询用户会议列表 BEGIN]----------")
    try {
        const requestUrl = `${getOrigin(clientConfig.apiPort)}${clientConfig.queryUserMeetingListPath}?pos=0&cursory=0`;
        frontendLogger.info("会议列表请求URL", { url: requestUrl });
        frontendLogger.info("请求配置: withCredentials: true");
        
        var response = await axios.get(requestUrl,
            { withCredentials: true } // 调用时设置请求带上cookie
        );

        frontendLogger.info("会议列表响应状态码", { status: response.status });
        frontendLogger.info("会议列表响应头", { headers: response.headers });
        frontendLogger.info("会议列表响应数据", { data: response.data });

        if (!response || !response.data) {
            frontendLogger.error(`${clientConfig.queryUserMeetingListPath} response is null`);
            return null;
        }

        const data = response.data;
        if (data) {
            frontendLogger.info("查询用户会议列表: 成功")
        } else {
            frontendLogger.error("查询用户会议列表: 数据为空")
        }
        frontendLogger.info("----------[查询用户会议列表 END]----------\n")
        return data.data;
    } catch (error) {
        frontendLogger.error(`${clientConfig.queryUserMeetingListPath} error`, { error })
        if (error.response) {
            frontendLogger.error("错误响应状态码", { status: error.response.status });
            frontendLogger.error("错误响应头", { headers: error.response.headers });
            frontendLogger.error("错误响应数据", { data: error.response.msg || error.response.data });
        }
        return null;
    }
}


export { handleCreateMeeting, handleGenerateJoinScheme, handleGenerateJumpUrl, handleQueryUserEndedMeetingList, handleQueryUserMeetingList, handleGenerateJoinUrl }