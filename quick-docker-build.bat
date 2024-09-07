@echo off
docker compose -f ./docker-compose-local.yml build
docker save fatpaper/fatpaper-web:latest fatpaper/fatpaper-monopoly-server:latest fatpaper/fatpaper-user-server:latest mysql:8.3.0 -o ./docker-output/fatpaper.tar
pause