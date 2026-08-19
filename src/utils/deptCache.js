import { getUserScopedDepartments } from '../components/wemeetapi/wemeetApi.js';
import { frontendLogger } from './logger.js';

const CACHE_KEY = 'disabled_departments_cache';
const CACHE_EXPIRE_HOURS = 24;

// 获取缓存的禁选部门列表（24小时内有效，超过则重新获取）
// 返回 Array<String> 或 null
export async function getDisabledDepartments() {
    try {
        // 检查 localStorage 中是否有有效缓存
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const cacheObj = JSON.parse(cached);
            const now = Date.now();
            const expireTime = cacheObj.timestamp + CACHE_EXPIRE_HOURS * 60 * 60 * 1000;
            if (now < expireTime) {
                frontendLogger.info('使用缓存的禁选部门列表', { count: cacheObj.departments?.length || 0 });
                return cacheObj.departments;
            }
            frontendLogger.info('禁选部门缓存已过期，重新获取');
        }

        // 无缓存或已过期，请求后端获取
        const data = await getUserScopedDepartments();
        if (data && data.disabledDeptIds) {
            // 写入 localStorage 缓存
            const cacheObj = {
                departments: data.disabledDeptIds,
                timestamp: Date.now(),
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheObj));
            frontendLogger.info('获取并缓存禁选部门列表', { count: data.disabledDeptIds.length });
            return data.disabledDeptIds;
        }
        frontendLogger.warn('获取禁选部门列表失败');
        return null;
    } catch (error) {
        frontendLogger.error('获取禁选部门列表异常', { error });
        return null;
    }
}

// 登录成功后预加载禁选部门列表并缓存
// 仅在 strict 模式下执行
export async function preloadDisabledDepartments() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const cacheObj = JSON.parse(cached);
            const now = Date.now();
            const expireTime = cacheObj.timestamp + CACHE_EXPIRE_HOURS * 60 * 60 * 1000;
            if (now < expireTime) {
                frontendLogger.info('禁选部门缓存有效，跳过预加载', { count: cacheObj.departments?.length || 0 });
                return cacheObj.departments;
            }
        }

        frontendLogger.info('开始预加载禁选部门列表');
        const data = await getUserScopedDepartments();
        if (data && data.disabledDeptIds) {
            const cacheObj = {
                departments: data.disabledDeptIds,
                timestamp: Date.now(),
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheObj));
            frontendLogger.info('预加载禁选部门列表成功', { count: data.disabledDeptIds.length });
            return data.disabledDeptIds;
        }
        return null;
    } catch (error) {
        frontendLogger.error('预加载禁选部门列表失败', { error });
        return null;
    }
}
