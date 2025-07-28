import winston from 'winston';
import path from 'path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import util from 'util';
import DailyRotateFile from 'winston-daily-rotate-file';
import serverConfig from '../server_config.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const serverTimezone = 'Asia/Shanghai';
dayjs.tz.setDefault(serverTimezone);

class CustomLogger {
  constructor() {
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
      transports: [
        new winston.transports.Console(),
        new DailyRotateFile({
          filename: 'logs/%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '30d'
        })
      ]
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
      console.error('获取文件信息时出错:', error);
      return '';
    }
  }

  log(level, ...args) {
    const fileInfo = this.getFileInfo();
    const messages = args.map(arg => {
      if (typeof arg === 'object' && arg!== null) {
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