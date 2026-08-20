import { logger } from '../util/logger.js';
import { configAccessControl, okResponse, failResponse } from '../server_util.js';
import { isLogin, getUserid } from '../dingtalkapi/dingtalkAuth.js';
import { getUserDetailByUserid } from '../dingtalkapi/dingtalkUtil.js';
import { getAllConfigValues, saveConfigValues } from '../config/configStore.js';
import serverConfig from '../config/server_config.js';

// 可配置的环境变量定义（按分组组织）
// type: text(文本), password(密码), switch(布尔开关), number(数字), select(下拉选择)
const CONFIG_DEFINITIONS = [
    // ===== 钉钉对接参数（前端）=====
    {
        group: '钉钉对接参数（前端）',
        key: 'REACT_APP_CORP_ID',
        label: '企业ID (CorpId)',
        type: 'text',
        required: true,
        description: '钉钉企业ID，在钉钉开发者后台获取',
        sensitive: false,
    },
    {
        group: '钉钉对接参数（前端）',
        key: 'REACT_APP_CLIENT_ID',
        label: '应用Client ID（前端）',
        type: 'text',
        required: true,
        description: '应用的Client ID（原AppKey和SuiteKey），前端使用',
        sensitive: false,
    },
    {
        group: '钉钉对接参数（前端）',
        key: 'REACT_APP_MODE',
        label: '工作台应用打开模式',
        type: 'select',
        required: false,
        description: 'app: 免登跳转腾讯会议客户端；upcoming: 展示待参加会议页面；schedule: 支持创建会议',
        options: [
            { value: 'app', label: 'app - 免登跳转腾讯会议客户端' },
            { value: 'upcoming', label: 'upcoming - 展示待参加会议页面' },
            { value: 'schedule', label: 'schedule - 支持创建会议' },
        ],
        sensitive: false,
    },
    {
        group: '钉钉对接参数（前端）',
        key: 'REACT_APP_CREATE_MEETING_BUTTON_VISIBILITY',
        label: '创建会议按钮展示控制',
        type: 'select',
        required: false,
        description: '控制创建会议按钮的可见范围',
        options: [
            { value: 'all', label: 'all - 所有用户可见' },
            { value: 'advanced', label: 'advanced - 仅高级账号可见' },
            { value: 'none', label: 'none - 全部不允许展示' },
        ],
        sensitive: false,
    },
    {
        group: '钉钉对接参数（前端）',
        key: 'REACT_APP_USER_SELECTOR_MODE',
        label: '人员选择模式',
        type: 'select',
        required: false,
        description: '预约/修改会议时设置主持人/参会人的方式',
        options: [
            { value: 'full', label: 'full - 全量模式，无范围限制' },
            { value: 'strict', label: 'strict - 严格模式，限制为用户所在部门及子部门' },
        ],
        sensitive: false,
    },

    // ===== 钉钉对接参数（后端）=====
    {
        group: '钉钉对接参数（后端）',
        key: 'DINGTALK_CORP_ID',
        label: '企业ID (CorpId)',
        type: 'text',
        required: true,
        description: '与前端CORP_ID相同',
        sensitive: false,
    },
    {
        group: '钉钉对接参数（后端）',
        key: 'DINGTALK_APP_ID',
        label: '钉钉应用ID',
        type: 'text',
        required: true,
        description: '在钉钉开发者后台获取',
        sensitive: false,
    },
    {
        group: '钉钉对接参数（后端）',
        key: 'DINGTALK_AGENT_ID',
        label: '钉钉应用Agent ID',
        type: 'text',
        required: true,
        description: '在钉钉开发者后台获取',
        sensitive: false,
    },
    {
        group: '钉钉对接参数（后端）',
        key: 'DINGTALK_CLIENT_ID',
        label: '钉钉应用Client ID（后端）',
        type: 'text',
        required: true,
        description: '原AppKey和SuiteKey，与前端相同',
        sensitive: false,
    },
    {
        group: '钉钉对接参数（后端）',
        key: 'DINGTALK_CLIENT_SECRET',
        label: '钉钉应用Client Secret',
        type: 'password',
        required: true,
        description: '原AppSecret和SuiteSecret',
        sensitive: true,
    },
    {
        group: '钉钉对接参数（后端）',
        key: 'DINGTALK_ROBOT_CODE',
        label: '钉钉机器人编码',
        type: 'text',
        required: false,
        description: '在钉钉开发者后台获取',
        sensitive: false,
    },
    {
        group: '钉钉对接参数（后端）',
        key: 'DINGTALK_CALENDAR_SWITCH',
        label: '预约会议时创建钉钉日程',
        type: 'switch',
        required: false,
        description: '预约普通会议时是否创建钉钉日程，对周期会议不生效',
        sensitive: false,
    },
    {
        group: '钉钉对接参数（后端）',
        key: 'DINGTALK_TODO_SWITCH',
        label: '预约会议时创建钉钉待办',
        type: 'switch',
        required: false,
        description: '预约普通会议时是否创建钉钉待办，对周期会议不生效',
        sensitive: false,
    },

    // ===== 腾讯会议对接参数 =====
    {
        group: '腾讯会议对接参数',
        key: 'WEMEET_APPID',
        label: '腾讯会议应用APPID',
        type: 'text',
        required: true,
        description: '在腾讯会议开发者平台获取',
        sensitive: false,
    },
    {
        group: '腾讯会议对接参数',
        key: 'WEMEET_REST_API_SDKID',
        label: '腾讯会议应用SDKID',
        type: 'text',
        required: true,
        description: '在腾讯会议开发者平台获取',
        sensitive: false,
    },
    {
        group: '腾讯会议对接参数',
        key: 'WEMEET_REST_API_SECRET_ID',
        label: '腾讯会议API应用SecretID',
        type: 'text',
        required: true,
        description: '在腾讯会议开发者平台获取',
        sensitive: true,
    },
    {
        group: '腾讯会议对接参数',
        key: 'WEMEET_REST_API_SECRET_KEY',
        label: '腾讯会议API应用SecretKey',
        type: 'password',
        required: true,
        description: '在腾讯会议开发者平台获取',
        sensitive: true,
    },
    {
        group: '腾讯会议对接参数',
        key: 'WEMEET_WEBHOOK_TOKEN',
        label: '腾讯会议webhook回调token',
        type: 'text',
        required: true,
        description: '在腾讯会议开发者平台获取',
        sensitive: true,
    },
    {
        group: '腾讯会议对接参数',
        key: 'WEMEET_WEBHOOK_AES_KEY',
        label: '腾讯会议webhook回调AES密钥',
        type: 'text',
        required: true,
        description: '在腾讯会议开发者平台获取',
        sensitive: true,
    },
    {
        group: '腾讯会议对接参数',
        key: 'WEMEET_SSO_URL',
        label: '腾讯会议IDaaS/Oneid免登链接前缀地址',
        type: 'text',
        required: true,
        description: '需要替换成自己所在环境的地址',
        sensitive: false,
    },
    {
        group: '腾讯会议对接参数',
        key: 'WEMEET_ADMIN_USERID',
        label: '腾讯会议管理员用户ID',
        type: 'text',
        required: true,
        description: '腾讯会议管理员用户ID',
        sensitive: false,
    },
    {
        group: '腾讯会议对接参数',
        key: 'FRONT_END_SERVER_URL',
        label: '前端server地址',
        type: 'text',
        required: true,
        description: '后端用于回调或通知前端',
        sensitive: false,
    },

    // ===== 会议默认参数配置 =====
    {
        group: '会议默认参数配置',
        key: 'REACT_APP_ONLY_USER_JOIN_TYPE',
        label: '成员入会限制类型',
        type: 'select',
        required: false,
        description: '1:所有成员可入会；2:仅受邀成员可入会；3:仅企业内部成员可入会',
        options: [
            { value: '1', label: '1 - 所有成员可入会' },
            { value: '2', label: '2 - 仅受邀成员可入会' },
            { value: '3', label: '3 - 仅企业内部成员可入会' },
        ],
        sensitive: false,
    },
    {
        group: '会议默认参数配置',
        key: 'REACT_APP_IS_SHOW_WATERMARK_SWITCH',
        label: '展示水印设置选项',
        type: 'switch',
        required: false,
        description: '是否展示水印设置选项',
        sensitive: false,
    },
    {
        group: '会议默认参数配置',
        key: 'REACT_APP_ALLOW_SCREEN_SHARED_WATERMARK',
        label: '开启水印',
        type: 'switch',
        required: false,
        description: '是否开启水印',
        sensitive: false,
    },
    {
        group: '会议默认参数配置',
        key: 'REACT_APP_WATER_MARK_TYPE',
        label: '水印样式',
        type: 'select',
        required: false,
        description: '0:单排；1:多排',
        options: [
            { value: '0', label: '0 - 单排' },
            { value: '1', label: '1 - 多排' },
        ],
        sensitive: false,
    },
    {
        group: '会议默认参数配置',
        key: 'REACT_APP_AUDIO_WATERMARK',
        label: '开启音频水印',
        type: 'switch',
        required: false,
        description: '是否开启音频水印',
        sensitive: false,
    },

    // ===== Redis配置 =====
    {
        group: 'Redis配置',
        key: 'REDIS_HOST',
        label: 'Redis主机地址',
        type: 'text',
        required: false,
        description: '留空则不使用Redis',
        sensitive: false,
    },
    {
        group: 'Redis配置',
        key: 'REDIS_PORT',
        label: 'Redis端口',
        type: 'number',
        required: false,
        description: '默认6379',
        sensitive: false,
    },
    {
        group: 'Redis配置',
        key: 'REDIS_PASSWORD',
        label: 'Redis密码',
        type: 'password',
        required: false,
        description: '无密码可留空',
        sensitive: true,
    },
    {
        group: 'Redis配置',
        key: 'REDIS_DB',
        label: 'Redis数据库索引',
        type: 'number',
        required: false,
        description: '默认0',
        sensitive: false,
    },
    {
        group: 'Redis配置',
        key: 'REDIS_KEY_PREFIX',
        label: 'Redis键前缀',
        type: 'text',
        required: false,
        description: '避免键冲突',
        sensitive: false,
    },
    {
        group: 'Redis配置',
        key: 'REDIS_USER_AUTH_EXPIRE',
        label: '用户鉴权信息过期时间（秒）',
        type: 'number',
        required: false,
        description: '默认3600',
        sensitive: false,
    },

    // ===== 数据自动过期/定时清理配置 =====
    {
        group: '数据自动过期/定时清理配置',
        key: 'DATA_CLEANUP_ENABLED',
        label: '启用数据定时清理',
        type: 'switch',
        required: false,
        description: '是否启用数据定时清理，默认启用',
        sensitive: false,
    },
    {
        group: '数据自动过期/定时清理配置',
        key: 'DATA_CLEANUP_TIME',
        label: '定时清理执行时间',
        type: 'text',
        required: false,
        description: '每日定时清理执行时间，格式 HH:MM，默认凌晨2点',
        sensitive: false,
    },
    {
        group: '数据自动过期/定时清理配置',
        key: 'ID_TOKEN_CLEANUP_ENABLED',
        label: '清理已过期的idToken记录',
        type: 'switch',
        required: false,
        description: '是否清理已过期的idToken记录，默认启用',
        sensitive: false,
    },
    {
        group: '数据自动过期/定时清理配置',
        key: 'TODO_RETENTION_DAYS',
        label: 'todo数据保留天数',
        type: 'number',
        required: false,
        description: '超过则清理，设为0表示不清理，默认366天',
        sensitive: false,
    },
    {
        group: '数据自动过期/定时清理配置',
        key: 'CALENDAR_RETENTION_DAYS',
        label: 'calendar数据保留天数',
        type: 'number',
        required: false,
        description: '超过则清理，设为0表示不清理，默认366天',
        sensitive: false,
    },
    {
        group: '数据自动过期/定时清理配置',
        key: 'USERINFO_RETENTION_DAYS',
        label: '用户信息保留天数',
        type: 'number',
        required: false,
        description: '超过最后登录时间则清理，默认366天，设为0表示不清理',
        sensitive: false,
    },

    // ===== 日志配置 =====
    {
        group: '日志配置',
        key: 'LOG_LEVEL',
        label: '日志级别',
        type: 'select',
        required: false,
        description: '服务端日志级别',
        options: [
            { value: 'debug', label: 'debug' },
            { value: 'info', label: 'info' },
            { value: 'warn', label: 'warn' },
            { value: 'error', label: 'error' },
        ],
        sensitive: false,
    },
    {
        group: '日志配置',
        key: 'REACT_APP_ENABLE_FRONTEND_LOG',
        label: '启用前端日志收集',
        type: 'switch',
        required: false,
        description: '是否启用前端日志收集',
        sensitive: false,
    },
    {
        group: '日志配置',
        key: 'REACT_APP_LOG_QUEUE_SIZE',
        label: '前端日志队列最大大小',
        type: 'number',
        required: false,
        description: '默认100',
        sensitive: false,
    },
    {
        group: '日志配置',
        key: 'REACT_APP_LOG_FLUSH_INTERVAL',
        label: '前端日志刷新间隔（毫秒）',
        type: 'number',
        required: false,
        description: '默认10000',
        sensitive: false,
    },
    {
        group: '日志配置',
        key: 'REACT_APP_ENABLE_LOG_WORKER',
        label: '启用Web Worker处理日志',
        type: 'switch',
        required: false,
        description: '是否启用Web Worker处理日志',
        sensitive: false,
    },
    {
        group: '日志配置',
        key: 'REACT_APP_LOG_WORKER_MAX_RETRY_COUNT',
        label: '日志发送最大重试次数',
        type: 'number',
        required: false,
        description: '默认3',
        sensitive: false,
    },
    {
        group: '日志配置',
        key: 'REACT_APP_LOG_WORKER_BATCH_SIZE',
        label: '每批发送的最大日志数量',
        type: 'number',
        required: false,
        description: '默认50',
        sensitive: false,
    },
    {
        group: '日志配置',
        key: 'REACT_APP_PROD_ENABLE_ERROR_ONLY',
        label: '生产环境只记录错误日志',
        type: 'switch',
        required: false,
        description: '生产环境是否只记录错误日志',
        sensitive: false,
    },
    {
        group: '日志配置',
        key: 'REACT_APP_PROD_ENABLE_STACK_TRACE',
        label: '生产环境记录调用栈',
        type: 'switch',
        required: false,
        description: '生产环境是否记录调用栈',
        sensitive: false,
    },
    {
        group: '日志配置',
        key: 'REACT_APP_PROD_LOG_LEVEL',
        label: '生产环境日志级别',
        type: 'select',
        required: false,
        description: '生产环境日志级别',
        options: [
            { value: 'debug', label: 'debug' },
            { value: 'info', label: 'info' },
            { value: 'warn', label: 'warn' },
            { value: 'error', label: 'error' },
        ],
        sensitive: false,
    },
    {
        group: '日志配置',
        key: 'REACT_APP_DEBUG_SWITCH',
        label: '调试模式开关',
        type: 'switch',
        required: false,
        description: '开启后会输出更多调试信息',
        sensitive: false,
    },
];

// 环境变量名 → serverConfig 属性名 映射
// null 表示前端变量（无对应 serverConfig 属性）
const KEY_MAP = {
    // 前端变量
    'REACT_APP_CORP_ID': null,
    'REACT_APP_CLIENT_ID': null,
    'REACT_APP_MODE': null,
    'REACT_APP_CREATE_MEETING_BUTTON_VISIBILITY': null,
    'REACT_APP_USER_SELECTOR_MODE': null,
    'REACT_APP_ONLY_USER_JOIN_TYPE': null,
    'REACT_APP_IS_SHOW_WATERMARK_SWITCH': null,
    'REACT_APP_ALLOW_SCREEN_SHARED_WATERMARK': null,
    'REACT_APP_WATER_MARK_TYPE': null,
    'REACT_APP_AUDIO_WATERMARK': null,
    'REACT_APP_ENABLE_FRONTEND_LOG': null,
    'REACT_APP_LOG_QUEUE_SIZE': null,
    'REACT_APP_LOG_FLUSH_INTERVAL': null,
    'REACT_APP_ENABLE_LOG_WORKER': null,
    'REACT_APP_LOG_WORKER_MAX_RETRY_COUNT': null,
    'REACT_APP_LOG_WORKER_BATCH_SIZE': null,
    'REACT_APP_PROD_ENABLE_ERROR_ONLY': null,
    'REACT_APP_PROD_ENABLE_STACK_TRACE': null,
    'REACT_APP_PROD_LOG_LEVEL': null,
    'REACT_APP_DEBUG_SWITCH': null,
    // 后端变量
    'WEMEET_APPID': 'wemeetAPPID',
    'WEMEET_REST_API_SDKID': 'wemeetRestAPISDKID',
    'WEMEET_REST_API_SECRET_ID': 'wemeetRestAPISecretID',
    'WEMEET_REST_API_SECRET_KEY': 'wemeetRestAPISecretKey',
    'WEMEET_WEBHOOK_TOKEN': 'wemeetWebhookToken',
    'WEMEET_WEBHOOK_AES_KEY': 'wemeetWebhookAESKey',
    'WEMEET_SSO_URL': 'wemeetSSOURL',
    'WEMEET_ADMIN_USERID': 'wemeetAdminUserID',
    'FRONT_END_SERVER_URL': 'frontEndServerUrl',
    'DINGTALK_CORP_ID': 'dingtalkCorpId',
    'DINGTALK_APP_ID': 'dingtalkAppId',
    'DINGTALK_AGENT_ID': 'dingtalkAgentId',
    'DINGTALK_CLIENT_ID': 'dingtalkClientId',
    'DINGTALK_CLIENT_SECRET': 'dingtalkClientSecret',
    'DINGTALK_ROBOT_CODE': 'dingtalkRobotCode',
    'DINGTALK_CALENDAR_SWITCH': 'dingtalkCalendarSwitch',
    'DINGTALK_TODO_SWITCH': 'dingtalkTodoSwitch',
    'REDIS_HOST': 'redisHost',
    'REDIS_PORT': 'redisPort',
    'REDIS_PASSWORD': 'redisPassword',
    'REDIS_DB': 'redisDb',
    'REDIS_KEY_PREFIX': 'redisKeyPrefix',
    'REDIS_USER_AUTH_EXPIRE': 'redisUserAuthExpire',
    'DATA_CLEANUP_ENABLED': 'dataCleanupEnabled',
    'DATA_CLEANUP_TIME': 'dataCleanupTime',
    'ID_TOKEN_CLEANUP_ENABLED': 'idTokenCleanupEnabled',
    'TODO_RETENTION_DAYS': 'todoRetentionDays',
    'CALENDAR_RETENTION_DAYS': 'calendarRetentionDays',
    'USERINFO_RETENTION_DAYS': 'userinfoRetentionDays',
    'LOG_LEVEL': 'logLevel',
    'API_PORT': 'apiPort',
};

// 校验当前用户是否为钉钉企业管理员
async function checkAdmin(ctx) {
    if (!(await isLogin(ctx))) {
        return { ok: false, reason: '用户未登录' };
    }

    let userInfo = ctx.session.userInfo;
    if (!userInfo) {
        return { ok: false, reason: '无法获取用户信息' };
    }

    if (userInfo.admin === true) {
        return { ok: true, userid: userInfo.userid };
    }

    const detail = await getUserDetailByUserid(userInfo.userid);
    if (detail && detail.admin === true) {
        return { ok: true, userid: userInfo.userid };
    }

    return { ok: false, reason: '当前用户不是钉钉企业管理员' };
}

// 获取配置定义列表（从数据库读取当前值）
async function handleGetConfigDefinitions(ctx) {
    configAccessControl(ctx);

    const adminCheck = await checkAdmin(ctx);
    if (!adminCheck.ok) {
        ctx.body = failResponse(adminCheck.reason);
        return;
    }

    // 从数据库读取所有配置值
    const dbValues = await getAllConfigValues(KEY_MAP);

    // 合并配置定义和数据库值
    const configsWithValues = CONFIG_DEFINITIONS.map(def => ({
        ...def,
        value: dbValues[def.key] !== undefined ? dbValues[def.key] : getDefaultByDefinition(def),
    }));

    ctx.body = okResponse({
        definitions: configsWithValues,
        requiresRestart: false,  // 后端变量实时生效；前端变量需重新构建镜像
    });
}

// 保存配置（写入数据库 + 实时更新内存）
async function handleSaveConfig(ctx) {
    configAccessControl(ctx);

    const adminCheck = await checkAdmin(ctx);
    if (!adminCheck.ok) {
        ctx.body = failResponse(adminCheck.reason);
        return;
    }

    try {
        const body = ctx.request.body;
        if (!body || !body.configs || typeof body.configs !== 'object') {
            ctx.body = failResponse('请求数据格式错误');
            return;
        }

        const submittedConfigs = body.configs;
        const allowedKeys = new Set(CONFIG_DEFINITIONS.map(d => d.key));
        const filteredConfigs = {};

        for (const key of Object.keys(submittedConfigs)) {
            if (allowedKeys.has(key)) {
                filteredConfigs[key] = String(submittedConfigs[key]);
            }
        }

        // 保存到数据库（加密）并实时更新 serverConfig 内存对象
        await saveConfigValues(serverConfig, KEY_MAP, filteredConfigs);

        logger.info(`管理员 ${adminCheck.userid} 更新了配置: ${Object.keys(filteredConfigs).join(', ')}`);
        ctx.body = okResponse({
            updated: true,
            message: '配置已保存并实时生效（前端REACT_APP_*变量需重新构建镜像才能生效）',
        });
    } catch (error) {
        logger.error('保存配置失败:', error.message, 'stack:', error.stack);
        ctx.body = failResponse('保存配置失败');
    }
}

// 根据定义获取默认值
function getDefaultByDefinition(def) {
    switch (def.type) {
        case 'switch':
            const falseDefaults = ['REACT_APP_IS_SHOW_WATERMARK_SWITCH', 'REACT_APP_DEBUG_SWITCH', 'REACT_APP_PROD_ENABLE_STACK_TRACE'];
            return falseDefaults.includes(def.key) ? 'false' : 'true';
        case 'number':
            const numberDefaults = {
                'REDIS_PORT': '6379',
                'REDIS_DB': '0',
                'REDIS_USER_AUTH_EXPIRE': '3600',
                'TODO_RETENTION_DAYS': '366',
                'CALENDAR_RETENTION_DAYS': '366',
                'USERINFO_RETENTION_DAYS': '366',
                'REACT_APP_LOG_QUEUE_SIZE': '100',
                'REACT_APP_LOG_FLUSH_INTERVAL': '10000',
                'REACT_APP_LOG_WORKER_MAX_RETRY_COUNT': '3',
                'REACT_APP_LOG_WORKER_BATCH_SIZE': '50',
            };
            return numberDefaults[def.key] || '0';
        case 'select':
            const selectDefaults = {
                'REACT_APP_MODE': 'schedule',
                'REACT_APP_CREATE_MEETING_BUTTON_VISIBILITY': 'advanced',
                'REACT_APP_USER_SELECTOR_MODE': 'full',
                'REACT_APP_ONLY_USER_JOIN_TYPE': '1',
                'REACT_APP_WATER_MARK_TYPE': '0',
                'LOG_LEVEL': 'info',
                'REACT_APP_PROD_LOG_LEVEL': 'error',
            };
            return selectDefaults[def.key] || (def.options && def.options[0] ? def.options[0].value : '');
        default:
            return '';
    }
}

export {
    handleGetConfigDefinitions,
    handleSaveConfig,
    checkAdmin,
    CONFIG_DEFINITIONS,
    KEY_MAP
};
