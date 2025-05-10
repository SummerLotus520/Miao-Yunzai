@echo off
chcp 65001 >nul
echo === 同步上游 TRSS 并提交本地修改 ===

:: 1. 进入你的本地仓库目录（修改为 F:\Miao-Yunzai）
cd /d "F:\Miao-Yunzai"

:: 2. 确保在 TRSS 分支
git checkout TRSS
if %errorlevel% neq 0 (
    echo [错误] 无法切换到 TRSS 分支
    pause
    exit /b 1
)

:: 3. 暂存所有修改
git add .

:: 4. 检查是否有本地未提交的修改
git status --porcelain | findstr "^M" >nul
if %errorlevel% equ 0 (
    echo 检测到本地修改，正在提交...
    git commit -m "[手动同步]"
    if %errorlevel% neq 0 (
        echo [错误] 提交失败
        pause
        exit /b 1
    )
) else (
    echo 本地没有修改，跳过提交
)

:: 5. 添加上游 TRSS 远程（如果不存在）
git remote get-url trss >nul 2>&1
if %errorlevel% neq 0 (
    git remote add trss https://github.com/TimeRainStarSky/Yunzai.git
)

:: 6. 强制拉取最新代码（避免缓存问题）
git fetch trss --force
if %errorlevel% neq 0 (
    echo [错误] 拉取 TRSS 更新失败
    pause
    exit /b 1
)

:: 7. 合并上游更新（允许不相关历史）
git merge trss/main --no-edit --allow-unrelated-histories
if %errorlevel% neq 0 (
    echo [错误] 合并冲突！请手动解决后重新运行脚本
    pause
    exit /b 1
)

:: 8. 推送到你的 fork（TRSS 分支）
git push origin TRSS
if %errorlevel% neq 0 (
    echo [错误] 推送失败，检查网络或权限
    pause
    exit /b 1
)

echo === 同步成功！本地修改和上游更新已推送 ===
pause
