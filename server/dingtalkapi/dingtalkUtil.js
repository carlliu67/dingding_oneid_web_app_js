import axios from 'axios';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import serverConfig from '../config/server_config.js';
import { logger } from '../util/logger.js';
import dbAdapter from '../db/db_adapter.js';
const { dbInsertUserinfo, dbGetUserinfoByUserid } = dbAdapter;

dayjs.extend(utc);
dayjs.extend(timezone);

// 服务时区（钉钉日程/消息展示统一使用东八区，避免容器系统时区为 UTC 导致偏差）
const SERVER_TIMEZONE = 'Asia/Shanghai';

// 将秒级时间戳按服务时区格式化
function formatTimestampInTimezone(seconds, template) {
    return dayjs(seconds * 1000).tz(SERVER_TIMEZONE).format(template);
}

// 定义一个函数用于将秒级时间戳转换为 ISO - 8601 格式
// 输出东八区本地时间（带 +08:00 偏移），与钉钉日程 timeZone: "Asia/Shanghai" 配合
// 注意：不能用 toISOString()（输出 UTC 时间），否则日程时间会偏差 8 小时
function convertSecondsToISO(seconds) {
    return formatTimestampInTimezone(seconds, 'YYYY-MM-DDTHH:mm:ssZ');
}

function formatTimeRange(startTimestamp, endTimestamp) {
    const startDate = dayjs(startTimestamp * 1000).tz(SERVER_TIMEZONE);
    const endDate = dayjs(endTimestamp * 1000).tz(SERVER_TIMEZONE);

    // 格式化日期部分 (XXXX年XX月XX日)
    const formatDate = date => date.format('YYYY年MM月DD日');

    // 格式化时间部分 (XX:XX)
    const formatTime = date => date.format('HH:mm');

    // 判断是否同一天
    const isSameDay = startDate.format('YYYY-MM-DD') === endDate.format('YYYY-MM-DD');

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
        logger.debug("access_token: ", interAccessToken)
        return interAccessToken
    }
    try {
        logger.debug(`获取interAccessToken，使用clientId: ${serverConfig.dingtalkClientId}`);
        const internalRes = await axios.post('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
            "appKey": serverConfig.dingtalkClientId,
            "appSecret": serverConfig.dingtalkClientSecret,
        }, { headers: { "Content-Type": "application/json" } })

        logger.debug("interAccessToken response:", internalRes.data);
        
        if (!internalRes.data || !internalRes.data.accessToken) {
            logger.error("获取 access_token 失败，响应中没有accessToken")
            return null
        }

        interAccessToken = internalRes.data.accessToken
        interAccessTokenTime = Math.floor(Date.now() / 1000)
        logger.debug("access_token: ", interAccessToken)
        return interAccessToken
    } catch (error) {
        logger.error("获取 access_token 失败", error.message, "stack:", error.stack);
        if (error.response) {
            logger.error("响应数据:", error.response.data);
        }
        return null
    }
}

// 应用的access token有效期为2小时，需要定时刷新
let accessToken = null;
let accessTokenTime = 0;
// 获取 access_token
async function getAccessToken() {
    if (accessToken && accessTokenTime + 7000 > Math.floor(Date.now() / 1000)) {
        logger.debug("access_token get time: ", accessTokenTime);
        return accessToken;
    }
    try {
        logger.debug(`获取accessToken，使用corpId: ${serverConfig.dingtalkCorpId}, clientId: ${serverConfig.dingtalkClientId}`);
        const internalRes = await axios.post('https://api.dingtalk.com/v1.0/oauth2/' + serverConfig.dingtalkCorpId + '/token', {
            "client_id": serverConfig.dingtalkClientId,
            "client_secret": serverConfig.dingtalkClientSecret,
            "grant_type": "client_credentials"
        }, { headers: { "Content-Type": "application/json" } })
        
        logger.debug("accessToken response:", internalRes.data);
        
        if (!internalRes.data || !internalRes.data.access_token) {
            logger.error("获取 access_token 失败，响应中没有access_token");
            return null;
        }

        accessToken = internalRes.data.access_token;
        accessTokenTime = Math.floor(Date.now() / 1000);
        logger.debug("access_token get time: ", accessTokenTime, "expires_in: ", internalRes.data.expires_in);
        return accessToken;
    } catch (error) {
        logger.error("获取 access_token 失败", error.message, "stack:", error.stack);
        if (error.response) {
            logger.error("响应数据:", error.response.data);
        }
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
        logger.debug("queryUserDetail result: ", internalRes.data);
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

        //logger.debug("internalRes: ", internalRes)

        if (!internalRes.data) {
            logger.error("根据unionid获取用户userid失败")
            return null;
        }
        logger.debug("queryUserIdByUnionId result: ", internalRes.data);
        return internalRes.data.result.userid;
    } catch (error) {
        logger.error("根据unionid获取用户userid失败", error.message, "stack:", error.stack);
        return null;
    }

}

// 搜索用户userId
// 调用钉钉通讯录搜索接口，根据用户名称/拼音/英文名称搜索匹配的用户userId列表
// 接口文档：https://open.dingtalk.com/document/development/address-book-search-user-id
async function searchUserByKeyword(queryWord, offset = 0, size = 20, fullMatchField) {
    const accessToken = await getInterAccessToken();
    if (!accessToken) {
        logger.error("搜索用户失败：无法获取access_token");
        return null;
    }

    try {
        const requestBody = {
            queryWord,
            offset,
            size,
        };
        if (fullMatchField !== undefined) {
            requestBody.fullMatchField = fullMatchField;
        }

        const response = await axios.post('https://api.dingtalk.com/v1.0/contact/users/search', requestBody, {
            headers: {
                "Content-Type": "application/json",
                "x-acs-dingtalk-access-token": accessToken,
            }
        });

        logger.debug("searchUserByKeyword result:", response.data);
        return response.data;  // {hasMore, totalCount, list: [userId, ...]}
    } catch (error) {
        logger.error("搜索用户失败:", error.message, "stack:", error.stack);
        if (error.response) {
            logger.error("响应数据:", error.response.data);
        }
        return null;
    }
}

// 查询用户详情（返回userid, name, unionid, avatar等）
// 调用钉钉topapi/v2/user/get接口获取用户完整信息
async function getUserDetailByUserid(userid) {
    const accessToken = await getInterAccessToken();
    if (!accessToken) {
        return null;
    }

    try {
        const response = await axios.post('https://oapi.dingtalk.com/topapi/v2/user/get?access_token=' + accessToken, {
            userid: userid
        }, { headers: { "Content-Type": "application/json" } });

        if (!response.data || response.data.errcode != 0) {
            logger.warn("getUserDetailByUserid失败:", response.data?.errcode, response.data?.errmsg);
            return null;
        }

        logger.debug("getUserDetailByUserid result:", response.data.result);
        return response.data.result;  // {userid, name, unionid, avatar, ...}
    } catch (error) {
        logger.error("查询用户详情失败:", error.message, "stack:", error.stack);
        return null;
    }
}

// 通用重试：fn 返回 null/undefined 视为失败，最多重试 retries 次（含首次）
async function withRetry(fn, retries = 2, retryDelayMs = 300) {
    let lastResult = null;
    for (let i = 0; i <= retries; i++) {
        lastResult = await fn();
        if (lastResult !== null && lastResult !== undefined) {
            return lastResult;
        }
        if (i < retries) {
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
    }
    return lastResult;
}

// 获取直属子部门列表（含部门名称）
// listsub 返回值本身包含 name 字段，直接利用可避免构建组织架构树时再逐个调用 department/get 查询部门名
// 失败（含重试后仍失败）返回 null；无子部门返回空数组——调用方必须区分这两种情况
async function listSubDepartmentInfo(parentId) {
    const accessToken = await getInterAccessToken();
    if (!accessToken) {
        logger.error("listSubDepartmentInfo失败：无法获取access_token");
        return null;
    }

    try {
        const response = await axios.post('https://oapi.dingtalk.com/topapi/v2/department/listsub?access_token=' + accessToken, {
            language: "zh_CN",
            dept_id: parentId,
        }, { headers: { "Content-Type": "application/json" } });

        if (!response.data || response.data.errcode != 0) {
            logger.error(`listSubDepartmentInfo(parentId=${parentId})失败:`, response.data?.errcode, response.data?.errmsg);
            return null;
        }

        const subDepts = (response.data.result || []).map(d => ({
            deptId: d.dept_id || d.id,
            name: d.name || '',
        }));
        logger.debug(`listSubDepartmentInfo(parentId=${parentId}) 返回部门数:`, subDepts.length);
        return subDepts;
    } catch (error) {
        logger.error(`listSubDepartmentInfo(parentId=${parentId})异常:`, error.message);
        return null;
    }
}

// 带重试的直属子部门列表查询（供组织架构构建使用）
async function listSubDepartmentInfoWithRetry(parentId) {
    return await withRetry(() => listSubDepartmentInfo(parentId));
}

// 获取直属子部门ID列表（基于 listSubDepartmentInfo，仅提取ID；失败时返回空数组保持旧语义）
async function listSubDepartmentIds(parentId) {
    const subDepts = await listSubDepartmentInfo(parentId);
    return (subDepts || []).map(d => d.deptId);
}

// 递归获取指定部门及其所有层级子部门ID列表
async function getAllSubDepartmentIds(rootDeptId) {
    const result = new Set();
    const queue = [rootDeptId];
    let safetyCounter = 0;
    const MAX_ITERATIONS = 1000; // 防止异常死循环

    while (queue.length > 0 && safetyCounter < MAX_ITERATIONS) {
        safetyCounter++;
        const currentId = queue.shift();
        result.add(currentId); // 包含当前部门本身

        const subIds = await listSubDepartmentIds(currentId);
        for (const subId of subIds) {
            if (!result.has(subId)) {
                queue.push(subId);
            }
        }
    }

    if (safetyCounter >= MAX_ITERATIONS) {
        logger.warn("getAllSubDepartmentIds 达到最大迭代次数，可能存在循环部门关系");
    }

    return Array.from(result);
}

// 获取企业所有部门ID列表（从根部门deptId=1开始递归）
async function getAllDepartmentIds() {
    return await getAllSubDepartmentIds(1);
}

// 获取指定部门及其所有子部门ID列表（兼容旧调用）
async function getSubDepartmentIds(deptId) {
    return await getAllSubDepartmentIds(deptId);
}

// 获取用户所在的所有部门ID列表
// 通过 getUserDetailByUserid 获取用户的 dept_id_list
async function getUserDeptIdList(userid) {
    const userDetail = await getUserDetailByUserid(userid);
    if (!userDetail || !userDetail.dept_id_list) {
        logger.warn("获取用户部门列表失败: 用户详情为空");
        return [];
    }
    logger.debug(`getUserDeptIdList(userid=${userid}) 部门列表:`, userDetail.dept_id_list);
    return userDetail.dept_id_list;
}

// 获取指定部门的详情（名称等）
// 接口：topapi/v2/department/get
async function getDeptInfo(deptId) {
    const accessToken = await getInterAccessToken();
    if (!accessToken) return null;

    try {
        const response = await axios.post('https://oapi.dingtalk.com/topapi/v2/department/get?access_token=' + accessToken, {
            dept_id: deptId,
        }, { headers: { "Content-Type": "application/json" } });

        if (!response.data || response.data.errcode != 0) {
            logger.error(`getDeptInfo(deptId=${deptId})失败:`, response.data?.errcode, response.data?.errmsg);
            return null;
        }

        const result = response.data.result;
        return { dept_id: result.dept_id, name: result.name };
    } catch (error) {
        logger.error(`getDeptInfo(deptId=${deptId})异常:`, error.message);
        return null;
    }
}

// 递归构建用户所在部门及子部门的组织架构树（含部门下的成员）
// 返回树形结构：[{ key, title, type:'dept', children: [...], users: [...] }]
async function getDeptTreeWithUsers(parentDeptId, deptInfoCache) {
    // 获取当前部门信息
    let deptInfo = deptInfoCache.get(parentDeptId);
    if (!deptInfo) {
        deptInfo = await getDeptInfo(parentDeptId);
        if (!deptInfo) return null;
        deptInfoCache.set(parentDeptId, deptInfo);
    }

    const node = {
        key: 'dept-' + parentDeptId,
        deptId: parentDeptId,
        title: deptInfo.name || '部门' + parentDeptId,
        type: 'dept',
        children: [],
    };

    // 获取该部门下的用户
    let cursor = 0;
    let hasMore = true;
    let pageCount = 0;
    while (hasMore && pageCount < 50) {
        pageCount++;
        const page = await getDeptUserList(parentDeptId, cursor, 100);
        const users = page?.users || [];
        for (const user of users) {
            node.children.push({
                key: 'user-' + user.userid,
                userid: user.userid,
                title: user.name || user.userid,
                type: 'user',
                avatar: user.avatar || "",
                job_number: user.job_number || "",
            });
        }
        hasMore = page?.hasMore || false;
        cursor += 100;
    }

    // 递归获取子部门
    const subDeptIds = await listSubDepartmentIds(parentDeptId);
    for (const subDeptId of subDeptIds) {
        const childNode = await getDeptTreeWithUsers(subDeptId, deptInfoCache);
        if (childNode) {
            node.children.push(childNode);
        }
    }

    return node;
}

// 构建多个部门的组织架构树（根节点为虚拟节点）
async function getScopedDeptTree(deptIds) {
    const deptInfoCache = new Map();
    const rootChildren = [];

    for (const deptId of deptIds) {
        const node = await getDeptTreeWithUsers(deptId, deptInfoCache);
        if (node) {
            rootChildren.push(node);
        }
    }

    // 如果只有一个部门，直接返回该部门作为根节点
    if (rootChildren.length === 1) {
        return rootChildren[0];
    }

    // 多个部门，用虚拟根节点
    return {
        key: 'root',
        title: '我的部门',
        type: 'dept',
        children: rootChildren,
    };
}

// 获取指定部门的用户列表（分页）
// 接口：topapi/v2/user/list，每次最多返回100条
async function getDeptUserList(deptId, cursor = 0, size = 100) {
    const accessToken = await getInterAccessToken();
    if (!accessToken) {
        logger.error("getDeptUserList失败：无法获取access_token");
        return null;
    }

    try {
        const response = await axios.post('https://oapi.dingtalk.com/topapi/v2/user/list?access_token=' + accessToken, {
            dept_id: deptId,
            cursor: cursor,
            size: size,
        }, { headers: { "Content-Type": "application/json" } });

        if (!response.data || response.data.errcode != 0) {
            logger.error(`getDeptUserList(deptId=${deptId})失败:`, response.data?.errcode, response.data?.errmsg);
            return null;
        }

        const result = response.data.result;
        return {
            users: result.list || [],
            hasMore: result.has_more || false,
        };
    } catch (error) {
        logger.error(`getDeptUserList(deptId=${deptId})异常:`, error.message);
        return null;
    }
}

// 带重试的部门用户列表查询（供组织架构缓存使用）
// 失败（含重试后仍失败）返回 null；成功返回 {users, hasMore}
async function getDeptUserListWithRetry(deptId, cursor = 0, size = 100) {
    return await withRetry(() => getDeptUserList(deptId, cursor, size));
}

// 递归获取多个部门及其所有子部门的全部用户
// deptIds: 初始部门ID列表
// 返回去重后的用户列表 [{userid, name, avatar, job_number, dept_id_list}, ...]
async function getAllScopedUsers(deptIds) {
    // 第一步：递归获取所有部门ID（含子部门）
    const allDeptIdSet = new Set();
    for (const deptId of deptIds) {
        const subDeptIds = await getSubDepartmentIds(deptId);
        for (const subId of subDeptIds) {
            allDeptIdSet.add(subId);
        }
    }
    const allDeptIds = Array.from(allDeptIdSet);
    logger.debug(`getAllScopedUsers: 共 ${allDeptIds.length} 个部门需要查询用户`);

    // 第二步：逐个部门分页获取用户
    const userMap = new Map(); // userid → user，用于去重
    for (const deptId of allDeptIds) {
        let cursor = 0;
        let hasMore = true;
        let pageCount = 0;
        const MAX_PAGES = 50; // 安全限制，防止异常死循环

        while (hasMore && pageCount < MAX_PAGES) {
            pageCount++;
            const page = await getDeptUserList(deptId, cursor, 100);
            const users = page?.users || [];
            for (const user of users) {
                if (user.userid && !userMap.has(user.userid)) {
                    userMap.set(user.userid, {
                        userid: user.userid,
                        name: user.name || user.userid,
                        avatar: user.avatar || "",
                        job_number: user.job_number || "",
                    });
                }
            }
            hasMore = page?.hasMore || false;
            cursor += 100;
        }
    }

    const users = Array.from(userMap.values());
    logger.info(`getAllScopedUsers 完成: ${allDeptIds.length}个部门，共获取 ${users.length} 个用户`);
    return users;
}

export {
    convertSecondsToISO,
    formatTimestampInTimezone,
    formatTimeRange,
    genUrlAppLink,
    genH5AppLink,
    getInterAccessToken,
    getAccessToken,
    getUnionIdByUserid,
    queryUserIdByUnionId,
    searchUserByKeyword,
    getUserDetailByUserid,
    getAllDepartmentIds,
    getSubDepartmentIds,
    getUserDeptIdList,
    listSubDepartmentIds,
    listSubDepartmentInfo,
    listSubDepartmentInfoWithRetry,
    getDeptUserList,
    getDeptUserListWithRetry,
    getAllScopedUsers,
    getDeptInfo,
    getScopedDeptTree
};