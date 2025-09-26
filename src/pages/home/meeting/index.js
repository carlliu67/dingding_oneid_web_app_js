import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs, Button, Table, Space } from 'antd';
import './index.css';
import { handleCreateMeeting, handleQueryUserEndedMeetingList, handleQueryUserMeetingList, handleGenerateJoinScheme } from '../../../components/wemeetapi/wemeetApi.js';
import MeetingModal from './MeetingModal.js';
import clientConfig from '../../../config/client_config.js';

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
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('upcoming');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const formRef = useRef(null);
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
      if (currentTimestamp - MeetingListTimestamp > 30) {
        meetingListsResult = await handleQueryUserMeetingList();
        console.log('meetingListsResult:', meetingListsResult);
        if (!meetingListsResult || meetingListsResult.meeting_number === 0) {
          setMeetings(upcomingMeetingList);
          setLoading(false);
          return;
        }
        for (var meetingInfo of meetingListsResult.meeting_info_list) {
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
      if (currentTimestamp - MeetingListTimestamp > 30) {
        meetingListsResult = await handleQueryUserMeetingList();
        console.log('meetingListsResult:', meetingListsResult);
        if (!meetingListsResult || meetingListsResult.meeting_number === 0) {
          setMeetings(ongoingMeetingList);
          setLoading(false);
          return;
        }
        for (var meetingInfo of meetingListsResult.meeting_info_list) {
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
      if (currentTimestamp - endedMeetingsTimestamp > 30) {
        meetingListsResult = await handleQueryUserEndedMeetingList();
        if (!meetingListsResult || meetingListsResult.total_count === 0) {
          setMeetings(endedMeetingList);
          setLoading(false);
          return;
        }
        console.log('endedMeetingListsResult:', meetingListsResult);
        var totalCount = meetingListsResult.total_count || 0;
        var totalPage = meetingListsResult.total_page || 0;
        var currentPage = meetingListsResult.current_page || 0;
        for (var meetingInfo of meetingListsResult.meeting_info_list) {
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
  }, [activeTab, searchText, ongoingMeetings, upcomingMeetings, endedMeetings, userInfo.userid]);

  const handleSearch = searchText => {
    setSearchText(searchText);
  };

  const handleSearchChange = searchText => {
    handleSearch(searchText);
  };

  const handleSearchClear = () => {
    handleSearch('');
  };

  const handleSearchSubmit = () => {
    getMeetingInfoList();
  };

  const handleSearchReset = () => {
    handleSearchClear();
    handleSearchSubmit();
  };

  const handleSearchEnter = e => {
    if (e.key === 'Enter') {
      handleSearchSubmit();
    }
  };

  const handleSearchIconClick = () => {
    handleSearchSubmit();
  };

  const handleSearchDropdownVisibleChange = visible => {
    if (visible) {
      setTimeout(() => {
        formRef.current.setFieldsValue({ searchText: '' });
      }, 100);
    }
  };

  useEffect(() => {
    getMeetingInfoList();
  }, [activeTab, searchText, userInfo.userid]);

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
    { title: '操作', width: 350, render: (_, record) => { const buttons = []; if (activeTab === 'ongoing') { buttons.unshift(<Button key="join" onClick={() => handleJoinMeeting(record.meeting_code)} style={{ width: 'auto' }}>加入会议</Button>); } else if (activeTab === 'ended') { buttons.unshift(<Button key="delete" danger onClick={() => handleDelete(record.meeting_id)} style={{ width: 'auto' }}>删除</Button>); buttons.unshift(<Button key="export-members" onClick={() => handleExportMembers(record.meeting_id)} style={{ width: 'auto' }}>导出参会成员</Button>); buttons.unshift(<Button key="export-checkin" onClick={() => handleExportCheckin(record.meeting_id)} style={{ width: 'auto' }}>导出签到记录</Button>); } else if (activeTab === 'upcoming') { buttons.unshift(<Button key="join" onClick={() => handleJoinMeeting(record.meeting_code)} style={{ width: 'auto' }}>加入会议</Button>); } return <Space>{buttons}</Space>; } }
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
      await handleCreateMeeting(meetingParamsStr);
      setIsModalVisible(false);
      setActiveTab('upcoming');
      await getMeetingInfoList();
    } catch (error) {
      console.error('创建会议失败-----:', error);
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

