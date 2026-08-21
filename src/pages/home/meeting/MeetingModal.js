import React, { useState, useRef, useEffect } from 'react';
import { Modal, Form, Input, DatePicker, TimePicker, Button, Select, Switch, Avatar, Tree, Input as AntInput } from 'antd';
import dayjs from 'dayjs';
import dd from '../../../utils/ddSdk.js';
import './MeetingModal.css'
import clientConfig from '../../../config/client_config.js';
import { frontendLogger } from '../../../utils/logger.js';
import { getScopedDeptTree } from '../../../utils/deptCache.js';
import { searchUser, getDeptUsers } from '../../../components/wemeetapi/wemeetApi.js';
const { Option } = Select;
const { Search } = AntInput;

const MeetingModal = ({ visible, onCancel, onCreate, userInfo, isFreeAccount }) => {
  const [selectedHosts, setSelectedHosts] = useState([]); // 存储选中的主持人列表，每项包含 {id, name}
  const [selectedInvitees, setSelectedInvitees] = useState([]); // 存储选中的邀请人列表，每项包含 {id, name}
  // strict模式：组织架构树数据 + 搜索关键词
  const [deptTreeData, setDeptTreeData] = useState(null);
  const [hostTreeSearch, setHostTreeSearch] = useState('');
  const [inviteeTreeSearch, setInviteeTreeSearch] = useState('');
  // strict模式：搜索结果（从后端搜索全企业用户）
  const [hostSearchResults, setHostSearchResults] = useState(null); // null=未搜索，[]=无结果，[...]=结果
  const [inviteeSearchResults, setInviteeSearchResults] = useState(null);
  const [hostSearching, setHostSearching] = useState(false);
  const [inviteeSearching, setInviteeSearching] = useState(false);
  const hostSearchTimerRef = useRef(null);
  const inviteeSearchTimerRef = useRef(null);
  // strict模式：弹窗可见性
  const [hostTreeModalVisible, setHostTreeModalVisible] = useState(false);
  const [inviteeTreeModalVisible, setInviteeTreeModalVisible] = useState(false);
  const [currentDate, setCurrentDate] = useState(dayjs().startOf('day')); // 使用状态变量存储日期
  const [currentTime, setCurrentTime] = useState(() => { // 使用状态变量存储时间，初始计算未来最近的15分钟间隔
    const now = dayjs();
    const currentMinutes = now.minute();
    const remainder = currentMinutes % 15;
    const minutesToAdd = 30 - remainder;
    return now.add(minutesToAdd, 'minute');
  });
  const [currentEndDate, setCurrentEndDate] = useState(dayjs().startOf('day')); // 使用状态变量存储结束日期
  const [currentEndTime, setCurrentEndTime] = useState(() => { // 使用状态变量存储结束时间，初始值为开始时间+30分钟
    const now = dayjs();
    const currentMinutes = now.minute();
    const remainder = currentMinutes % 15;
    const minutesToAdd = 30 - remainder;
    return now.add(minutesToAdd + 30, 'minute');
  });
  const formRef = useRef(null);
  // 监听开始时间变化，联动更新结束时间
  useEffect(() => {
    if (formRef.current) {
      const { start_date, start_time } = formRef.current.getFieldsValue(['start_date', 'start_time']);
      if (start_date && start_time) {
        const startDateTime = dayjs(start_date).hour(dayjs(start_time).hour()).minute(dayjs(start_time).minute());
        const endDateTime = startDateTime.add(30, 'minute');
        
        // 更新状态变量
        setCurrentEndDate(endDateTime.startOf('day'));
        setCurrentEndTime(endDateTime);
        
        // 更新表单值
        formRef.current.setFieldsValue({
          end_date: endDateTime.startOf('day'),
          end_time: endDateTime
        });
      }
    }
  }, [currentDate, currentTime]);

  // 使用useEffect监听visible属性变化，确保每次Modal显示时都更新时间
  useEffect(() => {
    if (visible) {
      // 计算未来最近的15分钟间隔时间
      const now = dayjs();
      const currentMinutes = now.minute();
      const remainder = currentMinutes % 15;
      const minutesToAdd = 30 - remainder;
      const adjustedTime = now.add(minutesToAdd, 'minute');
      const adjustedEndTime = adjustedTime.add(30, 'minute');
      
      frontendLogger.info('Modal显示，更新时间', { time: adjustedTime.format('YYYY-MM-DD HH:mm') });
      
      // 更新状态变量 - 使用调整后的时间来设置日期（处理跨日期的情况）
      setCurrentDate(adjustedTime.startOf('day'));
      setCurrentTime(adjustedTime);
      setCurrentEndDate(adjustedEndTime.startOf('day'));
      setCurrentEndTime(adjustedEndTime);
      
      // 延迟执行以确保formRef已初始化
      setTimeout(() => {
        if (formRef.current) {
          formRef.current.resetFields(['start_time', 'end_time']);
          formRef.current.setFieldsValue({
            start_time: adjustedTime,
            end_time: adjustedEndTime
          });
        }
      }, 0);
    }
  }, [visible]);

  // 监听窗口大小变化，动态调整表单布局
  useEffect(() => {
    const handleResize = () => {
      formRef.current?.setFieldsValue({});
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showModal = () => {
    // 使用新的变量名避免混淆
    const newNow = dayjs();
    
    // 计算未来最近的15分钟间隔时间
    const currentMinutes = newNow.minute();
    const remainder = currentMinutes % 15;
    const minutesToAdd = remainder > 0 ? 15 - remainder : 0;
    const adjustedTime = newNow.add(minutesToAdd, 'minute');
    const adjustedEndTime = adjustedTime.add(30, 'minute');
    
    frontendLogger.info('showModal调用', { 
      currentTime: newNow.format('YYYY-MM-DD HH:mm'), 
      adjustedTime: adjustedTime.format('YYYY-MM-DD HH:mm') 
    });
    
    // 更新状态变量，触发组件重新渲染 - 使用调整后的时间来设置日期（处理跨日期的情况）
    setCurrentDate(adjustedTime.startOf('day'));
    setCurrentTime(adjustedTime);
    setCurrentEndDate(adjustedEndTime.startOf('day'));
    setCurrentEndTime(adjustedEndTime);
    
    // 强制更新表单值
    if (formRef.current) {
      // 先重置表单，确保清除之前的值
      formRef.current.resetFields(['start_time', 'end_time']);
      // 然后设置新的值
      formRef.current.setFieldsValue({
        start_time: adjustedTime,
        end_time: adjustedEndTime
      });
    }
  };

  const handleCancel = () => {
    // 先调用父组件传入的onCancel关闭Modal
    onCancel();
    // 再清空组件内部的主持人和邀请人状态数据，确保下一次打开Modal时不会显示之前的数据
    setSelectedHosts([]); // 清空主持人数据
    setSelectedInvitees([]); // 清空邀请人数据
  };

  // 处理删除主持人
  const handleRemoveHost = (index) => {
    // 创建新的主持人列表副本，避免直接修改状态
    const newSelectedHosts = [...selectedHosts];
    
    // 移除指定索引的主持人
    newSelectedHosts.splice(index, 1);
    
    // 更新状态
    setSelectedHosts(newSelectedHosts);
  };

  // 处理删除邀请人
  const handleRemoveInvitee = (index) => {
    // 创建新的邀请人列表副本，避免直接修改状态
    const newSelectedInvitees = [...selectedInvitees];
    
    // 移除指定索引的邀请人
    newSelectedInvitees.splice(index, 1);
    
    // 更新状态
    setSelectedInvitees(newSelectedInvitees);
  };

  // 处理选择主持人
  const handleChooseHost = async () => {
    dd.ready(() => {
      const options = {
        title: '选择主持人',
        corpId: clientConfig.corpId,
        maxUsers: 50,
        multiple: true,
        limitTips: '选择人数不能超过50个',
        pickedUsers: selectedHosts.map(host => host.id),
        responseUserOnly: true,
        success: (res) => {
          frontendLogger.info('选择人员结果', { result: res });

          if (res && Array.isArray(res.users) && res.users.length > 0) {
              const hosts = res.users.map((user) => ({
                id: user.emplId,
                name: user.name
              }));

              frontendLogger.info('解析到人员数据', { hosts });
              setSelectedHosts(hosts);

          } else {
            setSelectedHosts([]);
          }
        },
        fail: () => { },
        complete: () => { },
      };

      // strict 模式由 Select 组件处理，不走 complexChoose
      if (clientConfig.userSelectorMode === 'strict') return;

      dd.complexChoose(options).catch((err) => {
        frontendLogger.error('选择主持人失败', { error: err });
      });
    });
  };

  // 处理选择邀请人
  const handleChooseInvitee = async () => {
    dd.ready(() => {
      const options = {
        title: '选择邀请成员',
        corpId: clientConfig.corpId,
        maxUsers: 300,
        multiple: true,
        limitTips: '选择人数不能超过300个',
        pickedUsers: selectedInvitees.map(invitee => invitee.id),
        responseUserOnly: true,
        success: (res) => {
          frontendLogger.info('选择邀请成员结果', { result: res });

          if (res && Array.isArray(res.users) && res.users.length > 0) {
              const invitees = res.users.map((user) => ({
                id: user.emplId,
                name: user.name
              }));

              frontendLogger.info('解析到邀请成员数据', { invitees });
              setSelectedInvitees(invitees);

          } else {
            setSelectedInvitees([]);
          }
        },
        fail: () => { },
        complete: () => { },
      };

      // strict 模式由 Select 组件处理，不走 complexChoose
      if (clientConfig.userSelectorMode === 'strict') return;

      dd.complexChoose(options).catch((err) => {
        frontendLogger.error('选择邀请成员失败', { error: err });
      });
    });
  };



  // 监听日期和时间变化，手动触发相关字段的重新验证
  useEffect(() => {
    if (formRef.current) {
      // 当日期或时间变化时，重新验证所有相关字段
      formRef.current.validateFields(['start_date', 'start_time', 'end_date', 'end_time']);
    }
  }, [currentDate, currentTime, currentEndDate, currentEndTime]);

  // strict 模式下从本地缓存读取组织架构树（登录时已预加载，24小时有效）
  useEffect(() => {
    if (clientConfig.userSelectorMode === 'strict') {
      getScopedDeptTree().then(tree => {
        if (tree) setDeptTreeData(tree);
      });
    }
  }, []);

  // strict模式：搜索用户（防抖，调用后端接口搜索全企业用户）
  const handleSearchUsers = (value, isHost) => {
    const timerRef = isHost ? hostSearchTimerRef : inviteeSearchTimerRef;
    const setResults = isHost ? setHostSearchResults : setInviteeSearchResults;
    const setSearching = isHost ? setHostSearching : setInviteeSearching;
    const setSearch = isHost ? setHostTreeSearch : setInviteeTreeSearch;

    setSearch(value);

    if (timerRef.current) clearTimeout(timerRef.current);

    if (!value || value.trim().length === 0) {
      setResults(null); // 清空搜索，恢复显示组织架构树
      return;
    }

    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await searchUser(value.trim());
        if (result && result.users) {
          // 转换为 Tree 数据格式
          const treeNodes = result.users.map(user => ({
            key: 'user-' + user.userid,
            userid: user.userid,
            title: user.name || user.userid,
            type: 'user',
            avatar: user.avatar || '',
            job_number: user.jobnumber || user.job_number || '',
          }));
          setResults(treeNodes);
        } else {
          setResults([]);
        }
      } catch (error) {
        frontendLogger.error('搜索用户失败', { error });
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 500);
  };

  // strict模式：更新树的子节点（异步加载用户后）
function updateTreeChildren(tree, targetKey, newChildren) {
    if (!tree) return tree;
    if (tree.key === targetKey) {
        return { ...tree, children: [...(tree.children || []).filter(c => c.type === 'dept'), ...newChildren] };
    }
    if (tree.children) {
        return { ...tree, children: tree.children.map(c => updateTreeChildren(c, targetKey, newChildren)) };
    }
    return tree;
}

// strict模式：自定义Tree节点渲染（用户节点显示头像+姓名+工号）
function renderTreeNode(node) {
    if (node.type === 'user') {
        return (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Avatar size="small" src={node.avatar}>{(node.title || '?')[0]}</Avatar>
                <span>{node.title}</span>
                {node.job_number && <span style={{ color: '#999', fontSize: '12px' }}>工号: {node.job_number}</span>}
            </span>
        );
    }
    return <span>{node.title}</span>;
}

// strict模式：获取Tree要展示的数据（有搜索结果时显示搜索结果，否则显示组织架构树）
  const getTreeData = (isHost) => {
    const search = isHost ? hostTreeSearch : inviteeTreeSearch;
    const results = isHost ? hostSearchResults : inviteeSearchResults;
    if (search && search.trim().length > 0) {
      return results || [];
    }
    return deptTreeData ? [deptTreeData] : [];
  };

  const handleCreateMeetingSubmit = async (values) => {
    var meetingParams = {};
    meetingParams.instanceid = 1;
    meetingParams.subject = values.topic;
    // 免费账号不支持设置主持人，仅高级账号可设置
    if (!isFreeAccount) {
      meetingParams.hosts = selectedHosts.map(host => host.id); // 从合并后的状态中提取hosts数组
    }
    meetingParams.invitees = selectedInvitees.map(invitee => invitee.id); // 从合并后的状态中提取invitees数组
    meetingParams.type = 0;
    // 初始化settings对象
    meetingParams.settings = {};
    // 以下参数免费账号不支持设置：参会限制、水印、音频水印
    if (!isFreeAccount) {
      // 参会限制类型
      meetingParams.settings.only_user_join_type = values.only_user_join_type;
      // 水印设置 - 优先使用表单值（如果存在），否则使用配置默认值
      meetingParams.settings.allow_screen_shared_watermark = values.allow_screen_shared_watermark !== undefined ? values.allow_screen_shared_watermark : clientConfig.allow_screen_shared_watermark;
      meetingParams.settings.water_mark_type = clientConfig.water_mark_type;
      // 音频水印设置
      meetingParams.settings.audio_watermark = clientConfig.audio_watermark;
    }
    // console.log("startTime: ", values.start_time);
    const startDateTime = dayjs(values.start_date).hour(dayjs(values.start_time).hour()).minute(dayjs(values.start_time).minute());
    meetingParams.start_time = String(startDateTime.unix());
    const endDateTime = dayjs(values.end_date).hour(dayjs(values.end_time).hour()).minute(dayjs(values.end_time).minute());
    meetingParams.end_time = String(endDateTime.unix());
    var meetingParamsStr = JSON.stringify(meetingParams);
    frontendLogger.info('会议参数字符串', { meetingParamsStr });
    onCreate(meetingParamsStr);
    // 清空组件内部的主持人和邀请人状态数据，确保下一次打开Modal时不会显示之前的数据
    setSelectedHosts([]); // 清空主持人数据
    setSelectedInvitees([]); // 清空邀请人数据
  };

  const disabledTime = () => {
    return {
      disabledMinutes: () => {
        const minutes = [];
        for (let i = 0; i < 60; i++) {
          if (i % 15 !== 0) { // 只允许 00, 15, 30, 45
            minutes.push(i);
          }
        }
        return minutes;
      },
    };
  };

  return (
    <Modal
        title="预约会议"
        open={visible}
        onCancel={handleCancel}
        footer={null}
        onOpen={showModal}
        // 响应式宽度设置，PC端固定宽度，移动端自适应
        width={{ xs: '95%', sm: 700, md: 700 }}
        // 设置最小宽度以确保内容不会太窄
        style={{ minWidth: '400px' }}
        styles={{ body: { padding: '16px', maxHeight: '80vh', overflowY: 'auto' } }}
        // 移除centered属性，让弹窗在移动端默认显示在顶部
        // 移动端自动调整
        breakPoint="md"
      >
      <Form
        name="meetingReservation"
        onFinish={handleCreateMeetingSubmit}
        ref={formRef}
        // 响应式表单布局，移动端标签文字靠左显示
        labelCol={{ xs: 24, sm: 6, style: { textAlign: window.innerWidth <= 768 ? 'left' : 'right', marginBottom: '8px' } }}
        wrapperCol={{ xs: 24, sm: 16 }}
        // 移动端垂直布局
        layout={window.innerWidth <= 768 ? 'vertical' : 'horizontal'}
        initialValues={{
          topic: userInfo.name + "预约的会议",
          start_date: currentDate,
          start_time: currentTime,
          end_date: currentEndDate,
          end_time: currentEndTime,
          only_user_join_type: clientConfig.only_user_join_type || 1,
          allow_screen_shared_watermark: clientConfig.allow_screen_shared_watermark || true
        }}
      >
        <Form.Item
          name="topic"
          label="会议主题"
          rules={[{ required: true, message: '请输入会议主题!' }]}
          style={{ marginBottom: 16 }}
        >
          <Input 
            placeholder="请输入会议主题" 
            style={{ width: '100%' }}
            // 移动端优化输入体验
            autoComplete="off"
          />
        </Form.Item>
        <Form.Item
          label="开始"
          style={{ marginBottom: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <Form.Item
              name="start_date"
              noStyle
              rules={[
                { required: true, message: '请选择开始日期!' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const endDate = getFieldValue('end_date');
                    if (endDate && value) {
                      const startDateObj = dayjs(value).startOf('day');
                      const endDateObj = dayjs(endDate).startOf('day');
                      if (endDateObj.isBefore(startDateObj)) {
                        return Promise.reject(new Error('结束日期不能早于开始日期!'));
                      }
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <DatePicker 
                format="YYYY/MM/DD" 
                style={{ width: '130px', marginRight: '-2px' }}
                // 移动端使用弹出模式
                popupMatchSelectWidth={window.innerWidth <= 768 ? false : true}
                onChange={(date) => {
                  setCurrentDate(date);
                  // 清除开始日期的错误提示
                  if (formRef.current) {
                    formRef.current.setFields([{
                      name: 'start_date',
                      errors: []
                    }]);
                  }
                }}
              />
            </Form.Item>
            <Form.Item
              name="start_time"
              noStyle
              rules={[
                { required: true, message: '请选择开始时间!' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const startDate = getFieldValue('start_date');
                    const endDate = getFieldValue('end_date');
                    const endTime = getFieldValue('end_time');
                    if (startDate && endDate && endTime && value) {
                      const startDateTime = dayjs(startDate).hour(dayjs(value).hour()).minute(dayjs(value).minute());
                      const endDateTime = dayjs(endDate).hour(dayjs(endTime).hour()).minute(dayjs(endTime).minute());
                      if (endDateTime.isBefore(startDateTime)) {
                        return Promise.reject(new Error('结束时间不能早于开始时间!'));
                      }
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <TimePicker
                format="HH:mm"
                showTime={{
                  disabledTime: disabledTime,
                }}
                placeholder="选择时间"
                showNow={false}
                style={{ width: '130px' }}
                // 移动端使用弹出模式
                popupMatchSelectWidth={window.innerWidth <= 768 ? false : true}
                onChange={(time) => {
                  setCurrentTime(time);
                  // 清除开始时间的错误提示
                  if (formRef.current) {
                    formRef.current.setFields([{
                      name: 'start_time',
                      errors: []
                    }]);
                  }
                }}
              />
            </Form.Item>
          </div>
        </Form.Item>
        <Form.Item
          label="结束"
          style={{ marginBottom: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <Form.Item
              name="end_date"
              noStyle
              rules={[
                { required: true, message: '请选择结束日期!' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const startDate = getFieldValue('start_date');
                    if (startDate && value) {
                      const endDateObj = dayjs(value).startOf('day');
                      const startDateObj = dayjs(startDate).startOf('day');
                      if (endDateObj.isBefore(startDateObj)) {
                        return Promise.reject(new Error('结束日期不能早于开始日期!'));
                      }
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <DatePicker 
                format="YYYY/MM/DD" 
                style={{ width: '130px', marginRight: '-2px' }}
                // 移动端使用弹出模式
                popupMatchSelectWidth={window.innerWidth <= 768 ? false : true}
                onChange={(date) => {
                  setCurrentEndDate(date);
                  // 清除结束日期的错误提示
                  if (formRef.current) {
                    formRef.current.setFields([{
                      name: 'end_date',
                      errors: []
                    }]);
                  }
                }}
              />
            </Form.Item>
            <Form.Item
              name="end_time"
              noStyle
              rules={[
                { required: true, message: '请选择结束时间!' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const startDate = getFieldValue('start_date');
                    const startTime = getFieldValue('start_time');
                    const endDate = getFieldValue('end_date');
                    if (startDate && startTime && endDate && value) {
                      const startDateTime = dayjs(startDate).hour(dayjs(startTime).hour()).minute(dayjs(startTime).minute());
                      const endDateTime = dayjs(endDate).hour(dayjs(value).hour()).minute(dayjs(value).minute());
                      if (endDateTime.isBefore(startDateTime)) {
                        return Promise.reject(new Error('结束时间不能早于开始时间!'));
                      }
                      // 检查时间差是否超过24小时
                      const diffInMinutes = endDateTime.diff(startDateTime, 'minute');
                      if (diffInMinutes > 24 * 60) {
                        return Promise.reject(new Error('结束时间与开始时间的差值不能超过24小时!'));
                      }
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <TimePicker
                format="HH:mm"
                showTime={{
                  disabledTime: disabledTime,
                }}
                placeholder="选择时间"
                showNow={false}
                style={{ width: '130px' }}
                // 移动端使用弹出模式
                popupMatchSelectWidth={window.innerWidth <= 768 ? false : true}
                onChange={(time) => {
                  setCurrentEndTime(time);
                  // 清除结束时间的错误提示
                  if (formRef.current) {
                    formRef.current.setFields([{
                      name: 'end_time',
                      errors: []
                    }]);
                  }
                }}
              />
            </Form.Item>
          </div>
        </Form.Item>

        {!isFreeAccount && (
        <Form.Item
          name="only_user_join_type"
          label="参会限制"
          style={{ marginBottom: 16 }}
        >
          <Select 
            placeholder="选择参会限制"
            style={{ minWidth: 180 }}
          >
            <Option value={1}>所有成员可入会</Option>
            <Option value={2}>仅受邀成员可入会</Option>
            <Option value={3}>仅企业内部成员可入会</Option>
          </Select>
        </Form.Item>
        )}
        {clientConfig.isShowWatermarkSwitch && (
          <Form.Item
            name="allow_screen_shared_watermark"
            label="水印"
            valuePropName="checked"
            style={{ marginBottom: 16 }}
          >
            <Switch 
              checkedChildren="开启"
              unCheckedChildren="关闭"
              style={{ minWidth: 100 }}
            />
          </Form.Item>
        )}
        {!isFreeAccount && (
        <Form.Item
          label="指定主持人"
          style={{ marginBottom: 16 }}
        >
          {clientConfig.userSelectorMode === 'strict' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <Button type="primary" onClick={() => setHostTreeModalVisible(true)}>选择主持人</Button>
              {selectedHosts.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {selectedHosts.map(host => (
                    <span key={host.id} style={{ background: '#f0f0f0', padding: '2px 8px', borderRadius: 4, fontSize: 13 }}>
                      {host.name}
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ color: '#999' }}>暂未选择主持人</span>
              )}
              <Modal
                title="选择主持人"
                open={hostTreeModalVisible}
                onOk={() => setHostTreeModalVisible(false)}
                onCancel={() => setHostTreeModalVisible(false)}
                width={500}
                styles={{ body: { maxHeight: '60vh', overflow: 'auto' } }}
              >
                <Search placeholder="搜索全企业用户" allowClear loading={hostSearching} onChange={e => handleSearchUsers(e.target.value, true)} style={{ marginBottom: 8 }} />
                <Tree
                  checkable
                  checkedKeys={selectedHosts.map(h => 'user-' + h.id)}
                  onCheck={(checkedKeys, info) => {
                    // 只选中用户节点（非部门节点）
                    const userKeys = checkedKeys.filter(k => k.startsWith('user-'));
                    const hosts = userKeys.map(k => {
                      const userid = k.replace('user-', '');
                      const node = info.checkedNodes?.find(n => n.key === k);
                      return { id: userid, name: node?.title || userid };
                    });
                    setSelectedHosts(hosts);
                  }}
                  treeData={getTreeData(true)}
                  titleRender={renderTreeNode}
                  loadData={async (node) => {
                    if (node.type !== 'dept' || node.children?.length > 0) return;
                    const deptId = node.deptId;
                    const users = await getDeptUsers(deptId);
                    if (users && users.length > 0) {
                      // 更新树的子节点
                      setDeptTreeData(prev => updateTreeChildren(prev, node.key, users));
                    }
                  }}
                  fieldNames={{ title: 'title', key: 'key', children: 'children' }}
                  selectable={false}
                />
              </Modal>
            </div>
          ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
              <Button
                type="primary"
                onClick={() => handleChooseHost()}
                style={{ 
                  marginBottom: 10, 
                  width: '100%',
                  padding: '10px 0',
                  fontSize: window.innerWidth <= 768 ? '16px' : '14px'
                }}
              >选择主持人</Button>
            </div>
            {/* 主持人展示框 */}
            <div style={{
              padding: '8px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              wordBreak: 'break-all',
              overflowX: 'auto',
              whiteSpace: 'nowrap'
            }}>
              {selectedHosts && selectedHosts.length > 0 ? (
                <div>
                  <span style={{ color: '#666', marginRight: '8px' }}>已选择主持人:</span>
                  <span>
                    {selectedHosts.map((item, index) => (
                      <React.Fragment key={index}>
                        {index > 0 && '; '}
                        <span style={{ marginRight: '5px' }}>{item.name}</span>
                        <span
                          style={{
                            color: '#1890ff',
                            cursor: 'pointer',
                            fontSize: '14px',
                            marginRight: '5px'
                          }}
                          onClick={() => handleRemoveHost(index)}
                        >
                          [删除]
                        </span>
                      </React.Fragment>
                    ))}
                  </span>
                </div>
              ) : (
                <span style={{ color: '#999' }}>暂未选择主持人</span>
              )}
            </div>
          </div>
          )}
        </Form.Item>
        )}
        <Form.Item
          label="邀请成员"
          style={{ marginBottom: 16 }}
        >
          {clientConfig.userSelectorMode === 'strict' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <Button type="primary" onClick={() => setInviteeTreeModalVisible(true)}>选择邀请成员</Button>
              {selectedInvitees.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {selectedInvitees.map(inv => (
                    <span key={inv.id} style={{ background: '#f0f0f0', padding: '2px 8px', borderRadius: 4, fontSize: 13 }}>
                      {inv.name}
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ color: '#999' }}>暂未选择邀请成员</span>
              )}
              <Modal
                title="选择邀请成员"
                open={inviteeTreeModalVisible}
                onOk={() => setInviteeTreeModalVisible(false)}
                onCancel={() => setInviteeTreeModalVisible(false)}
                width={500}
                styles={{ body: { maxHeight: '60vh', overflow: 'auto' } }}
              >
                <Search placeholder="搜索全企业用户" allowClear loading={inviteeSearching} onChange={e => handleSearchUsers(e.target.value, false)} style={{ marginBottom: 8 }} />
                <Tree
                  checkable
                  checkedKeys={selectedInvitees.map(inv => 'user-' + inv.id)}
                  onCheck={(checkedKeys, info) => {
                    const userKeys = checkedKeys.filter(k => k.startsWith('user-'));
                    const invitees = userKeys.map(k => {
                      const userid = k.replace('user-', '');
                      const node = info.checkedNodes?.find(n => n.key === k);
                      return { id: userid, name: node?.title || userid };
                    });
                    setSelectedInvitees(invitees);
                  }}
                  treeData={getTreeData(false)}
                  titleRender={renderTreeNode}
                  loadData={async (node) => {
                    if (node.type !== 'dept' || node.children?.length > 0) return;
                    const deptId = node.deptId;
                    const users = await getDeptUsers(deptId);
                    if (users && users.length > 0) {
                      setDeptTreeData(prev => updateTreeChildren(prev, node.key, users));
                    }
                  }}
                  fieldNames={{ title: 'title', key: 'key', children: 'children' }}
                  selectable={false}
                />
              </Modal>
            </div>
          ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
              <Button
                type="primary"
                onClick={() => handleChooseInvitee()}
                style={{ 
                  marginBottom: 10, 
                  width: '100%',
                  padding: '10px 0',
                  fontSize: window.innerWidth <= 768 ? '16px' : '14px'
                }}
              >选择邀请成员</Button>
            </div>
            {/* 邀请成员展示框 */}
            <div style={{
              padding: '8px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              wordBreak: 'break-all',
              overflowX: 'auto',
              whiteSpace: 'nowrap'
            }}>
              {selectedInvitees && selectedInvitees.length > 0 ? (
                <div>
                  <span style={{ color: '#666', marginRight: '8px' }}>已选择邀请成员:</span>
                  <span>
                    {selectedInvitees.map((item, index) => (
                      <React.Fragment key={index}>
                        {index > 0 && '; '}
                        <span style={{ marginRight: '5px' }}>{item.name}</span>
                        <span
                          style={{
                            color: '#1890ff',
                            cursor: 'pointer',
                            fontSize: '14px',
                            marginRight: '5px'
                          }}
                          onClick={() => handleRemoveInvitee(index)}
                        >
                          [删除]
                        </span>
                      </React.Fragment>
                    ))}
                  </span>
                </div>
              ) : (
                <span style={{ color: '#999' }}>暂未选择邀请成员</span>
              )}
            </div>
          </div>
          )}
        </Form.Item>
        <Form.Item wrapperCol={{ xs: 24, sm: { span: 16, offset: 6 } }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: window.innerWidth <= 768 ? 'space-between' : 'flex-end', 
            gap: 10, 
            alignItems: 'center',
            // 移动端全宽按钮
            flexDirection: window.innerWidth <= 768 ? 'column' : 'row'
          }}>
            <Button onClick={handleCancel} style={{ 
              width: window.innerWidth <= 768 ? '100%' : 'auto',
              minWidth: window.innerWidth <= 768 ? '100%' : '120px',
              padding: window.innerWidth <= 768 ? '12px 0' : '10px 20px',
              fontSize: window.innerWidth <= 768 ? '16px' : '14px'
            }}>取消</Button>
            <Button type="primary" htmlType="submit" style={{ 
              width: window.innerWidth <= 768 ? '100%' : 'auto',
              minWidth: window.innerWidth <= 768 ? '100%' : '120px',
              padding: window.innerWidth <= 768 ? '12px 0' : '10px 20px',
              fontSize: window.innerWidth <= 768 ? '16px' : '14px'
            }}>确定</Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default MeetingModal;
