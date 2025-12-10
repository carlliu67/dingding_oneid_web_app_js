import axios from 'axios';
import clientConfig from '../../config/client_config.js';
import { getOrigin } from '../../utils/auth_access_util.js';
import { openSchema } from '../dingtalkapi/dingtalkApi.js'

// 处理生成scheme免登url请求，一次性scheme链接，用于跳转到会议客户端
async function handleGenerateJoinScheme(meetingCode, closePage = false) {
    console.log("\n----------[GenerateJoinScheme BEGIN]----------")
    try {
        // 添加对meetingCode参数的验证
        if (!meetingCode || meetingCode.trim() === '') {
            console.error("会议码不能为空");
            alert("请输入有效的会议码");
            return;
        }

        console.log("请求参数 - meetingCode:", meetingCode);

        const response = await axios.get(`${getOrigin(clientConfig.apiPort)}${clientConfig.generateJoinSchemePath}?meetingCode=${encodeURIComponent(meetingCode)}`,
            { withCredentials: true } // 调用时设置请求带上cookie
        );

        if (!response || !response.data) {
            console.error(`${clientConfig.generateJoinSchemePath} response is null`);
            return;
        }
        const data = response.data;

        // 检查响应数据结构和状态
        if (data.code !== 0) {
            console.error(`GenerateJoinScheme 失败: ${data.msg || '未知错误'}`);
            alert(`生成会议链接失败: ${data.msg || '未知错误'}`);
            return;
        }

        console.log("GenerateJoinScheme: 成功", data.data);
        console.log("\n----------[GenerateJoinScheme]----------")

        // 确保data.data存在且为字符串
        if (data.data && typeof data.data === 'string') {
            openSchema(data.data, closePage);
        } else {
            console.error("Invalid scheme URL format", data.data);
            alert("生成的会议链接格式无效");
        }
    } catch (error) {
        console.error(`${clientConfig.generateJoinSchemePath} error`, error)
        if (error.response) {
            // 处理服务器返回的错误
            console.error("错误响应数据:", error.response.data);
            const errorMsg = error.response.data?.msg || error.response.data?.errorMessage || "服务器错误";
            const errorCode = error.response.data?.errorCode || "未知错误码";
            console.error(`错误代码: ${errorCode}, 错误信息: ${errorMsg}`);
            alert(`请求失败: ${errorMsg} (错误代码: ${errorCode})`);
        } else if (error.request) {
            // 处理请求发送失败的情况
            console.error("未收到响应:", error.request);
            alert("网络请求失败，请检查网络连接");
        } else {
            // 处理其他错误
            console.error("请求设置错误:", error.message);
            alert(`请求错误: ${error.message}`);
        }
    } finally {
        console.log("----------[GenerateJoinScheme END]----------\n")
    }
}

// 处理生成免登跳转链接jumpUrl，用于跳转到会议页面
async function handleGenerateJumpUrl(base64EncodedMeetingUrl, closePage = false) {
    console.log("\n----------[GenerateJumpUrl BEGIN]----------")
    try {
        const response = await axios.get(`${getOrigin(clientConfig.apiPort)}${clientConfig.generateJumpUrlPath}?meetingUrl=${base64EncodedMeetingUrl}`,
            { withCredentials: true } // 调用时设置请求带上cookie
        );

        if (!response || !response.data) {
            console.error(`${clientConfig.generateJumpUrlPath} response is null`);
            return;
        }
        const data = response.data;
        if (data) {
            console.log("GenerateJumpUrl: 成功")
        } else {
            console.error("GenerateJumpUrl: 数据为空")
        }
        console.log("\n----------[GenerateJumpUrl]----------", data.data)
        openSchema(data.data, closePage);
    } catch (error) {
        console.error(`${clientConfig.generateJumpUrlPath} error`, error)
        if (error.response) {
            console.error("错误响应数据:", error.response.msg || error.response.data);
        }
    } finally {
        console.log("----------[GenerateJumpUrl END]----------\n")
    }
}

// 处理生成免登入会链接joinUrl，非一次性链接，用于跳转会议客户端加入会议
async function handleGenerateJoinUrl(meetingUrl, closePage = false) {
    console.log("\n----------[GenerateJoinUrl BEGIN]----------")
    try {
        const response = await axios.get(`${getOrigin(clientConfig.apiPort)}${clientConfig.generateJoinUrlPath}?meetingUrl=${meetingUrl}`,
            { withCredentials: true } // 调用时设置请求带上cookie
        );

        if (!response || !response.data) {
            console.error(`${clientConfig.generateJoinUrlPath} response is null`);
            return null;
        }
        const data = response.data;
        if (data) {
            console.log("GenerateJoinUrl: 成功")
        } else {
            console.error("GenerateJoinUrl: 数据为空")
        }
        console.log("\n----------[GenerateJoinUrl]----------", data.data)
        openSchema(data.data, closePage);
        return;
    } catch (error) {
        console.error(`${clientConfig.generateJoinUrlPath} error`, error)
        if (error.response) {
            console.error("错误响应数据:", error.response.msg || error.response.data);
        }
        return;
    } finally {
        console.log("----------[GenerateJoinUrl END]----------\n")
    }
}

async function handleCreateMeeting(meetingParamsStr) {
    console.log("\n----------[创建会议 BEGIN]----------")
    const formData = new URLSearchParams();
    formData.append('data', meetingParamsStr);

    try {
        const response = await axios.post(`${getOrigin(clientConfig.apiPort)}${clientConfig.createMeetingPath}`,
            formData.toString(), // 请求体
            { withCredentials: true } // 调用时设置请求带上cookie
        );

        if (!response || !response.data) {
            console.error(`${clientConfig.createMeetingPath} response is null`);
            return null;
        }
        const data = response.data;
        if (data) {
            console.log("创建会议: 成功", data)
        } else {
            console.error("创建会议: 数据为空")
        }
        return data;
    } catch (error) {
        console.error(`${clientConfig.createMeetingPath} error`, error)
        if (error.response) {
            console.error("错误响应数据:", error.response.msg || error.response.data);
        }
        return null;
    } finally {
        console.log("----------[创建会议 END]----------\n")
    }
}

async function handleQueryUserEndedMeetingList() {
    console.log("\n----------[查询用户已结束会议列表 BEGIN]----------")
    try {
        var response = await axios.get(`${getOrigin(clientConfig.apiPort)}${clientConfig.queryUserEndedMeetingListPath}?page_size=20&page=1`,
            { withCredentials: true } // 调用时设置请求带上cookie
        );

        if (!response || !response.data) {
            console.error(`${clientConfig.queryUserEndedMeetingListPath} response is null`);
            return null;
        }

        const data = response.data;
        if (data) {
            console.log("查询用户已结束会议列表: 成功")
        } else {
            console.error("查询用户已结束会议列表: 数据为空")
        }
        console.log("----------[查询用户已结束会议列表 END]----------\n")
        return data.data;
    } catch (error) {
        console.error(`${clientConfig.queryUserEndedMeetingListPath} error`, error)
        if (error.response) {
            console.error("错误响应数据:", error.response.msg || error.response.data);
        }
        return null;
    }
}

async function handleQueryUserMeetingList() {
    console.log("\n----------[查询用户会议列表 BEGIN]----------")
    try {
        var response = await axios.get(`${getOrigin(clientConfig.apiPort)}${clientConfig.queryUserMeetingListPath}?pos=0&cursory=0`,
            { withCredentials: true } // 调用时设置请求带上cookie
        );

        if (!response || !response.data) {
            console.error(`${clientConfig.queryUserMeetingListPath} response is null`);
            return null;
        }

        const data = response.data;
        if (data) {
            console.log("查询用户会议列表: 成功")
        } else {
            console.error("查询用户会议列表: 数据为空")
        }
        console.log("----------[查询用户会议列表 END]----------\n")
        return data.data;
    } catch (error) {
        console.error(`${clientConfig.queryUserMeetingListPath} error`, error)
        if (error.response) {
            console.error("错误响应数据:", error.response.msg || error.response.data);
        }
        return null;
    }
}


export { handleCreateMeeting, handleGenerateJoinScheme, handleGenerateJumpUrl, handleQueryUserEndedMeetingList, handleQueryUserMeetingList, handleGenerateJoinUrl }