import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.js';
import { initDingH5RemoteDebug } from "dingtalk-h5-remote-debug";
import clientConfig from "./config/client_config.js";

if (clientConfig.debugSwitch) {
  console.log('开启远程调试');
  initDingH5RemoteDebug();
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);