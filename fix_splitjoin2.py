path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

# Find and replace lines 200-202 with correct split/join approach
lines = content.split('\n')
# Line 200 (index 199) and 201-202 (index 200-201)
for i in range(199, 202):
    if i < len(lines):
        lines[i] = ''

# Insert correct lines
lines.insert(199, "        const localPath = url.replace(/^file:\\/\\//, '').split('/').join('\\\\')")
lines.insert(200, "        const subPaths = (result.subtitles || []).map((sub: any) =>")
lines.insert(201, "          sub.path.replace(/^file:\\/\\//, '').split('/').join('\\\\')")

content = '\n'.join(lines)
open(path, 'w', encoding='utf-8').write(content)
print('Done')
