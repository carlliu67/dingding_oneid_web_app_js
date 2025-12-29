import { logger } from '../util/logger.js';

// 处理前端日志接收
export const handleFrontendLogs = async (ctx) => {
  try {
    const { logs } = ctx.request.body;
    
    if (!logs || !Array.isArray(logs)) {
      ctx.status = 400;
      ctx.body = {
        code: 400,
        message: '无效的日志数据',
        data: {}
      };
      return;
    }
    
    // 记录前端日志到后端日志系统
    logs.forEach(log => {
      const logLevel = log.level || 'info';
      const logMessage = `[前端日志] ${log.message}`;
      
      // 添加额外的上下文信息，包括callerInfo
      const logContext = {
        url: log.url,
        userAgent: log.userAgent,
        timestamp: log.timestamp,
        function: log.function,
        file: log.file,
        line: log.line,
        ...log.extra
      };
      
      // 根据日志级别记录
      switch (logLevel) {
        case 'debug':
          logger.debug(logMessage, logContext);
          break;
        case 'info':
          logger.info(logMessage, logContext);
          break;
        case 'warn':
          logger.warn(logMessage, logContext);
          break;
        case 'error':
          logger.error(logMessage, logContext);
          break;
        default:
          logger.info(logMessage, logContext);
      }
    });
    
    ctx.status = 200;
    ctx.body = {
      code: 0,
      message: '日志接收成功',
      data: {
        received: logs.length
      }
    };
  } catch (error) {
    logger.error('处理前端日志时出错:', error);
    ctx.status = 500;
    ctx.body = {
      code: 500,
      message: '服务器内部错误',
      data: {}
    };
  }
};