import * as dd from 'dingtalk-jsapi';
import { isMobileDevice } from '../../utils/auth_access_util.js';

function openSchema(url, closePage = false) {
    if (isMobileDevice()) {
        dd.openLink({
            url: url,
            success: () => { },
            fail: () => { },
            complete: () => { },
        });
        if (closePage) {
            // 移动端关闭页面，延迟10秒
            setTimeout(() => {
                dd.closePage({
                    success: () => { },
                    fail: () => { },
                    complete: () => { },
                });
            }, 10000); // 10秒延迟
        }
    } else {
        dd.openLink({
            url: url,
            success: () => { },
            fail: () => { },
            complete: () => { },
        });
        if (closePage) {
            // pc端关闭页面，立即执行
            dd.quitPage({
                success: () => { },
                fail: () => { },
                complete: () => { },
            });
        }
    }

}

export { openSchema }