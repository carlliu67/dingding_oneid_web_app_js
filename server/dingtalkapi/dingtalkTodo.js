import axios from 'axios';
import { logger } from '../util/logger.js';
import { formatTimeRange, genH5AppLink, getInterAccessToken } from './dingtalkUtil.js';
import dbAdapter from '../db/db_adapter.js';

// 从适配器获取数据库方法
const { dbInsertTodo, dbGetTodoByMeetingid, dbDeleteTodoByMeetingid } = dbAdapter;


// 创建会议待办
async function createMeetingTodo(creatorUnionId, meetingInfo, executorIds) {
    // logger.debug("meetingInfo:", meetingInfo);
    // logger.debug("executorIds:", executorIds);

    // 先查询数据库看待办是否已经存在
    const existingTodo = await dbGetTodoByMeetingid(meetingInfo.meeting_id);
    if (existingTodo) {
        logger.warn("待办已存在，无需重复创建，meetingid:", meetingInfo.meeting_id);
        return;
    }

    var access_token = await getInterAccessToken();
    if (!access_token) {
        logger.error("获取钉钉access_token失败");
        return;
    }

    var pcUrl = genH5AppLink("?meetingCode=" + meetingInfo.meeting_code);
    try {
        // 确保executorIds是一个数组并且不为空
        if (!Array.isArray(executorIds) || executorIds.length === 0) {
            logger.error("创建待办失败：执行人为空或格式错误");
            return;
        }

        const requestBody = {
            "sourceId": meetingInfo.meeting_id + "_todo",
            "subject": "腾讯会议：" + meetingInfo.subject + " - 会议号：" + meetingInfo.meeting_code + " - 时间：" + formatTimeRange(meetingInfo.start_time, meetingInfo.end_time),
            "creatorId": creatorUnionId,
            // 截止时间为会议开始时间
            "dueTime": meetingInfo.start_time * 1000,
            "executorIds": executorIds,
            "detailUrl": {
                "appUrl": meetingInfo.join_url,
                "pcUrl": pcUrl
            },
            "notifyConfigs": {
                "dingNotify": "1"
            },
            // 提醒时间为会议开始时间（注意：属性名使用驼峰命名）
            "reminderTimeStamp": meetingInfo.start_time * 1000,
            "remindNotifyConfigs": {
                "dingNotify": "1"
            }
        };

        logger.debug("待办请求参数：", JSON.stringify(requestBody));
        
        const internalRes = await axios.post(
            `https://api.dingtalk.com/v1.0/todo/users/${creatorUnionId}/tasks?operatorId=${creatorUnionId}`,
            requestBody,
            { 
                headers: { 
                    "Content-Type": "application/json", 
                    "x-acs-dingtalk-access-token": access_token 
                },
                validateStatus: function (status) {
                    // 不抛出4xx错误，由我们自己处理
                    return true;
                }
            }
        );

        if (internalRes.status === 200 && internalRes.data) {
            logger.debug("createTodo result: ", internalRes.data);
            // 插入待办数据库
            await dbInsertTodo(meetingInfo.meeting_id, internalRes.data.id, creatorUnionId, meetingInfo.start_time);
            logger.debug("创建会议待办成功，meetingid:", meetingInfo.meeting_id);
        } else {
            logger.error(`创建待办失败：状态码=${internalRes.status}, 错误信息=${JSON.stringify(internalRes.data)}`);
        }
    } catch (error) {
        logger.error("创建待办时发生异常:", error.message);
        if (error.response) {
            logger.error("错误响应数据:", JSON.stringify(error.response.data));
        }
        logger.error("错误堆栈:", error.stack);
    }
}

// 更新会议待办
async function updateMeetingTodo(creatorUnionId, meetingInfo, paticipants) {
    // logger.debug(meetingInfo);
    // 从数据库查询待办信息
    const todoInfo = await dbGetTodoByMeetingid(meetingInfo.meeting_id);
    if (!todoInfo) {
        logger.error("更新待办失败，待办不存在")
        return
    }

    // 钉钉待办更新接口不支持修改通知时间，所以这里先删除老的待办，然后创建一个新的待办
    await deleteMeetingTodo(creatorUnionId, meetingInfo.meeting_id);
    await createMeetingTodo(creatorUnionId, meetingInfo, paticipants);
}

// 删除会议待办
async function deleteMeetingTodo(creatorUnionId, meetingid) {
    // 从数据库查询待办信息
    const todoInfo = await dbGetTodoByMeetingid(meetingid);
    if (!todoInfo) {
        logger.warn("删除待办失败，待办不存在");
        return;
    }

    const access_token = await getInterAccessToken();
    if (!access_token) {
        logger.error("删除待办失败，未获取到有效的access_token");
        return;
    }

    try {
        const url = `https://api.dingtalk.com/v1.0/todo/users/${creatorUnionId}/tasks/${todoInfo.taskid}?operatorId=${creatorUnionId}`;
        const internalRes = await axios.delete(url, {
            headers: {
                "Content-Type": "application/json",
                "x-acs-dingtalk-access-token": access_token
            }
        });

        if (internalRes.status >= 400) {
            logger.error("删除待办失败，钉钉API返回错误状态码:", internalRes.status, internalRes.statusText);
            return;
        }

        await dbDeleteTodoByMeetingid(meetingid);
        logger.debug("删除会议待办成功，meetingid:", meetingid);
    } catch (error) {
        logger.error("删除待办时发生异常:", error.message, "stack:", error.stack);
    }
}


export {
    createMeetingTodo,
    updateMeetingTodo,
    deleteMeetingTodo
};