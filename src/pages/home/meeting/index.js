import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, Button, Table, Space, Modal } from 'antd';
import './index.css';
import { handleCreateMeeting, handleQueryUserEndedMeetingList, handleQueryUserMeetingList, handleGenerateJoinScheme } from '../../../components/wemeetapi/wemeetApi.js';
import MeetingModal from './MeetingModal.js';
import clientConfig from '../../../config/client_config.js';

// 定义错误码常量
const ERROR_CODE_LOGIN_REQUIRED = 500214; // 首次使用需要登录腾讯会议客户端的错误码

function formatTimestamp(timestamp) {
  // 将秒级时间戳转换为毫秒级时间戳
  const timestampInMilliseconds = timestamp * 1000;

  // 创建一个 Date 对象
  const date = new Date(timestampInMilliseconds);

  // 定义日期格式化选项
  const options = {
    weekday: 'short',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };

  // 创建一个 Intl.DateTimeFormat 对象
  const formatter = new Intl.DateTimeFormat('zh-CN', options);

  // 格式化日期
  let formattedDate = formatter.format(date);

  // 替换星期几的前缀
  formattedDate = formattedDate.replace('星期', '周');

  // 将XX/XX格式替换为XX月XX日
  formattedDate = formattedDate.replace(/(\d{2})\/(\d{2})/, '$1月$2日');

  return formattedDate;
}

function MeetingList(props) {
  const [meetings, setMeetings] = useState([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [ongoingMeetings, setOngoingMeetings] = useState([]);
  const [MeetingListTimestamp, setMeetingListTimestamp] = useState(0);
  const [endedMeetings, setEndedMeetings] = useState([]);
  const [endedMeetingsTimestamp, setEndedMeetingsTimeStamp] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [isModalVisible, setIsModalVisible] = useState(false);
  let userInfo = props.userInfo;
  console.log('userInfo:', userInfo);
  if (!userInfo) {
    userInfo = {};
  }

  const getMeetingInfoList = useCallback(async () => {
    setLoading(true);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    var meetingListsResult = null;
    var endedMeetingList = [];
    var upcomingMeetingList = [];
    var ongoingMeetingList = [];
    // 待参加会议和进行中会议使用的是通一个腾讯会议api接口
    if (activeTab === 'upcoming') {
      // 处理即将召开的会议逻辑
      // 当MeetingListTimestamp为0（强制刷新）或缓存过期时，重新获取数据
      // 确保即使之前列表为空，也会重新获取数据
      if (MeetingListTimestamp === 0 || currentTimestamp - MeetingListTimestamp > 30) {
        meetingListsResult = await handleQueryUserMeetingList();
        console.log('meetingListsResult:', meetingListsResult);
        // 即使返回空结果也要更新状态和时间戳
        if (!meetingListsResult || meetingListsResult.meeting_number === 0) {
          setMeetings(upcomingMeetingList);
          setUpcomingMeetings(upcomingMeetingList);
          setMeetingListTimestamp(currentTimestamp); // 更新时间戳避免重复请求
          setLoading(false);
          return;
        }
        for (let meetingInfo of meetingListsResult.meeting_info_list) {
          let formattedStartTime = formatTimestamp(meetingInfo.start_time);
          if (meetingInfo.status === 'MEETING_STATE_STARTED') {
            ongoingMeetingList.push({
              formatted_start_time: formattedStartTime,
              subject: meetingInfo.subject,
              meeting_code: meetingInfo.meeting_code,
              start_time: meetingInfo.start_time,
              meeting_id: meetingInfo.meeting_id,
            });
          } else {
            upcomingMeetingList.push({
              formatted_start_time: formattedStartTime,
              subject: meetingInfo.subject,
              meeting_code: meetingInfo.meeting_code,
              start_time: meetingInfo.start_time,
              meeting_id: meetingInfo.meeting_id,
            });
          }
        }
        setUpcomingMeetings(upcomingMeetingList);
        setOngoingMeetings(ongoingMeetingList);
        setMeetings(upcomingMeetingList);
        setMeetingListTimestamp(currentTimestamp);
      } else {
        setMeetings(upcomingMeetings);
      }
    } else if (activeTab === 'ongoing') {
      // 处理正在进行的会议逻辑
      if (MeetingListTimestamp === 0 || currentTimestamp - MeetingListTimestamp > 30) {
        meetingListsResult = await handleQueryUserMeetingList();
        console.log('meetingListsResult:', meetingListsResult);
        if (!meetingListsResult || meetingListsResult.meeting_number === 0) {
          setMeetings(ongoingMeetingList);
          setOngoingMeetings(ongoingMeetingList);
          setMeetingListTimestamp(currentTimestamp);
          setLoading(false);
          return;
        }
        for (let meetingInfo of meetingListsResult.meeting_info_list) {
          let formattedStartTime = formatTimestamp(meetingInfo.start_time);
          if (meetingInfo.status === 'MEETING_STATE_STARTED') {
            ongoingMeetingList.push({
              formatted_start_time: formattedStartTime,
              subject: meetingInfo.subject,
              meeting_code: meetingInfo.meeting_code,
              start_time: meetingInfo.start_time,
              meeting_id: meetingInfo.meeting_id,
            });
          } else {
            upcomingMeetingList.push({
              formatted_start_time: formattedStartTime,
              subject: meetingInfo.subject,
              meeting_code: meetingInfo.meeting_code,
              start_time: meetingInfo.start_time,
              meeting_id: meetingInfo.meeting_id,
            });
          }
        }
        setUpcomingMeetings(upcomingMeetingList);
        setOngoingMeetings(ongoingMeetingList);
        setMeetings(ongoingMeetingList);
        setMeetingListTimestamp(currentTimestamp);
      } else {
        setMeetings(ongoingMeetings);
      }
    } else if (activeTab === 'ended') {
      // 处理已结束的会议逻辑
      if (endedMeetingsTimestamp === 0 || currentTimestamp - endedMeetingsTimestamp > 30) {
        meetingListsResult = await handleQueryUserEndedMeetingList();
        if (!meetingListsResult || meetingListsResult.total_count === 0) {
          setMeetings(endedMeetingList);
          setEndedMeetings(endedMeetingList);
          setEndedMeetingsTimeStamp(currentTimestamp);
          setLoading(false);
          return;
        }
        console.log('endedMeetingListsResult:', meetingListsResult);
        for (let meetingInfo of meetingListsResult.meeting_info_list) {
          let formattedStartTime = formatTimestamp(meetingInfo.start_time);
          endedMeetingList.push({
            formatted_start_time: formattedStartTime,
            subject: meetingInfo.subject,
            meeting_code: meetingInfo.meeting_code,
            start_time: meetingInfo.start_time,
            meeting_id: meetingInfo.meeting_id,
          });
        }
        setEndedMeetings(endedMeetingList);
        setMeetings(endedMeetingList);
        setEndedMeetingsTimeStamp(currentTimestamp);
      } else {
        setMeetings(endedMeetings);
      };
    }
    setLoading(false);
  }, [activeTab, ongoingMeetings, upcomingMeetings, endedMeetings, MeetingListTimestamp, endedMeetingsTimestamp]);


  useEffect(() => {
    getMeetingInfoList();
  }, [activeTab, userInfo.userid, getMeetingInfoList]);

  const columns = [
    {
      title: '开始时间',
      dataIndex: 'formatted_start_time',
      width: 200
    },
    {
      title: '会议主题',
      dataIndex: 'subject',
      ellipsis: true,
      width: 200,
    },
    {
      title: '会议号',
      dataIndex: 'meeting_code',
      width: 150
    },
    { 
      title: '操作', 
      width: 180, 
      render: (_, record) => { 
        const buttons = []; 
        if (activeTab === 'ongoing') { 
          buttons.unshift( 
            <Button 
              key="join" 
              onClick={() => handleJoinMeeting(record.meeting_code)} 
              style={{ width: 'auto' }} 
            >
              加入会议
            </Button>
          ); 
        } else if (activeTab === 'ended') { 
          buttons.unshift( 
            <Button 
              key="delete" 
              danger 
              onClick={() => handleDelete(record.meeting_id)} 
              style={{ width: 'auto' }} 
            >
              删除
            </Button>
          ); 
          buttons.unshift( 
            <Button 
              key="export-members" 
              onClick={() => handleExportMembers(record.meeting_id)} 
              style={{ width: 'auto' }} 
            >
              导出参会成员
            </Button>
          ); 
          buttons.unshift( 
            <Button 
              key="export-checkin" 
              onClick={() => handleExportCheckin(record.meeting_id)} 
              style={{ width: 'auto' }} 
            >
              导出签到记录
            </Button>
          ); 
        } else if (activeTab === 'upcoming') { 
          buttons.unshift( 
            <Button 
              key="join" 
              onClick={() => handleJoinMeeting(record.meeting_code)} 
              style={{ width: 'auto' }} 
            >
              加入会议
            </Button>
          ); 
        } 
        return <Space>{buttons}</Space>; 
      } 
    }
  ];

  // 新增加入会议的处理函数
  const handleJoinMeeting = meeting_code => {
    console.log('Join meeting:', meeting_code);
    handleGenerateJoinScheme(meeting_code, false);
  };


  const handleDelete = id => {
    console.log('Delete:', id);
  };

  const handleExportMembers = id => {
    console.log('Export members:', id);
  };

  const handleExportCheckin = id => {
    console.log('Export checkin:', id);
  };

  const showModal = () => {
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  const handleCreateMeetingSubmit = async (meetingParamsStr) => {
    try {
      // 创建会议
      const result = await handleCreateMeeting(meetingParamsStr);

      // 检查是否有错误响应，ERROR_CODE_LOGIN_REQUIRED表示账号未激活，不能调创建会议接口，需要引导用户先登录腾讯会议客户端
      if (result && result.new_error_code && result.new_error_code === ERROR_CODE_LOGIN_REQUIRED) {
        // 显示登录腾讯会议客户端的弹窗
        Modal.info({
          title: '首次使用提示',
          content: (
            <div>
              <p>首次使用预约会议功能需要先登录腾讯会议客户端</p>
            </div>
          ),
          okText: '登录腾讯会议客户端',
          onOk() {
            // 调用handleGenerateJoinScheme方法
            // 由于没有具体会议码，这里可以使用一个默认的会议码或者提示用户
            // 为了演示，我们使用一个示例会议码
            handleGenerateJoinScheme('', true);
          },
          okButtonProps: { style: { width: 'auto' } }
        });
      } else {
        // 关闭模态框
        setIsModalVisible(false);
        // 确保显示即将召开的会议列表
        setActiveTab('upcoming');

        // 增加短暂延时，确保服务器已处理完会议创建
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 重置MeetingListTimestamp为0，触发useEffect重新执行getMeetingInfoList，获取最新的会议列表
        setMeetingListTimestamp(0);
      }
    } catch (error) {
      console.error('创建会议失败-----:', error);
      // 即使出错也要尝试刷新列表
      try {
        setMeetingListTimestamp(0);
      } catch (refreshError) {
        console.error('刷新会议列表失败:', refreshError);
      }
    }
  };

  const tabItems = [
    {
      key: 'upcoming',
      label: '即将召开的会议',
      children: null // 这里可以根据实际需求添加对应 tab 的内容
    }
    // {
    //   key: 'ongoing',
    //   label: '正在进行中的会议',
    //   children: null
    // },
    // {
    //   key: 'ended',
    //   label: '已结束的会议',
    //   children: null
    // }
  ];

  if (clientConfig.mode === 'schedule') {
    return (
      <div style={{ padding: 24, background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
          {<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" className="reserve-button" onClick={showModal}>预定会议</Button>
          </div>}
        </div>

        <Table
          columns={columns}
          dataSource={meetings}
          loading={loading}
          rowKey="meeting_id"
          pagination={false}
          // 添加 rowClassName 属性
          rowClassName="custom-row"
        />

        <MeetingModal
          visible={isModalVisible}
          onCancel={handleCancel}
          onCreate={handleCreateMeetingSubmit}
          userInfo={userInfo}
        />
      </div>
    );
  } else {
    return (
      <div style={{ padding: 24, background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
        </div>

        <Table
          columns={columns}
          dataSource={meetings}
          loading={loading}
          rowKey="meeting_id"
          pagination={false}
          // 添加 rowClassName 属性
          rowClassName="custom-row"
        />

        <MeetingModal
          visible={isModalVisible}
          onCancel={handleCancel}
          onCreate={handleCreateMeetingSubmit}
          userInfo={userInfo}
        />
      </div>
    );
  }
}

export default MeetingList;

