# Docker 部署指南

本应用支持多种 Docker 部署模式，可以根据需要选择合适的部署方式。

## 部署模式

### 1. 完整模式 (full)
同时运行前端、后端和 webhook 服务，适用于单机部署。

```bash
# 启动完整模式
docker-compose --profile full up -d
```

### 2. 前端模式 (front-end)
仅运行前端服务，适用于前后端分离部署。

```bash
# 启动前端模式
docker-compose --profile front-end up -d
```

### 3. 后端模式 (back-end)
仅运行后端服务，适用于前后端分离部署。

```bash
# 启动后端模式
docker-compose --profile back-end up -d
```

### 4. Webhook模式 (webhook)
仅运行 webhook 服务，适用于独立部署 webhook 服务。

```bash
# 启动 webhook 模式
docker-compose --profile webhook up -d
```

## 配置说明

### 环境变量配置

1. 复制环境变量示例文件：
```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，配置必要参数：

#### 钉钉对接参数
- `CORP_ID`: 钉钉企业ID
- `CLIENT_ID`: 钉钉应用客户端ID（原AppKey和SuiteKey）
- `DINGTALK_CORP_ID`: 后端使用的钉钉企业ID
- `DINGTALK_APP_ID`: 钉钉应用ID
- `DINGTALK_AGENT_ID`: 钉钉应用AgentID
- `DINGTALK_CLIENT_ID`: 后端使用的钉钉应用客户端ID
- `DINGTALK_CLIENT_SECRET`: 钉钉应用客户端密钥
- `DINGTALK_ROBOT_CODE`: 钉钉机器人代码

#### 服务配置
- `NODE_NAME`: 节点名称（多节点部署时需要）
- `SERVER_URL`: 后端服务地址
- `SERVER_PROTOCOL`: 服务协议（http/https）
- `API_PORT`: API端口（默认7001）
- `FRONT_END_SERVER_URL`: 前端服务地址

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

#### 其他配置
- `LOG_LEVEL`: 日志级别（默认info）
- `MODE`: 工作台应用打开模式（默认upcoming）

## 数据持久化

### 日志目录
- 前端日志：`./logs/front-end`
- 后端日志：`./logs/back-end`
- Webhook日志：`./logs/webhook`
- 完整模式日志：`./logs/full`

### 数据目录
- 前端数据：`./data/front-end`
- 后端数据：`./data/back-end`
- Webhook数据：`./data/webhook`
- 完整模式数据：`./data/full`

### 配置文件
- 前端配置：`./config/front-end`
- 后端配置：`./config/back-end`
- Webhook配置：`./config/webhook`
- 完整模式配置：`./config/full`

## 网络配置

所有服务都连接到 `dingding-network` 网络，确保服务间可以通信。

## 端口映射

- 前端服务：7000
- 后端服务：7001
- Webhook服务：7002

## 常用命令

```bash
# 查看服务状态
docker-compose ps

# 查看服务日志
docker-compose logs -f [service_name]

# 停止服务
docker-compose --profile [profile_name] down

# 重启服务
docker-compose --profile [profile_name] restart

# 更新镜像并重启
docker-compose pull && docker-compose --profile [profile_name] up -d
```

## 注意事项

1. 首次部署前，请确保已正确配置所有必要的环境变量
2. 生产环境建议使用 HTTPS 协议
3. 数据库和 Redis 配置为可选，不配置将使用默认的 SQLite 和本地存储
4. 多节点部署时，请确保每个节点的 `NODE_NAME` 唯一
5. 日志和数据目录需要适当的权限，确保 Docker 容器可以写入
6. 不同模式使用独立的配置文件，首次部署前需要复制相应的配置文件模板：
   ```bash
   # 创建配置目录
   mkdir -p config/front-end config/back-end config/webhook config/full
   
   # 复制配置文件模板
   cp src/config/client_config_sample.js config/front-end/client_config.js
   cp server/config/server_config_sample.js config/back-end/server_config.js
   cp server/config/server_config_sample.js config/webhook/server_config.js
   cp server/config/server_config_sample.js config/full/server_config.js
   ```