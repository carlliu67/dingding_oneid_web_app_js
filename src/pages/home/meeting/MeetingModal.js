import React, { useState, useRef, useEffect } from 'react';
import { Modal, Form, Input, DatePicker, TimePicker, InputNumber, Button } from 'antd';
import dayjs from 'dayjs';
import * as dd from 'dingtalk-jsapi';
import './MeetingModal.css'
import clientConfig from '../../../config/client_config.js';

const MeetingModal = ({ visible, onCancel, onCreate, userInfo }) => {
  const [selectedHosts, setSelectedHosts] = useState([]); // 存储选中的主持人列表，每项包含 {id, name}
  const [selectedInvitees, setSelectedInvitees] = useState([]); // 存储选中的邀请人列表，每项包含 {id, name}
  const [currentDate, setCurrentDate] = useState(dayjs().startOf('day')); // 使用状态变量存储日期
  const [currentTime, setCurrentTime] = useState(() => { // 使用状态变量存储时间，初始计算未来最近的15分钟间隔
    const now = dayjs();
    const currentMinutes = now.minute();
    const remainder = currentMinutes % 15;
    const minutesToAdd = 30 - remainder;
    return now.add(minutesToAdd, 'minute');
  });
  const formRef = useRef(null);

  // 使用useEffect监听visible属性变化，确保每次Modal显示时都更新时间
  useEffect(() => {
    if (visible) {
      // 计算未来最近的15分钟间隔时间
      const now = dayjs();
      const currentMinutes = now.minute();
      const remainder = currentMinutes % 15;
      const minutesToAdd = 30 - remainder;
      const adjustedTime = now.add(minutesToAdd, 'minute');
      
      console.log('Modal visible, updating time to:', adjustedTime.format('HH:mm'));
      
      // 更新状态变量
      setCurrentDate(now.startOf('day'));
      setCurrentTime(adjustedTime);
      
      // 延迟执行以确保formRef已初始化
      setTimeout(() => {
        if (formRef.current) {
          formRef.current.resetFields(['start_time']);
          formRef.current.setFieldsValue({
            start_time: adjustedTime
          });
        }
      }, 0);
    }
  }, [visible]);

  const showModal = () => {
    // 使用新的变量名避免混淆
    const newNow = dayjs();
    const newDate = newNow.startOf('day');
    
    // 计算未来最近的15分钟间隔时间
    const currentMinutes = newNow.minute();
    const remainder = currentMinutes % 15;
    const minutesToAdd = remainder > 0 ? 15 - remainder : 0;
    const adjustedTime = newNow.add(minutesToAdd, 'minute');
    
    console.log('showModal called, current time:', newNow.format('HH:mm'), 'adjusted to:', adjustedTime.format('HH:mm'));
    
    // 更新状态变量，触发组件重新渲染
    setCurrentDate(newDate);
    setCurrentTime(adjustedTime);
    
    // 强制更新表单值
    if (formRef.current) {
      // 先重置表单，确保清除之前的值
      formRef.current.resetFields(['start_time']);
      // 然后设置新的值
      formRef.current.setFieldsValue({
        start_time: adjustedTime
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
      dd.complexChoose({
        // appId: '3588138805',
        title: '选择主持人',
        corpId: clientConfig.corpId,
        // deptId: '0987',
        maxUsers: 50,
        multiple: true,
        // rootPage: `rootPage示例值`,
        limitTips: '选择人数不能超过50个',
        pickedUsers: selectedHosts.map(host => host.id),
        // disabledUsers: ['userId0', 'userId2'],
        // requiredUsers: [userInfo.userid],
        // showLabelPick: true,
        responseUserOnly: true,
        // pickedDepartments: ['deptId0', 'deptId1'],
        // showOrgEcological: false,
        // disabledDepartments: ['deptId0', 'deptId1'],
        // filterOrgEcological: false,
        // requiredDepartments: ['deptId0', 'deptId1'],
        // startWithDepartmentId: '0332',
        success: (res) => {
          console.log('选择人员结果:', res); // 打印返回结果以帮助调试

          if (res && Array.isArray(res.users) && res.users.length > 0) {
              // 确认返回的是一个用户对象数组 [{ name, avatar, emplId }, ...]
              const hosts = res.users.map((user) => ({
                id: user.emplId,
                name: user.name
              }));

              console.log('解析到人员数据:', hosts); // 打印解析后的人员数据
              setSelectedHosts(hosts); // 设置选中的人员数据

          } else {
            // 如果返回的不是预期的数组结构或数组为空
            setSelectedHosts([]); // 清空数据
          }
        },
        fail: () => { },
        complete: () => { },
      }).catch((err) => {
        console.error('选择主持人失败:', err);
      });
    });
  };

  // 处理选择邀请人
  const handleChooseInvitee = async () => {
    dd.ready(() => {
      dd.complexChoose({
        // appId: '3588138805',
        title: '选择邀请成员',
        corpId: clientConfig.corpId,
        // deptId: '0987',
        maxUsers: 300,
        multiple: true,
        // rootPage: `rootPage示例值`,
        limitTips: '选择人数不能超过300个',
        pickedUsers: selectedInvitees.map(invitee => invitee.id),
        // disabledUsers: ['userId0', 'userId2'],
        // requiredUsers: [userInfo.userid],
        // showLabelPick: true,
        responseUserOnly: true,
        // pickedDepartments: ['deptId0', 'deptId1'],
        // showOrgEcological: false,
        // disabledDepartments: ['deptId0', 'deptId1'],
        // filterOrgEcological: false,
        // requiredDepartments: ['deptId0', 'deptId1'],
        // startWithDepartmentId: '0332',
        success: (res) => {
          console.log('选择邀请成员结果:', res); // 打印返回结果以帮助调试

          if (res && Array.isArray(res.users) && res.users.length > 0) {
              // 确认返回的是一个用户对象数组 [{ name, avatar, emplId }, ...]
              const invitees = res.users.map((user) => ({
                id: user.emplId,
                name: user.name
              }));

              console.log('解析到邀请成员数据:', invitees); // 打印解析后的人员数据
              setSelectedInvitees(invitees); // 设置选中的人员数据

          } else {
            // 如果返回的不是预期的数组结构或数组为空
            setSelectedInvitees([]); // 清空数据
          }
        },
        fail: () => { },
        complete: () => { },
      }).catch((err) => {
        console.error('选择邀请成员失败:', err);
      });
    });
  };

  const handleCreateMeetingSubmit = async (values) => {
    var meetingParams = {};
    meetingParams.instanceid = 1;
    meetingParams.subject = values.topic;
    meetingParams.hosts = selectedHosts.map(host => host.id); // 从合并后的状态中提取hosts数组
    meetingParams.invitees = selectedInvitees.map(invitee => invitee.id); // 从合并后的状态中提取invitees数组
    meetingParams.type = 0;
    // console.log("startTime: ", values.start_time);
    const startDateTime = dayjs(values.start_date).hour(dayjs(values.start_time).hour()).minute(dayjs(values.start_time).minute());
    meetingParams.start_time = String(startDateTime.unix());
    const durationMinutes = values.duration;
    meetingParams.end_time = String(startDateTime.add(durationMinutes, 'minute').unix());
    var meetingParamsStr = JSON.stringify(meetingParams);
    console.log("meetingParamsStr: ", meetingParamsStr);
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
      footer={null}
      onCancel={handleCancel}
      onOpen={showModal}
    >
      <Form
        name="meetingReservation"
        onFinish={handleCreateMeetingSubmit}
        ref={formRef}
        labelCol={{ xs: 24, sm: 6, style: { textAlign: 'right' } }}
        wrapperCol={{ xs: 24, sm: 16, style: { textAlign: 'left' } }}
        initialValues={{
          topic: userInfo.name + "预约的会议",
          start_date: currentDate,
          start_time: currentTime,
          duration: 60
        }}
      >
        <Form.Item
          name="topic"
          label="会议主题"
          rules={[{ required: true, message: '请输入会议主题' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="start_date"
          label="开始日期"
          rules={[{ required: true, message: '请选择开始日期' }]}
        >
          <DatePicker format="YYYY/MM/DD" />
        </Form.Item>
        <Form.Item
          name="start_time"
          label="开始时间"
          rules={[{ required: true, message: '请选择开始时间' }]}
        >
          <TimePicker
            format="HH:mm"
            showTime={{
              disabledTime: disabledTime,
            }}
            placeholder="选择时间"
            showNow={false}
          />
        </Form.Item>
        <Form.Item
          name="duration"
          label="持续时长（分钟）"
          rules={[{ required: true, message: '请输入持续时长' }]}
        >
          <InputNumber min={1} step={5} />
        </Form.Item>
        <Form.Item
          name="host"
          label="指定主持人"
          rules={[{ message: '请选择成员' }]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button type="primary" onClick={() => handleChooseHost()}>选择主持人</Button>
            </div>
            {/* 主持人展示框 */}
            <div style={{
              padding: '12px',
              // border: '1px solid #d9d9d9',
              borderRadius: '4px',
              // backgroundColor: '#fafafa',
              wordBreak: 'break-all'
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
        </Form.Item>
        <Form.Item
          name="invitees"
          label="邀请成员"
          rules={[{ message: '请选择成员' }]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button type="primary" onClick={() => handleChooseInvitee()}>选择邀请成员</Button>
            </div>
            {/* 邀请成员展示框 */}
            <div style={{
              padding: '12px',
              // border: '1px solid #d9d9d9',
              borderRadius: '4px',
              // backgroundColor: '#fafafa',
              wordBreak: 'break-all'
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
        </Form.Item>
      </Form>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
        <Button onClick={handleCancel}>取消</Button>
        <Button type="primary" onClick={() => formRef.current?.submit()}>确定</Button>
      </div>
    </Modal>
  );
};

export default MeetingModal;
