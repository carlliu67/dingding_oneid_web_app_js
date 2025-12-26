import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.js';
import ErrorBoundary from './utils/ErrorBoundary.js';
import clientConfig from "./config/client_config.js";
import { initDingH5RemoteDebug } from "dingtalk-h5-remote-debug";
import './utils/globalErrorHandler.js'; // 初始化全局错误处理
import { frontendLogger } from './utils/logger.js';

try {
    if (clientConfig.debugSwitch) {
        initDingH5RemoteDebug();
        frontendLogger.info('开启远程调试');
    }
} catch (error) {
    frontendLogger.error('配置读取失败', { error: error });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);