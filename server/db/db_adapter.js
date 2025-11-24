import { logger } from '../util/logger.js';
import serverConfig from '../config/server_config.js';

// 根据配置选择数据库类型
const dbType = serverConfig.dbType || 'sqlite'; // 默认使用sqlite
logger.info(`Database type configured as: ${dbType}`);

// 导出数据库方法
const dbAdapter = {};

// 数据库模块和初始化状态
let dbModule = null;
let initPromise = null;

// 确保数据库模块已初始化
async function ensureDbModuleInitialized() {
  if (dbModule) {
    return dbModule;
  }
  
  if (initPromise) {
    return await initPromise;
  }
  
  initPromise = (async () => {
    try {
      if (dbType === 'mysql') {
        logger.info('Loading MySQL database module');
        dbModule = await import('./mysql.js');
      } else {
        logger.info('Loading SQLite database module');
        dbModule = await import('./sqlite.js');
      }
      
      logger.info('Database module loaded successfully');
      return dbModule;
    } catch (err) {
      logger.error('Failed to load database module:', err);
      throw err;
    }
  })();
  
  return await initPromise;
}

// 为所有数据库方法创建包装函数，确保在调用时数据库模块已初始化
const createDatabaseMethod = (methodName) => {
  return async (...args) => {
    try {
      const module = await ensureDbModuleInitialized();
      if (module[methodName]) {
        return await module[methodName](...args);
      } else {
        throw new Error(`Method ${methodName} not found in database module`);
      }
    } catch (err) {
      logger.error(`Error in database method ${methodName}:`, err);
      throw err;
    }
  };
};

// 定义所有需要导出的数据库方法
const databaseMethods = [
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

// 立即创建并导出所有数据库方法的包装函数
databaseMethods.forEach(method => {
  dbAdapter[method] = createDatabaseMethod(method);
});

// 提供同步可用的initDatabase方法
dbAdapter.initDatabase = async () => {
  try {
    const module = await ensureDbModuleInitialized();
    
    if (dbType === 'mysql') {
      await module.initDatabase();
      logger.info('MySQL database initialized successfully');
    } else {
      await module.openUserinfoDatabase();
      await module.openIdTokenDatabase();
      await module.openTodoDatabase();
      await module.openCalendarDatabase();
      logger.info('SQLite databases initialized successfully');
    }
  } catch (err) {
    logger.error('Failed to initialize database:', err);
    throw err;
  }
};

// 预先加载数据库模块以加快首次使用速度
ensureDbModuleInitialized().catch(err => {
  logger.error('Critical error during database module preloading:', err);
});

export default dbAdapter;
export { dbType };