import crypto from 'crypto';
import querystring from 'querystring';
import { Buffer } from 'buffer';
import serverConfig from '../config/server_config.js';
import { logger } from '../util/logger.js';
import { getUnionIdByUserid } from '../dingtalkapi/dingtalkUtil.js';
import { createMeetingCalendar, updateMeetingCalendar, deleteMeetingCalendar } from '../dingtalkapi/dingtalkCalendar.js';
import { createMeetingTodo, updateMeetingTodo, deleteMeetingTodo } from '../dingtalkapi/dingtalkTodo.js';
import { sendRecordViewAddressCardMessage } from '../dingtalkapi/dingtalkRobot.js';
import { queryMeetingById, queryMeetingRecordList, queryMeetingRecordAddress, queryMeetingParticipants } from './wemeetApi.js';
import RateLimiter from './rate_limiter.js';
import TaskQueue from './task_queue.js';

// 创建webhook请求限流器
const webhookRateLimiter = new RateLimiter({
    rate: serverConfig.webhookRateLimit || 1000, // 每秒处理的请求数
    capacity: serverConfig.webhookCapacity || 5000 // 最大并发请求数
});

// 创建全局任务队列实例，最大并发数可以根据服务器性能调整
const webhookTaskQueue = new TaskQueue(serverConfig.webhookMaxConcurrent || 5);

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
    // logger.debug('str:', str);

    // 3. 使用sha1算法加密
    const sha1 = crypto.createHash('sha1');
    sha1.update(str);
    const computedSignature = sha1.digest('hex');
    // logger.debug('computedSignature:', computedSignature);

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
    logger.debug(`处理会议创建事件: ${webhookMeetingInfo.meeting_id}`);

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

    logger.debug(`会议参与者信息: currentHosts=${currentHosts.length}, hosts=${hosts.length}, participants=${originalParticipants.length}`);
    logger.debug(`去重后的参与者数量: ${todoParticipants.length}`);

    // 会议类型(0:一次性会议，1:周期性会议，2:微信专属会议，4:rooms 投屏会议，5:个人会议号会议， 6:网络研讨会)
    if (webhookMeetingInfo.meeting_type === 0 || webhookMeetingInfo.meeting_type === 2 || webhookMeetingInfo.meeting_type === 5 || webhookMeetingInfo.meeting_type === 6) {
        // 非周期会议通知
        if (todoParticipants.length > 0) {
            if (serverConfig.dingtalkTodoSwitch) {
                await createMeetingTodo(creatorUnionid, meetingInfo, todoParticipants);
            }
            if (serverConfig.dingtalkCalendarSwitch) {
                await createMeetingCalendar(creatorUnionid, meetingInfo, todoParticipants);
            }
        } else {
            logger.warn("待办通知跳过：没有有效的参会者UnionId");
        }
    } else if (webhookMeetingInfo.meeting_type === 1) {
        // 周期会议通过日程通知
        await createMeetingCalendar(creatorUnionid, meetingInfo, todoParticipants);
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
    logger.debug(`处理会议更新事件: ${webhookMeetingInfo.meeting_id}`);

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

    logger.debug(`会议参与者信息: currentHosts=${currentHosts.length}, hosts=${hosts.length}, participants=${participants.length}`);
    logger.debug(`去重后的参与者数量: ${paticipants.length}`);

    // 会议类型(0:一次性会议，1:周期性会议，2:微信专属会议，4:rooms 投屏会议，5:个人会议号会议， 6:网络研讨会)
    if (webhookMeetingInfo.meeting_type === 0 || webhookMeetingInfo.meeting_type === 2 || webhookMeetingInfo.meeting_type === 5 || webhookMeetingInfo.meeting_type === 6) {
        // 非周期会议通知
        if (paticipants.length > 0) {
            if (serverConfig.dingtalkTodoSwitch) {
                // 更新会议待办事项
                await updateMeetingTodo(creatorUnionid, meetingInfo, paticipants);
            }
            if (serverConfig.dingtalkCalendarSwitch) {
                // 更新会议日程
                await updateMeetingCalendar(creatorUnionid, meetingInfo, paticipants);
            }
        } else {
            logger.warn("待办通知跳过：没有有效的参会者UnionId");
        }
    } else if (webhookMeetingInfo.meeting_type === 1) {
        // 周期会议通过日程通知
        // sub_meeting_id存在的话代表只更新某一场子会议，钉钉日程不支持修改单次日程，此时不更新日程
        if (!webhookMeetingInfo.sub_meeting_id) {
            await updateMeetingCalendar(creatorUnionid, meetingInfo, paticipants);
        }
    }
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
    logger.debug(`处理会议取消事件: ${webhookMeetingInfo.meeting_id}`);

    var creatorUnionid = await getUnionIdByUserid(webhookMeetingInfo.creator.userid);
    if (!creatorUnionid) {
        logger.warn("未获取到unionid");
        return;
    }

    // 会议类型(0:一次性会议，1:周期性会议，2:微信专属会议，4:rooms 投屏会议，5:个人会议号会议， 6:网络研讨会)
    if (webhookMeetingInfo.meeting_type === 0 || webhookMeetingInfo.meeting_type === 2 || webhookMeetingInfo.meeting_type === 5 || webhookMeetingInfo.meeting_type === 6) {
        // 非周期会议通知
        if (serverConfig.dingtalkTodoSwitch) {
            // 删除会议待办事项
            await deleteMeetingTodo(creatorUnionid, webhookMeetingInfo.meeting_id);
        }
        if (serverConfig.dingtalkCalendarSwitch) {
            // 删除会议日程
            await deleteMeetingCalendar(creatorUnionid, webhookMeetingInfo.meeting_id);
        }
    } else if (webhookMeetingInfo.meeting_type === 1) {
        // 周期会议通过日程通知
        // sub_meeting_id存在的话代表只取消某一场子会议，钉钉日程不支持取消单次日程，此时不更新日程
        if (!webhookMeetingInfo.sub_meeting_id) {
            await deleteMeetingCalendar(creatorUnionid, webhookMeetingInfo.meeting_id);
        }
    }
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
    logger.debug(`处理会议结束事件: ${webhookMeetingInfo.meeting_id}`);

    if (webhookMeetingInfo.meeting_type === 1) {
        // 周期会议不更新
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

    // 会议结束时只删除待办，不删日程
    if (serverConfig.dingtalkTodoSwitch) {
        // 取消会议待办事项
        await deleteMeetingTodo(creatorUnionid, webhookMeetingInfo.meeting_id);
    }
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
    logger.debug(`处理录制完成事件: ${webhookMeetingInfo.meeting_id}`);
    const recordListResult = await queryMeetingRecordList(webhookMeetingInfo);
    if (!recordListResult) {
        logger.error("未获取到录制信息");
        return;
    }
    // 一场会议存在多个录制文件时，会发送多次录制完成事件，此时第一个文件可能还没生成完成，这里会取到空值，等后续事件再处理及可拿到文件地址
    const meetingRecordId = recordListResult.record_meetings[0].meeting_record_id;
    const recordAddressResult = await queryMeetingRecordAddress(meetingRecordId, webhookMeetingInfo.creator.userid);
    if (!recordAddressResult || recordAddressResult.total_count === 0) {
        logger.warn("未获取到录制地址");
        return;
    }
    const recordViewAddress = recordAddressResult.record_files[0].view_address;
    logger.debug("recordViewAddress: ", recordViewAddress);

    const participantsResult = await queryMeetingParticipants(webhookMeetingInfo.meeting_id, webhookMeetingInfo.creator.userid);
    if (!participantsResult) {
        logger.error("未获取到参会人员信息");
        return;
    }
    const participants = participantsResult.participants;

    // 收集有效的userid并去重
    const validUserIds = [...new Set(
        participants
            .filter(participant => participant && participant.userid)
            .map(participant => participant.userid)
    )];

    logger.debug(`录制分享 - 有效用户数: ${validUserIds.length}`);

    // 批量发送消息，每次最多20个
    const batchSize = 20;
    for (let i = 0; i < validUserIds.length; i += batchSize) {
        const batchUserIds = validUserIds.slice(i, i + batchSize);
        logger.debug(`录制分享 - 发送批次 ${Math.floor(i / batchSize) + 1}, 大小: ${batchUserIds.length}`);
        sendRecordViewAddressCardMessage(
            batchUserIds,
            webhookMeetingInfo.creator.user_name,
            webhookMeetingInfo,
            recordViewAddress
        )
    }
}

/**
 * 异步处理webhook事件的函数
 * @param {Object} eventData 解析后的事件数据
 */
async function processWebhookEvent(eventData) {
    try {
        logger.debug(`处理webhook事件: ${eventData.event}`);
        // 处理事件
        switch (eventData.event) {
            // 会议创建事件
            case 'meeting.created':
                logger.info('会议创建:', eventData);
                await webhookCreateMeeting(eventData);
                break;
            // 会议更新事件
            case 'meeting.updated':
                logger.info('会议更新:', eventData);
                await webhookUpdateMeeting(eventData);
                break;
            // 会议取消事件
            case 'meeting.canceled':
                logger.info('会议取消:', eventData);
                await webhookCancelMeeting(eventData);
                break;
            // 会议结束事件
            case 'meeting.end':
                logger.info('会议结束:', eventData);
                await webhookEndMeeting(eventData);
                break;
            // 云录制完成事件
            case 'recording.completed':
                logger.info('云录制完成:', eventData);
                await webhookRecordingCompleted(eventData);
                break;
            default:
                logger.warn(`不支持的事件类型: ${eventData.event}`);
        }
    } catch (error) {
        logger.error(`处理webhook事件失败 - ${eventData.event || 'Unknown'}`, error);
    }
}

/**
 * 处理POST事件回调
 * 快速返回响应，实际处理逻辑放入任务队列异步执行
 */
async function handleEvent(ctx) {
    try {
        // 首先进行限流检查
        if (!webhookRateLimiter.tryAcquire()) {
            logger.warn(`请求被限流，返回429状态码`);
            ctx.status = 429;
            ctx.body = { error: '请求过于频繁，请稍后再试', status: 'limited' };
            return;
        }

        const { data } = ctx.request.body;
        const { timestamp, nonce, signature } = ctx.headers;
        var result = '';

        if (!timestamp || !nonce || !signature) {
            logger.warn('缺少必要的请求头');
            ctx.throw(400, 'Missing required headers');
            return;
        }

        // 验证签名
        const isValid = verifySignature(timestamp, nonce, data, signature);
        if (!isValid) {
            logger.warn('签名验证失败');
            ctx.throw(403, 'Invalid signature');
            return;
        }

        // 解密check_str
        if (serverConfig.wemeetWebhookAESKey.length > 1) {
            result = decryptAES(data);
        } else {
            // base64解码
            result = Buffer.from(data, 'base64').toString('utf8');
        }

        // 解析JSON数据
        const eventData = JSON.parse(result);
        const eventType = eventData.event;

        // 立即返回成功响应，不再等待后续处理完成
        ctx.status = 200;
        ctx.body = 'successfully received callback';

        // 将事件处理放入任务队列异步执行
        webhookTaskQueue.addTask(
            () => processWebhookEvent(eventData),
            { eventType, timestamp }
        ).catch(error => {
            // 任务队列添加失败时记录错误
            logger.error(`将webhook事件添加到任务队列失败 - ${eventType}`, error);
        });
    } catch (error) {
        logger.error('Webhook请求处理失败', error);
        ctx.status = 500;
        ctx.body = `Event processing failed: ${error.message}`;
    }
}

export {
    handleVerification,
    handleEvent
};