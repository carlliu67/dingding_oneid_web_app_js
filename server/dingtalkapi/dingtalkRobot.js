import axios from 'axios';
import { logger } from '../util/logger.js';
import { genH5AppLink, getInterAccessToken } from './dingtalkUtil.js';
import serverConfig from '../server_config.js';

// 发送云录制卡片消息
async function sendRecordViewAddressCardMessage(receive_id, createrName, webhookMeetingInfo, recordViewAddress) {
    var access_token = await getInterAccessToken();
    if (!access_token) {
        return
    }
    //腾讯会议侧userid与钉钉unionid一致时需要转换，如果同步的是钉钉的userid不需要转换
    // var userid = await queryUserIdByUnionId(receive_id);
    var userid = receive_id;
    if (!userid) {
        logger.error("根据unionid获取用户userid失败")
        return
    }
    const base64EncodedTargetUrl = Buffer.from(recordViewAddress).toString('base64')
    var singleURL = genH5AppLink("?targetUrl=" + base64EncodedTargetUrl)
    logger.info("singleURL: ", singleURL);
    var startTime = webhookMeetingInfo.start_time;
    var endTime = webhookMeetingInfo.end_time;
    var msgParams = {
        "title": "【录制文件已生成】" + webhookMeetingInfo.subject,
        "text": "会议时间：2025年XX月XX日 10:00 - 11:00" + "\n\n云录制地址：\n" + recordViewAddress + "\n\n#腾讯会议：" + webhookMeetingInfo.meeting_code + "\n\n发起人 " + createrName,
        "singleTitle": "点击查看云录制",
        "singleURL": singleURL
    };
    var msg = {
        "msgParam": JSON.stringify(msgParams),
        "msgKey": "sampleActionCard",
        "userIds": [userid],
        "robotCode": serverConfig.dingtalkRobotCode,
    }

    logger.info("sendRecordViewAddressCardMessage: ", JSON.stringify(msg));

    try {
        const internalRes = await axios.post('https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
            msg,
            { headers: { "Content-Type": "application/json", "x-acs-dingtalk-access-token": access_token } })

        if (!internalRes.data) {
            logger.error("创建待办失败")
            return
        }
        logger.info("sendRecordViewAddressCardMessage result: ", internalRes.data);
    } catch (error) {
        logger.error("发送云录制卡片消息失败", error.message, "stack:", error.stack);
    }
}

export {
    // sendMeetingInfoCardMessage,
    sendRecordViewAddressCardMessage
};