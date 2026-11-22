import re

path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

# Find and fix the broken regex patterns
# Replace: .replace(/\\/\\/g, '\\\\')  with: .replace(/\//g, '\\')
old1 = r".replace(/\\/\\/g, '\\\\')"
new1 = r".replace(/\//g, '\\')"

content = content.replace(old1, new1)

open(path, 'w', encoding='utf-8').write(content)
print('Done')
