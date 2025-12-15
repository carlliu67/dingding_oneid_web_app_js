import axios from 'axios';
import { logger } from '../util/logger.js';
import { genH5AppLink, getInterAccessToken, formatTimeRange } from './dingtalkUtil.js';
import serverConfig from '../config/server_config.js';

// 发送云录制卡片消息
// 支持接收单个userid或userid数组，一次最多发送20个
async function sendRecordViewAddressCardMessage(receive_ids, createrName, webhookMeetingInfo, recordViewAddress) {
    var access_token = await getInterAccessToken();
    if (!access_token) {
        return
    }
    
    // 标准化为数组格式处理
    const userIds = Array.isArray(receive_ids) ? receive_ids : [receive_ids];
    
    // 过滤掉无效的userid
    const validUserIds = userIds.filter(id => id && typeof id === 'string');
    
    if (validUserIds.length === 0) {
        logger.error("没有有效的用户ID")
        return
    }
    const base64EncodedTargetUrl = Buffer.from(recordViewAddress).toString('base64')
    var singleURL = genH5AppLink("?targetUrl=" + base64EncodedTargetUrl)
    logger.debug("singleURL: ", singleURL);
    var msgParams = {
        "title": "【录制文件已生成】" + webhookMeetingInfo.subject,
        "text": "会议主题：" + webhookMeetingInfo.subject + "\n\n会议时间：" + formatTimeRange(webhookMeetingInfo.start_time, webhookMeetingInfo.end_time) + "\n\n云录制地址：" + recordViewAddress + "\n\n#腾讯会议：" + webhookMeetingInfo.meeting_code + "\n\n发起人：" + createrName,
        "singleTitle": "点击查看云录制",
        "singleURL": singleURL
    };
    var msg = {
        "msgParam": JSON.stringify(msgParams),
        "msgKey": "sampleActionCard",
        "userIds": validUserIds,
        "robotCode": serverConfig.dingtalkRobotCode,
    }

    logger.debug("sendRecordViewAddressCardMessage: ", JSON.stringify(msg));

    try {
        const internalRes = await axios.post('https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
            msg,
            { headers: { "Content-Type": "application/json", "x-acs-dingtalk-access-token": access_token } })

        if (!internalRes.data) {
            logger.error("发送云录制卡片消息失败：响应数据为空")
            return
        }
        logger.debug("sendRecordViewAddressCardMessage result: ", internalRes.data);
    } catch (error) {
        logger.error("发送云录制卡片消息失败", error.message, "stack:", error.stack);
    }
}

export {
    // sendMeetingInfoCardMessage,
    sendRecordViewAddressCardMessage
};