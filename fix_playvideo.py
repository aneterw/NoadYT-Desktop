path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()
lines = content.split('\n')

# Find the playVideo function start and end
start_idx = None
end_idx = None
for i, line in enumerate(lines):
    if 'const playVideo = async (video: any) => {' in line:
        start_idx = i
    if start_idx is not None and end_idx is None:
        # Find the matching closing brace for the function
        # Look for '  }\n' pattern at the end of playVideo (2-space indent closing)
        if line.strip() == '}' and i > start_idx + 5:
            # Check if next non-empty line is 'const togglePlay'
            j = i + 1
            while j < len(lines) and lines[j].strip() == '':
                j += 1
            if j < len(lines) and 'const togglePlay' in lines[j]:
                end_idx = i
                break

print(f"playVideo starts at line {start_idx+1}, ends at line {end_idx+1}")

# New playVideo function
new_func = """  const playVideo = async (video: any) => {
    setVideoTitle(video.title || '無標題')
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    try {
      setLoading(true)
      setError('')
      const result: any = await invoke('get_stream_url', { input: { videoId: video.id, resolution } })
      const url: string = result.path
      setStreamUrl(url)
      console.log('[DEBUG playVideo] stream URL:', url)
      console.log('[DEBUG playVideo] subtitle tracks:', result.subtitles?.length || 0)

      // 如果選擇外部播放器，調用 Rust 端播放本地文件
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
      }

      const videoEl = videoRef.current
      if (videoEl) {
        // 添加字幕軌道（timedtext VTT，置中顯示）
        if (result.subtitles && Array.isArray(result.subtitles)) {
          const existingTracks = videoEl.querySelectorAll('track')
          existingTracks.forEach((t: HTMLTrackElement) => t.remove())
          for (const sub of result.subtitles) {
            const idx = result.subtitles.indexOf(sub)
            const track = document.createElement('track')
            track.kind = 'subtitles'
            track.label = sub.name || sub.language || '字幕'
            track.srclang = sub.language || 'zh'
            let trackSrc = sub.path
            if (trackSrc && trackSrc.includes(':\\\\')) {
              let subLocalPath = trackSrc.slice(8).replace(/\\\\/g, '/')
              try {
                const subBytes: Uint8Array = await invoke('read_binary_file', { path: subLocalPath })
                const subBlob = new Blob([subBytes], { type: 'text/vtt' })
                trackSrc = URL.createObjectURL(subBlob)
              } catch (e) {
                trackSrc = ''
              }
            }
            track.src = trackSrc
            track.default = idx === 0
            videoEl.appendChild(track)
            console.log('[DEBUG playVideo] added track:', track.label, track.src)
            setError((prevError: string) => (prevError || '') + '\\n字幕軌道[' + idx + ']: ' + track.label + ' → ' + trackSrc)
          }
        }

        // 本地 MP4 檔案，用 Blob URL 播放
        const isLocalFile = url.includes(':\\\\\\\\') || url.startsWith('file://')
        if (isLocalFile) {
          let localPath = url.slice(8).replace(/\\\\/g, '/')
          console.log('[DEBUG playVideo] local file path:', localPath)
          try {
            const bytes: Uint8Array = await invoke('read_binary_file', { path: localPath })
            const blob = new Blob([bytes], { type: 'video/mp4' })
            const blobUrl = URL.createObjectURL(blob)
            console.log('[DEBUG playVideo] blob URL created:', blobUrl)
            videoEl.src = blobUrl
            videoEl.onloadedmetadata = () => {
              console.log('[DEBUG playVideo] blob URL metadata loaded, switching to player page')
              URL.revokeObjectURL(blobUrl)
              setPage('player')
            }
            videoEl.onerror = (_e: any) => {
              setLoading(false)
              URL.revokeObjectURL(blobUrl)
              setError('<video> 無法播放此檔案: ' + (videoEl.error?.message || '未知錯誤'))
            }
            videoEl.play().catch((e: any) => {
              console.error('[DEBUG playVideo] video play failed:', e)
              setError('影片播放失敗: ' + (e.message || String(e)))
            })
          } catch (err: any) {
            setLoading(false)
            setError('播放失敗: ' + (err.message || String(err)))
          }
        } else {
          const isM3u8 = url.toLowerCase().includes('.m3u8') || url.toLowerCase().includes('m3u8')
          if (isM3u8 && Hls.isSupported()) {
            const hls = new Hls()
            hlsRef.current = hls
            hls.loadSource(url)
            hls.attachMedia(videoEl)
            hls.on(Hls.Events.ERROR, (_ev: any, data: any) => {
              console.error('[DEBUG playVideo] hls.js ERROR:', data)
              setError('hls.js 播放錯誤: ' + (data.details || String(data)))
            })
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              console.log('[DEBUG playVideo] hls.js MANIFEST_PARSED, attempting play')
              videoEl.play().catch((e: any) => {
                console.error('[DEBUG playVideo] video play failed after manifest:', e)
                setError('影片播放失敗: ' + (e.message || String(e)))
              })
            })
          } else {
            videoEl.src = url
            videoEl.onerror = (_e: any) => {
              console.error('[DEBUG playVideo] video element error:', _e)
              setError('<video> 無法播放此格式: ' + (videoEl.error?.message || '未知錯誤'))
            }
            videoEl.play().catch((e: any) => {
              console.error('[DEBUG playVideo] video play failed:', e)
              setError('影片播放失敗: ' + (e.message || String(e)))
            })
          }
        }
      }
    } catch (err: any) {
      setLoading(false)
      setError('無法取得串流網址: ' + (err.message || String(err)))
    }
  }"""

# Replace lines from start_idx to end_idx (inclusive)
new_lines = lines[:start_idx] + [new_func] + lines[end_idx+1:]
content = '\n'.join(new_lines)
open(path, 'w', encoding='utf-8').write(content)
print('Done')
