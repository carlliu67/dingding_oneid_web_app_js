import mysql from 'mysql2/promise';
import { logger } from '../util/logger.js';
import config from '../config/server_config.js';

// MySQL连接配置
const dbConfig = {
  host: process.env.MYSQL_HOST || config.dbHost,
  port: process.env.MYSQL_PORT || config.dbPort || 3306, // 添加端口配置，使用环境变量或配置文件中的端口，默认3306
  user: process.env.MYSQL_USER || config.dbUser,
  password: process.env.MYSQL_PASSWORD || config.dbPassword,
  database: process.env.MYSQL_DATABASE || config.dbDatabase,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 创建连接池
let pool = null;

// 初始化数据库连接池
async function initDatabase() {
  if (!pool) {
    try {
      pool = mysql.createPool(dbConfig);
      logger.info('MySQL connection pool created successfully');
      
      // 创建所有必要的表
      await createTables();
      
    } catch (err) {
      logger.error('Error creating MySQL connection pool:', err.message);
      throw err;
    }
  }
  return pool;
}

// 安全创建索引（索引已存在时静默跳过）
async function createIndexIfNotExists(connection, indexName, tableName, columnName) {
  try {
    await connection.query(`CREATE INDEX ${indexName} ON ${tableName}(${columnName})`);
    logger.info(`Index "${indexName}" created on ${tableName}(${columnName}).`);
  } catch (err) {
    // 索引已存在时会报错，属于正常情况
    logger.debug(`Index ${indexName} already exists or creation skipped:`, err.message);
  }
}

// 创建所有必要的表
async function createTables() {
  const connection = await pool.getConnection();
  
  try {
    // 创建idtoken表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS idtoken_users (
        userid VARCHAR(255) PRIMARY KEY,
        idToken TEXT NOT NULL,
        expired DATETIME NOT NULL
      )
    `);
    logger.info('Table "idtoken_users" created successfully');
    // 为定时清理字段创建索引
    await createIndexIfNotExists(connection, 'idx_idtoken_expired', 'idtoken_users', 'expired');
    
    // 创建userinfo表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        userid VARCHAR(255) PRIMARY KEY,
        unionid VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        lastupdatetime DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    logger.info('Table "users" created successfully');
    // 兼容旧表：若 lastupdatetime 列不存在则添加
    try {
      await connection.query(`ALTER TABLE users ADD COLUMN lastupdatetime DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
      logger.info('Column "lastupdatetime" added to table "users".');
    } catch (alterErr) {
      // 列已存在时会报错，属于正常情况
      logger.debug('Column lastupdatetime already exists:', alterErr.message);
    }
    // 为定时清理字段创建索引
    await createIndexIfNotExists(connection, 'idx_users_lastupdatetime', 'users', 'lastupdatetime');
    
    // 创建todo表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS todo (
        meetingid VARCHAR(255) PRIMARY KEY,
        taskid VARCHAR(255) NOT NULL,
        unionid VARCHAR(255) NOT NULL,
        createtimestamp BIGINT NOT NULL
      )
    `);
    logger.info('Table "todo" created successfully');
    // 为定时清理字段创建索引
    await createIndexIfNotExists(connection, 'idx_todo_createtimestamp', 'todo', 'createtimestamp');
    
    // 创建calendar表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS calendar (
        meetingid VARCHAR(255) PRIMARY KEY,
        scheduleId VARCHAR(255) NOT NULL,
        unionid VARCHAR(255) NOT NULL,
        createtimestamp BIGINT NOT NULL
      )
    `);
    logger.info('Table "calendar" created successfully');
    // 为定时清理字段创建索引
    await createIndexIfNotExists(connection, 'idx_calendar_createtimestamp', 'calendar', 'createtimestamp');

    // 创建config表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS config (
        config_key VARCHAR(255) PRIMARY KEY,
        value VARCHAR(255) NOT NULL
      )
    `);
    logger.info('Table "config" created successfully');
    
  } catch (err) {
    logger.error('Error creating tables:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 获取数据库连接
async function getConnection() {
  if (!pool) {
    await initDatabase();
  }
  return pool.getConnection();
}

// idtoken相关操作方法

// 插入或更新idtoken数据
async function dbInsertIdToken(userid, idToken, expired) {
  const connection = await getConnection();
  try {
    // 将时间戳转换为MySQL日期时间格式
    const expiredDate = typeof expired === 'number' ? new Date(expired * 1000) : expired;
    const mysqlDateTime = expiredDate.toISOString().slice(0, 19).replace('T', ' ');
    
    const [result] = await connection.execute(
      'INSERT INTO idtoken_users (userid, idToken, expired) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE idToken = VALUES(idToken), expired = VALUES(expired)',
      [userid, idToken, mysqlDateTime]
    );
    logger.debug(`dbInsertIdToken inserted/replaced userid: ${userid}, expired: ${mysqlDateTime} successfully`);
    return 'dbInsertIdToken inserted/replaced successfully';
  } catch (err) {
    logger.error('dbInsertIdToken failed:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 删除idtoken数据
async function dbDeleteIdToken(userid) {
  const connection = await getConnection();
  try {
    const [result] = await connection.execute(
      'DELETE FROM idtoken_users WHERE userid = ?',
      [userid]
    );
    logger.debug(`Data deleted userid: ${userid}`);
    return 'Data deleted successfully';
  } catch (err) {
    logger.error('dbDeleteIdToken failed:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 获取idtoken数据
async function dbGetIdToken(userid) {
  if (!userid) {
    throw new Error('Error: userid is required');
  }
  const connection = await getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT userid, idToken, expired FROM idtoken_users WHERE userid = ?',
      [userid]
    );
    
    if (rows.length > 0) {
      // 将MySQL日期时间格式转换回时间戳，保持接口一致性
      const result = {...rows[0]};
      if (result.expired) {
        result.expired = Math.floor(new Date(result.expired).getTime() / 1000);
      }
      logger.debug(`dbGetIdToken: ${userid}`);
      return result;
    } else {
      logger.debug(`dbGetIdToken: User not found for userid: ${userid}`);
      return null;
    }
  } catch (err) {
    logger.error('dbGetIdToken failed:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// userinfo相关操作方法

// 插入userinfo数据
async function dbInsertUserinfo(userid, unionid, name) {
  const connection = await getConnection();
  try {
    const [result] = await connection.execute(
      'INSERT INTO users (userid, unionid, name, lastupdatetime) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE unionid = VALUES(unionid), name = VALUES(name), lastupdatetime = NOW()',
      [userid, unionid, name]
    );
    logger.debug(`dbInsertUserinfo userid: ${userid}, unionid: ${unionid}, name: ${name} inserted successfully`);
    return 'dbInsertUserinfo inserted successfully';
  } catch (err) {
    logger.error('dbInsertUserinfo failed:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 根据userid查询userinfo数据
async function dbGetUserinfoByUserid(userid) {
  if (!userid) {
    throw new Error('Error: userid is required');
  }
  const connection = await getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT userid, unionid, name FROM users WHERE userid = ?',
      [userid]
    );
    
    if (rows.length > 0) {
      logger.debug(`查询用户信息成功: ${userid}`);
      return rows[0];
    } else {
      logger.debug(`未找到用户: ${userid}`);
      return null;
    }
  } catch (err) {
    logger.error('查询用户信息失败:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 根据unionid查询userinfo数据
async function dbGetUserinfoByUnionid(unionid) {
  if (!unionid) {
    throw new Error('Error: unionid is required');
  }
  const connection = await getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT userid, unionid, name FROM users WHERE unionid = ?',
      [unionid]
    );
    
    if (rows.length > 0) {
      logger.debug(`dbGetUserinfoByUnionid: ${unionid} ${JSON.stringify(rows[0])}`);
      return rows[0];
    } else {
      logger.debug(`dbGetUserinfoByUnionid 未找到 unionid 对应的用户: ${unionid}`);
      return null;
    }
  } catch (err) {
    logger.error('dbGetUserinfoByUnionid 查询失败:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 更新用户最后登录时间（用于定期清理判断，仅更新已存在的记录）
async function dbUpdateUserLoginTime(userid) {
  const connection = await getConnection();
  try {
    const [result] = await connection.execute(
      'UPDATE users SET lastupdatetime = NOW() WHERE userid = ?',
      [userid]
    );
    logger.debug(`dbUpdateUserLoginTime userid: ${userid}, affected: ${result.affectedRows}`);
    return result.affectedRows;
  } catch (err) {
    logger.error('dbUpdateUserLoginTime failed:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// todo相关操作方法

// 插入todo数据
async function dbInsertTodo(meetingid, taskid, unionid, createtimestamp) {
  const connection = await getConnection();
  try {
    // 确保createtimestamp是数字类型
    const timestamp = typeof createtimestamp === 'number' ? createtimestamp : parseInt(createtimestamp);
    
    const [result] = await connection.execute(
      'INSERT INTO todo (meetingid, taskid, unionid, createtimestamp) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE taskid = VALUES(taskid), unionid = VALUES(unionid), createtimestamp = VALUES(createtimestamp)',
      [meetingid, taskid, unionid, timestamp]
    );
    logger.debug(`dbInsertTodo taskid: ${taskid}, unionid: ${unionid}, meetingid: ${meetingid}, createtimestamp: ${timestamp} inserted successfully`);
    return 'dbInsertTodo inserted successfully';
  } catch (err) {
    logger.error('dbInsertTodo failed:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 根据meetingid查询todo数据
async function dbGetTodoByMeetingid(meetingid) {
  if (!meetingid) {
    throw new Error('Error: meetingid is required');
  }
  const connection = await getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT meetingid, taskid, unionid, createtimestamp FROM todo WHERE meetingid = ?',
      [meetingid]
    );
    
    if (rows.length > 0) {
      // 确保createtimestamp是数字类型，保持接口一致性
      const result = {...rows[0]};
      if (result.createtimestamp !== undefined) {
        result.createtimestamp = Number(result.createtimestamp);
      }
      logger.debug(`查询待办信息成功: ${meetingid}`);
      return result;
    } else {
      logger.debug(`未找到待办信息: ${meetingid}`);
      return null;
    }
  } catch (err) {
    logger.error('查询待办信息失败:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 删除todo数据
async function dbDeleteTodoByMeetingid(meetingid) {
  if (!meetingid) {
    throw new Error('Error: meetingid is required');
  }
  const connection = await getConnection();
  try {
    const [result] = await connection.execute(
      'DELETE FROM todo WHERE meetingid = ?',
      [meetingid]
    );
    logger.debug(`Data deleted meetingid: ${meetingid}`);
    return 'Data deleted successfully';
  } catch (err) {
    logger.error('dbDeleteTodoByMeetingid failed:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// calendar相关操作方法

// 插入calendar数据
async function dbInsertCalendar(meetingid, scheduleId, unionid, createtimestamp) {
  const connection = await getConnection();
  try {
    // 确保createtimestamp是数字类型
    const timestamp = typeof createtimestamp === 'number' ? createtimestamp : parseInt(createtimestamp);
    
    const [result] = await connection.execute(
      'INSERT INTO calendar (meetingid, scheduleId, unionid, createtimestamp) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE scheduleId = VALUES(scheduleId), unionid = VALUES(unionid), createtimestamp = VALUES(createtimestamp)',
      [meetingid, scheduleId, unionid, timestamp]
    );
    logger.debug(`dbInsertCalendar scheduleId: ${scheduleId}, unionid: ${unionid}, meetingid: ${meetingid}, createtimestamp: ${timestamp} inserted successfully`);
    return 'dbInsertCalendar inserted successfully';
  } catch (err) {
    logger.error('dbInsertCalendar failed:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 根据meetingid查询calendar数据
async function dbGetCalendarByMeetingid(meetingid) {
  if (!meetingid) {
    throw new Error('Error: meetingid is required');
  }
  const connection = await getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT meetingid, scheduleId, unionid, createtimestamp FROM calendar WHERE meetingid = ?',
      [meetingid]
    );
    
    if (rows.length > 0) {
      // 确保createtimestamp是数字类型，保持接口一致性
      const result = {...rows[0]};
      if (result.createtimestamp !== undefined) {
        result.createtimestamp = Number(result.createtimestamp);
      }
      logger.debug(`查询日历信息成功: ${meetingid}`);
      return result;
    } else {
      logger.debug(`未找到日历信息: ${meetingid}`);
      return null;
    }
  } catch (err) {
    logger.error('查询日历信息失败:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 删除calendar数据
async function dbDeleteCalendarByMeetingid(meetingid) {
  if (!meetingid) {
    throw new Error('Error: meetingid is required');
  }
  const connection = await getConnection();
  try {
    const [result] = await connection.execute(
      'DELETE FROM calendar WHERE meetingid = ?',
      [meetingid]
    );
    logger.debug(`Calendar data deleted meetingid: ${meetingid}`);
    return 'Calendar data deleted successfully';
  } catch (err) {
    logger.error('dbDeleteCalendarByMeetingid failed:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 获取配置值
async function dbGetConfig(key) {
  const connection = await getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT value FROM config WHERE config_key = ?',
      [key]
    );
    
    if (rows.length > 0) {
      logger.debug(`查询配置成功: ${key} = ${rows[0].value}`);
      return rows[0].value;
    } else {
      logger.debug(`未找到配置: ${key}`);
      return null;
    }
  } catch (err) {
    logger.error('查询配置失败:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 设置配置值
async function dbSetConfig(key, value) {
  const connection = await getConnection();
  try {
    const [result] = await connection.execute(
      'INSERT INTO config (config_key, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [key, value]
    );
    logger.debug(`设置配置成功: ${key} = ${value}`);
    return '配置设置成功';
  } catch (err) {
    logger.error('设置配置失败:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// ==================== 数据定时清理函数 ====================
// 分批删除配置：每批最多删除1000条，单次清理最多执行100批（10万条），避免长时间锁表
const CLEANUP_BATCH_SIZE = 1000;
const CLEANUP_MAX_BATCHES = 100;

// 清理已过期的 idToken 记录（分批删除）
// 注意：expired 字段以 UTC 时间字符串存储（dbInsertIdToken 使用 toISOString），
// 因此此处使用 UTC_TIMESTAMP() 而非 NOW()，避免服务器时区非 UTC 时清理失效
async function dbCleanupExpiredIdTokens() {
  const connection = await getConnection();
  try {
    let totalDeleted = 0;
    for (let i = 0; i < CLEANUP_MAX_BATCHES; i++) {
      const [result] = await connection.query(
        'DELETE FROM idtoken_users WHERE expired < UTC_TIMESTAMP() LIMIT ?',
        [CLEANUP_BATCH_SIZE]
      );
      totalDeleted += result.affectedRows;
      if (result.affectedRows < CLEANUP_BATCH_SIZE) break;
    }
    logger.info(`清理过期idToken完成，删除 ${totalDeleted} 条记录`);
    return totalDeleted;
  } catch (err) {
    logger.error('清理过期idToken失败:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 清理超过保留期的 todo 记录（分批删除）
async function dbCleanupOldTodos(retentionSeconds) {
  const connection = await getConnection();
  try {
    const cutoff = Math.floor(Date.now() / 1000) - retentionSeconds;
    let totalDeleted = 0;
    for (let i = 0; i < CLEANUP_MAX_BATCHES; i++) {
      const [result] = await connection.query(
        'DELETE FROM todo WHERE createtimestamp < ? LIMIT ?',
        [cutoff, CLEANUP_BATCH_SIZE]
      );
      totalDeleted += result.affectedRows;
      if (result.affectedRows < CLEANUP_BATCH_SIZE) break;
    }
    logger.info(`清理过期todo完成，删除 ${totalDeleted} 条记录`);
    return totalDeleted;
  } catch (err) {
    logger.error('清理过期todo失败:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 清理超过保留期的 calendar 记录（分批删除）
async function dbCleanupOldCalendars(retentionSeconds) {
  const connection = await getConnection();
  try {
    const cutoff = Math.floor(Date.now() / 1000) - retentionSeconds;
    let totalDeleted = 0;
    for (let i = 0; i < CLEANUP_MAX_BATCHES; i++) {
      const [result] = await connection.query(
        'DELETE FROM calendar WHERE createtimestamp < ? LIMIT ?',
        [cutoff, CLEANUP_BATCH_SIZE]
      );
      totalDeleted += result.affectedRows;
      if (result.affectedRows < CLEANUP_BATCH_SIZE) break;
    }
    logger.info(`清理过期calendar完成，删除 ${totalDeleted} 条记录`);
    return totalDeleted;
  } catch (err) {
    logger.error('清理过期calendar失败:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 清理超过保留期的用户信息记录（依据最后登录时间，分批删除）
async function dbCleanupOldUserinfos(retentionSeconds) {
  const connection = await getConnection();
  try {
    let totalDeleted = 0;
    for (let i = 0; i < CLEANUP_MAX_BATCHES; i++) {
      const [result] = await connection.query(
        'DELETE FROM users WHERE lastupdatetime IS NOT NULL AND lastupdatetime < DATE_SUB(NOW(), INTERVAL ? SECOND) LIMIT ?',
        [retentionSeconds, CLEANUP_BATCH_SIZE]
      );
      totalDeleted += result.affectedRows;
      if (result.affectedRows < CLEANUP_BATCH_SIZE) break;
    }
    logger.info(`清理过期用户信息完成（最后登录时间早于${retentionSeconds}秒前），删除 ${totalDeleted} 条记录`);
    return totalDeleted;
  } catch (err) {
    logger.error('清理过期用户信息失败:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

// 为了保持与sqlite.js的接口一致性，导出相应的方法
export {
  // 由于使用连接池，不需要单独的openXXX方法，直接导出操作方法
  dbInsertIdToken,
  dbDeleteIdToken,
  dbGetIdToken,
  dbInsertUserinfo,
  dbGetUserinfoByUserid,
  dbGetUserinfoByUnionid,
  dbUpdateUserLoginTime,
  dbGetConfig,
  dbSetConfig,
  dbInsertTodo,
  dbGetTodoByMeetingid,
  dbDeleteTodoByMeetingid,
  dbInsertCalendar,
  dbGetCalendarByMeetingid,
  dbDeleteCalendarByMeetingid,
  dbCleanupExpiredIdTokens,
  dbCleanupOldTodos,
  dbCleanupOldCalendars,
  dbCleanupOldUserinfos,
  // 额外导出初始化方法，方便应用启动时初始化数据库
  initDatabase
};