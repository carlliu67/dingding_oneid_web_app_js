# 钉钉 OneID 应用

钉钉 OneID 应用是一个集成钉钉和腾讯会议的企业级应用，支持会议创建、预约、查看等功能。

## 功能特性

- 腾讯会议客户端创建/修改/取消会议同步到钉钉日程/待办，支持周期会议
- 预约会议（支持参会类型、水印等参数设置）、加入会议、唤起腾讯会议客户端
- PC/移动端从日程、待办及工作台入口免登跳转入会
- 云录制文件生成 IM 消息推送与免登打开云录制页面
- 人员选择两种模式：全量模式（钉钉通讯录组件）/ 严格模式（组织架构树，限定用户所在部门及子部门，支持全企业搜索）
- 管理后台：在线配置所有环境参数（加密存储、实时生效），仅钉钉企业管理员可访问
- 组织架构三层缓存（内存/数据库/钉钉），每日凌晨自动全量刷新
- 数据自动过期/定时清理，支持免费账号预约会议
- 配置 Redis 后支持多节点部署；数据库支持 MySQL 和 SQLite

详细变更参考 RELEASE_NOTES.md

## 技术栈

- **前端**：React 18 + Ant Design
- **后端**：Node.js 18+ + Koa
- **数据库**：SQLite / MySQL
- **缓存**：Redis（可选，多节点部署时需要配置）

### 环境要求

- **Docker**：≥ 20.10
- **docker-compose**：≥ 2.0

## 快速开始

### 1. 配置文件

复制环境变量示例文件并配置必要参数：

```bash
cp .env.example .env
# 然后编辑 .env 文件，填入相关参数
```

### 2. 构建并启动

```bash
docker-compose up -d --build
```

## 管理命令

```bash
# 查看服务状态
docker-compose ps

# 查看服务日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart
```

## 配置说明

### 环境变量配置

#### 钉钉对接参数
- `CORP_ID`: 钉钉企业ID
- `CLIENT_ID`: 钉钉应用客户端ID
- `DINGTALK_CORP_ID`: 后端使用的钉钉企业ID
- `DINGTALK_APP_ID`: 钉钉应用ID
- `DINGTALK_AGENT_ID`: 钉钉应用AgentID
- `DINGTALK_CLIENT_ID`: 后端使用的钉钉应用客户端ID
- `DINGTALK_CLIENT_SECRET`: 钉钉应用客户端密钥
- `DINGTALK_ROBOT_CODE`: 钉钉机器人代码

#### 服务配置
- `API_PORT`: 后端监听端口（默认7000，可被 `PORT` 环境变量覆盖）
- `PORT`: 后端实际监听端口（优先级高于 `API_PORT`，Docker 中默认7000）
- `FRONT_END_SERVER_URL`: 前端服务完整地址（钉钉日程"加入会议"链接使用，移动端跳转依赖此方式；需包含协议+域名+端口，如 `http://your-domain.com:7000`）

#### 腾讯会议对接参数
- `WEMEET_APPID`: 腾讯会议应用ID
- `WEMEET_REST_API_SDKID`: 腾讯会议SDKID
- `WEMEET_REST_API_SECRET_ID`: 腾讯会议SecretID
- `WEMEET_REST_API_SECRET_KEY`: 腾讯会议SecretKey
- `WEMEET_WEBHOOK_TOKEN`: Webhook令牌
- `WEMEET_WEBHOOK_AES_KEY`: Webhook AES密钥
- `WEMEET_SSO_URL`: SSO URL

#### 数据库配置
- `DB_TYPE`: 数据库类型（默认sqlite）
- `DB_HOST`: 数据库主机
- `DB_PORT`: 数据库端口
- `DB_USER`: 数据库用户名
- `DB_PASSWORD`: 数据库密码
- `DB_DATABASE`: 数据库名称

#### Redis配置（可选）
- `REDIS_HOST`: Redis主机地址
- `REDIS_PORT`: Redis端口（默认6379）
- `REDIS_PASSWORD`: Redis密码
- `REDIS_DB`: Redis数据库索引（默认0）
- `REDIS_KEY_PREFIX`: Redis键前缀（默认dingtalk:）
- `REDIS_USER_AUTH_EXPIRE`: 用户鉴权信息过期时间（默认3600秒）

#### 数据自动过期/定时清理配置
- `TODO_RETENTION_DAYS`: todo数据保留天数，超过则清理（默认366，设为0表示不清理）
- `CALENDAR_RETENTION_DAYS`: calendar数据保留天数，超过则清理（默认366，设为0表示不清理）
- `USERINFO_RETENTION_DAYS`: 用户信息保留天数，超过最后登录时间则清理（默认366，设为0表示不清理）

#### 其他配置
- `LOG_LEVEL`: 日志级别（默认info）
- `MODE`: 工作台应用打开模式（默认upcoming）
- `REACT_APP_CREATE_MEETING_BUTTON_VISIBILITY`: 创建会议按钮展示控制（默认advanced），可选值：`all`（所有用户可见）、`advanced`（仅高级账号可见）、`none`（全部不允许展示）
- `REACT_APP_USER_SELECTOR_MODE`: 人员选择模式（默认full），可选值：`full`（全量模式，钉钉通讯录组件）、`strict`（严格模式，组织架构树限定用户所在部门及子部门）
- `DINGTALK_CALENDAR_SWITCH`: 预约普通会议时是否创建钉钉日程（默认false，周期会议不受此开关影响）
- `DINGTALK_TODO_SWITCH`: 预约普通会议时是否创建钉钉待办（默认true，周期会议不受此开关影响）

以上参数均可在管理后台在线修改（加密存储到数据库，保存后实时生效；`REACT_APP_*` 前端变量需重新构建镜像）。

## 端口说明

后端 Koa 服务同时托管前端静态文件与 API，前后端复用同一端口。

| 端口 | 服务 |
|------|------|
| 7000 | 前端静态文件 + 后端 API 服务（含 webhook） |

## 注意事项

1. 首次部署前，请确保已正确配置所有必要的环境变量
2. 生产环境建议使用 HTTPS 协议
3. 数据库和 Redis 配置为可选，不配置将使用默认的 SQLite 和本地存储
4. 日志和数据目录需要适当的权限，确保 Docker 容器可以写入

## 组织架构缓存说明

严格模式（`REACT_APP_USER_SELECTOR_MODE=strict`）依赖组织架构缓存服务：

- **存储**：独立数据表 `org_dept_tree`（全量部门树）与 `org_dept_users`（部门成员，按需加载），与业务配置表分离
- **加载策略**：启动时数据库数据未超24小时直接加载；否则从钉钉拉取全量组织架构（首次拉取后落库，重启秒级恢复）
- **定时刷新**：每日凌晨1点（东八区）自动全量刷新，刷新失败30分钟后重试；部门改名/增删最晚次日凌晨生效
- **部门成员**：用户展开部门节点时才从钉钉拉取该部门直属成员，24小时缓存，过期后先返回旧数据再后台刷新
- **容错**：钉钉API调用并发限流（5）+ 失败重试；构建失败不落缓存；部门删除后自动清理残留成员缓存