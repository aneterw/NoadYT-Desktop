@echo off
chcp 65001 >nul
echo ========================================
echo  NoadYT-Desktop 安裝程式
echo ========================================
echo.

echo [1/3] 檢查 MSI 檔案...
if not exist "src-tauri\target\release\bundle\msi\NoadYT-Desktop_0.1.0_x64_en-US.msi" (
    echo 錯誤：找不到 MSI 檔案！
    pause
    exit /b 1
)
echo 找到 MSI 檔案

echo.
echo [2/3] 卸載舊版 NoadYT-Desktop...
powershell -Command "$prod = Get-CimInstance Win32_Product | Where-Object { $_.Name -like '*NoadYT*' }; if ($prod) { Write-Host '找到舊版：' $prod.Name; $prod.Uninstall() } else { Write-Host '未找到舊版，跳過卸載' }"

echo.
echo [3/3] 安裝新版 NoadYT-Desktop...
msiexec /i "src-tauri\target\release\bundle\msi\NoadYT-Desktop_0.1.0_x64_en-US.msi" /qn /norestart
if %errorlevel%==0 (
    echo.
    echo ========================================
    echo  安裝完成！
    echo ========================================
) else (
    echo.
    echo 錯誤：安裝失敗，代碼 %errorlevel%
    pause
    exit /b 1
)

echo.
echo 請從開始選單啟動 NoadYT-Desktop，搜尋「新聞」並點擊影片播放。
pause
