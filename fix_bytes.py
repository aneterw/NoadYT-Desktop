path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'rb').read()

# Replace the broken regex /\\//g with correct /\//g
# File bytes currently contain: /\\//g  (which is regex matching \/)
# We want: /\//g  (which is regex matching /)
content = content.replace(
    b'replace(/\\\\//g',
    b'replace(//g'
)

# But wait, we need /\//g not just //g
# Let's be more specific
content = content.replace(
    b'replace(/\\\\//g',
    b'replace(/\\//g'
)

# And fix the replacement string: '\\\\' -> '\\'
content = content.replace(
    b", '\\\\\\\\')",
    b", '\\\\')"
)

open(path, 'wb').write(content)
print('Fixed')
