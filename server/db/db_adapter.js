import { logger } from '../util/logger.js';
import serverConfig from '../config/server_config.js';

// 根据配置选择数据库类型
const dbType = serverConfig.dbType || 'sqlite'; // 默认使用sqlite

// 动态导入数据库模块
let dbModule;
if (dbType === 'mysql') {
  logger.info('Using MySQL database');
  dbModule = await import('./mysql.js');
} else {
  logger.info('Using SQLite database');
  dbModule = await import('./sqlite.js');
}

// 导出数据库方法
const dbAdapter = {};

// 数据库初始化方法
if (dbType === 'mysql') {
  // MySQL使用连接池，只需要一个初始化方法
  dbAdapter.initDatabase = async () => {
    try {
      await dbModule.initDatabase();
      logger.info('Database initialized successfully');
    } catch (err) {
      logger.error('Failed to initialize database:', err);
      throw err;
    }
  };
} else {
  // SQLite需要分别初始化各个数据库
  dbAdapter.initDatabase = async () => {
    try {
      await dbModule.openUserinfoDatabase();
      await dbModule.openIdTokenDatabase();
      await dbModule.openTodoDatabase();
      await dbModule.openCalendarDatabase();
      logger.info('All databases initialized successfully');
    } catch (err) {
      logger.error('Failed to initialize databases:', err);
      throw err;
    }
  };
}

// 导出所有数据库操作方法
const methodsToExport = [
  'dbInsertIdToken',
  'dbDeleteIdToken',
  'dbGetIdToken',
  'dbInsertUserinfo',
  'dbGetUserinfoByUserid',
  'dbGetUserinfoByUnionid',
  'dbInsertTodo',
  'dbGetTodoByMeetingid',
  'dbDeleteTodoByMeetingid',
  'dbInsertCalendar',
  'dbGetCalendarByMeetingid',
  'dbDeleteCalendarByMeetingid'
];

methodsToExport.forEach(method => {
  if (dbModule[method]) {
    dbAdapter[method] = dbModule[method];
  } else {
    logger.warn(`Method ${method} not found in database module`);
  }
});

export default dbAdapter;
export { dbType };