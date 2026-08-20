import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button, Form, Input, Switch, Select, InputNumber, message, Modal, Spin, Result, Card, Tag, Collapse, Typography } from 'antd';
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
    const initialGroupValuesRef = useRef({});  // 记录每个分组的初始值，用于检测变更
    const [changedGroups, setChangedGroups] = useState(new Set());  // 已变更的分组集合

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

            // 记录每个分组的初始值（归一化为字符串），用于后续变更检测
            const grouped = {};
            for (const def of data.data.definitions) {
                if (!grouped[def.group]) grouped[def.group] = [];
                grouped[def.group].push(def);
            }
            const initialSnapshot = {};
            for (const [groupName, defs] of Object.entries(grouped)) {
                initialSnapshot[groupName] = {};
                for (const def of defs) {
                    const val = formValues[def.key];
                    initialSnapshot[groupName][def.key] = def.type === 'switch' ? (val ? 'true' : 'false') : String(val ?? '');
                }
            }
            initialGroupValuesRef.current = initialSnapshot;
            setChangedGroups(new Set());
        } catch (err) {
            frontendLogger.error('获取配置失败', { error: err });
            setError(err.response?.data?.msg || err.message || '获取配置失败');
            setIsAdmin(false);
        } finally {
            setLoading(false);
        }
    }

    // 监听表单字段变化，更新 changedGroups
    function handleFormChange(changedValues, allValues) {
        const initialSnapshot = initialGroupValuesRef.current;
        if (!initialSnapshot || Object.keys(initialSnapshot).length === 0) return;

        // 只处理实际变化的字段，确定它属于哪个分组
        const newChanged = new Set(changedGroups);
        for (const key of Object.keys(changedValues)) {
            // 找到该字段所属的分组
            for (const [groupName, defMap] of Object.entries(initialSnapshot)) {
                if (key in defMap) {
                    // 对比当前值和初始值
                    const originalValue = defMap[key];
                    const currentValue = allValues[key];
                    const normalized = typeof currentValue === 'boolean'
                        ? (currentValue ? 'true' : 'false')
                        : String(currentValue ?? '');
                    if (normalized !== originalValue) {
                        newChanged.add(groupName);
                    } else {
                        newChanged.delete(groupName);
                    }
                    break;
                }
            }
        }
        setChangedGroups(newChanged);
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

    // 保存配置（只保存指定分组的参数）
    async function handleSave(groupName) {
        try {
            const values = await form.validateFields();
            setSaving(true);

            // 转换值：switch类型转为字符串，只保存指定分组的参数
            const groupDefs = groupedDefinitions[groupName] || [];
            const groupKeys = new Set(groupDefs.map(d => d.key));
            const configs = {};
            for (const def of definitions) {
                if (!groupKeys.has(def.key)) continue;
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

                // 更新初始值快照，清除该分组的变更标记
                const currentValues = form.getFieldsValue();
                const groupDefs = groupedDefinitions[groupName] || [];
                const snapshot = initialGroupValuesRef.current[groupName] || {};
                for (const def of groupDefs) {
                    const val = currentValues[def.key];
                    snapshot[def.key] = def.type === 'switch' ? (val ? 'true' : 'false') : String(val ?? '');
                }
                initialGroupValuesRef.current[groupName] = snapshot;
                setChangedGroups(prev => {
                    const next = new Set(prev);
                    next.delete(groupName);
                    return next;
                });

                // 仅在有前端变量时显示重建提示
                const hasFrontendVars = groupDefs.some(d => d.key.startsWith('REACT_APP_'));
                if (hasFrontendVars) {
                    Modal.success({
                        title: '保存成功',
                        content: (
                            <div>
                                <p>配置已保存到数据库并实时生效。</p>
                                <p style={{ color: '#fa8c16', fontWeight: 'bold' }}>
                                    ⚠️ 前端变量（REACT_APP_*）需重新构建镜像才能生效：
                                </p>
                                <p style={{ paddingLeft: 20 }}>
                                    执行 <code>docker compose up -d --build</code>
                                </p>
                            </div>
                        ),
                        okText: '我知道了',
                        okButtonProps: { style: { width: 'auto' } }
                    });
                }
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
                        {def.description && <Text type="secondary" style={{ marginLeft: 8, fontSize: '12px', fontWeight: 'normal' }}>（{def.description}）</Text>}
                    </span>
                }
                rules={rules}
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
            </div>

            <Card style={{ marginBottom: 16, textAlign: 'left' }}>
                <Paragraph type="warning" style={{ margin: 0, textAlign: 'left' }}>
                    <Text strong>⚠️ 提示：</Text>
                    后端配置参数保存后实时生效（无需重启）。前端变量（<code>REACT_APP_*</code>）保存后需执行 <code>docker compose up -d --build</code> 重新构建镜像才能生效。
                </Paragraph>
            </Card>

            <Form
                form={form}
                layout="vertical"
                onValuesChange={handleFormChange}
                style={{ background: '#fff', padding: '24px 24px 24px 48px', borderRadius: '8px' }}
            >
                {Object.entries(groupedDefinitions).map(([groupName, defs]) => (
                    <Collapse
                        key={groupName}
                        style={{ marginBottom: 16, background: '#fafafa', border: 'none' }}
                        items={[{
                            key: groupName,
                            label: (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingRight: 8 }}>
                                    <Text strong style={{ fontSize: '15px' }}>{groupName}</Text>
                                    {changedGroups.has(groupName) && (
                                        <Button
                                            type="primary"
                                            size="small"
                                            icon={<SaveOutlined />}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSave(groupName);
                                            }}
                                            loading={saving}
                                        >
                                            保存
                                        </Button>
                                    )}
                                </div>
                            ),
                            children: defs.map(def => renderFormItem(def)),
                        }]}
                    />
                ))}
            </Form>

        </div>
    );
}
