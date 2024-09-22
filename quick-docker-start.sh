#!/bin/bash

echo "请输入代理主机IP:端口（无需代理可按回车跳过）："
read proxy_host
if [ -z "$proxy_host" ]; then
    echo "未设置代理主机"
else
    export http_proxy=$proxy_host
    export https_proxy=$proxy_host
    echo "代理主机已临时设置为：$proxy_host"
fi

docker_compose_path=$(whereis docker-compose | awk '{print $2}')
if [ -z "$docker_compose_path" ]
then
    echo "docker compose -f ./docker-compose-local.yml -p fatpapersite up --force-recreate -d --build"
    docker compose -f ./docker-compose-local.yml -p fatpapersite up --force-recreate -d --build
else
    echo "$docker_compose_path -f ./docker-compose-local.yml -p fatpapersite up --force-recreate -d --build"
    $docker_compose_path -f ./docker-compose-local.yml -p fatpapersite up --force-recreate -d --build
fi
