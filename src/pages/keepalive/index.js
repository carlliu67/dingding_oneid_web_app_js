import React, { useEffect } from 'react';
import clientConfig from '../../config/client_config.js';

const KeepAlive = () => {
    useEffect(() => {
        // 设置保活响应
        console.log('保活请求处理:', clientConfig.keepAlivePath);
        
        // 在React应用中，路由匹配本身就表示200响应
        // 返回的JSON内容就是响应体
        console.log('返回保活响应:', clientConfig.keepAliveResponse);
    }, []);

    // 直接返回JSON格式的响应内容
    // React Router会自动处理200状态码
    return (
        <div>
            {JSON.stringify(clientConfig.keepAliveResponse, null, 2)}
        </div>
    );
};

export default KeepAlive;