import axios from 'axios';
import { logger } from '../util/logger.js';
import { genH5AppLink, getInterAccessToken } from './dingtalkUtil.js';
import serverConfig from '../server_config.js';

// 发送会议卡片消息
// async function sendMeetingInfoCardMessage(receive_id, createrName, meetingInfo) {
//     var tenant_access_token = await getTenantAccessToken();;
//     var startTime = meetingInfo.startTime;
//     var endTime = meetingInfo.endTime;
//     // var jumpUrl = "https://applink.feishu.cn/client/web_url/open?mode=appCenter&reload=false&url=http%3A%2F%2Fss.liuqi92.cn%3A3000%3FmeetingCode%3D854576960";
//     var jumpUrl = genH5AppLinkMeetingCode(meetingInfo.meeting_code);
//     var msg ={
//         "schema": "2.0",
//         "config": {
//             "update_multi": true,
//             "locales": [
//                 "en_us"
//             ],
//             "style": {
//                 "text_size": {
//                     "normal_v2": {
//                         "default": "normal",
//                         "pc": "normal",
//                         "mobile": "heading"
//                     }
//                 }
//             }
//         },
//         "body": {
//                 "direction": "vertical",
//                 "padding": "12px 12px 12px 12px",
//                 "elements": [
//                     {
//                         "tag": "markdown",
//                         "content": "腾讯会议参会链接：\nhttps://meeting.tencent.com/dm/WvrYC8kzGU0N\n\n#腾讯会议：" + meetingInfo.meeting_code + "\n\n发起人 " + createrName + "\n\n参会人 ",
//                         "i18n_content": {
//                             "en_us": "👋 <at id=\"${open_id}\"></at> Hello, ready to explore our **Bot Card Interaction Guide**? 🤖\n\nThis tutorial uses \"Alert System\" as an example to help you understand:\n- Creating your first interactive card\n- Setting up interactive buttons on your card\n- Customizing your bot's menu options"
//                         },
//                         "text_align": "left",
//                         "text_size": "normal_v2",
//                         "margin": "0px 0px 0px 0px"
//                     },
//                     {
//                         "tag": "hr",
//                         "margin": "0px 0px 0px 0px"
//                     },
//                     {
//                         "tag": "column_set",
//                         "horizontal_align": "left",
//                         "columns": [
//                             {
//                                 "tag": "column",
//                                 "width": "weighted",
//                                 "elements": [
//                                     {
//                                         "tag": "button",
//                                         "text": {
//                                             "tag": "plain_text",
//                                             "content": "加入会议",
//                                             "i18n_content": {
//                                                 "en_us": "View Tutorial"
//                                             }
//                                         },
//                                         "type": "primary_filled",
//                                         "width": "default",
//                                         "size": "medium",
//                                         "behaviors": [
//                                             {
//                                                 "type": "open_url",
//                                                 "default_url": jumpUrl,
//                                                 "pc_url": "",
//                                                 "ios_url": "",
//                                                 "android_url": ""
//                                             }
//                                         ]
//                                     }
//                                 ],
//                                 "direction": "horizontal",
//                                 "horizontal_spacing": "8px",
//                                 "vertical_spacing": "8px",
//                                 "horizontal_align": "left",
//                                 "vertical_align": "top",
//                                 "weight": 1
//                             }
//                         ],
//                         "margin": "0px 0px 0px 0px"
//                     }
//                 ]
//             },
//             "header": {
//                 "title": {
//                     "tag": "plain_text",
//                     "content": "【会议提醒】" + meetingInfo.subject,
//                     "i18n_content": {
//                         "en_us": "👋 Dive into Bot Card Interactions: A Hands-on Tutorial"
//                     }
//                 },
//                 "subtitle": {
//                     "tag": "plain_text",
//                     "content": "会议时间：2025年XX月XX日 10:00 - 11:00"
//                 },
//                 "template": "blue",
//                 "padding": "12px 12px 12px 12px"
//             }
//     }

//     logger.info("sendMeetingInfoCardMessage: ", JSON.stringify(msg));

//     client.im.v1.message.create({
//         params: {
//             receive_id_type: 'user_id',
//         },
//         data: {
//             receive_id: receive_id,
//             msg_type: 'interactive',
//             content: JSON.stringify(msg),
//         },
//     },
//         lark.withTenantToken(tenant_access_token)
//     ).then(res => {
//         logger.info("sendCardMessage result: ", res);
//     }).catch(e => {
//         logger.error(JSON.stringify(e.response.data, null, 4));
//     });
// }

// 根据unionid获取用户userid
async function queryUserIdByUnionId(unionid) {
    var access_token = await getInterAccessToken();
    if (!access_token) {
        return
    }
    const internalRes = await axios.post('https://oapi.dingtalk.com/topapi/user/getbyunionid?access_token=' + access_token,
        {
            "unionid": unionid
        }, { headers: { "Content-Type": "application/json" } })

    //logger.info("internalRes: ", internalRes)

    if (!internalRes.data) {
        logger.error("根据unionid获取用户userid失败")
        return
    }
    logger.info("queryUserIdByUnionId result: ", internalRes.data);
    return internalRes.data.result.userid;
}

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

    const internalRes = await axios.post('https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
        msg, 
        { headers: { "Content-Type": "application/json", "x-acs-dingtalk-access-token": access_token } })

    if (!internalRes.data) {
        logger.error("创建待办失败")
        return
    }
    logger.info("createTodo result: ", internalRes.data);
}

export {
    // sendMeetingInfoCardMessage,
    sendRecordViewAddressCardMessage
};