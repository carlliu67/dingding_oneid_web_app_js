// dingtalk-jsapi 按需加载封装
// 原始 `import * as dd from 'dingtalk-jsapi'` 会经 index.js 全量加载 api/apiObj（496 个模块/~400KB）
// 本封装仅引入：SDK 核心(entry/union，含 config/ready/error/env + 平台桥接初始化) + 实际使用的 5 个 API
import dd from 'dingtalk-jsapi/entry/union.js';
import { complexChoose$ } from 'dingtalk-jsapi/api/union/complexChoose.js';
import { openLink$ } from 'dingtalk-jsapi/api/union/openLink.js';
import { closePage$ } from 'dingtalk-jsapi/api/union/closePage.js';
import { quitPage$ } from 'dingtalk-jsapi/api/union/quitPage.js';
import { requestAuthCode$ } from 'dingtalk-jsapi/api/runtime/permission/requestAuthCode.js';

// 挂载按需引入的 API（与全量 apiObj 的挂载方式一致，导入时各模块已通过 ddSdk.setAPI 自注册）
dd.complexChoose = complexChoose$;
dd.openLink = openLink$;
dd.closePage = closePage$;
dd.quitPage = quitPage$;
dd.runtime = { permission: { requestAuthCode: requestAuthCode$ } };

export default dd;
