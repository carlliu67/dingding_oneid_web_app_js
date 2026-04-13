# 钉钉 OneID 应用

钉钉 OneID 应用是一个集成钉钉和腾讯会议的企业级应用，支持会议创建、预约、查看等功能。

## 功能特性

- **钉钉免登**：支持钉钉企业内部免登
- **会议管理**：创建、查询、取消会议
- **日程同步**：会议与钉钉日程同步
- **云录制**：支持会议录制和回放

## 技术栈

- **前端**：React 18 + Ant Design
- **后端**：Node.js 18+ + Koa
- **数据库**：SQLite / MySQL
- **缓存**：Redis（可选，多节点部署时需要配置）

### 环境要求

- **Node.js**：≥ 18.0.0（建议使用 LTS 版本）
- **npm**：≥ 9.0.0
- **Docker**：≥ 20.10（如需 Docker 部署）
- **docker-compose**：≥ 2.0（如需 Docker Compose 部署）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置文件

#### 环境变量配置
复制环境变量示例文件并配置必要参数：

```bash
cp .env.example .env
# 然后编辑 .env 文件，填入相关参数
```

#### 后端配置文件
确保 `server/config/server_config.js` 文件存在：

```bash
cp server/config/server_config_sample.js server/config/server_config.js
```

### 3. 本地开发

#### 方式一：使用 npm 脚本

```bash
# 启动完整服务（前后端）
npm run start

# 仅启动前端
npm run start:web

# 仅启动后端
npm run start:server
```



## Docker 部署

### 构建镜像

```bash
npm run docker:build
```

或者直接使用 Docker 命令：

```bash
docker build --tag dingding-oneid .
```

### 启动服务

```bash
# 使用 docker-compose
docker-compose up -d

# 或者使用 npm 脚本
npm run docker:run
```

### 目录结构

确保以下目录结构存在：

```
./config/
├── server/          # 后端配置文件
└── client/          # 前端配置文件
./logs/              # 日志目录
./data/              # 数据目录
```

创建配置目录：

```bash
mkdir -p config/server config/client

# 复制配置文件模板
cp src/config/client_config_sample.js config/client/client_config.js
cp server/config/server_config_sample.js config/server/server_config.js
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

## 端口说明

| 端口 | 服务 |
|------|------|
| 7000 | React 前端服务 |
| 7001 | 后端 API 服务（包含 webhook） |

## 管理命令

### Docker 管理

```bash
# 查看日志
npm run docker:logs

# 停止服务
npm run docker:stop

# 清理容器和镜像
npm run docker:clean
```

### docker-compose 命令

```bash
# 查看服务状态
docker-compose ps

# 查看服务日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 更新镜像并重启
docker-compose pull && docker-compose up -d
```

## 直接使用 Docker 命令

```bash
# 构建镜像
docker build --tag dingding-oneid .

# 运行容器
docker run -d -p 7000:7000 -p 7001:7001 --name dingding-oneid dingding-oneid
```

## 注意事项

1. 首次部署前，请确保已正确配置所有必要的环境变量
2. 生产环境建议使用 HTTPS 协议
3. 数据库和 Redis 配置为可选，不配置将使用默认的 SQLite 和本地存储
4. 日志和数据目录需要适当的权限，确保 Docker 容器可以写入