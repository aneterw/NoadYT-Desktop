path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

# 檢查當前狀態
if "slice(2)" in content:
    # 修復字幕路徑：slice(2) -> slice(8)
    content = content.replace(
        "trackSrc = 'tauri://local-files/' + trackSrc.slice(2).replace(/\\\\/g, '/')",
        "trackSrc = 'tauri://local-files/' + trackSrc.slice(8).replace(/\\\\/g, '/')"
    )
    print('Fixed subtitle slice(2) -> slice(8)')
else:
    # 尚未應用字幕修復，先檢查原始代碼
    print('Subtitle fix not yet applied, checking...')

# 確保第 246 行已修復
if "url.slice(8)" in content:
    print('Video path slice(8) already applied')
else:
    print('Video path slice(8) NOT applied yet')

open(path, 'w', encoding='utf-8').write(content)
print('Done')
