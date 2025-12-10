import React, { useState, useEffect } from 'react';
import MeetingList from './meeting/index.js';
import { handleJSAPIAccess, handleUserAuth, configJSAPIAccess, isMobileDevice } from '../../utils/auth_access_util.js';
import { handleGenerateJoinScheme, handleGenerateJumpUrl, handleGenerateJoinUrl } from '../../components/wemeetapi/wemeetApi.js';
import './index.css';
import clientConfig from '../../config/client_config.js';

export default function Home() {
    const [userInfo, setUserInfo] = useState({});
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        // 获取 URL 中的查询参数
        const searchParams = new URLSearchParams(window.location.search);
        const params = {};
        for (const [key, value] of searchParams.entries()) {
            params[key] = value;
        }

        // 免登处理
        handleUserAuth((userInfo) => {
            setUserInfo(userInfo);
            console.log('userInfo: ', userInfo);
            if (params.meetingCode || params.joinUrl) {
                // 处理 code 参数
                console.log('meetingCode:', params.meetingCode, "joinUrl (base64):", params.joinUrl);
                setIsLoaded(false);
                // 钉钉移动端不支持跳转到三方app，识别到为移动端是直接打开参会链接，引导用户跳转到系统浏览器
                if (isMobileDevice()) {
                    // 移动端处理
                    // 处理 joinUrl 参数，需要先进行base64解码
                    try {
                        // 处理URL安全的base64编码（替换-为+，_为/，并添加必要的填充字符）
                        let base64Url = params.joinUrl.replace(/-/g, '+').replace(/_/g, '/');
                        // 添加必要的填充字符
                        while (base64Url.length % 4) {
                            base64Url += '=';
                        }
                        const decodedJoinUrl = atob(base64Url);
                        console.log('joinUrl (decoded):', decodedJoinUrl);
                        handleGenerateJoinUrl(decodedJoinUrl, true);
                    } catch (error) {
                        console.error('joinUrl解码失败:', error);
                        handleGenerateJoinUrl(params.joinUrl, true); // 解码失败时尝试直接使用
                    }
                } else {
                    // pc端处理
                    handleGenerateJoinScheme(params.meetingCode, true)
                }
            } else if (params.targetUrl) {
                // 处理 targetUrl 参数
                console.log('targetUrl:', params.targetUrl);
                setIsLoaded(false);
                handleGenerateJumpUrl(params.targetUrl, true)
            } else {
                setIsLoaded(true);
            }
        });

        // 创建会议邀请成员时需要调用通讯录jsapi接口
        if (clientConfig.mode === 'schedule') {
            // 鉴权处理
            handleJSAPIAccess().then(data => {
                if (data) {
                    console.log('JSAPI鉴权参数获取成功');
                    configJSAPIAccess(data.data);
                }
            }).catch(error => {
                console.error('JSAPI鉴权失败:', error);
            });
        }
    }, []);

    // 获取 URL 中的查询参数以显示
    // const searchParams = new URLSearchParams(window.location.search);
    // const params = {};
    // for (const [key, value] of searchParams.entries()) {
    //     params[key] = value;
    // }

    if (clientConfig.mode === 'app') {
        // 当isLoaded为true 时唤起腾讯会议客户端
        if (isLoaded) {
            handleGenerateJoinScheme('', true);
        }

        return (
            <div>
                <div>正在打开腾讯会议客户端，请稍后...</div>
                {/* <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                    <h3>URL 参数：</h3>
                    <pre>{JSON.stringify(params, null, 2)}</pre>
                </div> */}
            </div>
        );
    } else {
        return (
            // 只有当 userInfo 已经获取到才渲染页面
            isLoaded ? (
                <div className="home">
                    {/* <UserInfo userInfo={userInfo} /> */}
                    <MeetingList userInfo={userInfo} />
                    {/* <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                        <h3>URL 参数：</h3>
                        <pre>{JSON.stringify(params, null, 2)}</pre>
                    </div> */}
                </div>
            ) : (
                // 在 userInfo 未获取到之前，可以显示加载提示
                <div>
                    <div>正在打开中...</div>
                    {/* <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                        <h3>URL 参数：</h3>
                        <pre>{JSON.stringify(params, null, 2)}</pre>
                    </div> */}
                </div>
            )
        )
    }


}