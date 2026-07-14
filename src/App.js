import { Route, Routes, BrowserRouter as Router } from "react-router-dom"
import { Modal } from 'antd';
import NotFound from './pages/notfound/index.js';
import Mobile from './pages/mobile/index.js'
import Home from './pages/home/index.js'
import KeepAlive from './pages/keepalive/index.js'
import { frontendLogger } from './utils/logger.js';
import { isHarmony, isHarmonyCompatMode } from './utils/auth_access_util.js';
import { useEffect, useState } from 'react';

function App() {
  const [showHarmonyGuide, setShowHarmonyGuide] = useState(false);

  useEffect(() => {
    // 记录应用启动日志
    frontendLogger.info('应用程序启动', {
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString()
    });

    // 鸿蒙端引导：仅未开启兼容模式时提示用户切换
    const harmonyUA = navigator.userAgent || '';
    const harmonyFlag = isHarmony();
    const compatMode = isHarmonyCompatMode();
    frontendLogger.info('鸿蒙端引导检测', {
      isHarmony: harmonyFlag,
      isCompatMode: compatMode,
      hasHarmonyUA: /OpenHarmony|HarmonyOS/i.test(harmonyUA),
      hasAndroidUA: /Android/i.test(harmonyUA),
      userAgent: harmonyUA
    });
    if (harmonyFlag && !compatMode) {
      frontendLogger.info('检测到鸿蒙端未开启兼容模式，引导用户切换');
      setShowHarmonyGuide(true);
    }
    
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
    <>
      <Modal
        open={showHarmonyGuide}
        title="兼容模式提示"
        okText="我知道了"
        cancelButtonProps={{ style: { display: 'none' } }}
        onOk={() => setShowHarmonyGuide(false)}
      >
        <p>检测到您正在使用鸿蒙系统访问。如遇页面功能异常（如无法加入会议），请点击右上角「⋯」菜单，切换到「兼容模式」后重新打开本页面。</p>
      </Modal>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mobile" element={<Mobile />} />
          <Route path="/api/keep_alive" element={<KeepAlive />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </>
  );
}

export default App;



