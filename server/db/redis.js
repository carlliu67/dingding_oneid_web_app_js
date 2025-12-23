import { createClient } from 'redis';
import { logger } from '../util/logger.js';
import serverConfig from '../config/server_config.js';

let redisClient = null;

// 初始化Redis连接
export async function initRedis() {
    // 检查是否配置了Redis相关参数
    if (!serverConfig.redisHost) {
        logger.info('未配置Redis主机地址，跳过Redis初始化');
        return false;
    }
    
    try {
        redisClient = createClient({
            socket: {
                host: serverConfig.redisHost,
                port: serverConfig.redisPort
            },
            password: serverConfig.redisPassword || undefined,
            database: serverConfig.redisDb
        });

        redisClient.on('error', (err) => {
            logger.error('Redis Client Error:', err);
        });

        redisClient.on('connect', () => {
            logger.info('Redis Client Connected');
        });

        await redisClient.connect();
        logger.info('Redis连接初始化成功');
        return true;
    } catch (error) {
        logger.error('Redis初始化失败:', error);
        logger.warn('系统将在没有Redis的情况下继续运行');
        redisClient = null;
        return false;
    }
}

// 获取Redis客户端
export function getRedisClient() {
    return redisClient;
}

// 关闭Redis连接
export async function closeRedis() {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        logger.info('Redis连接已关闭');
    }
}

// 生成Redis键名
export function getRedisKey(key) {
    return `${serverConfig.redisKeyPrefix || 'dingtalk:'}${key}`;
}

// 存储用户鉴权信息到Redis
export async function setUserAuthToRedis(userid, userInfo) {
    if (!redisClient) {
        logger.debug('Redis客户端未初始化，跳过存储操作');
        return false;
    }

    try {
        const key = getRedisKey(`user_auth:${userid}`);
        await redisClient.setEx(key, serverConfig.redisUserAuthExpire || 3600, JSON.stringify(userInfo));
        logger.debug(`用户${userid}的鉴权信息已存储到Redis`);
        return true;
    } catch (error) {
        logger.error('存储用户鉴权信息到Redis失败:', error);
        return false;
    }
}

// 从Redis获取用户鉴权信息
export async function getUserAuthFromRedis(userid) {
    if (!redisClient) {
        logger.debug('Redis客户端未初始化，跳过查询操作');
        return null;
    }

    try {
        const key = getRedisKey(`user_auth:${userid}`);
        const userInfo = await redisClient.get(key);
        
        if (userInfo) {
            logger.debug(`从Redis获取用户${userid}的鉴权信息成功`);
            return JSON.parse(userInfo);
        }
        
        logger.debug(`Redis中未找到用户${userid}的鉴权信息`);
        return null;
    } catch (error) {
        logger.error('从Redis获取用户鉴权信息失败:', error);
        return null;
    }
}

// 删除Redis中的用户鉴权信息
export async function deleteUserAuthFromRedis(userid) {
    if (!redisClient) {
        logger.debug('Redis客户端未初始化，跳过删除操作');
        return false;
    }

    try {
        const key = getRedisKey(`user_auth:${userid}`);
        await redisClient.del(key);
        logger.debug(`已删除Redis中用户${userid}的鉴权信息`);
        return true;
    } catch (error) {
        logger.error('删除Redis中用户鉴权信息失败:', error);
        return false;
    }
}