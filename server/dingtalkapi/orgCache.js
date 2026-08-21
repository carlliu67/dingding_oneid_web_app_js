import { logger } from '../util/logger.js';
import dbAdapter from '../db/db_adapter.js';
import { getSubDepartmentIds, getDeptInfo, getDeptUserList, listSubDepartmentIds } from './dingtalkUtil.js';

// 内存缓存
// 组织架构树（纯部门，不含用户）
let deptTreeCache = null;           // 部门树对象
let deptTreeTimestamp = 0;          // 部门树更新时间戳

// 部门用户列表缓存：Map<deptId, {users, timestamp}>
const deptUsersCache = new Map();

// 用户详情缓存：Map<userid, {user, timestamp}>
const userDetailCache = new Map();

// 缓存过期时间（24小时）
const CACHE_EXPIRE_MS = 24 * 60 * 60 * 1000;

// 判断缓存是否过期
function isCacheExpired(timestamp) {
    return Date.now() - timestamp > CACHE_EXPIRE_MS;
}

// ============ 组织架构树（纯部门） ============

// 递归构建纯部门树（不含用户）
async function buildDeptTree(parentDeptId, deptInfoCache) {
    let deptInfo = deptInfoCache.get(parentDeptId);
    if (!deptInfo) {
        deptInfo = await getDeptInfo(parentDeptId);
        if (!deptInfo) return null;
        deptInfoCache.set(parentDeptId, deptInfo);
    }

    const node = {
        key: 'dept-' + parentDeptId,
        deptId: parentDeptId,
        title: deptInfo.name || '部门' + parentDeptId,
        type: 'dept',
        isLeaf: false, // 部门节点都可展开（异步加载用户）
        children: [],
    };

    const subDeptIds = await listSubDepartmentIds(parentDeptId);
    for (const subDeptId of subDeptIds) {
        const childNode = await buildDeptTree(subDeptId, deptInfoCache);
        if (childNode) {
            node.children.push(childNode);
        }
    }

    // 如果没有子部门，标记为可加载用户的叶子节点
    if (node.children.length === 0) {
        node.isLeaf = false; // 仍然可展开（展开后显示用户）
    }

    return node;
}

// 获取用户范围内的组织架构树（纯部门）
// 策略：内存有且未过期→返回；有但过期→返回+后台刷新；无→从钉钉获取→存内存+DB
export async function getScopedDeptTree(userDeptIds) {
    // 内存有缓存
    if (deptTreeCache) {
        if (!isCacheExpired(deptTreeTimestamp)) {
            logger.debug('组织架构树：返回内存缓存');
            return deptTreeCache;
        }
        // 过期：先返回缓存，后台异步刷新
        logger.info('组织架构树：缓存已过期，先返回旧数据，后台异步刷新');
        refreshDeptTree(userDeptIds);
        return deptTreeCache;
    }

    // 内存无缓存：尝试从数据库加载
    const dbTree = await loadDeptTreeFromDB();
    if (dbTree) {
        logger.info('组织架构树：从数据库加载到内存');
        deptTreeCache = dbTree;
        // 检查是否过期
        if (isCacheExpired(deptTreeTimestamp)) {
            logger.info('组织架构树：DB数据已过期，后台异步刷新');
            refreshDeptTree(userDeptIds);
        }
        return deptTreeCache;
    }

    // 数据库也无：从钉钉获取（只获取组织架构，不获取用户）
    logger.info('组织架构树：无缓存，从钉钉获取组织架构');
    const tree = await buildScopedDeptTreeFromDingtalk(userDeptIds);
    if (tree) {
        deptTreeCache = tree;
        deptTreeTimestamp = Date.now();
        await saveDeptTreeToDB(tree);
    }
    return tree;
}

// 从钉钉构建用户范围内的部门树
async function buildScopedDeptTreeFromDingtalk(userDeptIds) {
    const deptInfoCache = new Map();
    const rootChildren = [];

    for (const deptId of userDeptIds) {
        const node = await buildDeptTree(deptId, deptInfoCache);
        if (node) {
            rootChildren.push(node);
        }
    }

    if (rootChildren.length === 1) {
        return rootChildren[0];
    }

    return {
        key: 'root',
        title: '我的部门',
        type: 'dept',
        isLeaf: false,
        children: rootChildren,
    };
}

// 后台异步刷新部门树
async function refreshDeptTree(userDeptIds) {
    try {
        const tree = await buildScopedDeptTreeFromDingtalk(userDeptIds);
        if (tree) {
            deptTreeCache = tree;
            deptTreeTimestamp = Date.now();
            await saveDeptTreeToDB(tree);
            logger.info('组织架构树：后台刷新成功');
        }
    } catch (error) {
        logger.error('组织架构树：后台刷新失败:', error.message);
    }
}

// 保存部门树到数据库（独立表 org_dept_tree）
async function saveDeptTreeToDB(tree) {
    try {
        await dbAdapter.dbSetOrgDeptTree(JSON.stringify(tree), deptTreeTimestamp);
    } catch (error) {
        logger.error('保存部门树到DB失败:', error.message);
    }
}

// 从数据库加载部门树
async function loadDeptTreeFromDB() {
    try {
        const row = await dbAdapter.dbGetOrgDeptTree();
        if (row && row.treeData) {
            deptTreeTimestamp = row.updateTime;
            return JSON.parse(row.treeData);
        }
    } catch (error) {
        logger.error('从DB加载部门树失败:', error.message);
    }
    return null;
}

// ============ 部门用户列表 ============

// 获取指定部门的用户列表
// 策略：内存有且未过期→返回；有但过期→返回+后台刷新；无→查DB→DB有→加载到内存+检查过期；DB无→从钉钉获取→存内存+DB
export async function getDeptUsers(deptId) {
    const cacheKey = String(deptId);

    // 1. 内存有缓存
    if (deptUsersCache.has(cacheKey)) {
        const cached = deptUsersCache.get(cacheKey);
        if (!isCacheExpired(cached.timestamp)) {
            logger.debug(`部门用户(deptId=${deptId})：返回内存缓存`);
            return cached.users;
        }
        // 过期：先返回，后台刷新
        logger.info(`部门用户(deptId=${deptId})：缓存过期，先返回旧数据，后台刷新`);
        refreshDeptUsers(deptId);
        return cached.users;
    }

    // 2. 内存无：查数据库
    const dbData = await loadDeptUsersFromDB(cacheKey);
    if (dbData) {
        logger.info(`部门用户(deptId=${deptId})：从数据库加载到内存`);
        deptUsersCache.set(cacheKey, dbData);
        if (isCacheExpired(dbData.timestamp)) {
            logger.info(`部门用户(deptId=${deptId})：DB数据过期，后台刷新`);
            refreshDeptUsers(deptId);
        }
        return dbData.users;
    }

    // 3. 数据库也无：从钉钉获取
    logger.info(`部门用户(deptId=${deptId})：无缓存，从钉钉获取`);
    const users = await fetchDeptUsersFromDingtalk(deptId);
    const cacheData = { users, timestamp: Date.now() };
    deptUsersCache.set(cacheKey, cacheData);
    await saveDeptUsersToDB(cacheKey, cacheData);
    return users;
}

// 从钉钉获取部门用户列表（分页）
async function fetchDeptUsersFromDingtalk(deptId) {
    const users = [];
    let cursor = 0;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < 50) {
        pageCount++;
        const { users: pageUsers, hasMore: more } = await getDeptUserList(deptId, cursor, 100);
        for (const user of pageUsers) {
            users.push({
                key: 'user-' + user.userid,
                userid: user.userid,
                title: user.name || user.userid,
                type: 'user',
                avatar: user.avatar || '',
                job_number: user.job_number || '',
            });
        }
        hasMore = more;
        cursor += 100;
    }

    logger.debug(`从钉钉获取部门用户(deptId=${deptId}): ${users.length}个用户`);
    return users;
}

// 后台异步刷新部门用户
async function refreshDeptUsers(deptId) {
    try {
        const users = await fetchDeptUsersFromDingtalk(deptId);
        const cacheData = { users, timestamp: Date.now() };
        deptUsersCache.set(String(deptId), cacheData);
        await saveDeptUsersToDB(String(deptId), cacheData);
        logger.info(`部门用户(deptId=${deptId})：后台刷新成功`);
    } catch (error) {
        logger.error(`部门用户(deptId=${deptId})：后台刷新失败:`, error.message);
    }
}

// 保存部门用户到数据库（独立表 org_dept_users）
async function saveDeptUsersToDB(cacheKey, cacheData) {
    try {
        await dbAdapter.dbSetOrgDeptUsers(cacheKey, JSON.stringify(cacheData.users), cacheData.timestamp);
    } catch (error) {
        logger.error('保存部门用户到DB失败:', error.message);
    }
}

// 从数据库加载部门用户
async function loadDeptUsersFromDB(cacheKey) {
    try {
        const row = await dbAdapter.dbGetOrgDeptUsers(cacheKey);
        if (row && row.usersData) {
            return {
                users: JSON.parse(row.usersData),
                timestamp: row.updateTime,
            };
        }
    } catch (error) {
        logger.error('从DB加载部门用户失败:', error.message);
    }
    return null;
}

// ============ 启动时初始化 ============

// 启动时从数据库加载组织架构树到内存
export async function initOrgCache() {
    logger.info('初始化组织架构缓存...');
    const dbTree = await loadDeptTreeFromDB();
    if (dbTree) {
        deptTreeCache = dbTree;
        logger.info('组织架构树已从数据库加载到内存');
        if (isCacheExpired(deptTreeTimestamp)) {
            logger.info('组织架构树DB数据已过期，将在首次请求时刷新');
        }
    } else {
        logger.info('数据库中无组织架构树数据，将在首次请求时从钉钉获取');
    }
}
