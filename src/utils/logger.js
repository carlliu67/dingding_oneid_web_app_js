import axios from 'axios';
import clientConfig from '../config/client_config.js';

class FrontendLogger {
  constructor() {
    // 从配置文件中读取参数
    this.logQueue = [];
    this.maxQueueSize = clientConfig.logQueueSize || 100;
    this.flushInterval = clientConfig.logFlushInterval || 10000;
    this.isOnline = navigator.onLine;
    this.retryCount = 0;
    this.maxRetryCount = clientConfig.logWorkerMaxRetryCount || 3;
    this.logServerUrl = this.getLogServerUrl();
    this.isEnabled = clientConfig.enableFrontendLog !== false;
    
    // 生产环境下禁用详细日志
    if (process.env.NODE_ENV === 'production') {
      // 生产环境默认禁用，除非明确启用
      this.isEnabled = clientConfig.enableFrontendLog === true;
      
      // 生产环境日志级别控制
      this.prodLogLevel = clientConfig.productionLogConfig?.logLevel || 'error';
      this.enableErrorOnly = clientConfig.productionLogConfig?.enableErrorLogOnly !== false;
      this.enableStackTrace = clientConfig.productionLogConfig?.enableStackTrace === true;
    } else {
      // 开发环境默认启用所有日志
      this.prodLogLevel = 'debug';
      this.enableErrorOnly = false;
      this.enableStackTrace = true;
    }
    
    // Web Worker 相关属性
    this.worker = null;
    this.workerSupported = typeof Worker !== 'undefined';
    this.workerReady = false;
    this.enableWorker = this.isEnabled && clientConfig.enableLogWorker !== false;
    
    // 初始化 Web Worker
    if (this.workerSupported && this.enableWorker) {
      this.initWorker();
    }
    
    // 监听网络状态变化
    window.addEventListener('online', () => {
      this.isOnline = true;
      if (this.workerReady) {
        this.worker.postMessage({ type: 'flush' });
      } else {
        this.flushLogs();
      }
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      if (this.workerReady) {
        this.worker.postMessage({ 
          type: 'update-config', 
          data: { isOnline: false } 
        });
      }
    });
    
    // 页面卸载时发送剩余日志
    window.addEventListener('beforeunload', () => {
      if (this.workerReady) {
        this.worker.postMessage({ type: 'flush-sync' });
      } else {
        this.flushLogsSync();
      }
    });
  }
  
  // 初始化 Web Worker
  initWorker() {
    try {
      // 创建 Worker 实例
      this.worker = new Worker(new URL('./loggerWorker.js', import.meta.url), { type: 'module' });
      
      // 监听 Worker 消息
      this.worker.addEventListener('message', (event) => {
        const { type, data } = event.data;
        
        switch (type) {
          case 'flush-success':
            console.log(`成功发送 ${data.count} 条日志`);
            this.retryCount = 0;
            break;
            
          case 'flush-error':
            console.error(`日志发送失败: ${data.error}, 重试次数: ${data.retryCount}`);
            this.retryCount = data.retryCount;
            break;
            
          case 'status':
            console.log('日志队列状态:', data);
            break;
            
          default:
            // 处理未知的消息类型
            console.warn(`未知的Worker消息类型: ${type}`);
            break;
        }
      });
      
      // 监听 Worker 错误
      this.worker.addEventListener('error', (error) => {
        console.error('Worker 错误:', error);
        this.workerReady = false;
      });
      
      // 初始化 Worker 配置
      this.worker.postMessage({
        type: 'init',
        data: {
          maxQueueSize: this.maxQueueSize,
          flushInterval: this.flushInterval,
          maxRetryCount: this.maxRetryCount,
          isOnline: this.isOnline,
          logServerUrl: this.logServerUrl
        }
      });
      
      this.workerReady = true;
      console.log('日志 Worker 初始化成功');
      
    } catch (error) {
      console.error('初始化日志 Worker 失败:', error);
      this.workerReady = false;
    }
  }
  
  getLogServerUrl() {
    const protocol = clientConfig.serverProtocol || 'http';
    const serverUrl = clientConfig.serverUrl || window.location.hostname;
    const port = clientConfig.apiPort || '7001';
    
    return `${protocol}://${serverUrl}:${port}/api/logs`;
  }
  
  // 获取北京时区的时间戳
  getBeijingTimestamp() {
    const now = new Date();
    // 获取UTC时间
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    // 北京时间是UTC+8，所以加上8小时
    const beijingTime = new Date(utcTime + (8 * 3600000));
    
    // 格式化为北京时间字符串，不使用toISOString()
    const year = beijingTime.getFullYear();
    const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getDate()).padStart(2, '0');
    const hours = String(beijingTime.getHours()).padStart(2, '0');
    const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getSeconds()).padStart(2, '0');
    const milliseconds = String(beijingTime.getMilliseconds()).padStart(3, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}+08:00`;
  }
  
  // 提取DingTalk部分userAgent
  extractDingTalkUserAgent(userAgent) {
    const dingTalkMatch = userAgent.match(/DingTalk\([^)]+\)/);
    return dingTalkMatch ? dingTalkMatch[0] : '';
  }
  
  // 获取调用栈信息，提取文件名和行号
  getCallerInfo() {
    // 如果调用栈被禁用，返回基本信息
    if (!this.enableStackTrace) {
      return {
        file: 'unknown',
        line: 0,
        function: 'anonymous'
      };
    }
    
    try {
      // 创建一个新的错误对象来获取调用栈
      const error = new Error();
      const stack = error.stack;
      
      if (!stack) {
        return {
          file: 'unknown',
          line: 0,
          function: 'anonymous'
        };
      }
      
      // 解析调用栈
      const stackLines = stack.split('\n');
      
      // 找到真正的调用者（非logger.js和frontendLogger的函数）
      let callerIndex = -1;
      let functionName = 'anonymous';
      let fileName = 'unknown';
      let lineNumber = 0;
      
      for (let i = 3; i < Math.min(stackLines.length, 10); i++) {
        const line = stackLines[i];
        
        // 跳过logger.js和frontendLogger相关的栈帧
        if (!line || line.includes('logger.js') || line.includes('frontendLogger')) {
          continue;
        }
        
        // 解析当前栈帧
        const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):\d+\)|at\s+(.+?):(\d+):\d+/);
        
        if (match) {
          if (match[1] && match[2] && match[3]) {
            // 格式: at functionName (filename:line:column)
            functionName = match[1];
            fileName = match[2];
            lineNumber = parseInt(match[3]);
          } else {
            // 格式: at filename:line:column
            functionName = 'anonymous';
            fileName = match[4];
            lineNumber = parseInt(match[5]);
          }
          
          callerIndex = i;
          break;
        }
      }
      
      // 如果没有找到有效的调用者，返回默认值
      if (callerIndex === -1) {
        return {
          file: 'unknown',
          line: 0,
          function: 'anonymous'
        };
      }
      
      // 清理函数名
      if (functionName && functionName !== 'anonymous') {
        // 如果函数名看起来像是代码片段而不是函数名，则标记为匿名函数
        if (functionName.includes('.') || functionName.includes('(') || functionName.includes('[')) {
          // 检查是否是方法调用
          if (functionName.includes('.')) {
            const parts = functionName.split('.');
            const lastPart = parts[parts.length - 1];
            // 如果最后一部分看起来像函数名，则使用它
            if (lastPart && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(lastPart)) {
              functionName = lastPart;
            } else {
              functionName = 'anonymous';
            }
          } else {
            functionName = 'anonymous';
          }
        }
        
        // 如果函数名太长，可能是表达式，标记为匿名函数
        if (functionName.length > 30) {
          functionName = 'anonymous';
        }
      }
      
      // 提取文件名（去掉路径）
      const justFileName = fileName ? fileName.split('/').pop() : 'unknown';
      
      const callerInfo = {
        file: fileName,
        line: lineNumber || 0,
        function: functionName || 'anonymous'
      };
      
      // 如果是打包文件，添加标记
      if (justFileName && (justFileName.includes('bundle') || justFileName.includes('chunk'))) {
        callerInfo.bundle = true;
      } else {
        callerInfo.bundle = false;
      }
      
      return callerInfo;
    } catch (error) {
      console.error('获取调用栈信息失败:', error);
    }
    
    return {
      file: 'unknown',
      line: 0,
      function: 'anonymous'
    };
  }
  
  // 检查日志级别是否应该记录
  shouldLog(level) {
    // 如果日志功能被禁用，则不记录
    if (!this.isEnabled) {
      return false;
    }
    
    // 生产环境下，如果只记录错误日志
    if (process.env.NODE_ENV === 'production' && this.enableErrorOnly && level !== 'error') {
      return false;
    }
    
    // 检查日志级别
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.prodLogLevel);
    const logLevelIndex = levels.indexOf(level);
    
    return logLevelIndex >= currentLevelIndex;
  }
  
  // 添加日志到队列
  addLog(level, message, extra = {}) {
    // 检查是否应该记录此日志
    if (!this.shouldLog(level)) {
      return;
    }
    
    // 只有warn和error级别才获取调用栈信息，优化性能
    let callerInfo;
    if (level === 'warn' || level === 'error') {
      callerInfo = this.getCallerInfo();
    } else {
      // 其他级别提供默认信息
      callerInfo = {
        file: 'unknown',
        line: 0,
        function: 'anonymous',
        bundle: false
      };
    }
    
    const logEntry = {
      timestamp: this.getBeijingTimestamp(),
      level: level,
      message: message,
      url: window.location.href,
      userAgent: this.extractDingTalkUserAgent(navigator.userAgent),
      ...callerInfo,
      ...extra
    };
    
    // 如果 Worker 准备就绪，将日志发送给 Worker 处理
    if (this.workerReady) {
      // 发送给 Worker
      this.worker.postMessage({
        type: 'add-log',
        data: logEntry
      });
    } else {
      // 降级处理：使用原有逻辑
      // 添加到队列
      this.logQueue.push(logEntry);
      
      // 如果队列过大，移除最旧的日志
      if (this.logQueue.length > this.maxQueueSize) {
        this.logQueue.shift();
      }
      
      // 如果是错误级别，立即尝试发送
      if (level === 'error') {
        this.flushLogs();
      }
    }
  }
  
  // 调试日志
  debug(message, extra = {}) {
    this.addLog('debug', message, extra);
    console.debug(message, extra);
  }
  
  // 信息日志
  info(message, extra = {}) {
    this.addLog('info', message, extra);
    console.info(message, extra);
  }
  
  // 警告日志
  warn(message, extra = {}) {
    this.addLog('warn', message, extra);
    console.warn(message, extra);
  }
  
  // 错误日志
  error(message, extra = {}) {
    this.addLog('error', message, extra);
    console.error(message, extra);
  }
  
  // 发送日志到服务器（降级方法）
  async flushLogs() {
    if (this.logQueue.length === 0 || !this.isOnline) {
      return;
    }
    
    // 复制当前队列并清空
    const logsToSend = [...this.logQueue];
    this.logQueue = [];
    
    try {
      await axios.post(this.logServerUrl, {
        logs: logsToSend
      }, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      this.retryCount = 0; // 重置重试计数
    } catch (error) {
      console.error('发送日志失败:', error);
      
      // 如果发送失败，将日志放回队列
      this.logQueue = [...logsToSend, ...this.logQueue];
      
      // 限制队列大小
      if (this.logQueue.length > this.maxQueueSize) {
        this.logQueue = this.logQueue.slice(-this.maxQueueSize);
      }
      
      // 增加重试计数
      this.retryCount++;
      
      // 如果重试次数未达到上限，延迟重试
      if (this.retryCount <= this.maxRetryCount) {
        setTimeout(() => {
          this.flushLogs();
        }, this.flushInterval * this.retryCount);
      }
    }
  }
  
  // 同步发送日志（用于页面卸载）
  flushLogsSync() {
    if (this.logQueue.length === 0) {
      return;
    }
    
    const logsToSend = [...this.logQueue];
    
    // 使用同步方式发送，适用于页面卸载
    const request = new XMLHttpRequest();
    request.open('POST', this.logServerUrl, false); // 同步请求
    request.setRequestHeader('Content-Type', 'application/json');
    
    try {
      request.send(JSON.stringify({
        logs: logsToSend
      }));
    } catch (error) {
      console.error('同步发送日志失败:', error);
    }
  }
  
  // 获取队列状态
  getQueueStatus() {
    if (this.workerReady) {
      this.worker.postMessage({ type: 'get-status' });
    } else {
      return {
        queueLength: this.logQueue.length,
        maxQueueSize: this.maxQueueSize,
        retryCount: this.retryCount,
        isOnline: this.isOnline,
        workerReady: this.workerReady
      };
    }
  }
  
  // 清空日志队列
  clearLogs() {
    if (this.workerReady) {
      this.worker.postMessage({ type: 'clear' });
    } else {
      this.logQueue = [];
    }
  }
  
  // 销毁 Worker
  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.workerReady = false;
    }
  }
}

// 创建单例实例
export const frontendLogger = new FrontendLogger();