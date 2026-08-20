import crypto from 'crypto';
import { logger } from '../util/logger.js';
import dbAdapter from '../db/db_adapter.js';

// AES-256-CBC 加密密钥（从 DINGTALK_CLIENT_SECRET 派生，或使用固定后备密钥）
const ENCRYPTION_KEY = crypto.scryptSync(
    process.env.DINGTALK_CLIENT_SECRET || 'dingtalk-meet-default-encryption-key',
    'salt',
    32
);
const IV_LENGTH = 16;
const CONFIG_DB_PREFIX = 'config:';

// 加密
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(String(text), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    // 格式：base64(iv + ciphertext)
    return Buffer.concat([iv, Buffer.from(encrypted, 'base64')]).toString('base64');
}

// 解密
function decrypt(encryptedText) {
    try {
        const rawData = Buffer.from(encryptedText, 'base64');
        const iv = rawData.slice(0, IV_LENGTH);
        const encryptedData = rawData.slice(IV_LENGTH).toString('base64');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        logger.error('解密配置失败:', error.message);
        return null;
    }
}

// 从 serverConfig 对象读取所有配置值并保存到数据库（加密）
// keyMap: { envVarName: serverConfigPropertyName }
export async function syncEnvToDatabase(serverConfig, keyMap) {
    logger.info('开始同步 .env 配置到数据库...');
    let syncedCount = 0;

    for (const [envKey, configKey] of Object.entries(keyMap)) {
        if (configKey === null || configKey === undefined) {
            // 前端变量，从 process.env 读取
            const value = process.env[envKey] || '';
            if (value) {
                await dbAdapter.dbSetConfig(CONFIG_DB_PREFIX + envKey, encrypt(value));
                syncedCount++;
            }
            continue;
        }

        // 后端变量，从 serverConfig 读取
        const value = serverConfig[configKey];
        if (value !== undefined && value !== '') {
            // 布尔值转为字符串
            const strValue = typeof value === 'boolean' ? String(value) : String(value);
            await dbAdapter.dbSetConfig(CONFIG_DB_PREFIX + envKey, encrypt(strValue));
            syncedCount++;
        }
    }

    logger.info(`同步完成，共 ${syncedCount} 个配置项写入数据库`);
}

// 从数据库读取所有配置值（解密）并更新 serverConfig 对象
export async function loadConfigFromDatabase(serverConfig, keyMap) {
    logger.info('从数据库加载配置到内存...');
    let loadedCount = 0;

    for (const [envKey, configKey] of Object.entries(keyMap)) {
        try {
            const encryptedValue = await dbAdapter.dbGetConfig(CONFIG_DB_PREFIX + envKey);
            if (encryptedValue === null || encryptedValue === undefined) {
                continue;
            }

            const decryptedValue = decrypt(encryptedValue);
            if (decryptedValue === null) {
                logger.warn(`解密失败: ${envKey}`);
                continue;
            }

            if (configKey === null || configKey === undefined) {
                // 前端变量，更新 process.env（不影响已构建的前端，但保持环境变量一致）
                process.env[envKey] = decryptedValue;
            } else {
                // 后端变量，根据原始类型转换后更新 serverConfig
                const currentValue = serverConfig[configKey];
                if (typeof currentValue === 'boolean') {
                    serverConfig[configKey] = decryptedValue === 'true';
                } else if (typeof currentValue === 'number') {
                    serverConfig[configKey] = isNaN(parseInt(decryptedValue)) ? currentValue : parseInt(decryptedValue);
                } else {
                    serverConfig[configKey] = decryptedValue;
                }
            }
            loadedCount++;
        } catch (error) {
            logger.warn(`加载配置 ${envKey} 失败:`, error.message);
        }
    }

    logger.info(`从数据库加载完成，共 ${loadedCount} 个配置项`);
}

// 从数据库读取所有配置值（解密），返回 key-value map（供管理页面使用）
export async function getAllConfigValues(keyMap) {
    const result = {};

    for (const envKey of Object.keys(keyMap)) {
        try {
            const encryptedValue = await dbAdapter.dbGetConfig(CONFIG_DB_PREFIX + envKey);
            if (encryptedValue !== null && encryptedValue !== undefined) {
                result[envKey] = decrypt(encryptedValue);
            }
        } catch (error) {
            logger.warn(`读取配置 ${envKey} 失败:`, error.message);
        }
    }

    return result;
}

// 保存配置到数据库（加密）并实时更新 serverConfig 内存对象
export async function saveConfigValues(serverConfig, keyMap, configs) {
    logger.info('保存配置到数据库并更新内存...');
    let savedCount = 0;

    for (const [envKey, value] of Object.entries(configs)) {
        const configKey = keyMap[envKey];

        // 加密保存到数据库
        await dbAdapter.dbSetConfig(CONFIG_DB_PREFIX + envKey, encrypt(value));

        // 实时更新 serverConfig 内存对象
        if (configKey !== null && configKey !== undefined) {
            const currentValue = serverConfig[configKey];
            if (typeof currentValue === 'boolean') {
                serverConfig[configKey] = value === 'true' || value === true;
            } else if (typeof currentValue === 'number') {
                serverConfig[configKey] = isNaN(parseInt(value)) ? currentValue : parseInt(value);
            } else {
                serverConfig[configKey] = String(value);
            }
        }

        // 更新 process.env
        process.env[envKey] = String(value);
        savedCount++;
    }

    logger.info(`保存完成，共 ${savedCount} 个配置项已更新并实时生效`);
    return savedCount;
}
