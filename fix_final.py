path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

# Replace the broken regex /\\//g with correct /\//g and replacement '\\\\' with '\\'
old_line200 = "        const localPath = url.replace(/^file:\\/\\//, '').replace(/\\//g, '\\\\\\\\')"
new_line200 = "        const localPath = url.replace(/^file:\\/\\//, '').replace(/\//g, '\\\\')"

# Actually let's just do a simple string replacement
content = content.replace(
    r"replace(/\\//g, '\\\\')",
    r"replace(/\//g, '\\')"
)

open(path, 'w', encoding='utf-8').write(content)
print('Fixed')
