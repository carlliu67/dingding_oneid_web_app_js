import crypto from 'crypto';
import querystring from 'querystring';
import { Buffer } from 'buffer';
import serverConfig from '../server_config.js';
import { logger } from '../util/logger.js';
import { getUnionIdByUserid } from '../dingtalkapi/dingtalkUtil.js';
import { createMeetingCalendar } from '../dingtalkapi/dingtalkCalendar.js';
import { createMeetingTodo, updateMeetingTodo, deleteMeetingTodo } from '../dingtalkapi/dingtalkTodo.js';
import { sendRecordViewAddressCardMessage } from '../dingtalkapi/dingtalkRobot.js';
import { queryMeetingById, queryMeetingRecordList, queryMeetingRecordAddress, queryMeetingParticipants } from './wemeetApi.js';

/**
 * 验证签名
 * @param {string} timestamp 时间戳
 * @param {string} nonce 随机数
 * @param {string} checkStr 校验字符串
 * @param {string} signature 签名
 * @returns {boolean} 是否验证通过
 */
function verifySignature(timestamp, nonce, data, signature) {
    // 1. 将token、timestamp、nonce、data按字典序排序
    const arr = [serverConfig.wemmetWebhookToken, timestamp, nonce, data].sort();

    // 2. 将排序后的字符串拼接成一个字符串
    const str = arr.join('');
    // logger.info('str:', str);

    // 3. 使用sha1算法加密
    const sha1 = crypto.createHash('sha1');
    sha1.update(str);
    const computedSignature = sha1.digest('hex');
    // logger.info('computedSignature:', computedSignature);

    // 4. 比较计算出的签名与传入的签名
    return computedSignature === signature;
}

/**
 * 使用 EncodingAESKey 的解密函数
 * @param {string} base64EncodedData - Base64编码的加密数据
 * @returns {string|null} 解密后的明文或null（失败时）
 */
function decryptAES(base64EncodedData) {
    try {
        // 1. 参数校验
        if (!base64EncodedData) {
            throw new Error('参数不能为空');
        }

        // 2. 处理EncodingAESKey：补上等号后Base64解码
        const aesKeyBase64 = serverConfig.wemeetWebhookAESKey + '=';
        const aesKey = Buffer.from(aesKeyBase64, 'base64');

        if (aesKey.length !== 32) {
            throw new Error('Base64解码后的AES密钥应为32字节');
        }

        // 3. Base64解码加密数据
        const encryptedData = Buffer.from(base64EncodedData, 'base64');

        // 4. 准备AES解密参数
        const algorithm = 'aes-256-cbc'; // 使用CBC模式
        const iv = aesKey.slice(0, 16); // 取密钥前16字节作为IV

        // 5. 创建解密器
        const decipher = crypto.createDecipheriv(algorithm, aesKey, iv);

        // 6. 执行解密
        let decrypted = decipher.update(encryptedData);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        // 7. 返回解密结果
        return decrypted.toString('utf8');
    } catch (error) {
        logger.error('解密失败:', error.message);
        return null;
    }
}

/**
 * 处理GET验证请求
 */
async function handleVerification(ctx) {
    try {
        const { check_str: checkStr } = ctx.query;
        const { timestamp, nonce, signature } = ctx.headers;
        var result = '';

        if (!timestamp || !nonce || !signature) {
            ctx.throw(400, 'Missing required headers');
            logger.error('Missing required headers');
            return;
        }

        // 验证签名
        const isValid = verifySignature(timestamp, nonce, checkStr, signature);
        if (!isValid) {
            ctx.throw(403, 'Invalid signature');
            logger.error('Invalid signature');
            return;
        }

        // URL解码
        var decodedCheckStr = checkStr ? querystring.unescape(checkStr) : '';

        if (serverConfig.wemeetWebhookAESKey.length > 1) {
            // 解密check_str
            result = decryptAES(decodedCheckStr);
        } else {
            // base64解码
            result = Buffer.from(decodedCheckStr, 'base64').toString('utf8');
        }

        // 返回解密后的字符串（注意：不能加引号或换行符）
        ctx.status = 200;
        ctx.body = result;
    } catch (error) {
        ctx.throw(500, `Verification failed: ${error.message}`);
    }
}

/**
 * 处理会议创建消息
 */
async function webhookCreateMeeting(eventData) {
    const webhookMeetingInfo = eventData.payload[0].meeting_info;
    if (!webhookMeetingInfo) {
        logger.error("未获取到会议信息");
        return;
    }
    // 快速会议不需要创建日程和待办，会议创建类型 0:普通会议；1:快速会议
    if (webhookMeetingInfo.meeting_create_mode === 1) {
        return;
    }

    var creatorUserid = webhookMeetingInfo.creator.userid;
    var creatorUnionid = await getUnionIdByUserid(creatorUserid);
    if (!creatorUnionid) {
        logger.warn("未获取到创建者UnionId");
        return;
    }

    const result = await queryMeetingById(webhookMeetingInfo.meeting_id, webhookMeetingInfo.creator.userid);
    if (!result) {
        logger.error("未获取到会议信息");
        return;
    }
    
    const meetingInfo = result.meeting_info_list[0];
    var currentHosts = meetingInfo.current_hosts ? meetingInfo.current_hosts : [];
    var hosts = meetingInfo.hosts ? meetingInfo.hosts : [];
    var originalParticipants = meetingInfo.participants ? meetingInfo.participants : [];
    var todoParticipants = [];
    var participantUnionId = null;

    // 添加会议创建者
    todoParticipants.push(creatorUnionid);
    // 添加currentHosts
    if (currentHosts.length > 0) {
        for (const host of currentHosts) {
            participantUnionId = await getUnionIdByUserid(host.userid);
            if (participantUnionId) {
                todoParticipants.push(participantUnionId);
            }
        }
    }
    // 添加hosts
    if (hosts.length > 0) {
        for (const host of hosts) {
            participantUnionId = await getUnionIdByUserid(host.userid);
            if (participantUnionId) {
                todoParticipants.push(participantUnionId);
            }
        }
    }
    // 添加originalParticipants
    if (originalParticipants.length > 0) {
        for (const participant of originalParticipants) {
            participantUnionId = await getUnionIdByUserid(participant.userid);
            if (participantUnionId) {
                todoParticipants.push(participantUnionId);
            }
        }
    }
    // 去重
    todoParticipants = [...new Set(todoParticipants)];

    logger.info("currentHosts: ", currentHosts);
    logger.info("hosts: ", hosts);
    logger.info("originalParticipants: ", originalParticipants);
    logger.info("todoParticipants: ", todoParticipants);

    // 会议类型(0:一次性会议，1:周期性会议，2:微信专属会议，4:rooms 投屏会议，5:个人会议号会议， 6:网络研讨会)
    if (webhookMeetingInfo.meeting_type === 0 || webhookMeetingInfo.meeting_type === 2 || webhookMeetingInfo.meeting_type === 5 || webhookMeetingInfo.meeting_type === 6) {
        // 非周期会议通过待办通知
        if (todoParticipants.length > 0) {
            await createMeetingTodo(creatorUnionid, meetingInfo, todoParticipants);
        } else {
            logger.warn("待办通知跳过：没有有效的参会者UnionId");
        }
    } else if (webhookMeetingInfo.meeting_type === 1) {
        // 周期会议暂不处理
        return;
        // 周期会议通过日程通知
        // await createMeetingCalendar(creatorUnionid, meetingInfo, todoParticipants);
    }

}

/**
 * 处理会议更新消息
 */
async function webhookUpdateMeeting(eventData) {
    const webhookMeetingInfo = eventData.payload[0].meeting_info;
    if (!webhookMeetingInfo) {
        logger.error("未获取到会议信息");
        return;
    }
    // 快速会议不需要更新日程和待办
    if (webhookMeetingInfo.meeting_create_mode === 1) {
        return;
    }
    if (webhookMeetingInfo.meeting_type === 1) {
        // 周期会议暂不处理
        return;
    }

    var creatorUserid = webhookMeetingInfo.creator.userid;
    var creatorUnionid = await getUnionIdByUserid(creatorUserid);
    if (!creatorUnionid) {
        logger.warn("未获取到创建者UnionId");
        return;
    }

    const result = await queryMeetingById(webhookMeetingInfo.meeting_id, webhookMeetingInfo.creator.userid);
    if (!result) {
        logger.error("未获取到会议信息");
        return;
    }
    
    const meetingInfo = result.meeting_info_list[0];
    var currentHosts = meetingInfo.current_hosts ? meetingInfo.current_hosts : [];
    var hosts = meetingInfo.hosts ? meetingInfo.hosts : [];
    var participants = meetingInfo.participants ? meetingInfo.participants : [];
    var paticipants = [];
    var paticipantUnionId = null;

    // 添加会议创建者
    paticipants.push(creatorUnionid);
    // 添加currentHosts
    if (currentHosts.length > 0) {
        for (const host of currentHosts) {
            paticipantUnionId = await getUnionIdByUserid(host.userid);
            if (paticipantUnionId) {
                paticipants.push(paticipantUnionId);
            }
        }
    }
    // 添加hosts
    if (hosts.length > 0) {
        for (const host of hosts) {
            paticipantUnionId = await getUnionIdByUserid(host.userid);
            if (paticipantUnionId) {
                paticipants.push(paticipantUnionId);
            }
        }
    }
    // 添加participants
    if (participants.length > 0) {
        for (const paticipant of participants) {
            paticipantUnionId = await getUnionIdByUserid(paticipant.userid);
            if (paticipantUnionId) {
                paticipants.push(paticipantUnionId);
            }
        }
    }
    // 按id属性去重
    paticipants = [...new Set(paticipants)];

    logger.info("currentHosts: ", currentHosts);
    logger.info("hosts: ", hosts);
    logger.info("paticipants: ", participants);
    logger.info("todoPaticipants: ", paticipants);

    // 更新会议日程
    // await createMeetingCalendar(creatorUnionid, meetingInfo, paticipants);
    // 更新会议待办事项
    await updateMeetingTodo(creatorUnionid, meetingInfo, paticipants);
}

/**
 * 处理会议取消消息
 */
async function webhookCancelMeeting(eventData) {
    const webhookMeetingInfo = eventData.payload[0].meeting_info;
    if (!webhookMeetingInfo) {
        logger.error("未获取到会议信息");
        return;
    }
    // 快速会议不需要更新日程和待办
    if (webhookMeetingInfo.meeting_create_mode === 1) {
        return;
    }

    if (webhookMeetingInfo.meeting_type === 1) {
        // 周期会议暂不处理
        return;
    }

    var creatorUnionid = await getUnionIdByUserid(webhookMeetingInfo.creator.userid);
    if (!creatorUnionid) {
        logger.warn("未获取到unionid");
        return;
    }

    // 取消会议待办事项
    await deleteMeetingTodo(creatorUnionid, webhookMeetingInfo.meeting_id);
}

/**
 * 处理会议结束消息
 */
async function webhookEndMeeting(eventData) {
    const webhookMeetingInfo = eventData.payload[0].meeting_info;
    if (!webhookMeetingInfo) {
        logger.error("未获取到会议信息");
        return;
    }
    // 快速会议不需要更新日程和待办
    if (webhookMeetingInfo.meeting_create_mode === 1) {
        return;
    }

    if (webhookMeetingInfo.meeting_type === 1) {
        // 周期会议暂不处理
        return;
    }

    // 没有到达会议预定开始时间，不删除会议待办事项
    if (webhookMeetingInfo.start_time * 1000 > eventData.payload[0].operate_time) {
        return;
    }

    var creatorUnionid = await getUnionIdByUserid(webhookMeetingInfo.creator.userid);
    if (!creatorUnionid) {
        logger.warn("未获取到unionid");
        return;
    }

    // 取消会议待办事项
    await deleteMeetingTodo(creatorUnionid, webhookMeetingInfo.meeting_id);
}

/**
 * 处理云录制完成消息
 */
async function webhookRecordingCompleted(eventData) {
    const webhookMeetingInfo = eventData.payload[0].meeting_info;
    if (!webhookMeetingInfo) {
        logger.error("未获取到会议信息");
        return;
    }
    const recordListResult = await queryMeetingRecordList(webhookMeetingInfo);
    if (!recordListResult) {
        logger.error("未获取到录制信息");
        return;
    }
    ///////////////////////////////////////////////////////////////////////////////////存在多个录制文件时，这里可能会取到空值，需要看看
    const meetingRecordId = recordListResult.record_meetings[0].meeting_record_id;
    const recordAddressResult = await queryMeetingRecordAddress(meetingRecordId, webhookMeetingInfo.creator.userid);
    if (!recordAddressResult || recordAddressResult.total_count === 0) {
        logger.error("未获取到录制地址");
        return;
    }
    const recordViewAddress = recordAddressResult.record_files[0].view_address;
    logger.info("recordViewAddress: ", recordViewAddress);

    const participantsResult = await queryMeetingParticipants(webhookMeetingInfo.meeting_id, webhookMeetingInfo.creator.userid);
    if (!participantsResult) {
        logger.error("未获取到参会人员信息");
        return;
    }
    const participants = participantsResult.participants;
    // 按id属性去重
    var attendees = [...new Map(participants.map(item => [item.userid, item])).values()];
    // 发送会议录制卡片消息
    for (const participant of attendees) {
        logger.info("participant: ", participant);
        if (participant.userid) {
            sendRecordViewAddressCardMessage(participant.userid, webhookMeetingInfo.creator.user_name, webhookMeetingInfo, recordViewAddress);
        }
    }

}

/**
 * 处理POST事件回调
 */
async function handleEvent(ctx) {
    try {
        const { data } = ctx.request.body;
        const { timestamp, nonce, signature } = ctx.headers;
        var result = '';

        if (!timestamp || !nonce || !signature) {
            ctx.throw(400, 'Missing required headers');
            logger.error('Missing required headers');
            return;
        }

        // 验证签名
        const isValid = verifySignature(timestamp, nonce, data, signature);
        if (!isValid) {
            ctx.throw(403, 'Invalid signature');
            logger.error('Invalid signature');
            return;
        }

        // 解密check_str
        if (serverConfig.wemeetWebhookAESKey.length > 1) {
            result = decryptAES(data);
            // console.log('解密后的字符串:', decryptedStr);
        } else {
            // base64解码
            result = Buffer.from(data, 'base64').toString('utf8');
        }

        // 解析JSON数据
        const eventData = JSON.parse(result);

        // 返回成功响应
        ctx.status = 200;
        ctx.body = 'successfully received callback';

        // 处理事件
        switch (eventData.event) {
            // 会议创建事件
            case 'meeting.created':
                logger.info('会议创建:', eventData);
                webhookCreateMeeting(eventData);
                break;
            // 会议更新事件
            case 'meeting.updated':
                logger.info('会议更新:', eventData);
                webhookUpdateMeeting(eventData);
                break;
            // 会议取消事件
            case 'meeting.canceled':
                logger.info('会议取消:', eventData);
                webhookCancelMeeting(eventData);
                break;
            // 会议结束事件
            case 'meeting.end':
                logger.info('会议结束:', eventData);
                webhookEndMeeting(eventData);
                break;
            // 云录制完成事件
            case 'recording.completed':
                logger.info('云录制完成:', eventData);
                webhookRecordingCompleted(eventData);
                break;
            default:
                logger.info('收到未知事件:', eventData);
        }
    } catch (error) {
        ctx.throw(500, `Event processing failed: ${error.message}`);
    }
}

export {
    handleVerification,
    handleEvent
};