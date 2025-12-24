# Docker 部署指南

本应用支持多种 Docker 部署模式，可以根据需要选择合适的部署方式。

## 快速开始

### 1. 构建镜像

```bash
npm run docker:build
```

或者直接使用 Docker 命令：

```bash
docker build --tag dingding-oneid .
```

### 2. 配置文件

项目使用两种配置方式：

#### 环境变量配置（前端）
复制环境变量示例文件并配置必要参数：

```bash
cp .env.example .env
# 然后编辑 .env 文件，填入相关参数
```

#### 后端配置文件
确保 `server/config/server_config.js` 文件存在。可以从 `server_config_sample.js` 复制：

```bash
cp server/config/server_config_sample.js server/config/server_config.js
```

注意：后端配置主要通过环境变量传递，`server_config.js` 文件负责读取这些环境变量。

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

## 管理命令

### 查看日志

```bash
npm run docker:logs
```

### 停止服务

```bash
npm run docker:stop
```

### 清理容器和镜像

```bash
npm run docker:clean
```

## 直接使用 Docker 命令

### 构建并运行指定模式

```bash
# 构建镜像
docker build --tag dingding-oneid .

# 运行前端模式
docker run -d -p 7000:7000 --name dingding-front-end dingding-oneid front-end

# 运行后端模式
docker run -d -p 7001:7001 --name dingding-back-end dingding-oneid back-end

# 运行 webhook 模式
docker run -d -p 7002:7002 -e PORT=7002 --name dingding-webhook dingding-oneid webhook

# 运行完整模式
docker run -d -p 7000:7000 -p 7001:7001 --name dingding-full dingding-oneid full
```

## 本地开发启动脚本

项目还提供了本地启动脚本 `start.sh`，支持相同的模式切换：

```bash
# 给脚本执行权限
chmod +x start.sh

# 启动不同模式
./start.sh front-end    # 前端模式
./start.sh back-end     # 后端模式
./start.sh webhook      # Webhook 模式
./start.sh full         # 完整模式（默认）
./start.sh help         # 查看帮助
```

## 端口说明

- **7000**: React 前端服务端口
- **7001**: 后端 API 服务端口
- **7002**: Webhook 服务端口（独立部署时，内部和外部都使用7002）

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

## 环境变量

可以通过环境变量覆盖默认配置：

```bash
# 设置端口
docker run -e PORT=7001 dingding-oneid back-end

# 设置 Node.js 环境
docker run -e NODE_ENV=production dingding-oneid full
```