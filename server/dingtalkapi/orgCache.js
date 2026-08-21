import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { logger } from '../util/logger.js';
import dbAdapter from '../db/db_adapter.js';
import { getDeptInfo, getDeptUserListWithRetry, listSubDepartmentInfoWithRetry } from './dingtalkUtil.js';

dayjs.extend(utc);
dayjs.extend(timezone);

// 服务时区（定时任务时间点按东八区计算）
const SERVER_TIMEZONE = 'Asia/Shanghai';

// 每日全量组织架构刷新时间点（东八区凌晨1点）
const TREE_REFRESH_HOUR = 1;

// 全量刷新失败后的退避时间（避免钉钉持续故障时每个请求都触发全量拉取）
const TREE_REFRESH_FAIL_BACKOFF_MS = 5 * 60 * 1000;

// 内存缓存
// 组织架构树（纯部门，不含用户）
let deptTreeCache = null;           // 部门树对象
let deptTreeTimestamp = 0;          // 部门树更新时间戳
let deptNodeIndex = null;           // Map<deptId, node>，O(1)定位部门节点

// 全量刷新进行中的Promise（并发去重：多个请求同时触发时只拉取一次）
let treeRefreshInFlight = null;
// 上次全量刷新失败时间（用于失败退避）
let lastTreeRefreshFailAt = 0;

// 部门用户列表缓存：Map<deptId, {users, timestamp}>
const deptUsersCache = new Map();
// 部门用户后台刷新进行中：Map<cacheKey, Promise>（并发去重：刷新完成前不重复触发）
const deptUsersRefreshing = new Map();

// 缓存过期时间（24小时）
const CACHE_EXPIRE_MS = 24 * 60 * 60 * 1000;

// 判断缓存是否过期
function isCacheExpired(timestamp) {
    return Date.now() - timestamp > CACHE_EXPIRE_MS;
}

// ============ 钉钉API并发控制 ============

// 组织架构构建时同时在飞的钉钉API请求数上限（防止触发钉钉接口限流）
const API_CONCURRENCY = 5;

// 全局信号量：递归并行展开部门树时，实际API并发不超上限
const apiSemaphore = {
    active: 0,
    waiters: [],
    async acquire() {
        if (this.active < API_CONCURRENCY) {
            this.active++;
            return;
        }
        await new Promise(resolve => this.waiters.push(resolve));
    },
    release() {
        this.active--;
        const next = this.waiters.shift();
        if (next) {
            this.active++;
            next();
        }
    }
};

// 在并发限制内执行钉钉API调用
async function callWithConcurrencyLimit(fn) {
    await apiSemaphore.acquire();
    try {
        return await fn();
    } finally {
        apiSemaphore.release();
    }
}

// ============ 组织架构树（纯部门） ============

// 递归构建纯部门树（不含用户）
// deptName 由父级 listsub 结果提供（根部门由调用方先查询），避免每个部门再单独调用 department/get
// 同层子部门并行展开，实际API并发由全局信号量控制
// 子部门查询失败（重试后仍失败）时抛错，由调用方判定整体构建失败——避免残缺树被缓存
async function buildDeptTree(deptId, deptName) {
    const node = {
        key: 'dept-' + deptId,
        deptId: deptId,
        title: deptName || '部门' + deptId,
        type: 'dept',
        isLeaf: false, // 部门节点都可展开（异步加载用户）
        children: [],
    };

    const subDepts = await callWithConcurrencyLimit(() => listSubDepartmentInfoWithRetry(deptId));
    if (subDepts === null) {
        throw new Error(`获取子部门失败(重试后仍失败): deptId=${deptId}`);
    }
    if (subDepts.length === 0) {
        return node;
    }

    const childNodes = await Promise.all(
        subDepts.map(sub => buildDeptTree(sub.deptId, sub.name))
    );
    node.children = childNodes.filter(child => child !== null);
    return node;
}

// 获取用户范围内的组织架构树（纯部门）
// 策略：全量树就绪（内存→DB→钉钉兜底）后，从全量树中裁剪出用户部门范围返回
// 全量树的刷新由启动流程和每日凌晨1点定时任务负责，请求路径仅在无缓存时兜底（带失败退避和并发去重）
export async function getScopedDeptTree(userDeptIds) {
    // 内存无全量树：尝试从数据库加载
    if (!deptTreeCache) {
        const dbTree = await loadDeptTreeFromDB();
        if (dbTree) {
            setDeptTreeCache(dbTree.tree, dbTree.timestamp);
            logger.info('组织架构树：从数据库加载到内存');
        } else if (Date.now() - lastTreeRefreshFailAt > TREE_REFRESH_FAIL_BACKOFF_MS) {
            // 数据库也无（如启动时钉钉获取失败）：兜底从钉钉获取全量
            // 失败退避：距上次失败不足5分钟时不重试，避免钉钉故障期间每个请求都触发全量拉取
            logger.info('组织架构树：无缓存，从钉钉获取全量组织架构');
            await refreshDeptTreeFromDingtalk();
        } else {
            logger.warn('组织架构树：无缓存且处于失败退避期，跳过本次钉钉拉取');
        }
    }

    if (!deptTreeCache) {
        return null;
    }

    // 从全量树中裁剪出用户所在部门及子部门
    return extractScopedTree(userDeptIds);
}

// 从全量树中提取用户部门范围子树（多部门时包一层虚拟根节点）
// 返回的是内部缓存节点的引用，仅供序列化返回，调用方不得修改
function extractScopedTree(userDeptIds) {
    const subtrees = [];
    for (const deptId of userDeptIds) {
        const node = findDeptNode(deptId);
        if (node) {
            subtrees.push(node);
        } else {
            logger.warn(`组织架构树：未找到用户部门 deptId=${deptId}`);
        }
    }

    if (subtrees.length === 0) {
        return null;
    }
    if (subtrees.length === 1) {
        return subtrees[0];
    }

    return {
        key: 'root',
        title: '我的部门',
        type: 'dept',
        isLeaf: false,
        children: subtrees,
    };
}

// 通过索引O(1)定位部门节点（索引未就绪时降级为递归查找）
function findDeptNode(deptId) {
    if (deptNodeIndex) {
        return deptNodeIndex.get(deptId) || null;
    }
    return deptTreeCache ? deepFindDeptNode(deptTreeCache, deptId) : null;
}

// 在树中深度查找指定部门节点（索引降级路径）
function deepFindDeptNode(node, deptId) {
    if (node.deptId === deptId) {
        return node;
    }
    for (const child of node.children || []) {
        const found = deepFindDeptNode(child, deptId);
        if (found) {
            return found;
        }
    }
    return null;
}

// 设置内存树缓存并同步构建部门节点索引（索引仅供查找，节点为原对象引用）
function setDeptTreeCache(tree, timestamp) {
    deptTreeCache = tree;
    deptTreeTimestamp = timestamp;
    const index = new Map();
    const stack = [tree];
    while (stack.length > 0) {
        const node = stack.pop();
        if (node && node.deptId !== undefined) {
            index.set(node.deptId, node);
        }
        for (const child of (node && node.children) || []) {
            stack.push(child);
        }
    }
    deptNodeIndex = index;
}

// 从钉钉获取全量组织架构树（从企业根部门deptId=1开始）
async function fetchFullDeptTreeFromDingtalk() {
    const rootDeptId = 1;
    const rootInfo = await callWithConcurrencyLimit(() => getDeptInfo(rootDeptId));
    if (rootInfo === null) {
        throw new Error('获取企业根部门信息失败');
    }
    const rootName = rootInfo.name || '企业根部门';
    return await buildDeptTree(rootDeptId, rootName);
}

// 从钉钉全量刷新组织架构树，保存到内存和数据库
// 并发去重：刷新进行中时，后续调用直接复用同一个Promise
async function refreshDeptTreeFromDingtalk() {
    if (treeRefreshInFlight) {
        return treeRefreshInFlight;
    }
    treeRefreshInFlight = (async () => {
        const startTime = Date.now();
        try {
            const tree = await fetchFullDeptTreeFromDingtalk();
            setDeptTreeCache(tree, Date.now());
            await saveDeptTreeToDB(tree);
            // 清理已不存在于组织架构中的部门用户缓存（孤儿数据）
            await cleanupOrphanDeptUsers(tree);
            lastTreeRefreshFailAt = 0;
            logger.info(`组织架构树：全量刷新成功，耗时 ${((Date.now() - startTime) / 1000).toFixed(1)} 秒`);
            return true;
        } catch (error) {
            lastTreeRefreshFailAt = Date.now();
            logger.error('组织架构树：全量刷新失败:', error.message);
            return false;
        }
    })();
    try {
        return await treeRefreshInFlight;
    } finally {
        treeRefreshInFlight = null;
    }
}

// 清理组织架构树中已不存在的部门的用户缓存（DB孤儿行+内存条目）
async function cleanupOrphanDeptUsers(tree) {
    try {
        const validDeptIds = new Set();
        const stack = [tree];
        while (stack.length > 0) {
            const node = stack.pop();
            if (node && node.deptId !== undefined) {
                validDeptIds.add(String(node.deptId));
            }
            for (const child of (node && node.children) || []) {
                stack.push(child);
            }
        }

        // 内存：删除已不存在的部门缓存
        for (const key of deptUsersCache.keys()) {
            if (!validDeptIds.has(key)) {
                deptUsersCache.delete(key);
            }
        }

        // DB：删除孤儿行
        const allDeptIds = await dbAdapter.dbListOrgDeptUserIds();
        const orphanIds = allDeptIds.filter(id => !validDeptIds.has(id));
        if (orphanIds.length > 0) {
            await dbAdapter.dbDeleteOrgDeptUsersByDeptIds(orphanIds);
            logger.info(`组织架构树：已清理 ${orphanIds.length} 个已删除部门的用户缓存`);
        }
    } catch (error) {
        logger.error('清理孤儿部门用户缓存失败:', error.message);
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

// 从数据库加载部门树（返回 {tree, timestamp}，不改内存状态）
async function loadDeptTreeFromDB() {
    try {
        const row = await dbAdapter.dbGetOrgDeptTree();
        if (row && row.treeData) {
            return {
                tree: JSON.parse(row.treeData),
                timestamp: Number(row.updateTime),
            };
        }
    } catch (error) {
        logger.error('从DB加载部门树失败:', error.message);
    }
    return null;
}

// ============ 部门用户列表 ============

// 获取指定部门的用户列表
// 策略：内存有且未过期→返回；有但过期→返回+后台刷新（去重）；无→查DB→DB有→加载到内存+检查过期；DB无→从钉钉获取→存内存+DB（失败不落缓存）
export async function getDeptUsers(deptId) {
    const cacheKey = String(deptId);

    // 1. 内存有缓存
    if (deptUsersCache.has(cacheKey)) {
        const cached = deptUsersCache.get(cacheKey);
        if (!isCacheExpired(cached.timestamp)) {
            logger.debug(`部门用户(deptId=${deptId})：返回内存缓存`);
            return cached.users;
        }
        // 过期：先返回，后台刷新（进行中则复用，不重复触发）
        logger.info(`部门用户(deptId=${deptId})：缓存过期，先返回旧数据，后台刷新`);
        refreshDeptUsers(deptId).catch(() => { });
        return cached.users;
    }

    // 2. 内存无：查数据库
    const dbData = await loadDeptUsersFromDB(cacheKey);
    if (dbData) {
        logger.info(`部门用户(deptId=${deptId})：从数据库加载到内存`);
        deptUsersCache.set(cacheKey, dbData);
        if (isCacheExpired(dbData.timestamp)) {
            logger.info(`部门用户(deptId=${deptId})：DB数据过期，后台刷新`);
            refreshDeptUsers(deptId).catch(() => { });
        }
        return dbData.users;
    }

    // 3. 数据库也无：从钉钉获取（失败时抛错，不缓存空结果）
    logger.info(`部门用户(deptId=${deptId})：无缓存，从钉钉获取`);
    const users = await fetchDeptUsersFromDingtalk(deptId);
    const cacheData = { users, timestamp: Date.now() };
    deptUsersCache.set(cacheKey, cacheData);
    await saveDeptUsersToDB(cacheKey, cacheData);
    return users;
}

// 从钉钉获取部门用户列表（分页）
// 分页任一页失败（重试后仍失败）时抛错，避免把失败当作"无用户"缓存
async function fetchDeptUsersFromDingtalk(deptId) {
    const users = [];
    let cursor = 0;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < 50) {
        pageCount++;
        const page = await callWithConcurrencyLimit(() => getDeptUserListWithRetry(deptId, cursor, 100));
        if (page === null) {
            throw new Error(`获取部门用户失败(重试后仍失败): deptId=${deptId}, cursor=${cursor}`);
        }
        for (const user of page.users) {
            users.push({
                key: 'user-' + user.userid,
                userid: user.userid,
                title: user.name || user.userid,
                type: 'user',
                avatar: user.avatar || '',
                job_number: user.job_number || '',
            });
        }
        hasMore = page.hasMore;
        cursor += 100;
    }

    logger.debug(`从钉钉获取部门用户(deptId=${deptId}): ${users.length}个用户`);
    return users;
}

// 后台异步刷新部门用户（并发去重：同一部门刷新进行中时复用同一个Promise）
function refreshDeptUsers(deptId) {
    const cacheKey = String(deptId);
    if (deptUsersRefreshing.has(cacheKey)) {
        return deptUsersRefreshing.get(cacheKey);
    }
    const p = (async () => {
        try {
            const users = await fetchDeptUsersFromDingtalk(deptId);
            const cacheData = { users, timestamp: Date.now() };
            deptUsersCache.set(cacheKey, cacheData);
            await saveDeptUsersToDB(cacheKey, cacheData);
            logger.info(`部门用户(deptId=${deptId})：后台刷新成功`);
        } catch (error) {
            logger.error(`部门用户(deptId=${deptId})：后台刷新失败:`, error.message);
        }
    })().finally(() => {
        deptUsersRefreshing.delete(cacheKey);
    });
    deptUsersRefreshing.set(cacheKey, p);
    return p;
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

// ============ 启动初始化与定时刷新 ============

// 部门树定时刷新定时器句柄
let deptTreeRefreshTimer = null;

// 计算距离下一个刷新时间点（东八区凌晨1点）的毫秒数
function getDelayToNextRefresh() {
    const now = dayjs().tz(SERVER_TIMEZONE);
    let target = now.hour(TREE_REFRESH_HOUR).minute(0).second(0).millisecond(0);
    if (!now.isBefore(target)) {
        target = target.add(1, 'day');
    }
    return target.valueOf() - now.valueOf();
}

// 定时刷新失败后的重试间隔（30分钟）
const TREE_REFRESH_RETRY_DELAY_MS = 30 * 60 * 1000;

// 启动每日凌晨1点的全量组织架构定时刷新（递归调度避免长时间运行产生时间漂移）
function startDeptTreeScheduler() {
    const delay = getDelayToNextRefresh();
    const nextTime = dayjs().tz(SERVER_TIMEZONE).add(delay, 'millisecond').format('YYYY-MM-DD HH:mm:ss');
    logger.info(`组织架构树定时刷新已启动，每日${TREE_REFRESH_HOUR}:00全量刷新，下次刷新时间: ${nextTime}`);
    deptTreeRefreshTimer = setTimeout(() => scheduleTreeRefresh(), delay);
}

// 执行一次全量刷新：成功后回到每日正常调度；失败后延迟重试（钉钉故障时不至于等到次日才有数据）
async function scheduleTreeRefresh() {
    let ok = false;
    try {
        ok = await refreshDeptTreeFromDingtalk();
    } catch (error) {
        logger.error('组织架构树：定时刷新异常:', error.message);
    }
    if (ok) {
        startDeptTreeScheduler();
    } else {
        const retryTime = dayjs().tz(SERVER_TIMEZONE).add(TREE_REFRESH_RETRY_DELAY_MS, 'millisecond').format('YYYY-MM-DD HH:mm:ss');
        logger.warn(`组织架构树：定时刷新失败，将于 ${retryTime} 重试`);
        deptTreeRefreshTimer = setTimeout(() => scheduleTreeRefresh(), TREE_REFRESH_RETRY_DELAY_MS);
    }
}

// 停止组织架构定时刷新（进程退出时调用）
function stopOrgCacheScheduler() {
    if (deptTreeRefreshTimer) {
        clearTimeout(deptTreeRefreshTimer);
        deptTreeRefreshTimer = null;
        logger.info('组织架构树定时刷新已停止');
    }
}

// 启动时初始化组织架构缓存：
// DB有数据且未超过24小时→从数据库加载到内存；
// DB数据过期或无数据→从钉钉获取全量组织架构（存内存+DB）
// 随后启动每日凌晨1点的定时全量刷新
export async function initOrgCache() {
    logger.info('初始化组织架构缓存...');
    const dbTree = await loadDeptTreeFromDB();
    if (dbTree) {
        if (!isCacheExpired(dbTree.timestamp)) {
            setDeptTreeCache(dbTree.tree, dbTree.timestamp);
            logger.info('组织架构树：DB数据未过期，已从数据库加载到内存');
        } else {
            logger.info('组织架构树：DB数据已超过24小时，从钉钉获取全量组织架构');
            await refreshDeptTreeFromDingtalk();
        }
    } else {
        logger.info('组织架构树：数据库无数据，从钉钉获取全量组织架构');
        await refreshDeptTreeFromDingtalk();
    }

    // 启动每日定时全量刷新
    startDeptTreeScheduler();
}
