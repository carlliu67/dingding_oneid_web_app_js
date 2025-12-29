import axios from 'axios';
import clientConfig from '../config/client_config.js';
import StackTrace from 'stacktrace-js';

class FrontendLogger {
  constructor() {
    // 从配置文件中读取参数
    this.logQueue = [];
    this.maxQueueSize = clientConfig.logQueueSize || 100;
    this.flushInterval = clientConfig.logFlushInterval || 10000;
    this.isOnline = navigator.onLine;
    this.retryCount = 0;
    this.maxRetryCount = 3;
    this.logServerUrl = this.getLogServerUrl();
    this.isEnabled = clientConfig.enableFrontendLog !== false;
    
    // 监听网络状态变化
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flushLogs();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
    
    // 定期发送日志
    setInterval(() => {
      if (this.isOnline) {
        this.flushLogs();
      }
    }, this.flushInterval);
    
    // 页面卸载时发送剩余日志
    window.addEventListener('beforeunload', () => {
      this.flushLogsSync();
    });
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
    return beijingTime.toISOString();
  }
  
  // 提取DingTalk部分userAgent
  extractDingTalkUserAgent(userAgent) {
    const dingTalkMatch = userAgent.match(/DingTalk\([^)]+\)/);
    return dingTalkMatch ? dingTalkMatch[0] : '';
  }
  
  // 获取调用栈信息，提取文件名和行号
  async getCallerInfo() {
    try {
      // 使用 StackTrace 获取更准确的调用信息
      const stack = await StackTrace.get();
      
      // 调试：打印整个调用栈
      console.debug('StackTrace result:', stack);
      
      // 跳过前几个栈帧（getCallerInfo, addLog, debug/info/error等内部调用）
      // 调用链：调用方代码 -> debug/info/error -> addLog -> getCallerInfo
      // 所以我们需要跳过至少3个栈帧，可能更多取决于调用方式
      let callerIndex = 3; // 默认跳过3个栈帧
      
      // 如果调用栈中有更多内部函数，尝试找到真正的调用者
      for (let i = 3; i < Math.min(stack.length, 8); i++) {
        const frame = stack[i];
        // 如果是logger.js内部的函数，继续跳过
        if (frame.fileName && frame.fileName.includes('logger.js')) {
          callerIndex = i + 1;
        } else {
          break; // 找到了非logger.js的函数，使用这个作为调用者
        }
      }
      
      if (stack.length > callerIndex) {
        const caller = stack[callerIndex];
        
        const callerInfo = {
          file: caller.fileName ? caller.fileName.split('/').pop() : 'unknown',
          line: caller.lineNumber || 0,
          function: caller.functionName || 'anonymous'
        };
        
        // 如果是打包文件，添加标记
        if (callerInfo.file.includes('bundle') || callerInfo.file.includes('chunk')) {
          callerInfo.bundle = true;
        } else {
          callerInfo.bundle = false;
        }
        
        // 调试：打印解析结果
        console.debug(`Parsed caller info from StackTrace at index ${callerIndex}:`, callerInfo);
        
        return callerInfo;
      }
      
      return {};
    } catch (e) {
      console.error('Error getting caller info with StackTrace:', e);
      
      // 如果 StackTrace 失败，回退到原始方法
      return this.getCallerInfoFallback();
    }
  }
  
  // 原始的回退方法
  getCallerInfoFallback() {
    try {
      const stack = new Error().stack;
      const stackLines = stack.split('\n');
      
      // 调试：打印整个调用栈
      console.debug('Full stack trace (fallback):', stack);
      
      // 尝试多个可能的调用栈索引，找到第一个能匹配的
      // 调用链：调用方代码 -> debug/info/error -> addLog -> getCallerInfo
      // 所以我们需要从索引4开始尝试，跳过内部调用
      let callerIndex = -1;
      
      for (let i = 4; i <= 8; i++) {
        const callerLine = stackLines[i] || '';
        
        // 调试：打印尝试匹配的调用行
        console.debug(`Attempting to match caller line [${i}]:`, callerLine);
        
        // 尝试多种可能的格式
        const match = callerLine.match(/at\s+.*\s+\((.*):(\d+):(\d+)\)/) || 
                      callerLine.match(/at\s+(.*):(\d+):(\d+)/) ||
                      callerLine.match(/(.*):(\d+):(\d+)/);
        
        if (match) {
          const fullPath = match[1];
          
          // 如果是logger.js文件，继续查找下一个
          if (fullPath.includes('logger.js')) {
            continue;
          }
          
          const fileName = fullPath.split('/').pop(); // 只取文件名，不取路径
          
          const callerInfo = {
            file: fileName,
            line: match[2]
          };
          
          // 如果是打包文件，尝试从调用栈中获取更多有用的信息
          if (fileName.includes('bundle') || fileName.includes('chunk')) {
            // 尝试从调用栈中提取函数名或模块信息
            const functionMatch = callerLine.match(/at\s+(\w+)/);
            if (functionMatch) {
              callerInfo.function = functionMatch[1];
            }
            
            // 添加标记，表明这是打包后的文件
            callerInfo.bundle = true;
          }
          
          callerIndex = i;
          
          // 调试：打印解析结果
          console.debug(`Parsed caller info at index ${i}:`, callerInfo);
          
          return callerInfo;
        }
      }
      
      if (callerIndex === -1) {
        console.debug('No match found in any caller line');
      }
      
      return {};
    } catch (e) {
      console.error('Error getting caller info:', e);
      return {};
    }
  }
  
  async addLog(level, message, extra = {}) {
    // 如果日志功能被禁用，则不记录
    if (!this.isEnabled) {
      return;
    }
    
    const callerInfo = await this.getCallerInfo();
    const logEntry = {
      timestamp: this.getBeijingTimestamp(),
      level: level, // debug, info, warn, error
      message: message,
      url: window.location.href,
      userAgent: this.extractDingTalkUserAgent(navigator.userAgent),
      ...callerInfo,
      ...extra
    };
    
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
  
  debug(message, extra = {}) {
    this.addLog('debug', message, extra);
    console.debug(message, extra);
  }
  
  info(message, extra = {}) {
    this.addLog('info', message, extra);
    console.info(message, extra);
  }
  
  warn(message, extra = {}) {
    this.addLog('warn', message, extra);
    console.warn(message, extra);
  }
  
  error(message, extra = {}) {
    this.addLog('error', message, extra);
    console.error(message, extra);
  }
  
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
  
  // 同步发送日志，用于页面卸载时
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
}

// 创建单例实例
export const frontendLogger = new FrontendLogger();