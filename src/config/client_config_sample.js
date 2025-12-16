const clientConfig = {
    // 钉钉对接参数
    corpId: "", //CorpId
    clientId: "", //clientID(原 AppKey 和 SuiteKey)

    // 后端服务配置
    serverUrl: "", //后端服务地址，后端服务和前端部署在同一台机器上时不需要设置，后端URL和前端URL需要是在同一个域名下
    serverProtocol: "http", //后端服务协议类型，http或者https
    apiPort: "7001",   //后端指定端口

    // 调试模式开关
    debugSwitch: false, //是否开启调试模式

    // 工作台应用打开模式
    mode: 'upcoming', // 工作台应用打开模式，可选值：'app'（免登跳转腾讯会议客户端）、'upcoming'（展示待参加会议页面）、‘schedule’（支持创建会议）

    // 会议默认参数配置
    only_user_join_type: 1, // 成员入会限制类型，1：所有成员可入会，2：仅受邀成员可入会，3：仅企业内部成员可入会

    // 后端服务API路径，这部分参数不要修改
    getUserAccessTokenPath:  "/api/get_user_access_token", //免登api path
    getSignParametersPath:  "/api/get_sign_parameters", //鉴权api path;
    generateJoinSchemePath:  "/api/generateJoinScheme", //获取scheme url的api path
    generateJumpUrlPath:  "/api/generateJumpUrl", //获取免登跳转url的api path
    generateJoinUrlPath:  "/api/generateJoinUrl", //获取免登入会url的api path
    createMeetingPath:  "/api/create_meeting", //创建会议的api path
    queryUserEndedMeetingListPath:  "/api/query_user_ended_meeting_list", //获取用户已结束会议列表的api path
    queryUserMeetingListPath:  "/api/query_user_meeting_list", //获取用户会议列表的api path
}
    
export default clientConfig;