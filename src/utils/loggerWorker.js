// Web Worker 负责处理日志的序列化、存储和上传
// 避免阻塞主线程，提升页面渲染性能

// 日志队列
let logQueue = [];
let config = {
  maxQueueSize: 100,
  flushInterval: 10000,
  maxRetryCount: 3,
  retryCount: 0,
  isOnline: true,
  logServerUrl: ''
};

// 定时器ID
let flushTimerId = null;

// 初始化配置
function initConfig(initialConfig) {
  config = { ...config, ...initialConfig };
  
  // 设置定时发送日志
  if (flushTimerId) {
    clearInterval(flushTimerId);
  }
  
  flushTimerId = setInterval(() => {
    if (config.isOnline && logQueue.length > 0) {
      flushLogs();
    }
  }, config.flushInterval);
}

// 获取北京时区的时间戳
function getBeijingTimestamp() {
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

// 添加日志到队列
function addLog(logEntry) {
  // 添加时间戳（如果主线程没有提供）
  if (!logEntry.timestamp) {
    logEntry.timestamp = getBeijingTimestamp();
  }
  
  logQueue.push(logEntry);
  
  // 如果队列过大，移除最旧的日志
  if (logQueue.length > config.maxQueueSize) {
    logQueue.shift();
  }
  
  // 如果是错误级别，立即尝试发送
  if (logEntry.level === 'error') {
    flushLogs();
  }
}

// 发送日志到服务器
async function flushLogs() {
  if (logQueue.length === 0 || !config.isOnline || !config.logServerUrl) {
    return;
  }
  
  // 复制当前队列并清空
  const logsToSend = [...logQueue];
  logQueue = [];
  
  try {
    // 使用fetch API发送日志
    const response = await fetch(config.logServerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        logs: logsToSend
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // 重置重试计数
    config.retryCount = 0;
    
    // 通知主线程发送成功
    // eslint-disable-next-line no-undef
    globalThis.postMessage({
      type: 'flush-success',
      data: { count: logsToSend.length }
    });
    
  } catch (error) {
    // 如果发送失败，将日志放回队列
    logQueue = [...logsToSend, ...logQueue];
    
    // 限制队列大小
    if (logQueue.length > config.maxQueueSize) {
      logQueue = logQueue.slice(-config.maxQueueSize);
    }
    
    // 增加重试计数
    config.retryCount++;
    
    // 通知主线程发送失败
    // eslint-disable-next-line no-undef
    globalThis.postMessage({
      type: 'flush-error',
      data: {
        error: error.message,
        retryCount: config.retryCount
      }
    });
    
    // 如果重试次数未达到上限，延迟重试
    if (config.retryCount <= config.maxRetryCount) {
      setTimeout(() => {
        flushLogs();
      }, config.flushInterval * config.retryCount);
    }
  }
}

// 同步发送日志（用于页面卸载）
function flushLogsSync() {
  if (logQueue.length === 0 || !config.logServerUrl) {
    return;
  }
  
  const logsToSend = [...logQueue];
  
  // 在Worker中无法使用同步XMLHttpRequest，但可以尝试使用navigator.sendBeacon
  if (navigator.sendBeacon) {
    const success = navigator.sendBeacon(
      config.logServerUrl,
      JSON.stringify({ logs: logsToSend })
    );
    
    if (success) {
      logQueue = [];
    }
  }
}

// 清空队列
function clearLogs() {
  logQueue = [];
}

// 获取队列状态
function getQueueStatus() {
  return {
    queueLength: logQueue.length,
    maxQueueSize: config.maxQueueSize,
    retryCount: config.retryCount,
    isOnline: config.isOnline
  };
}

// 监听主线程消息
// eslint-disable-next-line no-undef
globalThis.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'init':
      initConfig(data);
      break;
      
    case 'add-log':
      addLog(data);
      break;
      
    case 'flush':
      flushLogs();
      break;
      
    case 'flush-sync':
      flushLogsSync();
      break;
      
    case 'clear':
      clearLogs();
      break;
      
    case 'get-status':
      // eslint-disable-next-line no-undef
      globalThis.postMessage({
        type: 'status',
        data: getQueueStatus()
      });
      break;
      
    case 'update-config':
      config = { ...config, ...data };
      break;
      
    default:
      console.warn(`Unknown message type: ${type}`);
  }
});

// 导出函数供测试使用（如果在Node.js环境中运行）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    addLog,
    flushLogs,
    clearLogs,
    getQueueStatus,
    initConfig
  };
}