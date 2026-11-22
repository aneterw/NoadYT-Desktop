path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

# Replace the broken regex-based path conversion with split/join
old_block = """        const localPath = url.replace(/^file:\\/\\//, '').replace(/\\//g, '\\\\')
        const subPaths = (result.subtitles || []).map((sub: any) =>
          sub.path.replace(/^file:\\/\\//, '').replace(/\\//g, '\\\\')
        )"""

new_block = """        const localPath = url.replace(/^file:\\/\\//, '').split('/').join('\\\\\\\\')
        const subPaths = (result.subtitles || []).map((sub: any) =>
          sub.path.replace(/^file:\\/\\//, '').split('/').join('\\\\\\\\')
        )"""

content = content.replace(old_block, new_block)

open(path, 'w', encoding='utf-8').write(content)
print('Done')
