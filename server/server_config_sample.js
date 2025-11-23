const config = {
    dingtalkCorpId: "ding14864b9xxxxfcb1e09", //CorpId
    dingtalkAppId: "adba01ed-c1d0-454a-baec-6bxxxxe05a", //AppId
    dingtalkAgentId: "358xxx8805", //AgentId
    dingtalkClientId: "dinglti2iwaxxxu8ciz", //clientID(原 AppKey 和 SuiteKey)
    dingtalkClientSecret: "ZAKgj-FktD-YHael6DwxxxxhYLb", //clientSecret(原 AppSecret 和 SuiteSecret)
    dingtalkRobotCode: "dinglti2ixxxu8ciz", //机器人code
    apiPort: "7001",   //后端指定端口
    wemeetAPPID: "218xxx147",   //腾讯会议应用APPID
    wemeetRestAPISDKID: "287xxx4015",   //腾讯会议应用SDKID
    wemeetRestAPISecretID: "FraK7pxxxxxJOyjpenR8TVG",   //腾讯会议API应用SecretID
    wemeetRestAPISecretKey: "qSXpIh2CyGFLEuNrMxxxxxxiVu6F2jZIHQQM",   //腾讯会议API应用SecretKey
    wemeetRestAPIServerUrl: "https://api.meeting.qq.com",   //腾讯会议API应用服务地址
    wemmetWebhookToken: "UgvPiqEVxxxxxkBVl89",   //腾讯会议webhook回调token
    wemeetWebhookAESKey: "Tks9gchzv1yFxxxxxxxoTvdOMd2zCtksiI",   //腾讯会议webhook回调AES密钥
    wemeetSSOURL: "https://xxx-idp.id.meeting.qq.com/cidp/custom/ai-d5310676xxxxae74bfda38008bec/ai-0bccd361711f497xxxxdbb2e4a4da6",   //腾讯会议IDaaS免登链接前缀地址
    getUserAccessTokenPath:  "/api/get_user_access_token", //免登-获取user_access_token的api path
    getSignParametersPath:  "/api/get_sign_parameters", //鉴权-获取鉴权参数的api path
    createMeetingPath:  "/api/create_meeting", //创建会议的api path
    queryUserEndedMeetingListPath:  "/api/query_user_ended_meeting_list", //获取用户已结束会议列表的api path
    queryUserMeetingListPath:  "/api/query_user_meeting_list", //获取用户会议列表的api path
    generateJoinSchemePath:  "/api/generateJoinScheme", //获取scheme url的api path
    generateJumpUrlPath:  "/api/generateJumpUrl", //获取免登跳转url的api path
    generateJoinUrlPath:  "/api/generateJoinUrl", //获取免登入会url的api path
    webhookPath:  "/api/webhook", //webhook回调的api path
    dbType: "sqlite", // 数据库类型："sqlite" 或 "mysql"
    logLevel: "info", // 日志级别，可选值：debug, info, warn, error
};

export default config;