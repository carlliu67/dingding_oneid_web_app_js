const config = {
    // 钉钉对接参数
    dingtalkCorpId: "", //CorpId
    dingtalkAppId: "", //AppId
    dingtalkAgentId: "", //AgentId
    dingtalkClientId: "", //clientID(原 AppKey 和 SuiteKey)
    dingtalkClientSecret: "", //clientSecret(原 AppSecret 和 SuiteSecret)
    dingtalkRobotCode: "", //机器人code
    dingtalkCalendarSwitch: false, //预约普通会议是是否创建钉钉日程，对周期会议不生效，周期会议固定会创建日程
    dingtalkTodoSwitch: true, //预约普通会议是是否创建钉钉待办，对周期会议不生效，周期会议固定会创建日程

    // server运行参数配置
    apiPort: "7001",   //后端指定端口
    // 当APP server和webhook server部署在同一台机器上时，appServerMode和webhookServerMode都需要设置为true；分开部署时一个为true，一个为false
    appServerMode: true,  //是否开启app server模式
    webhookServerMode: true,  //是否开启webhook server模式
    frontEndServerUrl: "http://dingtalk-test.company.cn:7000",  //前端server地址

    // 腾讯会议对接参数
    wemeetAPPID: "",   //腾讯会议应用APPID
    wemeetRestAPISDKID: "",   //腾讯会议应用SDKID
    wemeetRestAPISecretID: "",   //腾讯会议API应用SecretID
    wemeetRestAPISecretKey: "",   //腾讯会议API应用SecretKey
    wemmetWebhookToken: "",   //腾讯会议webhook回调token
    wemeetWebhookAESKey: "",   //腾讯会议webhook回调AES密钥
    wemeetSSOURL: "https://oauth2.account.tencent.com/v1/sso/jwtp/12xxx9/13xxx8/kit/meeting",   //腾讯会议IDaaS/Oneid免登链接前缀地址，需要替换成自己所在环境的地址
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
    dbType: "sqlite", // 数据库类型："sqlite" 或 "mysql"
    dbHost: "", // MySQL 数据库主机
    dbPort: 3306, // MySQL 数据库端口
    dbUser: "", // MySQL 数据库用户名
    dbPassword: "", // MySQL 数据库密码
    dbDatabase: "", // MySQL 数据库名称

    // 服务端日志打印
    logLevel: "info", // 日志级别，可选值：debug, info, warn, error
};

export default config;