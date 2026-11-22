path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()
lines = content.split('\n')

# Replace lines 200 and 202 (index 199 and 201)
# Line 200: const localPath = ...
# Line 202: sub.path.replace(...)
lines[199] = "        const localPath = url.slice(7).split('/').join('\\\\')"
lines[201] = "          sub.path.slice(7).split('/').join('\\\\')"

content = '\n'.join(lines)
open(path, 'w', encoding='utf-8').write(content)
print('Done')
