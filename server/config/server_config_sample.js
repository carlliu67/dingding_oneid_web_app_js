const config = {
    nodeName: `${process.env.CONTAINER_NAME || 'node'}_${process.env.HOSTNAME || ''}`, //当前节点名称，多节点部署时需要配置
    
    // 钉钉对接参数
    dingtalkCorpId: process.env.DINGTALK_CORP_ID || "", //CorpId
    dingtalkAppId: process.env.DINGTALK_APP_ID || "", //AppId
    dingtalkAgentId: process.env.DINGTALK_AGENT_ID || "", //AgentId
    dingtalkClientId: process.env.DINGTALK_CLIENT_ID || "", //clientID(原 AppKey 和 SuiteKey)
    dingtalkClientSecret: process.env.DINGTALK_CLIENT_SECRET || "", //clientSecret(原 AppSecret 和 SuiteSecret)
    dingtalkRobotCode: process.env.DINGTALK_ROBOT_CODE || "", //机器人code
    dingtalkCalendarSwitch: process.env.DINGTALK_CALENDAR_SWITCH === "true", //预约普通会议是是否创建钉钉日程，对周期会议不生效，周期会议固定会创建日程
    dingtalkTodoSwitch: process.env.DINGTALK_TODO_SWITCH !== "false", //预约普通会议是是否创建钉钉待办，对周期会议不生效，周期会议固定会创建日程

    // server运行参数配置
    apiPort: process.env.API_PORT || "7001",   //后端指定端口
    serverMode: process.env.SERVER_MODE || "full",  //当前server模式，可选back-end、webhook、full
    frontEndServerUrl: process.env.FRONT_END_SERVER_URL || "",  //前端server地址

    // 腾讯会议对接参数
    wemeetAPPID: process.env.WEMEET_APPID || "",   //腾讯会议应用APPID
    wemeetRestAPISDKID: process.env.WEMEET_REST_API_SDKID || "",   //腾讯会议应用SDKID
    wemeetRestAPISecretID: process.env.WEMEET_REST_API_SECRET_ID || "",   //腾讯会议API应用SecretID
    wemeetRestAPISecretKey: process.env.WEMEET_REST_API_SECRET_KEY || "",   //腾讯会议API应用SecretKey
    wemeetWebhookToken: process.env.WEMEET_WEBHOOK_TOKEN || "",   //腾讯会议webhook回调token
    wemeetWebhookAESKey: process.env.WEMEET_WEBHOOK_AES_KEY || "",   //腾讯会议webhook回调AES密钥
    wemeetSSOURL: process.env.WEMEET_SSO_URL || "",   //腾讯会议IDaaS/Oneid免登链接前缀地址，需要替换成自己所在环境的地址
    wemeetRestAPIServerUrl: "https://api.meeting.qq.com",   //腾讯会议API应用服务地址，不需要替换

    // app server接口配置，这部分参数不要修改
    getUserAccessTokenPath:  "/api/get_user_access_token", //免登-获取user_access_token的api path
    getSignParametersPath:  "/api/get_sign_parameters", //鉴权-获取鉴权参数的api path
    createMeetingPath:  "/api/create_meeting", //创建会议的api path
    queryUserEndedMeetingListPath:  "/api/query_user_ended_meeting_list", //获取用户已结束会议列表的api path
    queryUserMeetingListPath:  "/api/query_user_meeting_list", //获取用户会议列表的api path
    generateJoinSchemePath:  "/api/generateJoinScheme", //获取scheme url的api path
    generateJumpUrlPath:  "/api/generateJumpUrl", //获取免登跳转url的api path
    generateJoinUrlPath:  "/api/generateJoinUrl", //获取免登入会url的api path

    // 保活响应配置
    keepAlivePath: "/api/keep_alive", // 保活api path
    keepAliveResponse: {
        code: 0,
        message: "OK",
        data: {},
    },

    // webhook server接口配置，webhookPath不要修改
    webhookPath:  "/api/webhook", //webhook回调的api path
    webhookRateLimit: 1000, // 每秒处理的请求数
    webhookCapacity: 5000, // 最大并发请求数
    webhookMaxConcurrent: 5, // 最大并发处理数

    // 数据库对接参数
    dbType: process.env.DB_TYPE || "sqlite", // 数据库类型："sqlite" 或 "mysql"
    dbHost: process.env.DB_HOST || "", // MySQL 数据库主机
    dbPort: process.env.DB_PORT || 3306, // MySQL 数据库端口
    dbUser: process.env.DB_USER || "", // MySQL 数据库用户名
    dbPassword: process.env.DB_PASSWORD || "", // MySQL 数据库密码
    dbDatabase: process.env.DB_DATABASE || "", // MySQL 数据库名称
    
    // SQLite 并发配置
    sqliteBusyTimeout: parseInt(process.env.SQLITE_BUSY_TIMEOUT) || 30000, // SQLite 忙等待超时时间（毫秒）
    sqliteWalMode: process.env.SQLITE_WAL_MODE !== "false", // 启用WAL模式以提高并发性能

    // Redis对接参数（可选）
    redisHost: process.env.REDIS_HOST || "", // Redis 主机地址，留空则不使用Redis
    redisPort: process.env.REDIS_PORT || 6379, // Redis 端口
    redisPassword: process.env.REDIS_PASSWORD || "", // Redis 密码（如果有）
    redisDb: process.env.REDIS_DB || 0, // Redis 数据库索引
    redisKeyPrefix: process.env.REDIS_KEY_PREFIX || "dingtalk:", // Redis 键前缀
    redisUserAuthExpire: process.env.REDIS_USER_AUTH_EXPIRE || 3600, // 用户鉴权信息过期时间（秒）

    // 服务端日志打印
    logLevel: process.env.LOG_LEVEL || "info", // 日志级别，可选值：debug, info, warn, error
    
    // 前端日志配置
    enableFrontendLog: process.env.ENABLE_FRONTEND_LOG !== "false", // 是否启用前端日志收集
    frontendLogPath: "/api/logs", // 前端日志接收API路径
    frontendLogMaxSize: process.env.FRONTEND_LOG_MAX_SIZE || "100", // 前端日志队列最大大小
    frontendLogFlushInterval: process.env.FRONTEND_LOG_FLUSH_INTERVAL || "10000", // 前端日志刷新间隔(毫秒)
};

export default config;