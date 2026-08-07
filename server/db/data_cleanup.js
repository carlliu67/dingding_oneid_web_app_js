import serverConfig from '../config/server_config.js';
import { logger } from '../util/logger.js';
import dbAdapter from './db_adapter.js';

let cleanupTimer = null;
let isRunning = false;

/**
 * 执行一次数据清理
 * 根据配置清理过期的 idToken、todo、calendar、用户信息记录
 */
async function runCleanup() {
    if (isRunning) {
        logger.debug('数据清理任务正在执行中，跳过本次触发');
        return;
    }
    isRunning = true;
    logger.info('========== 数据定时清理任务开始 ==========');
    const startTime = Date.now();
    let totalDeleted = 0;

    try {
        // 1. 清理已过期的 idToken 记录
        if (serverConfig.idTokenCleanupEnabled) {
            try {
                const deleted = await dbAdapter.dbCleanupExpiredIdTokens();
                totalDeleted += deleted || 0;
            } catch (err) {
                logger.error('清理过期idToken时出错:', err.message);
            }
        }

        // 2. 清理超过保留期的 todo 记录
        if (serverConfig.todoRetentionDays > 0) {
            try {
                const retentionSeconds = serverConfig.todoRetentionDays * 24 * 3600;
                const deleted = await dbAdapter.dbCleanupOldTodos(retentionSeconds);
                totalDeleted += deleted || 0;
            } catch (err) {
                logger.error('清理过期todo时出错:', err.message);
            }
        }

        // 3. 清理超过保留期的 calendar 记录
        if (serverConfig.calendarRetentionDays > 0) {
            try {
                const retentionSeconds = serverConfig.calendarRetentionDays * 24 * 3600;
                const deleted = await dbAdapter.dbCleanupOldCalendars(retentionSeconds);
                totalDeleted += deleted || 0;
            } catch (err) {
                logger.error('清理过期calendar时出错:', err.message);
            }
        }

        // 4. 清理超过保留期的用户信息记录（依据最后登录时间）
        if (serverConfig.userinfoRetentionDays > 0) {
            try {
                const retentionSeconds = serverConfig.userinfoRetentionDays * 24 * 3600;
                const deleted = await dbAdapter.dbCleanupOldUserinfos(retentionSeconds);
                totalDeleted += deleted || 0;
            } catch (err) {
                logger.error('清理过期用户信息时出错:', err.message);
            }
        }

        const elapsed = Date.now() - startTime;
        logger.info(`========== 数据定时清理任务完成，共删除 ${totalDeleted} 条记录，耗时 ${elapsed}ms ==========`);
    } catch (err) {
        logger.error('数据定时清理任务异常:', err.message);
    } finally {
        isRunning = false;
    }
}

/**
 * 计算到下一个定时清理执行时间点的延迟毫秒数
 * 使用北京时间（UTC+8）作为基准，不受容器/系统时区影响
 * @returns {number} 延迟毫秒数
 */
function getNextCleanupDelay() {
    const cleanupTime = serverConfig.dataCleanupTime || '02:00';
    const match = /^(\d{1,2}):(\d{2})$/.exec(cleanupTime);
    if (!match) {
        logger.warn(`dataCleanupTime 格式非法: "${cleanupTime}"，回退为默认值 02:00`);
    }
    const targetHours = match ? parseInt(match[1], 10) : 2;
    const targetMinutes = match ? parseInt(match[2], 10) : 0;
    const beijingOffset = 8 * 3600000; // UTC+8 毫秒

    const now = new Date();
    // 将当前 UTC 时间偏移为北京时间表示（时间戳 +8h，用 UTC 方法操作等同于北京时间）
    const nowBeijing = new Date(now.getTime() + beijingOffset);
    const nextBeijing = new Date(nowBeijing);
    nextBeijing.setUTCHours(targetHours, targetMinutes, 0, 0);

    // 如果今天的目标时间已过，则顺延到明天
    if (nextBeijing.getTime() <= nowBeijing.getTime()) {
        nextBeijing.setUTCDate(nextBeijing.getUTCDate() + 1);
    }

    // 将北京时间目标时间戳还原为实际 UTC 时间戳，计算延迟
    const nextUTC = nextBeijing.getTime() - beijingOffset;
    return nextUTC - now.getTime();
}

/**
 * 将毫秒数格式化为可读的时间描述
 * @param {number} ms 毫秒数
 * @returns {string} 可读时间描述，如 "8小时32分10秒"
 */
function formatDelay(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}小时${minutes}分${seconds}秒`;
}

/**
 * 启动数据定时清理调度器
 * 每日在配置的 dataCleanupTime（默认凌晨2点）执行清理任务
 * @returns {NodeJS.Timeout} 定时器句柄，可用于停止调度
 */
function startCleanupScheduler() {
    if (!serverConfig.dataCleanupEnabled) {
        logger.info('数据定时清理功能未启用（DATA_CLEANUP_ENABLED=false）');
        return null;
    }

    const cleanupTime = serverConfig.dataCleanupTime || '02:00';
    logger.info(`数据定时清理调度器已启动，每日执行时间: 北京时间 ${cleanupTime}`);
    logger.info(`清理配置 - idToken清理: ${serverConfig.idTokenCleanupEnabled ? '启用' : '禁用'}, ` +
        `todo保留: ${serverConfig.todoRetentionDays}天, ` +
        `calendar保留: ${serverConfig.calendarRetentionDays}天, ` +
        `用户信息保留: ${serverConfig.userinfoRetentionDays}天`);

    // 递归调度：每次执行后重新计算到下一个时间点的延迟，避免长时间运行产生时间漂移
    function scheduleNext() {
        const delay = getNextCleanupDelay();
        const nextBeijingTime = new Date(Date.now() + delay + 8 * 3600000);
        const bjStr = nextBeijingTime.toISOString().replace('T', ' ').substring(0, 19);
        logger.info(`下次数据清理将在北京时间 ${bjStr} 执行（${formatDelay(delay)}后）`);

        cleanupTimer = setTimeout(async () => {
            await runCleanup();
            // 清理完成后调度下一次
            scheduleNext();
        }, delay);
    }

    scheduleNext();
    return cleanupTimer;
}

/**
 * 停止数据定时清理调度器
 */
function stopCleanupScheduler() {
    if (cleanupTimer) {
        clearTimeout(cleanupTimer);
        cleanupTimer = null;
        logger.info('数据定时清理调度器已停止');
    }
}

export { runCleanup, startCleanupScheduler, stopCleanupScheduler };
