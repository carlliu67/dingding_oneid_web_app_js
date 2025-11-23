import React, { useState, useEffect } from 'react';
import MeetingList from './meeting/index.js';
import { handleJSAPIAccess, handleUserAuth, configJSAPIAccess } from '../../utils/auth_access_util.js';
import { handleGenerateJoinScheme, handleGenerateJumpUrl } from '../../components/wemeetapi/wemeetApi.js';
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
            if (params.meetingCode) {
                // 处理 code 参数
                console.log('meetingCode:', params.meetingCode);
                setIsLoaded(false);
                handleGenerateJoinScheme(params.meetingCode, true)
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

    if (clientConfig.mode === 'app') {
        // 当isLoaded为true 时唤起腾讯会议客户端
        if (isLoaded) {
            handleGenerateJoinScheme('', true);
        }

        return (
            <div>正在打开腾讯会议客户端，请稍后...</div>
        );
    } else {
        return (
            // 只有当 userInfo 已经获取到才渲染页面
            isLoaded ? (
                <div className="home">
                    {/* <UserInfo userInfo={userInfo} /> */}
                    <MeetingList userInfo={userInfo} />
                    {/* <pre>{JSON.stringify(uriParams, null, 2)}</pre> */}
                </div>
            ) : (
                // 在 userInfo 未获取到之前，可以显示加载提示
                <div>正在打开中...</div>
            )
        )
    }


}