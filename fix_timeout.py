path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

# 替換 playVideo 函數，添加超時處理
old = """  const playVideo = async (video: any) => {
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
      console.log('[DEBUG playVideo] subtitle tracks:', result.subtitles?.length || 0)"""

new = """  const playVideo = async (video: any) => {
    setVideoTitle(video.title || '無標題')
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    try {
      setLoading(true)
      setError('')
      // 30 秒超時，避免 Python 下載過長導致應用卡死
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('解析超時，請嘗試指定解析度或使用外部播放器')), 30000)
      )
      const result: any = await Promise.race([
        invoke('get_stream_url', { input: { videoId: video.id, resolution } }),
        timeout
      ])
      const url: string = result.path
      setStreamUrl(url)
      console.log('[DEBUG playVideo] stream URL:', url)
      console.log('[DEBUG playVideo] subtitle tracks:', result.subtitles?.length || 0)"""

content = content.replace(old, new)

# 將 setPage('player') 從第 312 行移動到 onloadedmetadata 回調中
# 目前 setPage('player') 在 if (videoEl) 塊之後無條件執行
# 需要移除那個無條件的 setPage('player')，只在 onloadedmetadata 中調用

# 找到並移除第 312 行的 setPage('player')（在 catch 塊之前）
old2 = """      setPage('player')
    } catch (err: any) {
      setError('無法取得串流網址: ' + (err.message || String(err)))
    }"""

new2 = """    } catch (err: any) {
      setLoading(false)
      setError('無法取得串流網址: ' + (err.message || String(err)))
    }"""

content = content.replace(old2, new2)

open(path, 'w', encoding='utf-8').write(content)
print('Done')
