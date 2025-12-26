import { Route, Routes, BrowserRouter as Router } from "react-router-dom"
import NotFound from './pages/notfound/index.js';
import Mobile from './pages/mobile/index.js'
import Home from './pages/home/index.js'
import KeepAlive from './pages/keepalive/index.js'
import { frontendLogger } from './utils/logger.js';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    // 记录应用启动日志
    frontendLogger.info('应用程序启动', {
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString()
    });
    
    // 记录页面访问
    const handleRouteChange = () => {
      frontendLogger.info('页面访问', {
        path: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        url: window.location.href
      });
    };
    
    // 监听路由变化
    window.addEventListener('popstate', handleRouteChange);
    
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/mobile" element={<Mobile />} />
        <Route path="/api/keep_alive" element={<KeepAlive />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;



