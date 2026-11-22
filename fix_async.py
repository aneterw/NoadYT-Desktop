path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

# Replace forEach with async for...of
old_start = "          result.subtitles.forEach((sub: any, idx: number) => {"
new_start = "          for (const sub of result.subtitles) {\n            const idx = result.subtitles.indexOf(sub)"

content = content.replace(old_start, new_start)

# Fix closing: replace the final "          })" after the forEach block
# Find the line with just "          })" that closes the forEach
lines = content.split('\n')
# The closing brace of forEach is at line 245: "          })"
# Replace it with just "          }"
for i, line in enumerate(lines):
    if line.strip() == '          })' and i > 220 and i < 250:
        lines[i] = '          }'
        break

content = '\n'.join(lines)
open(path, 'w', encoding='utf-8').write(content)
print('Done')
