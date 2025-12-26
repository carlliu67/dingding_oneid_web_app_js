import React from 'react';
import { frontendLogger } from './logger.js';

// 提取DingTalk部分userAgent的辅助函数
function extractDingTalkUserAgent(userAgent) {
    const dingTalkMatch = userAgent.match(/DingTalk\([^)]+\)/);
    return dingTalkMatch ? dingTalkMatch[0] : '';
}

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // 更新 state 使下一次渲染能够显示降级后的 UI
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // 将错误日志发送到服务器
        frontendLogger.error('错误边界捕获到错误', { error, errorInfo });
        
        // 记录错误到前端日志系统
        frontendLogger.error('React组件错误', {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            errorInfo: {
                componentStack: errorInfo.componentStack
            },
            location: window.location.href,
            userAgent: extractDingTalkUserAgent(navigator.userAgent)
        });
        
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
    }

    render() {
        if (this.state.hasError) {
            // 你可以自定义降级后的 UI 并渲染
            return (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                    <h2>应用程序遇到错误</h2>
                    <details style={{ whiteSpace: 'pre-wrap', textAlign: 'left', marginTop: '20px' }}>
                        <summary>错误详情</summary>
                        <p><strong>错误信息:</strong> {this.state.error && this.state.error.toString()}</p>
                        <p><strong>错误堆栈:</strong></p>
                        <pre>{this.state.errorInfo.componentStack}</pre>
                    </details>
                    <button onClick={() => window.location.reload()} style={{ marginTop: '20px' }}>
                        重新加载页面
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;