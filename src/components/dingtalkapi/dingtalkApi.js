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
            // 移动端关闭页面
            dd.closePage({
                success: () => { },
                fail: () => { },
                complete: () => { },
            });
        }
    } else {
        dd.openLink({
            url: url,
            success: () => { },
            fail: () => { },
            complete: () => { },
        });

        if (closePage) {
            // pc端关闭页面
            dd.quitPage({
                success: () => { },
                fail: () => { },
                complete: () => { },
            });
        }
    }

}

export { openSchema }