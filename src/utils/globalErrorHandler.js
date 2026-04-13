import { frontendLogger } from './logger.js';

// 全局错误处理器
class GlobalErrorHandler {
  constructor() {
    this.setupErrorHandlers();
  }
  
  // 从错误栈中提取调用者信息
  extractCallerInfoFromStack(stack) {
    if (!stack) {
      return {
        file: 'unknown',
        line: 0,
        function: 'anonymous'
      };
    }
    
    try {
      const stackLines = stack.split('\n');
      let functionName = 'anonymous';
      let fileName = 'unknown';
      let lineNumber = 0;
      
      for (let i = 1; i < Math.min(stackLines.length, 10); i++) {
        const line = stackLines[i];
        if (!line) continue;
        
        const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):\d+\)|at\s+(.+?):(\d+):\d+/);
        
        if (match) {
          if (match[1] && match[2] && match[3]) {
            functionName = match[1];
            fileName = match[2];
            lineNumber = parseInt(match[3]);
          } else {
            functionName = 'anonymous';
            fileName = match[4];
            lineNumber = parseInt(match[5]);
          }
          
          // 清理函数名
          if (functionName && functionName !== 'anonymous') {
            if (functionName.includes('.')) {
              const parts = functionName.split('.');
              const lastPart = parts[parts.length - 1];
              if (lastPart && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(lastPart)) {
                functionName = lastPart;
              } else {
                functionName = 'anonymous';
              }
            }
            if (functionName.length > 30) {
              functionName = 'anonymous';
            }
          }
          
          break;
        }
      }
      
      return {
        file: fileName,
        line: lineNumber || 0,
        function: functionName || 'anonymous'
      };
    } catch (error) {
      return {
        file: 'unknown',
        line: 0,
        function: 'anonymous'
      };
    }
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
      const stack = event.reason && event.reason.stack ? event.reason.stack : null;
      const callerInfo = this.extractCallerInfoFromStack(stack);
      
      frontendLogger.error('未处理的Promise拒绝', {
        reason: event.reason,
        promise: event.promise ? event.promise.toString() : null,
        stack: stack,
        file: callerInfo.file,
        line: callerInfo.line,
        function: callerInfo.function
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