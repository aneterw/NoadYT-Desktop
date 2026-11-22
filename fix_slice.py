path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

# Replace with slice/split/join approach - no regex escaping needed
old = """        const localPath = url.replace(/^file:\\/\\//, '').split('/').join('\\\\')
        const subPaths = (result.subtitles || []).map((sub: any) =>
          sub.path.replace(/^file:\\/\\//, '').split('/').join('\\\\')
        )"""

new = """        const localPath = url.slice(7).split('/').join('\\\\')
        const subPaths = (result.subtitles || []).map((sub: any) =>
          sub.path.slice(7).split('/').join('\\\\')
        )"""

content = content.replace(old, new)
open(path, 'w', encoding='utf-8').write(content)
print('Done')
