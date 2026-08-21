import dotenv from 'dotenv';
import path from 'path';

// 获取项目根目录（相对于当前文件的路径）
const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const envPath = path.join(projectRoot, '.env');

// 加载环境变量配置（必须在导入其他模块之前执行）
dotenv.config({ path: envPath });

// 使用动态 import 确保环境变量已加载后再导入配置
const { default: serverConfig } = await import('./config/server_config.js');
const { logger } = await import('./util/logger.js');
const { handleVerification, handleEvent } = await import('./wemeet/webhook.js');
const { handleCreateMeeting, handleQueryUserEndedMeetingList, handleQueryUserMeetingList, handleGetUserInfo } = await import('./wemeet/wemeetApi.js');
const { handleGenerateJoinScheme, handleGenerateJumpUrl, handleGenerateJoinUrl } = await import('./wemeet/wemeetUtil.js');
const { getUserAccessToken, getSignParameters, isLogin, getUserid, handleSearchUser, handleGetScopedUsers, handleGetDeptUsers } = await import('./dingtalkapi/dingtalkAuth.js');
const dbAdapter = (await import('./db/db_adapter.js')).default;
const { initRedis } = await import('./db/redis.js');
const { handleFrontendLogs } = await import('./util/logHandler.js');
const { initializeAdminUserid } = await import('./util/adminUseridManager.js');
const { startCleanupScheduler, stopCleanupScheduler } = await import('./db/data_cleanup.js');
const { handleGetConfigDefinitions, handleSaveConfig, KEY_MAP } = await import('./admin/configManager.js');
const { syncEnvToDatabase, loadConfigFromDatabase } = await import('./config/configStore.js');
const { initOrgCache, stopOrgCacheScheduler } = await import('./dingtalkapi/orgCache.js');

import Koa from 'koa';
import Router from 'koa-router';
import session from 'koa-session';
import bodyParser from 'koa-bodyparser';
import serve from 'koa-static';
import fs from 'fs';
import zlib from 'zlib';

// 初始化数据库
dbAdapter.initDatabase().then(async () => {
  // 初始化ADMIN_USERID
  await initializeAdminUserid();
  // 同步 .env 配置到数据库（加密存储）
  await syncEnvToDatabase(serverConfig, KEY_MAP);
  // 从数据库加载配置到内存（解密并更新 serverConfig）
  await loadConfigFromDatabase(serverConfig, KEY_MAP);
  logger.info('系统配置加载完成');
  // 从数据库加载组织架构树到内存（启动时不从钉钉获取用户信息）
  await initOrgCache();
  // 启动数据定时清理调度器（在数据库初始化完成后启动）
  startCleanupScheduler();
});

// 初始化Redis
initRedis();

// Start Server
const app = new Koa()
const router = new Router();

// 配置Session的中间件
app.keys = ['some secret hurr'];   /*cookie的签名*/
const koaSessionConfig = {
    key: 'lk_koa:session', /** 默认 */
    maxAge: 2 * 3600 * 1000,  /*  cookie的过期时间，单位 ms  */
    overwrite: true, /** (boolean) can overwrite or not (default true)  默认 */
    httpOnly: true, /**  true表示只有服务器端可以获取cookie */
    signed: true, /** 默认 签名 */
    rolling: true, /** 在每次请求时强行设置 cookie，这将重置 cookie 过期时间（默认：false） 【需要修改】 */
    renew: false, /** (boolean) renew session when session is nearly expired      【需要修改】*/
};
app.use(session(koaSessionConfig, app));
// 使用 koa-bodyparser 中间件
app.use(bodyParser());

// gzip 压缩中间件：对文本类响应（静态JS/CSS/HTML/JSON等）启用压缩，
// 大幅减小高延迟链路下的传输体积，降低连接超时中断（ECONNRESET）概率
app.use(async (ctx, next) => {
    await next();
    if (!ctx.body || ctx.method === 'HEAD' || ctx.status === 204 || ctx.status === 304) return;
    if (ctx.response.get('Content-Encoding')) return;
    const acceptEncoding = (ctx.headers['accept-encoding'] || '').toLowerCase();
    if (!acceptEncoding.includes('gzip')) return;
    const contentType = ctx.response.get('Content-Type') || '';
    if (!/text|javascript|json|xml|svg|wasm/i.test(contentType)) return;

    // 流式响应（koa-static 以 stream 托管文件）：通过 gzip 转换流处理
    if (ctx.body && typeof ctx.body.pipe === 'function') {
        ctx.body = ctx.body.pipe(zlib.createGzip({ level: 6 }));
        ctx.set('Content-Encoding', 'gzip');
        ctx.remove('Content-Length');
        return;
    }
    // 缓冲型响应：仅在超过阈值（1KB）时压缩
    let buf = Buffer.isBuffer(ctx.body) ? ctx.body
        : typeof ctx.body === 'string' ? Buffer.from(ctx.body)
        : null;
    if (!buf || buf.length < 1024) return;
    const gz = zlib.gzipSync(buf, { level: 6 });
    ctx.body = gz;
    ctx.set('Content-Encoding', 'gzip');
    ctx.set('Content-Length', gz.length);
});

// 缓存策略中间件：静态资源（JS/CSS/字体/图片等）长缓存 immutable，HTML 不缓存以便发版即时生效
app.use(async (ctx, next) => {
    await next();
    if (ctx.status !== 200) return;
    const contentType = ctx.response.get('Content-Type') || '';
    if (contentType.includes('text/html')) {
        ctx.set('Cache-Control', 'no-cache');
    } else if (/javascript|css|font|image|svg|wasm|audio|video/i.test(contentType)) {
        ctx.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
});

// 静态文件服务：托管前端构建产物（build 目录），实现前后端同端口部署
const buildDir = path.resolve(projectRoot, 'build');
const staticExists = fs.existsSync(buildDir);
if (staticExists) {
    app.use(serve(buildDir));
    logger.info(`静态文件服务已启用，托管目录: ${buildDir}`);
}

router.options('/api/:path*', (ctx) => {
    const origin = ctx.headers.origin || '*';
    ctx.set("Access-Control-Allow-Origin", origin);
    ctx.set("Access-Control-Allow-Methods", "OPTIONS, GET, PUT, POST, DELETE");
    ctx.set("Access-Control-Allow-Credentials", "true");
    ctx.set("Access-Control-Allow-Headers", "x-requested-with, accept, origin, content-type");
    ctx.status = 204;
});

// 注册服务端路由和处理
router.get(serverConfig.getUserAccessTokenPath, getUserAccessToken)
router.get(serverConfig.getSignParametersPath, getSignParameters)
router.post(serverConfig.createMeetingPath, handleCreateMeeting)
router.get(serverConfig.queryUserEndedMeetingListPath, handleQueryUserEndedMeetingList)
router.get(serverConfig.queryUserMeetingListPath, handleQueryUserMeetingList)
router.get(serverConfig.getUserInfoPath, handleGetUserInfo)
router.get(serverConfig.searchUserPath, handleSearchUser)
router.get(serverConfig.getUserScopedDepartmentsPath, handleGetScopedUsers)
router.get('/api/get_dept_users', handleGetDeptUsers)

// 管理页面配置接口
router.get('/api/admin/config', handleGetConfigDefinitions)
router.post('/api/admin/config', handleSaveConfig)
router.get(serverConfig.generateJoinSchemePath, handleGenerateJoinScheme)
router.get(serverConfig.generateJumpUrlPath, handleGenerateJumpUrl)
router.get(serverConfig.generateJoinUrlPath, handleGenerateJoinUrl)

// 前端日志接收接口
router.post('/api/logs', handleFrontendLogs)

// webhook相关路由和处理
router.get(serverConfig.webhookPath, handleVerification);
router.post(serverConfig.webhookPath, handleEvent);

// 保持alive路由
router.get(serverConfig.keepAlivePath, (ctx) => {
    ctx.body = serverConfig.keepAliveResponse;
})

// 注册路由
const port = process.env.PORT || serverConfig.apiPort;
app.use(router.routes()).use(router.allowedMethods());

// 读取 package.json 获取版本信息
const pkgPath = path.join(projectRoot, 'package.json');
const { version, name } = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

// SPA fallback：非 /api 的未匹配 GET 请求返回 index.html，交给前端路由处理
if (staticExists) {
    app.use(async (ctx) => {
        if (ctx.method === 'GET' && !ctx.path.startsWith('/api') && ctx.status === 404) {
            const indexFile = path.join(buildDir, 'index.html');
            if (fs.existsSync(indexFile)) {
                ctx.type = 'text/html';
                const indexStream = fs.createReadStream(indexFile);
                indexStream.on('error', (streamErr) => {
                    logger.debug('返回 index.html 流读取错误:', streamErr.message);
                });
                ctx.body = indexStream;
                ctx.status = 200;
            }
        }
    });
}

// 全局错误处理：捕获请求处理过程中的错误（如客户端断开导致的流错误）
app.on('error', (err, ctx) => {
    // 客户端主动断开连接导致的错误，属于正常现象，仅 debug 记录，避免污染日志
    if (err && (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ECONNABORTED')) {
        logger.debug(`客户端连接中断: ${err.code}${ctx ? ' ' + ctx.method + ' ' + ctx.url : ''}`);
        return;
    }
    // 仅记录错误摘要，避免完整堆栈对象刷屏
    const reqInfo = ctx ? `${ctx.method} ${ctx.url}` : '';
    logger.error(`请求处理错误 ${reqInfo}: ${err.message}`);
});

app.listen(port, () => {
    logger.info(`${name} v${version} server started, listening on port ${port}`);
}).on('error', (err) => {
    logger.error(`Failed to start server on port ${port}:`, err);
});

// 安全地记录错误到stderr
function safeErrorLog(message, error) {
    try {
        const errMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
        process.stderr.write(`${message}: ${errMsg}\n`);
    } catch (stderrErr) {
        // 如果stderr也不可用，静默失败
    }
}

// 处理未捕获的异常
process.on('uncaughtException', (err) => {
    try {
        logger.error('捕获到未处理的异常:', err);
    } catch (logErr) {
        // 如果日志记录失败，使用安全的方式记录到stderr
        safeErrorLog('捕获到未处理的异常', err);
        safeErrorLog('日志记录失败', logErr);
    }
    // 可以添加其他清理操作
});

// 处理未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
    try {
        logger.error('捕获到未处理的 Promise 拒绝:', reason);
    } catch (logErr) {
        // 如果日志记录失败，使用安全的方式记录到stderr
        safeErrorLog('捕获到未处理的 Promise 拒绝', reason);
        safeErrorLog('日志记录失败', logErr);
    }
    // 可以添加其他清理操作
});

// 处理进程终止信号
process.on('SIGTERM', () => {
    try {
        logger.info('收到 SIGTERM 信号，正在关闭服务器...');
    } catch (logErr) {
        console.error('收到 SIGTERM 信号，正在关闭服务器...');
        console.error('日志记录失败:', logErr);
    }
    // 停止数据定时清理调度器
    stopCleanupScheduler();
    // 停止组织架构定时刷新
    stopOrgCacheScheduler();
    process.exit(0);
});

process.on('SIGINT', () => {
    try {
        logger.info('收到 SIGINT 信号，正在关闭服务器...');
    } catch (logErr) {
        console.error('收到 SIGINT 信号，正在关闭服务器...');
        console.error('日志记录失败:', logErr);
    }
    // 停止数据定时清理调度器
    stopCleanupScheduler();
    // 停止组织架构定时刷新
    stopOrgCacheScheduler();
    process.exit(0);
});