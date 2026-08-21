import { getUserScopedDepartments } from '../components/wemeetapi/wemeetApi.js';
import { frontendLogger } from './logger.js';

const CACHE_KEY = 'scoped_dept_tree_cache';
const REFRESH_THRESHOLD_HOURS = 24; // 超过24小时触发后台刷新

// 从 localStorage 读取缓存的树数据（不做过期判断，永不过期）
// 返回 { tree, timestamp } 或 null
function readCache() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (e) {
        frontendLogger.warn('读取部门架构树缓存失败', { error: e });
    }
    return null;
}

// 写入缓存
function writeCache(tree) {
    try {
        const cacheObj = {
            tree,
            timestamp: Date.now(),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheObj));
    } catch (e) {
        frontendLogger.warn('写入部门架构树缓存失败', { error: e });
    }
}

// 判断缓存是否超过24小时（需要后台刷新）
function isCacheStale(timestamp) {
    const now = Date.now();
    return now - timestamp > REFRESH_THRESHOLD_HOURS * 60 * 60 * 1000;
}

// 从后台拉取数据并刷新缓存（不影响返回值）
async function refreshFromServer() {
    try {
        const data = await getUserScopedDepartments();
        if (data && data.tree) {
            writeCache(data.tree);
            frontendLogger.info('后台刷新部门架构树成功');
            return data.tree;
        }
        return null;
    } catch (error) {
        frontendLogger.error('后台刷新部门架构树失败', { error });
        return null;
    }
}

// 获取用户范围内的组织架构树
// 策略：永不过期，先显示本地缓存，超过24小时则后台异步刷新
export async function getScopedDeptTree() {
    const cacheObj = readCache();

    // 有缓存：直接返回，如果超过24小时则后台异步刷新
    if (cacheObj && cacheObj.tree) {
        if (isCacheStale(cacheObj.timestamp)) {
            frontendLogger.info('部门架构树缓存超过24小时，先显示缓存，后台异步刷新');
            refreshFromServer(); // 不 await，异步刷新不阻塞
        } else {
            frontendLogger.info('使用缓存的部门架构树');
        }
        return cacheObj.tree;
    }

    // 无缓存：同步请求后端获取
    frontendLogger.info('无缓存，同步获取部门架构树');
    const tree = await refreshFromServer();
    return tree || null;
}

// 登录成功后预加载部门架构树并缓存
// 仅在 strict 模式下执行
export async function preloadScopedUsers() {
    // 如果已有缓存，不重复加载
    const cacheObj = readCache();
    if (cacheObj && cacheObj.tree) {
        frontendLogger.info('部门架构树缓存已存在，跳过预加载');
        return cacheObj.tree;
    }

    frontendLogger.info('开始预加载部门架构树');
    const tree = await refreshFromServer();
    return tree;
}
