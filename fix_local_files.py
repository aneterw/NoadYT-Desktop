path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

# 修復第 246 行：將 url.replace(/^file:\/\//, '').replace(/\\/g, '/') 改為 url.slice(8).replace(/\\/g, '/')
content = content.replace(
    "let localPath = url.replace(/^file:\\/\\//, '').replace(/\\\\/g, '/')",
    "let localPath = url.slice(8).replace(/\\\\/g, '/')"
)

# 修復字幕 track src：將 file:/// URI 轉為 tauri://local-files/
content = content.replace(
    "            // Windows 本地路徑轉 file:// URI，否則 <track src> 無法載入\n            let trackSrc = sub.path\n            if (trackSrc && trackSrc.includes(':\\\\')) {\n              trackSrc = 'file:///' + trackSrc.replace(/\\\\/g, '/')\n            }",
    "            // Windows 本地路徑轉 tauri://local-files/ URI，否則 <track src> 無法載入\n            let trackSrc = sub.path\n            if (trackSrc && trackSrc.includes(':\\\\')) {\n              trackSrc = 'tauri://local-files/' + trackSrc.slice(2).replace(/\\\\/g, '/')\n            }"
)

open(path, 'w', encoding='utf-8').write(content)
print('Done')
