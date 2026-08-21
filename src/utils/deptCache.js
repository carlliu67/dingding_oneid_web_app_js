import { getUserScopedDepartments } from '../components/wemeetapi/wemeetApi.js';
import { frontendLogger } from './logger.js';

// 部门组织架构树现在由后端缓存（内存→DB→钉钉）
// 前端只需要发起请求，后端负责缓存策略
// 前端不再做 localStorage 缓存，避免数据不一致

// 获取用户范围内的组织架构树（纯部门，不含用户）
export async function getScopedDeptTree() {
    try {
        const data = await getUserScopedDepartments();
        if (data && data.tree) {
            frontendLogger.info('获取组织架构树成功');
            return data.tree;
        }
        frontendLogger.warn('获取组织架构树失败');
        return null;
    } catch (error) {
        frontendLogger.error('获取组织架构树异常', { error });
        return null;
    }
}

// 兼容旧调用（preloadScopedUsers 现在不需要前端缓存了，后端启动时已加载）
export async function preloadScopedUsers() {
    frontendLogger.info('组织架构缓存由后端管理，前端无需预加载');
    return null;
}
