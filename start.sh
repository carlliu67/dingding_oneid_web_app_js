#!/bin/bash

# 钉钉OneID应用启动脚本
# 支持三种启动模式：front-end、back-end、webhook

set -e

# 获取启动模式参数
MODE=${1:-"full"}

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查配置文件是否存在
check_config() {
    if [ ! -f "./server/config/server_config.js" ]; then
        log_error "配置文件 server_config.js 不存在！"
        log_info "请从 server_config_sample.js 复制并配置相关参数"
        exit 1
    fi
}

# 更新serverMode配置
update_server_mode() {
    local mode=$1
    log_info "更新 serverMode 配置为: $mode"
    
    # 使用sed命令替换serverMode的值
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/serverMode: \".*\"/serverMode: \"$mode\"/" ./server/config/server_config.js
    else
        # Linux
        sed -i "s/serverMode: \".*\"/serverMode: \"$mode\"/" ./server/config/server_config.js
    fi
    
    log_info "配置更新完成"
}

# 启动函数
start_front_end() {
    log_info "启动前端服务 (front-end mode)..."
    check_config
    npm run start:web
}

start_back_end() {
    log_info "启动后端服务 (back-end mode)..."
    check_config
    update_server_mode "back-end"
    npm run start:server
}

start_webhook() {
    log_info "启动Webhook服务 (webhook mode)..."
    check_config
    update_server_mode "webhook"
    npm run start:server
}

start_full() {
    log_info "启动完整服务 (full mode)..."
    check_config
    update_server_mode "both"
    npm run start
}

# 显示帮助信息
show_help() {
    echo "钉钉OneID应用启动脚本"
    echo ""
    echo "用法: $0 [MODE]"
    echo ""
    echo "启动模式:"
    echo "  front-end   仅启动前端服务 (端口 7000)"
    echo "  back-end    仅启动后端服务 (端口 7001, serverMode: back-end)"
    echo "  webhook     仅启动Webhook服务 (端口 7001, serverMode: webhook)"
    echo "  full        启动完整服务 (前后端, serverMode: both) [默认]"
    echo ""
    echo "示例:"
    echo "  $0 front-end   # 启动前端"
    echo "  $0 back-end    # 启动后端"
    echo "  $0 webhook     # 启动webhook"
    echo "  $0 full        # 启动完整服务"
}

# 主逻辑
main() {
    case "$MODE" in
        "front-end")
            start_front_end
            ;;
        "back-end")
            start_back_end
            ;;
        "webhook")
            start_webhook
            ;;
        "full")
            start_full
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            log_error "未知的启动模式: $MODE"
            log_info "支持的模式: front-end, back-end, webhook, full"
            show_help
            exit 1
            ;;
    esac
}

# 捕获中断信号
trap 'log_info "收到中断信号，正在退出..."; exit 0' INT TERM

# 执行主函数
main "$MODE"