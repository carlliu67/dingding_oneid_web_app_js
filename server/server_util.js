import { logger } from './util/logger.js';

// 工具方法
function failResponse(msg) {
    const response = {
        "code": -1,
        "msg": msg || "error"
    };
    logger.error('Failed response:', response);
    return JSON.stringify(response);
}

function okResponse(data) {
    const response = {
        "code": 0,
        "msg": "ok",
        "data": data
    };
    logger.debug('Success response:', response);
    return JSON.stringify(response);
}

// 处理跨域问题
//【特别说明】：该部分实现仅在线下用。【线上环境】需要对敏感信息接口服务端返回的跨域头部进行严格限制，避免任何域都能跨域访问此接口。
function configAccessControl(ctx) {
    ctx.set("Access-Control-Allow-Origin", ctx.headers.origin);
    ctx.set("Access-Control-Allow-Methods", "OPTIONS, GET, PUT, POST, DELETE");
    ctx.set("Access-Control-Allow-Credentials", "true");  // 表示是否允许发送Cookie
    ctx.set("Access-Control-Allow-Headers", "x-requested-with, accept, origin, content-type");
}

// 设置Cookie
function setCookie(ctx, name, value) {
    if (!name || !value) {
        return;
    }

    const date = new Date();
    date.setTime(date.getTime() + (2 * 60 * 60 * 1000));

    try {
        ctx.cookies.set(
            name,
            value,
            {
                domain: '',  // 写cookie所在的域名
                path: '',       // 写cookie所在的路径
                //maxAge: 2 * 60 * 1000, // cookie有效时长
                expires: date,    // cookie失效时间
                // expires: new Date(''),  // cookie失效时间
                httpOnly: false,  // 是否只用于http请求中获取
                overwrite: false  // 是否允许重写
            }
        );
        logger.debug(`Cookie ${name}: ${value} set successfully.`);
    } catch (error) {
        logger.error(`Failed to set cookie ${name}:`, error);
    }
}

export {
    failResponse, okResponse, configAccessControl, setCookie
};