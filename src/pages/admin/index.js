import React, { useState, useEffect, useMemo } from 'react';
import { Button, Form, Input, Switch, Select, InputNumber, message, Modal, Spin, Result, Card, Tag, Divider, Typography } from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import axios from 'axios';
import { getOrigin, handleUserAuth } from '../../utils/auth_access_util.js';
import { frontendLogger } from '../../utils/logger.js';
import clientConfig from '../../config/client_config.js';
import { preloadDisabledDepartments } from '../../utils/deptCache.js';

const { Title, Text, Paragraph } = Typography;

// 配置项定义类型
// type: text, password, switch, number, select

export default function Admin() {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [definitions, setDefinitions] = useState([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);  // 免登loading状态

    // 免登处理：进入页面先完成用户认证
    useEffect(() => {
        handleUserAuth((userInfo) => {
            setAuthLoading(false);
            if (!userInfo) {
                setError('用户认证失败，请通过钉钉客户端打开');
                return;
            }
            frontendLogger.info('管理页面用户信息', { userInfo });
            // strict 模式下预加载禁选部门列表并缓存
            if (clientConfig.userSelectorMode === 'strict') {
                preloadDisabledDepartments();
            }
            loadConfig();
        });
    }, []);

    async function loadConfig() {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(`${getOrigin()}/api/admin/config`, {
                withCredentials: true
            });

            if (!response || !response.data) {
                setError('无法获取配置数据');
                return;
            }

            const data = response.data;
            if (data.code !== 0) {
                setError(data.msg || '获取配置失败');
                setIsAdmin(false);
                return;
            }

            setIsAdmin(true);
            setDefinitions(data.data.definitions || []);

            // 将当前值填充到表单
            const formValues = {};
            for (const def of data.data.definitions) {
                if (def.type === 'switch') {
                    // switch类型：值是"true"/"false"字符串，转换为boolean
                    formValues[def.key] = def.value === 'true' || def.value === true;
                } else {
                    formValues[def.key] = def.value;
                }
            }
            form.setFieldsValue(formValues);
        } catch (err) {
            frontendLogger.error('获取配置失败', { error: err });
            setError(err.response?.data?.msg || err.message || '获取配置失败');
            setIsAdmin(false);
        } finally {
            setLoading(false);
        }
    }

    // 按分组组织配置项
    const groupedDefinitions = useMemo(() => {
        const groups = {};
        for (const def of definitions) {
            if (!groups[def.group]) {
                groups[def.group] = [];
            }
            groups[def.group].push(def);
        }
        return groups;
    }, [definitions]);

    // 保存配置
    async function handleSave() {
        try {
            const values = await form.validateFields();
            setSaving(true);

            // 转换值：switch类型转为字符串
            const configs = {};
            for (const def of definitions) {
                const value = values[def.key];
                if (def.type === 'switch') {
                    configs[def.key] = value ? 'true' : 'false';
                } else if (value !== undefined && value !== null) {
                    configs[def.key] = String(value);
                }
            }

            const response = await axios.post(`${getOrigin()}/api/admin/config`, 
                { configs },
                { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
            );

            if (response.data && response.data.code === 0) {
                message.success(response.data.data.message || '配置保存成功');
                // 显示重启提示
                Modal.success({
                    title: '保存成功',
                    content: (
                        <div>
                            <p>配置已写入.env文件。</p>
                            <p style={{ color: '#fa8c16', fontWeight: 'bold' }}>
                                ⚠️ 需要重启容器才能生效：
                            </p>
                            <ul style={{ paddingLeft: 20 }}>
                                <li>后端环境变量：执行 <code>docker compose restart</code> 即可</li>
                                <li>前端REACT_APP_*变量：需执行 <code>docker compose up -d --build</code> 重新构建镜像</li>
                            </ul>
                        </div>
                    ),
                    okText: '我知道了',
                    okButtonProps: { style: { width: 'auto' } }
                });
            } else {
                message.error(response.data?.msg || '保存失败');
            }
        } catch (err) {
            if (err.errorFields) {
                message.error('请检查表单必填项');
            } else {
                frontendLogger.error('保存配置失败', { error: err });
                message.error(err.response?.data?.msg || err.message || '保存配置失败');
            }
        } finally {
            setSaving(false);
        }
    }

    // 渲染单个配置项
    function renderFormItem(def) {
        const rules = [];
        if (def.required) {
            rules.push({ required: true, message: `请输入${def.label}` });
        }

        let control;
        switch (def.type) {
            case 'password':
                control = <Input.Password placeholder={`请输入${def.label}`} autoComplete="off" />;
                break;
            case 'switch':
                control = <Switch />;
                break;
            case 'number':
                control = <InputNumber style={{ width: '100%' }} placeholder={`请输入${def.label}`} />;
                break;
            case 'select':
                control = (
                    <Select placeholder={`请选择${def.label}`}>
                        {def.options && def.options.map(opt => (
                            <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                        ))}
                    </Select>
                );
                break;
            case 'text':
            default:
                control = <Input placeholder={`请输入${def.label}`} autoComplete="off" />;
        }

        return (
            <Form.Item
                key={def.key}
                name={def.key}
                label={
                    <span>
                        {def.label}
                        {def.sensitive && <Tag color="orange" style={{ marginLeft: 8, fontSize: '11px' }}>敏感</Tag>}
                        {def.required && <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>}
                    </span>
                }
                rules={rules}
                extra={def.description ? <Text type="secondary" style={{ fontSize: '12px' }}>{def.description}</Text> : null}
            >
                {control}
            </Form.Item>
        );
    }

    // 免登loading
    if (authLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <Spin size="large" tip="正在验证用户身份..." />
            </div>
        );
    }

    // 错误或非管理员
    if (error && !isAdmin) {
        return (
            <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 16px' }}>
                <Result
                    status="403"
                    title="无权访问"
                    subTitle={error}
                    extra={
                        <Button type="primary" onClick={() => window.location.href = '/'}>
                            返回首页
                        </Button>
                    }
                />
            </div>
        );
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <Spin size="large" tip="加载配置中..." />
            </div>
        );
    }

    if (error && !loading) {
        return (
            <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 16px' }}>
                <Result
                    status="error"
                    title="加载失败"
                    subTitle={error}
                    extra={
                        <div>
                            <Button type="primary" onClick={loadConfig} style={{ marginRight: 8 }}>
                                重试
                            </Button>
                            <Button onClick={() => window.location.href = '/'}>
                                返回首页
                            </Button>
                        </div>
                    }
                />
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Button 
                        type="text" 
                        icon={<ArrowLeftOutlined />} 
                        onClick={() => window.location.href = '/'}
                    />
                    <Title level={3} style={{ margin: 0 }}>系统配置管理</Title>
                </div>
                <Button 
                    type="primary" 
                    icon={<SaveOutlined />} 
                    onClick={handleSave}
                    loading={saving}
                >
                    保存配置
                </Button>
            </div>

            <Card style={{ marginBottom: 16 }}>
                <Paragraph type="warning" style={{ margin: 0 }}>
                    <Text strong>⚠️ 重要提示：</Text>
                    修改配置后会写入 <code>.env</code> 文件，需要重启容器才能生效。
                    其中后端变量（<code>DINGTALK_*</code>、<code>WEMEET_*</code>、<code>DB_*</code>、<code>REDIS_*</code> 等）执行 <code>docker compose restart</code> 即可生效；
                    前端变量（<code>REACT_APP_*</code>）需要执行 <code>docker compose up -d --build</code> 重新构建镜像才能生效。
                </Paragraph>
            </Card>

            <Form
                form={form}
                layout="vertical"
                style={{ background: '#fff', padding: '24px', borderRadius: '8px' }}
            >
                {Object.entries(groupedDefinitions).map(([groupName, defs]) => (
                    <div key={groupName} style={{ marginBottom: 24 }}>
                        <Divider orientation="left" orientationMargin={0}>
                            <Text strong style={{ fontSize: '15px' }}>{groupName}</Text>
                        </Divider>
                        {defs.map(def => renderFormItem(def))}
                    </div>
                ))}
            </Form>

            <div style={{ textAlign: 'right', marginTop: 16 }}>
                <Button 
                    type="primary" 
                    icon={<SaveOutlined />} 
                    onClick={handleSave}
                    loading={saving}
                    size="large"
                >
                    保存配置
                </Button>
            </div>
        </div>
    );
}
