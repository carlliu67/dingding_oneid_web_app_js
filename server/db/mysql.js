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
    
    // 创建userinfo表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        userid VARCHAR(255) PRIMARY KEY,
        unionid VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL
      )
    `);
    logger.info('Table "users" created successfully');
    
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
      'INSERT INTO users (userid, unionid, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE unionid = VALUES(unionid), name = VALUES(name)',
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

// 为了保持与sqlite.js的接口一致性，导出相应的方法
export {
  // 由于使用连接池，不需要单独的openXXX方法，直接导出操作方法
  dbInsertIdToken,
  dbDeleteIdToken,
  dbGetIdToken,
  dbInsertUserinfo,
  dbGetUserinfoByUserid,
  dbGetUserinfoByUnionid,
  dbInsertTodo,
  dbGetTodoByMeetingid,
  dbDeleteTodoByMeetingid,
  dbInsertCalendar,
  dbGetCalendarByMeetingid,
  dbDeleteCalendarByMeetingid,
  // 额外导出初始化方法，方便应用启动时初始化数据库
  initDatabase
};