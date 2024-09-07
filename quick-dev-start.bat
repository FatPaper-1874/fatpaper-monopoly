@echo off
reg add HKEY_CURRENT_USER\Console /v QuickEdit /t REG_DWORD /d 00000000 /f
chcp 65001
:startWeb
cd /d %~dp0\monopoly-admin && start "monopoly-admin" cmd /k "yarn dev"
cd /d %~dp0\monopoly-client && start "monopoly-client" cmd /k "yarn dev"
cd /d %~dp0\fatpaper-login && start "fatpaper-login" cmd /k "yarn dev"

:startUserServer
echo 正在启动user服务器
cd /d %~dp0\fatpaper-user-server && start "fatpaper-user-server" cmd /k "yarn dev"

echo 等待user服务器启动成功...

:waitForUserServerStart
timeout /t 5 >nul
for /f "tokens=*" %%i in ('netstat -aon ^| findstr ":83"') do (
    echo user服务器启动成功
    goto startMonopolyServer
)
goto waitForUserServerStart

:startMonopolyServer
echo 正在启动monopoly服务器
cd /d %~dp0\monopoly-server && start "monopoly-server" cmd /k "yarn dev"

echo 等待monopoly服务器启动成功...

:waitForMonopolyServerStart
timeout /t 5 >nul
for /f "tokens=*" %%i in ('netstat -aon ^| findstr ":84"') do (
    echo monopoly服务器启动成功
    goto end
)
goto waitForMonopolyServerStart

:end