import re

path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

# 修復路徑轉換的正規表達式：將 /\\/\\/g 替換為 /\//g
content = content.replace(
    r"replace(/\\/\\/g, '\\\\')",
    r"replace(/\//g, '\\')"
)

open(path, 'w', encoding='utf-8').write(content)
print('Fixed regex syntax')
