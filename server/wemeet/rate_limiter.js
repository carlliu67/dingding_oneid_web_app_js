import { logger } from '../util/logger.js';

/**
 * 限流保护机制 - 令牌桶算法
 * 用于控制webhook接口的请求频率，防止系统过载
 */
class RateLimiter {
    constructor(options = {}) {
        this.rate = options.rate || 1000; // 每秒生成的令牌数
        this.capacity = options.capacity || 5000; // 桶的最大容量
        this.tokens = this.capacity; // 当前令牌数
        this.lastRefillTime = Date.now();
        this.limitedRequests = 0;
    }

    /**
     * 补充令牌
     * 根据经过的时间计算并添加新的令牌
     * @private
     */
    _refillTokens() {
        const now = Date.now();
        const elapsedTime = (now - this.lastRefillTime) / 1000; // 秒
        
        if (elapsedTime > 0) {
            const newTokens = elapsedTime * this.rate;
            this.tokens = Math.min(this.capacity, this.tokens + newTokens);
            this.lastRefillTime = now;
        }
    }

    /**
     * 尝试获取令牌
     * @param {number} tokens 需要获取的令牌数，默认为1
     * @returns {boolean} 是否成功获取令牌
     */
    tryAcquire(tokens = 1) {
        this._refillTokens();
        
        if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return true;
        }
        
        this.limitedRequests++;
        logger.warn(`限流触发: 当前令牌数 ${this.tokens.toFixed(2)}, 需要 ${tokens} 个令牌, 已限流请求数: ${this.limitedRequests}`);
        return false;
    }

    /**
     * 获取当前状态
     * @returns {Object} 包含令牌桶状态信息的对象
     */
    getStatus() {
        this._refillTokens();
        return {
            tokens: this.tokens,
            capacity: this.capacity,
            rate: this.rate,
            limitedRequests: this.limitedRequests,
            utilization: ((this.capacity - this.tokens) / this.capacity * 100).toFixed(2) + '%'
        };
    }
}

export default RateLimiter;