import React from 'react';

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
        // 你同样可以将错误日志上报给服务器
        console.error('错误边界捕获到错误:', error, errorInfo);
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