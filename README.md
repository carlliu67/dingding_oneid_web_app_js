# 钉钉 OneID 应用

钉钉 OneID 应用是一个集成钉钉和腾讯会议的企业级应用，支持会议创建、预约、查看等功能。

## 功能特性

参考RELEASE_NOTES.md文档

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
- `FRONT_END_SERVER_URL`: 前端服务完整地址（用于后端生成钉钉日程/待办跳转链接，需包含协议+域名+端口，如 `http://your-domain.com:7000`）

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