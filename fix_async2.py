path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

lines = content.split('\n')

# Find and replace line 222 (index 221): forEach -> for...of
# And add idx line after it
for i, line in enumerate(lines):
    if 'result.subtitles.forEach((sub: any, idx: number) => {' in line:
        lines[i] = '          for (const sub of result.subtitles) {'
        lines.insert(i + 1, '            const idx = result.subtitles.indexOf(sub)')
        break

# Fix closing: change "          })" to "          }" (the one right after the forEach block)
for i, line in enumerate(lines):
    if line.strip() == '          })' and i > 220 and i < 250:
        lines[i] = '          }'
        break

content = '\n'.join(lines)
open(path, 'w', encoding='utf-8').write(content)
print('Done')
