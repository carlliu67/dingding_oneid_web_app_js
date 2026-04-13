import { logger } from './logger.js';
import dbAdapter from '../db/db_adapter.js';
import serverConfig from '../config/server_config.js';

// 内存中存储的ADMIN_USERID
let adminUseridInMemory = null;

// 初始化ADMIN_USERID
async function initializeAdminUserid() {
  try {
    // 从数据库中获取ADMIN_USERID
    const dbAdminUserid = await dbAdapter.dbGetConfig('ADMIN_USERID');
    
    if (dbAdminUserid) {
      // 数据库中有值，使用数据库中的值
      adminUseridInMemory = dbAdminUserid;
      logger.info(`ADMIN_USERID initialized from database: ${adminUseridInMemory}`);
    } else {
      // 数据库中没有值，从配置文件中读取并保存到数据库
      const configAdminUserid = serverConfig.wemeetAdminUserID;
      if (configAdminUserid) {
        adminUseridInMemory = configAdminUserid;
        await dbAdapter.dbSetConfig('ADMIN_USERID', configAdminUserid);
        logger.info(`ADMIN_USERID initialized from config and saved to database: ${adminUseridInMemory}`);
      } else {
        logger.warn('ADMIN_USERID not found in database or config');
      }
    }
  } catch (error) {
    logger.error('Error initializing ADMIN_USERID:', error);
  }
}

// 获取当前使用的ADMIN_USERID（内存中的值）
function getAdminUserid() {
  return adminUseridInMemory;
}

// 更新ADMIN_USERID（同时更新内存和数据库）
async function updateAdminUserid(userid) {
  try {
    adminUseridInMemory = userid;
    await dbAdapter.dbSetConfig('ADMIN_USERID', userid);
    logger.info(`ADMIN_USERID updated to: ${userid}`);
  } catch (error) {
    logger.error('Error updating ADMIN_USERID:', error);
  }
}

export {
  initializeAdminUserid,
  getAdminUserid,
  updateAdminUserid
};
