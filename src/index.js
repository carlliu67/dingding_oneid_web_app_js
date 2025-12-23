import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.js';
import ErrorBoundary from './utils/ErrorBoundary.js';
import clientConfig from "./config/client_config.js";

try {
    if (clientConfig.debugSwitch) {
        import("dingtalk-h5-remote-debug").then(module => {
            module.initDingH5RemoteDebug();
            console.log('开启远程调试');
        }).catch(error => {
            console.error('远程调试初始化失败:', error);
        });
    }
} catch (error) {
    console.error('配置读取失败:', error);
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);