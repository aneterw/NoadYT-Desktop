path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

# 修復第 246 行：url.replace(/^file:\/\//, '') -> url.slice(8)
content = content.replace(
    "let localPath = url.replace(/^file:\\/\\//, '').replace(/\\\\/g, '/')",
    "let localPath = url.slice(8).replace(/\\\\/g, '/')"
)

# 修復字幕 track src：file:/// URI -> tauri://local-files/ URI
content = content.replace(
    "            // Windows 本地路徑轉 file:// URI，否則 <track src> 無法載入\n            let trackSrc = sub.path\n            if (trackSrc && trackSrc.includes(':\\\\')) {\n              trackSrc = 'file:///' + trackSrc.replace(/\\\\/g, '/')\n            }",
    "            // Windows 本地路徑轉 tauri://local-files/ URI，否則 <track src> 無法載入\n            let trackSrc = sub.path\n            if (trackSrc && trackSrc.includes(':\\\\')) {\n              trackSrc = 'tauri://local-files/' + trackSrc.slice(8).replace(/\\\\/g, '/')\n            }"
)

open(path, 'w', encoding='utf-8').write(content)
print('Done')
