import winston from 'winston';
import path from 'path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import util from 'util';
import DailyRotateFile from 'winston-daily-rotate-file';
import serverConfig from '../config/server_config.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const serverTimezone = 'Asia/Shanghai';
dayjs.tz.setDefault(serverTimezone);

class CustomLogger {
  constructor() {
    // 创建文件传输并添加错误处理
    const fileTransport = new DailyRotateFile({
      filename: 'logs/%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d'
    });
    fileTransport.on('error', (err) => {
      // 防止文件日志写入失败导致进程崩溃
      // 使用最基本的console.error，避免依赖其他模块
      try {
        process.stderr.write(`文件日志写入失败: ${err.message || err}\n`);
      } catch (stderrErr) {
        // 如果stderr也不可用，我们无能为力，只能静默失败
      }
    });

    // 创建一个安全的控制台传输，使用winston内置的Console transport
    const safeConsoleTransport = new winston.transports.Console({
      format: winston.format.printf(({ timestamp, level, message, fileInfo }) => {
        return `${timestamp} [${fileInfo}] ${level}: ${message}`;
      }),
      stderrLevels: ['error', 'warn'],
      consoleWarnLevels: ['warn'],
      handleExceptions: true,
      handleRejections: true
    });
    
    // 添加错误处理，防止控制台写入失败导致进程崩溃
    safeConsoleTransport.on('error', (err) => {
      try {
        process.stderr.write(`控制台日志写入失败: ${err.message || err}\n`);
      } catch (stderrErr) {
        // 如果stderr也不可用，我们无能为力，只能静默失败
      }
    });

    // 根据logLevel决定是否使用控制台传输
    const transports = [fileTransport];
    const exceptionHandlers = [fileTransport];
    const rejectionHandlers = [fileTransport];
    
    // 如果logLevel为debug，同时输出到控制台和文件
    if (serverConfig.logLevel === 'debug') {
      transports.push(safeConsoleTransport);
      exceptionHandlers.push(safeConsoleTransport);
      rejectionHandlers.push(safeConsoleTransport);
    }

    this.logger = winston.createLogger({
      level: 'debug',
      format: winston.format.combine(
        winston.format.timestamp({
          format: () => dayjs().tz().format('YYYY-MM-DD HH:mm:ss.SSS')
        }),
        winston.format.printf(({ timestamp, level, message, fileInfo }) => {
          return `${timestamp} [${fileInfo}] ${level}: ${message}`;
        })
      ),
      transports: transports,
      // 全局处理未捕获的日志错误
      exceptionHandlers: exceptionHandlers,
      rejectionHandlers: rejectionHandlers,
      // 禁用未处理的拒绝处理，我们自己处理
      handleExceptions: true,
      handleRejections: true
    });
  }

  getFileInfo() {
    try {
      const stack = new Error().stack.split('\n');
      let callerLine;
      for (let i = 2; i < stack.length; i++) {
        if (!stack[i].includes('logger.js')) {
          callerLine = stack[i];
          break;
        }
      }
      callerLine = callerLine || '';
      const match = callerLine.match(/at\s+(.+):(\d+):\d+/);
      return match ? `${path.basename(match[1])}:${match[2]}` : '';
    } catch (error) {
      try {
        // 使用更安全的方式记录错误，避免递归错误
        process.stderr.write(`获取文件信息时出错: ${error.message || error}\n`);
      } catch (stderrErr) {
        // 如果stderr也不可用，静默失败
      }
      return '';
    }
  }

  log(level, ...args) {
    try {
      const fileInfo = this.getFileInfo();
      const messages = args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
          try {
            return util.inspect(arg, { depth: null, colors: false });
          } catch (error) {
            return `Failed to inspect object: ${error.message}`;
          }
        }
        return String(arg);
      });
      const message = messages.join(' ');
      this.logger.log({
        level,
        message,
        fileInfo
      });
    } catch (logError) {
      try {
        // 如果日志记录失败，使用更安全的方式记录到stderr
        const simpleMessage = args.map(arg => String(arg)).join(' ');
        process.stderr.write(`${dayjs().tz().format('YYYY-MM-DD HH:mm:ss.SSS')} [logger.error] ERROR: Failed to log ${level} message: ${simpleMessage}\n`);
        process.stderr.write(`Logger error: ${logError.message}\n`);
      } catch (stderrError) {
        // 如果stderr也不可用，静默失败
      }
    }
  }

    debug(...args) {
    if (serverConfig.logLevel === 'debug') {
      this.log('debug', ...args);
    }
  }
  
  info(...args) {
    if (serverConfig.logLevel === 'debug' || serverConfig.logLevel === 'info') {
      this.log('info', ...args);
    }
  }

  warn(...args) {
    if (serverConfig.logLevel === 'debug' || serverConfig.logLevel === 'info' || serverConfig.logLevel === 'warn') {
      this.log('warn', ...args);
    }
  }

  error(...args) {
    if (serverConfig.logLevel === 'debug' || serverConfig.logLevel === 'info' || serverConfig.logLevel === 'warn' || serverConfig.logLevel === 'error') {
      this.log('error', ...args);
    }
  }

}

export const logger = new CustomLogger();