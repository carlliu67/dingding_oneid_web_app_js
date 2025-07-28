import axios from 'axios';
import { logger } from '../util/logger.js';
import { formatTimeRange, genH5AppLink, getInterAccessToken } from './dingtalkUtil.js';
import { dbInsertTodo, dbGetTodoByMeetingid as dbGetTodoByMeetingid, dbDeleteTodoByMeetingid } from '../db/sqlite.js';


// 创建会议待办
async function createMeetingTodo(creatorUnionId, meetingInfo, paticipants) {
    // logger.info(meetingInfo);

    var access_token = await getInterAccessToken();
    if (!access_token) {
        logger.error("获取钉钉access_token失败");
        return;
    }

    var pcUrl = genH5AppLink("?meetingCode=" + meetingInfo.meeting_code);
    try {
        const internalRes = await axios.post('https://api.dingtalk.com/v1.0/todo/users/' + creatorUnionId + '/tasks?operatorId=' + creatorUnionId,
            {
                "sourceId": meetingInfo.meeting_id + "_todo",
                "subject": "腾讯会议：" + meetingInfo.subject + " - 会议号：" + meetingInfo.meeting_code + " - 时间：" + formatTimeRange(meetingInfo.start_time, meetingInfo.end_time),
                "creatorId": creatorUnionId,
                // 截止时间为会议开始时间
                "dueTime": meetingInfo.start_time * 1000,
                "participantIds": paticipants,
                "detailUrl": {
                    "appUrl": meetingInfo.join_url,
                    "pcUrl": pcUrl
                },
                "notifyConfigs": {
                    "dingNotify": "1"
                },
                // 提醒时间为会议开始时间
                reminderTimeStamp: meetingInfo.start_time * 1000,
                "remindNotifyConfigs": {
                    "dingNotify": "1"
                }
            }, { headers: { "Content-Type": "application/json", "x-acs-dingtalk-access-token": access_token } })

        if (!internalRes.data) {
            logger.error("创建待办失败")
            return
        }
        logger.info("createTodo result: ", internalRes.data);
        // 插入待办数据库
        await dbInsertTodo(meetingInfo.meeting_id, internalRes.data.id, creatorUnionId, meetingInfo.start_time);
        logger.info("创建会议待办成功，meetingid:", meetingInfo.meeting_id);
    } catch (error) {
        logger.error("创建待办时发生异常:", error.message, "stack:", error.stack);
    }

}

// 更新会议待办
async function updateMeetingTodo(creatorUnionId, meetingInfo, paticipants) {
    // logger.info(meetingInfo);
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
        logger.info("删除会议待办成功，meetingid:", meetingid);
    } catch (error) {
        logger.error("删除待办时发生异常:", error.message, "stack:", error.stack);
    }
}


export {
    createMeetingTodo,
    updateMeetingTodo,
    deleteMeetingTodo
};