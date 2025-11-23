import { logger } from '../util/logger.js';

/**
 * 异步任务队列系统
 * 用于处理webhook事件的异步执行，避免阻塞主线程
 */
class TaskQueue {
  constructor(maxConcurrent = 5) {
    this.queue = []; // 等待执行的任务队列
    this.running = 0; // 当前运行中的任务数
    this.maxConcurrent = maxConcurrent; // 最大并发任务数
    this.isProcessing = false; // 是否正在处理队列
    this.processedCount = 0; // 处理的任务总数
  }

  /**
   * 添加任务到队列
   * @param {Function} task 任务函数，返回Promise
   * @param {Object} context 任务上下文信息
   * @returns {Promise} 任务执行结果的Promise
   */
  addTask(task, context = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        task,
        context,
        resolve,
        reject
      });
      
      // 开始处理队列
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * 处理队列中的任务
   * @private
   */
  async processQueue() {
    this.isProcessing = true;
    
    // 当队列为空时退出循环
    while (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const { task, context, resolve, reject } = this.queue.shift();
      this.running++;
      this.processedCount++;
      
      if (this.processedCount % 100 === 0) {
        logger.debug(`TaskQueue: 已处理 ${this.processedCount} 个任务，当前队列长度: ${this.queue.length}`);
      }

      // 执行任务
      (async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          logger.error(`TaskQueue: 任务执行失败 - ${context.eventType || 'Unknown'}`, error);
          reject(error);
        } finally {
          this.running--;
          // 继续处理队列
          this.processQueue();
        }
      })();
    }
    
    // 如果队列为空且没有运行中的任务，标记为非处理状态
    if (this.queue.length === 0 && this.running === 0) {
      this.isProcessing = false;
    }
  }

  /**
   * 获取队列状态
   * @returns {Object} 包含队列状态信息的对象
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      runningTasks: this.running,
      processedCount: this.processedCount,
      maxConcurrent: this.maxConcurrent
    };
  }
}

export default TaskQueue;