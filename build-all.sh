#!/bin/bash

echo "构建所有Docker服务镜像..."

echo "=== 构建前端服务 ==="
sudo docker-compose build front-end

echo ""
echo "=== 构建后端服务 ==="
sudo docker-compose build back-end

echo ""
echo "=== 构建webhook服务 ==="
sudo docker-compose build webhook

echo ""
echo "=== 构建完整服务 ==="
sudo docker-compose build full

echo ""
echo "=== 所有镜像 ==="
sudo docker images | grep dingding

echo ""
echo "✅ 所有镜像构建完成！"