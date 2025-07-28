import { useState, useRef } from 'react';
import { Modal, Form, Input, DatePicker, TimePicker, InputNumber, Button } from 'antd';
import dayjs from 'dayjs';
import './MeetingModal.css'

const MeetingModal = ({ visible, onCancel, onCreate, userInfo }) => {
  const [startTime, setStartTime] = useState(null);
  const formRef = useRef(null);
  let currentDate;
  let currentTime;

  const showModal = () => {
    const now = dayjs();
    currentDate = now.startOf('day');
    currentTime = now;
    setStartTime(now.toDate());
  };

  const handleCancel = () => {
    onCancel();
  };

  const handleCreateMeetingSubmit = async (values) => {
    var meetingParams = {};
    meetingParams.instanceid = 1;
    meetingParams.subject = values.topic;
    meetingParams.host = values.host;
    meetingParams.invitees = values.invitees;
    meetingParams.type = 0;
    // console.log("startTime: ", values.start_time);
    const startDateTime = dayjs(values.start_date).hour(dayjs(values.start_time).hour()).minute(dayjs(values.start_time).minute());
    meetingParams.start_time = String(startDateTime.unix());
    const durationMinutes = values.duration;
    meetingParams.end_time = String(startDateTime.add(durationMinutes, 'minute').unix());
    var meetingParamsStr = JSON.stringify(meetingParams);
    console.log("meetingParamsStr: ", meetingParamsStr);
    onCreate(meetingParamsStr);
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
          rules={[{ message: '请输入成员名称' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="invitees"
          label="邀请成员"
          rules={[{ message: '请输入成员名称' }]}
        >
          <Input />
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
