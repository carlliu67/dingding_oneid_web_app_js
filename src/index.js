import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.js';
import { initDingH5RemoteDebug } from "dingtalk-h5-remote-debug";
import clientConfig from "./config/client_config.js";

if (clientConfig.debugSwitch) {
  initDingH5RemoteDebug();
  console.log('开启远程调试');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);