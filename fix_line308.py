path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()
lines = content.split('\n')

# Fix line 308 (index 307): change '            }' to '            })'
if lines[307].strip() == '}':
    lines[307] = '            }'

content = '\n'.join(lines)
open(path, 'w', encoding='utf-8').write(content)
print('Done')
