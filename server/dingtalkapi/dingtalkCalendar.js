import axios from 'axios';
import { logger } from '../util/logger.js';
import { convertSecondsToISO, genH5AppLink, getInterAccessToken } from './dingtalkUtil.js';
import { dbInsertCalendar, dbDeleteCalendarByMeetingid, dbGetCalendarByMeetingid } from '../db/sqlite.js';

/*
 * 腾讯会议RecurringRule → 钉钉日程recurrence转换
 * @param {Object} txRule - 腾讯会议RecurringRule对象
 * @returns {Object} 钉钉日程recurrence对象
 */
function convertRecurrence(txRule) {
  // 1. 基础类型映射
  const typeMap = {
    0: "daily",      // 每天
    1: "weekly",     // 每周一至周五
    2: "weekly",     // 每周
    3: "weekly",     // 每两周
    4: "absoluteMonthly", // 每月
    5: "custom"      // 自定义
  };

  // 2. 基础结构
  const dingRecurrence = {
    pattern: {
      type: typeMap[txRule.recurring_type] || "daily",
      interval: txRule.recurring_type === 3 ? 2 : 1, // 每两周特殊处理
      dayOfMonth: txRule.recurring_type === 4 ? new Date(txRule.meeting_start_time * 1000).getDate() : null
    },
    range: {
      type: "noEnd" // 默认无结束日期
    }
  };

  // 3. 处理类型1（每周一至周五）
  if (txRule.recurring_type === 1) {
    dingRecurrence.pattern.daysOfWeek = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  }

  // 4. 结束条件处理
  if (txRule.until_type === 0) { // 按日期结束
    dingRecurrence.range.type = "endDate";
    dingRecurrence.range.endDate = new Date(txRule.until_date * 1000).toISOString();
  } else if (txRule.until_type === 1) { // 按次数结束
    dingRecurrence.range.type = "numbered";
    dingRecurrence.range.numberOfOccurrences = txRule.until_count;
  }

  // 5. 自定义规则处理（腾讯type=5）
  if (txRule.recurring_type === 5) {
    const customMap = {
      0: "daily",          // 按天重复
      1: "weekly",         // 按周重复
      2: "relativeMonthly", // 按月以周为粒度
      3: "absoluteMonthly" // 按月以日期为粒度
    };
    
    dingRecurrence.pattern.type = customMap[txRule.customized_recurring_type] || "daily";
    dingRecurrence.pattern.interval = txRule.customized_recurring_step;
    
    // 按周重复（每周重复）
    if (txRule.customized_recurring_type === 1) {
      dingRecurrence.pattern.daysOfWeek = parseWeekDays(txRule.customized_recurring_days);
    }
    
    // 按月重复（按周方式）
    if (txRule.customized_recurring_type === 2) {
      dingRecurrence.pattern.index = parseWeekIndex(txRule.customized_recurring_days);
      dingRecurrence.pattern.daysOfWeek = parseWeekDays(txRule.customized_recurring_days);
    }
    
    // 按月重复（按日期方式）
    if (txRule.customized_recurring_type === 3) {
      dingRecurrence.pattern.dayOfMonth = new Date(txRule.meeting_start_time * 1000).getDate();
    }
  }

  return dingRecurrence;
}

/**
 * 解析腾讯会议的周次索引
 * @param {number} daysValue - 腾讯会议的customized_recurring_days值
 * @returns {string} 钉钉日程的周次索引
 */
function parseWeekIndex(daysValue) {
  // 周次标志位定义
  const WEEK_OCCURRENCE_FLAGS = {
    128: "first",   // 第一周
    256: "second",  // 第二周
    512: "third",   // 第三周
    1024: "fourth", // 第四周
    2048: "last"    // 最后一周
  };
  
  // 检查并返回第一个匹配的周次
  for (const [flag, index] of Object.entries(WEEK_OCCURRENCE_FLAGS)) {
    const flagValue = parseInt(flag);
    if ((daysValue & flagValue) === flagValue) {
      return index;
    }
  }
  
  // 默认值（如无匹配则使用第一周）
  return "first";
}

/**
 * 解析腾讯会议的星期几
 * @param {number} daysValue - 腾讯会议的customized_recurring_days值
 * @returns {Array} 钉钉日程的星期几数组
 */
function parseWeekDays(daysValue) {
  // 星期标志位定义（低7位）
  const WEEK_DAY_FLAGS = {
    1: "monday",    // 周一（2^0）
    2: "tuesday",   // 周二（2^1）
    4: "wednesday", // 周三（2^2）
    8: "thursday",  // 周四（2^3）
    16: "friday",   // 周五（2^4）
    32: "saturday", // 周六（2^5）
    64: "sunday"    // 周日（2^6）
  };
  
  // 提取星期几信息（过滤掉周次的高5位）
  const weekDaysValue = daysValue & 127; // 127 = 0x7F (01111111)
  
  // 解析匹配的星期几
  const matchedDays = [];
  for (const [flag, day] of Object.entries(WEEK_DAY_FLAGS)) {
    const flagValue = parseInt(flag);
    if ((weekDaysValue & flagValue) === flagValue) {
      matchedDays.push(day);
    }
  }
  
  return matchedDays;
}

// 创建日程
async function createMeetingCalendar(creatorUnionId, meetingInfo, attendees) {
    // logger.info(meetingInfo);
    const access_token = await getInterAccessToken();
    if (!access_token) {
        logger.error("获取access_token失败");
        return;
    }
    var body = null;
    const url = genH5AppLink("?meetingCode=" + meetingInfo.meeting_code);
    logger.info("url: ", url);

    const calendarAttendees = attendees.map(attendee => ({
        id: attendee,
        isOptional: false
    }));

    // 周期会议要转换重复规则，
    // 会议类型:   
    // 0：一次性会议
    // 1：周期性会议
    // 2：微信专属会议
    // 4：Rooms 投屏会议
    // 5：个人会议号会议
    // 6：网络研讨会
    if (meetingInfo.meeting_type === 1) {
        var dingRecurrence = convertRecurrence(meetingInfo.recurring_rule);
        body = {
                summary: meetingInfo.subject,
                start: {
                    dateTime: convertSecondsToISO(meetingInfo.start_time),
                    timeZone: "Asia/Shanghai"
                },
                end: {
                    dateTime: convertSecondsToISO(meetingInfo.end_time),
                    timeZone: "Asia/Shanghai"
                },
                recurrence: dingRecurrence,
                attendees: calendarAttendees,
                richTextDescription: {
                    text: `<a href="${url}" target="_blank">加入会议</a>`
                }
            }
    } else {
        body = {
                summary: meetingInfo.subject,
                start: {
                    dateTime: convertSecondsToISO(meetingInfo.start_time),
                    timeZone: "Asia/Shanghai"
                },
                end: {
                    dateTime: convertSecondsToISO(meetingInfo.end_time),
                    timeZone: "Asia/Shanghai"
                },
                attendees: calendarAttendees,
                richTextDescription: {
                    text: `<a href="${url}" target="_blank">加入会议</a>`
                }
            }
    }

    try {
        const internalRes = await axios.post(
            `https://api.dingtalk.com/v1.0/calendar/users/${creatorUnionId}/calendars/primary/events`,
            body,
            {
                headers: {
                    "Content-Type": "application/json",
                    "x-acs-dingtalk-access-token": access_token
                }
            }
        );

        if (internalRes.status === 200 && internalRes.data) {
            logger.info("createTodo result: ", internalRes.data);
            // 插入日程数据库
            await dbInsertCalendar(meetingInfo.meeting_id, internalRes.data.id, creatorUnionId, meetingInfo.start_time);
            logger.info("创建会议日程成功，meetingid:", meetingInfo.meeting_id);
        } else {
            logger.error(`创建日程失败：状态码=${internalRes.status}, 错误信息=${JSON.stringify(internalRes.data)}`);
        }

    } catch (error) {
        logger.error("创建日程请求失败：", error.response ? error.response.data : error.message);
    }
}

// 更新日程
async function updateMeetingCalendar(creatorUnionId, meetingInfo, attendees) {
    // logger.info(meetingInfo);
    // 从数据库查询日程信息
    const calendarInfo = await dbGetCalendarByMeetingid(meetingInfo.meeting_id);
    if (!calendarInfo) {
        logger.error("更新日程失败，日程不存在")
        return
    }
    const access_token = await getInterAccessToken();
    if (!access_token) {
        logger.error("获取access_token失败");
        return;
    }
    var body = null;
    const url = genH5AppLink("?meetingCode=" + meetingInfo.meeting_code);
    logger.info("url: ", url);

    const calendarAttendees = attendees.map(attendee => ({
        id: attendee,
        isOptional: false
    }));

    // 周期会议要转换重复规则，
    // 会议类型:   
    // 0：一次性会议
    // 1：周期性会议
    // 2：微信专属会议
    // 4：Rooms 投屏会议
    // 5：个人会议号会议
    // 6：网络研讨会
    if (meetingInfo.meeting_type === 1) {
        var dingRecurrence = convertRecurrence(meetingInfo.recurring_rule);
        body = {
                summary: meetingInfo.subject,
                id: calendarInfo.scheduleId,
                start: {
                    dateTime: convertSecondsToISO(meetingInfo.start_time),
                    timeZone: "Asia/Shanghai"
                },
                end: {
                    dateTime: convertSecondsToISO(meetingInfo.end_time),
                    timeZone: "Asia/Shanghai"
                },
                recurrence: dingRecurrence,
                attendees: calendarAttendees,
                richTextDescription: {
                    text: `<a href="${url}" target="_blank">加入会议</a>`
                }
            }
    } else {
        body = {
                summary: meetingInfo.subject,
                id: calendarInfo.scheduleId,
                start: {
                    dateTime: convertSecondsToISO(meetingInfo.start_time),
                    timeZone: "Asia/Shanghai"
                },
                end: {
                    dateTime: convertSecondsToISO(meetingInfo.end_time),
                    timeZone: "Asia/Shanghai"
                },
                attendees: calendarAttendees,
                richTextDescription: {
                    text: `<a href="${url}" target="_blank">加入会议</a>`
                }
            }
    }

    try {
        const internalRes = await axios.put(
            `https://api.dingtalk.com/v1.0/calendar/users/${creatorUnionId}/calendars/primary/events/${calendarInfo.scheduleId}`,
            body,
            {
                headers: {
                    "Content-Type": "application/json",
                    "x-acs-dingtalk-access-token": access_token
                }
            }
        );

        // 判断返回的数据是否有效，一般看是否有errcode或者直接看业务字段
        if (!internalRes.data) {
            logger.error("更新日程失败：返回数据为空");
            return;
        }

        // 可选：根据钉钉API实际返回结构判断是否真正成功，比如有的接口会返回 errcode: 0 表示成功
        logger.info("更新日程成功：", internalRes.data);

    } catch (error) {
        logger.error("更新日程请求失败：", error.response ? error.response.data : error.message);
    }
}

// 删除日程
async function deleteMeetingCalendar(creatorUnionId, meetingid) {
    // logger.info(meetingInfo);
    // 从数据库查询日程信息
    const calendarInfo = await dbGetCalendarByMeetingid(meetingid);
    if (!calendarInfo) {
        logger.error("删除日程失败，日程不存在")
        return
    }
    const access_token = await getInterAccessToken();
    if (!access_token) {
        logger.error("获取access_token失败");
        return;
    }

    try {
        const internalRes = await axios.delete(
            `https://api.dingtalk.com/v1.0/calendar/users/${creatorUnionId}/calendars/primary/events/${calendarInfo.scheduleId}`,
            {
                headers: {
                    "Content-Type": "application/json",
                    "x-acs-dingtalk-access-token": access_token
                }
            }
        );

        if (internalRes.status === 200 && internalRes.data) {
            logger.info("deleteMeetingCalendar result: ", internalRes.data);
            // 从数据库删除日程信息
            await dbDeleteCalendarByMeetingid(meetingid);
            logger.info("删除会议日程成功，meetingid:", meetingid);
        } else {
            logger.error(`删除日程失败：状态码=${internalRes.status}, 错误信息=${JSON.stringify(internalRes.data)}`);
        }

    } catch (error) {
        logger.error("删除日程请求失败：", error.response ? error.response.data : error.message);
    }
}

export {
    createMeetingCalendar,
    updateMeetingCalendar,
    deleteMeetingCalendar
};