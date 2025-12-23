const clientConfig = {
    // 钉钉对接参数
    corpId: process.env.CORP_ID || "", //CorpId
    clientId: process.env.CLIENT_ID || "", //clientID(原 AppKey 和 SuiteKey)

    // 后端服务配置
    serverUrl: process.env.SERVER_URL || "", //后端服务地址，后端服务和前端部署在同一台机器上时不需要设置，后端URL和前端URL需要是在同一个域名下
    serverProtocol: process.env.SERVER_PROTOCOL || "http", //后端服务协议类型，http或者https
    apiPort: process.env.API_PORT || "7001",   //后端指定端口

    // 调试模式开关
    debugSwitch: process.env.DEBUG_SWITCH === "true", //是否开启调试模式

    // 工作台应用打开模式
    mode: process.env.MODE || 'upcoming', // 工作台应用打开模式，可选值：'app'（免登跳转腾讯会议客户端）、'upcoming'（展示待参加会议页面）、'schedule'（支持创建会议）

    // 会议默认参数配置
    only_user_join_type: parseInt(process.env.ONLY_USER_JOIN_TYPE) || 1, // 成员入会限制类型，1：所有成员可入会，2：仅受邀成员可入会，3：仅企业内部成员可入会
    isShowWatermarkSwitch: process.env.IS_SHOW_WATERMARK_SWITCH === "true", // 是否展示水印设置选项，true：展示，false：不展示，默认值为false
    allow_screen_shared_watermark: process.env.ALLOW_SCREEN_SHARED_WATERMARK !== "false", // 是否开启水印，true：开启，false：不开启，默认值为true
    water_mark_type: parseInt(process.env.WATER_MARK_TYPE) || 0, // 水印样式，0：单排，1：多排，默认值为0
    audio_watermark: process.env.AUDIO_WATERMARK !== "false", // 是否开启音频水印，true：开启，false：不开启，默认值为true

    // 后端服务API路径，这部分参数不要修改
    getUserAccessTokenPath:  "/api/get_user_access_token", //免登api path
    getSignParametersPath:  "/api/get_sign_parameters", //鉴权api path;
    generateJoinSchemePath:  "/api/generateJoinScheme", //获取scheme url的api path
    generateJumpUrlPath:  "/api/generateJumpUrl", //获取免登跳转url的api path
    generateJoinUrlPath:  "/api/generateJoinUrl", //获取免登入会url的api path
    createMeetingPath:  "/api/create_meeting", //创建会议的api path
    queryUserEndedMeetingListPath:  "/api/query_user_ended_meeting_list", //获取用户已结束会议列表的api path
    queryUserMeetingListPath:  "/api/query_user_meeting_list", //获取用户会议列表的api path

    // 保活响应配置
    keepAlivePath: "/api/keep_alive", // 保活api path
    keepAliveResponse: {
        code: 0,
        message: "OK",
        data: {},
    },
}
    
export default clientConfig;