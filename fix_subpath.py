path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

old = """      // 如果選擇外部播放器，調用 Rust 端播放本地文件
      if (playerType === 'external' && url.startsWith('file://')) {
        const localPath = url.slice(8).split('/').join('\\\\')
        const subPaths = (result.subtitles || []).map((sub: any) =>
          sub.path.slice(8).split('/').join('\\\\')
        )
        console.log('[DEBUG playVideo] calling play_with_external_player:', localPath, subPaths, externalPlayer)
        await invoke('play_with_external_player', { videoPath: localPath, subtitlePaths: subPaths, player: externalPlayer })
        setLoading(false)
        setPage('player')
        return
      }"""

new = """      // 如果選擇外部播放器，調用 Rust 端播放本地文件
      if (playerType === 'external' && url.startsWith('file://')) {
        const localPath = url.slice(8).split('/').join('\\\\')
        const subPaths = (result.subtitles || []).map((sub: any) => {
          let p = sub.path
          if (p.startsWith('file://')) p = p.slice(8).split('/').join('\\\\')
          else if (p.includes('/')) p = p.split('/').join('\\\\')
          return p
        })
        console.log('[DEBUG playVideo] calling play_with_external_player:', localPath, subPaths, externalPlayer)
        await invoke('play_with_external_player', { videoPath: localPath, subtitlePaths: subPaths, player: externalPlayer })
        setLoading(false)
        setPage('player')
        return
      }"""

content = content.replace(old, new)
open(path, 'w', encoding='utf-8').write(content)
print('Done')