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
const { handleCreateMeeting, handleQueryUserEndedMeetingList, handleQueryUserMeetingList } = await import('./wemeet/wemeetApi.js');
const { handleGenerateJoinScheme, handleGenerateJumpUrl, handleGenerateJoinUrl } = await import('./wemeet/wemeetUtil.js');
const { getUserAccessToken, getSignParameters } = await import('./dingtalkapi/dingtalkAuth.js');
const dbAdapter = (await import('./db/db_adapter.js')).default;
const { initRedis } = await import('./db/redis.js');
const { handleFrontendLogs } = await import('./util/logHandler.js');

import Koa from 'koa';
import Router from 'koa-router';
import session from 'koa-session';
import bodyParser from 'koa-bodyparser';

// 初始化数据库
dbAdapter.initDatabase();

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

// 处理OPTIONS预检请求
router.options('/api/:path*', (ctx) => {
    ctx.status = 204;
    // 不设置任何CORS头，让Nginx处理
});

// 注册服务端路由和处理
router.get(serverConfig.getUserAccessTokenPath, getUserAccessToken)
router.get(serverConfig.getSignParametersPath, getSignParameters)
router.post(serverConfig.createMeetingPath, handleCreateMeeting)
router.get(serverConfig.queryUserEndedMeetingListPath, handleQueryUserEndedMeetingList)
router.get(serverConfig.queryUserMeetingListPath, handleQueryUserMeetingList)
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

app.listen(port, () => {
    logger.info(`server is start, listening on port ${port}`);
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
    // 可以添加优雅关闭的逻辑
    process.exit(0);
});

process.on('SIGINT', () => {
    try {
        logger.info('收到 SIGINT 信号，正在关闭服务器...');
    } catch (logErr) {
        console.error('收到 SIGINT 信号，正在关闭服务器...');
        console.error('日志记录失败:', logErr);
    }
    // 可以添加优雅关闭的逻辑
    process.exit(0);
});