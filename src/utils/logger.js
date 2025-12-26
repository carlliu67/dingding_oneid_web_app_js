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
  getCallerInfo() {
    try {
      const stack = new Error().stack;
      const stackLines = stack.split('\n');
      // 跳过当前函数和addLog函数的调用栈，获取调用者的信息
      const callerLine = stackLines[4] || stackLines[3] || '';
      
      // 匹配文件名和行号
      const match = callerLine.match(/at\s+.*\s+\((.*):(\d+):(\d+)\)/) || 
                    callerLine.match(/at\s+(.*):(\d+):(\d+)/);
      
      if (match) {
        return {
          file: match[1].split('/').pop(), // 只取文件名，不取路径
          line: match[2],
          column: match[3]
        };
      }
      return {};
    } catch (e) {
      return {};
    }
  }
  
  addLog(level, message, extra = {}) {
    // 如果日志功能被禁用，则不记录
    if (!this.isEnabled) {
      return;
    }
    
    const callerInfo = this.getCallerInfo();
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
        logs: logsToSend,
        source: 'frontend'
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
        logs: logsToSend,
        source: 'frontend'
      }));
    } catch (error) {
      console.error('同步发送日志失败:', error);
    }
  }
}

// 创建单例实例
export const frontendLogger = new FrontendLogger();