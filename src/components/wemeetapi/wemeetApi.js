import axios from 'axios';
import clientConfig from '../../config/client_config.js';
import { getOrigin } from '../../utils/auth_access_util.js';
import { openSchema } from '../dingtalkapi/dingtalkApi.js'


async function handleGenerateJoinScheme(meetingCode, closePage = false) {
    console.log("\n----------[GenerateJoinScheme BEGIN]----------")
    axios.get(`${getOrigin(clientConfig.apiPort)}${clientConfig.generateJoinSchemePath}?meetingCode=${meetingCode}`,
        { withCredentials: true } // 调用时设置请求带上cookie
    ).then(function (response) { 
        if (!response.data) {
            console.error(`${clientConfig.generateJoinSchemePath} response is null`);
            return;
        }
        const data = response.data;
        if (data) {
            console.log("GenerateJoinScheme: 成功")
        } else {
            console.error("GenerateJoinScheme: 数据为空")
        }
        console.log("\n----------[GenerateJoinScheme]----------")
        openSchema(data.data, closePage);
        return;
    }).catch(function (error) {
        console.error(`${clientConfig.generateJoinSchemePath} error`)
        if (error.response) {
            console.error("错误响应数据:", error.response.msg);
        }
    }).finally(() => {
        console.log("----------[GenerateJoinScheme END]----------\n")
    });
}

function handleGenerateJumpUrl(base64EncodedMeetingUrl, closePage = false) {
    console.log("\n----------[GenerateJumpUrl BEGIN]----------")
    axios.get(`${getOrigin(clientConfig.apiPort)}${clientConfig.generateJumpUrlPath}?meetingUrl=${base64EncodedMeetingUrl}`,
        { withCredentials: true } // 调用时设置请求带上cookie
    ).then(function (response) { 
        if (!response.data) {
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
        return;
    }).catch(function (error) {
        console.error(`${clientConfig.generateJumpUrlPath} error`)
        if (error.response) {
            console.error("错误响应数据:", error.response.msg);
        }
    }).finally(() => {
        console.log("----------[GenerateJumpUrl END]----------\n")
    });
}

async function handleGenerateJoinUrl(meetingUrl) {
    console.log("\n----------[GenerateJoinUrl BEGIN]----------")
    axios.get(`${getOrigin(clientConfig.apiPort)}${clientConfig.generateJoinUrlPath}?meetingUrl=${meetingUrl}`,
        { withCredentials: true } // 调用时设置请求带上cookie
    ).then(function (response) { 
        if (!response.data) {
            console.error(`${clientConfig.generateJoinUrlPath} response is null`);
            return;
        }
        const data = response.data;
        if (data) {
            console.log("GenerateJoinUrl: 成功")
        } else {
            console.error("GenerateJoinUrl: 数据为空")
        }
        return data;
    }).catch(function (error) {
        console.error(`${clientConfig.generateJoinUrlPath} error`)
        if (error.response) {
            console.error("错误响应数据:", error.response.msg);
        }
    }).finally(() => {
        console.log("----------[GenerateJoinUrl END]----------\n")
    });
}

async function handleCreateMeeting(meetingParamsStr) {
    console.log("\n----------[创建会议 BEGIN]----------")
    const formData = new URLSearchParams();
    formData.append('data', meetingParamsStr);

    var response = axios.post(`${getOrigin(clientConfig.apiPort)}${clientConfig.createMeetingPath}`,
        formData.toString(), // 请求体
        { withCredentials: true } // 调用时设置请求带上cookie
    ).then(function (response) { 
        if (!response.data) {
            console.error(`${clientConfig.createMeetingPath} response is null`);
            return;
        }
        const data = response.data;
        if (data) {
            console.log("创建会议: 成功", data)
        } else {
            console.error("创建会议: 数据为空")
        }
    }).catch(function (error) {
        console.error(`${clientConfig.createMeetingPath} error`)
        if (error.response) {
            console.error("错误响应数据:", error.response.msg);
        }
    }).finally(() => {
        console.log("----------[创建会议 END]----------\n")
        return response.data;
    });
}

async function handleQueryUserEndedMeetingList() {
    console.log("\n----------[查询用户已结束会议列表 BEGIN]----------")
    var response = await axios.get(`${getOrigin(clientConfig.apiPort)}${clientConfig.queryUserEndedMeetingListPath}?page_size=20&page=1`,
        { withCredentials: true } // 调用时设置请求带上cookie
    ).catch(function (error) {
        console.log(`${clientConfig.queryUserEndedMeetingListPath} error`)
        if (error.response) {
            console.error("错误响应数据:", error.response.msg);
        }
    });

    if (!response.data) {
        console.error(`${clientConfig.queryUserEndedMeetingListPath} response is null`);
        return;
    }

    const data = response.data;
    if (data) {
        console.log("查询用户已结束会议列表: 成功")
    } else {
        console.error("查询用户已结束会议列表: 数据为空")
    }
    console.log("----------[查询用户已结束会议列表 END]----------\n")
    return data.data;
}

async function handleQueryUserMeetingList() {
    console.log("\n----------[查询用户会议列表 BEGIN]----------")
    var response = await axios.get(`${getOrigin(clientConfig.apiPort)}${clientConfig.queryUserMeetingListPath}?pos=0&cursory=0`,
        { withCredentials: true } // 调用时设置请求带上cookie
    ).catch(function (error) {
        console.error(`${clientConfig.queryUserMeetingListPath} error`)
        if (error.response) {
            console.error("错误响应数据:", error.response.msg);
        }
    });

    if (!response.data) {
        console.error(`${clientConfig.queryUserMeetingListPath} response is null`);
        return;
    }

    const data = response.data;
    if (data) {
        console.log("查询用户会议列表: 成功")
    } else {
        console.error("查询用户会议列表: 数据为空")
    }
    console.log("----------[查询用户会议列表 END]----------\n")
    return data.data;
}

export { handleCreateMeeting, handleGenerateJoinScheme, handleGenerateJumpUrl, handleQueryUserEndedMeetingList, handleQueryUserMeetingList }