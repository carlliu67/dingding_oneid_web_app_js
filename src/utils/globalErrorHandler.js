import { frontendLogger } from './logger.js';

// 全局错误处理器
class GlobalErrorHandler {
  constructor() {
    this.setupErrorHandlers();
  }
  
  setupErrorHandlers() {
    // 捕获未处理的JavaScript错误
    window.addEventListener('error', (event) => {
      frontendLogger.error('全局JavaScript错误', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error ? {
          name: event.error.name,
          message: event.error.message,
          stack: event.error.stack
        } : null
      });
    });
    
    // 捕获未处理的Promise拒绝
    window.addEventListener('unhandledrejection', (event) => {
      frontendLogger.error('未处理的Promise拒绝', {
        reason: event.reason,
        promise: event.promise ? event.promise.toString() : null,
        stack: event.reason && event.reason.stack ? event.reason.stack : null
      });
      
      // 防止错误在控制台显示
      event.preventDefault();
    });
    
    // 捕获资源加载错误
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        const element = event.target;
        frontendLogger.error('资源加载失败', {
          elementType: element.tagName,
          source: element.src || element.href,
          type: element.type || 'unknown'
        });
      }
    }, true);
  }
}

// 创建单例实例
const globalErrorHandler = new GlobalErrorHandler();

export default globalErrorHandler;