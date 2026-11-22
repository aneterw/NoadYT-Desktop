import re

path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

# 修復路徑轉換：將 /\\//g 改為 /\//g (匹配所有正斜線)
content = content.replace(r"replace(/\\//g, '\\')", r"replace(/\//g, '\\')")

open(path, 'w', encoding='utf-8').write(content)
print('Fixed path conversion regex')
