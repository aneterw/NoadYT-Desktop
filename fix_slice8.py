path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()
lines = content.split('\n')

# Fix lines 200 and 202: slice(7) -> slice(8)
lines[199] = "        const localPath = url.slice(8).split('/').join('\\\\')"
lines[201] = "          sub.path.slice(8).split('/').join('\\\\')"

content = '\n'.join(lines)
open(path, 'w', encoding='utf-8').write(content)
print('Done')
