import { useState, useRef, useEffect, useCallback } from 'react'
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import Hls from 'hls.js'

type Page = 'search' | 'player' | 'env' | 'channels' | 'channel-videos' | 'settings'

export default function App() {
  const [page, setPage] = useState<Page>('env')
  const [envChecked, setEnvChecked] = useState(false)
  const [envReady, setEnvReady] = useState(false)
  const [envError, setEnvError] = useState<string>('')
  const [query, setQuery] = useState('')
  const [videos, setVideos] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [searchDuration, setSearchDuration] = useState<number | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string>('')
  const [streamSubtitles, setStreamSubtitles] = useState<any[]>([])
  const [videoTitle, setVideoTitle] = useState<string>('')
  const [maxResults, setMaxResults] = useState<number>(60)
  const [resolution, setResolution] = useState<string>('auto')
  const [playerType, setPlayerType] = useState<'internal' | 'external'>('internal')
  const [externalPlayer, setExternalPlayer] = useState<'potplayer' | 'vlc' | 'mpv'>('potplayer')
  const [subtitleLang, setSubtitleLang] = useState<string>('auto')
  const [cacheStatus, setCacheStatus] = useState<string>('')
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  const [subtitleFontSize, setSubtitleFontSize] = useState<number>(32)
  const [styleEl, setStyleEl] = useState<HTMLStyleElement | null>(null)
  const [debugCollapsed, setDebugCollapsed] = useState<boolean>(true)
  const [subtitleText, setSubtitleText] = useState<string>('')
  const [subtitleActive, setSubtitleActive] = useState<boolean>(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<any>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const historyListRef = useRef<HTMLUListElement>(null)

  // 啟動時檢查 Python 環境
  useEffect(() => {
    const checkEnv = async () => {
      try {
        const dismissed = localStorage.getItem('noadyt-env-dismissed')
        if (dismissed === 'true') {
          setPage('search')
          setEnvChecked(true)
          return
        }
      } catch {}

      try {
        await invoke('check_python_environment')
        setEnvReady(true)
      } catch (err: any) {
        setEnvError(err.message || '環境檢查失敗')
        setEnvReady(false)
      } finally {
        setEnvChecked(true)
      }
    }
    checkEnv()
  }, [])

  // 讀取歷史關鍵字
  useEffect(() => {
    try {
      const raw = localStorage.getItem('noadyt-search-history')
      if (raw) setHistory(JSON.parse(raw))
    } catch {}
  }, [])

  // 儲存歷史關鍵字
  useEffect(() => {
    try {
      localStorage.setItem('noadyt-search-history', JSON.stringify(history))
    } catch {}
  }, [history])

  // 讀取設定
  useEffect(() => {
    try {
      const raw = localStorage.getItem('noadyt-settings')
      if (raw) {
        const s = JSON.parse(raw)
        if (s.maxResults) setMaxResults(s.maxResults)
        if (s.resolution) setResolution(s.resolution)
        if (s.playerType) setPlayerType(s.playerType)
        if (s.externalPlayer) setExternalPlayer(s.externalPlayer)
        if (s.subtitleLang) setSubtitleLang(s.subtitleLang)
      }
    } catch {}
  }, [])

  // 儲存設定
  const saveSettings = useCallback(() => {
    try {
      localStorage.setItem('noadyt-settings', JSON.stringify({ maxResults, resolution, playerType, externalPlayer, subtitleLang }))
    } catch {}
  }, [maxResults, resolution, playerType, externalPlayer, subtitleLang])

  // 清除緩存
  const clearCache = useCallback(async () => {
    try {
      setCacheStatus('清除中...')
      await invoke('clear_cache')
      setCacheStatus('緩存已清除')
      setTimeout(() => setCacheStatus(''), 3000)
    } catch (err: any) {
      setCacheStatus('清除失敗: ' + (err.message || String(err)))
      setTimeout(() => setCacheStatus(''), 3000)
    }
  }, [])

  // 清理 hls.js
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [])

  const addHistory = useCallback((kw: string) => {
    if (!kw.trim()) return
    setHistory(prev => {
      const filtered = prev.filter(k => k !== kw)
      return [kw, ...filtered].slice(0, 20)
    })
    setShowHistory(false)
  }, [])

  const addDebug = (msg: string) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`
    setDebugInfo(prev => [...prev.slice(-49), entry])
    console.log(entry)
  }

  // 解析 VTT 內容為時間段陣列
  const parseVttCues = (vttContent: string): Array<{start: number, end: number, text: string}> => {
    const cues: Array<{start: number, end: number, text: string}> = []
    const lines = vttContent.split(/\r?\n/)
    let i = 0
    addDebug('parseVttCues: total lines: ' + lines.length)
    while (i < lines.length) {
      const line = lines[i].trim()
      // 匹配時間行：00:00:00.199 --> 00:00:07.230 align:center position:50%
      // 也支持：00:00.199 --> 00:00:07.230
      const timeMatch = line.match(/(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})/)
      if (timeMatch) {
        const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000
        const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000
        // 收集後續的文本行，直到空行
        i++
        const textLines: string[] = []
        while (i < lines.length && lines[i].trim() !== '') {
          textLines.push(lines[i].trim())
          i++
        }
        const text = textLines.join(' ')
        cues.push({ start, end, text })
        addDebug('cue found: start=' + start + ', end=' + end + ', text=' + text.substring(0, 30))
      }
      i++
    }
    addDebug('parseVttCues: total cues: ' + cues.length)
    return cues
  }

  // 應用字幕大小到 video 元素，使用動態 style 標籤（::cue 對 CSS 變數支持有限）
  useEffect(() => {
    if (!styleEl) {
      const el = document.createElement('style')
      el.id = 'subtitle-style'
      document.head.appendChild(el)
      setStyleEl(el)
    }
    if (styleEl) {
      styleEl.textContent = `
        video::cue {
          font-size: ${subtitleFontSize}px !important;
        }
      `
    }
  }, [subtitleFontSize, styleEl])

  const removeHistory = useCallback((kw: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setHistory(prev => prev.filter(k => k !== kw))
  }, [])

  const selectHistory = useCallback((kw: string) => {
    setQuery(kw)
    setShowHistory(false)
    handleSearch()
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const kw = query.trim()
    if (!kw) return
    addHistory(kw)
    setLoading(true)
    setError('')
    setSearchDuration(null)
    const start = performance.now()
    try {
      const result: any = await invoke('search_videos', { input: { keyword: kw, maxResults } })
      if (!result.ok) {
        setError(result.error || '搜尋失敗')
        setVideos([])
        setSearchDuration(Math.round((performance.now() - start) / 10) / 100)
        return
      }
      const data = result.data
      const list = Array.isArray(data) ? data : (data?.entries || data?.videos || [])
      setVideos(list.slice(0, maxResults))
      setSearchDuration(Math.round((performance.now() - start) / 10) / 100)
    } catch (err: any) {
      setError(err.message || '搜尋出錯')
      setVideos([])
      setSearchDuration(Math.round((performance.now() - start) / 10) / 100)
    } finally {
      setLoading(false)
    }
  }

  const handleChannelSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const kw = query.trim()
    if (!kw) return
    setLoading(true)
    setError('')
    const start = performance.now()
    try {
      const result: any = await invoke('search_channels', { keyword: kw })
      if (!result.ok) {
        setError(result.error || '頻道搜尋失敗')
        setVideos([])
        return
      }
      const data = result.data
      const list = Array.isArray(data) ? data : (data?.entries || data?.videos || [])
      setVideos(list)
      setSearchDuration(Math.round((performance.now() - start) / 10) / 100)
    } catch (err: any) {
      setError(err.message || '頻道搜尋出錯')
      setVideos([])
    } finally {
      setLoading(false)
    }
  }

  const playVideo = async (video: any) => {
    setVideoTitle(video.title || '無標題')
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    try {
      setLoading(true)
      setError('')
      const result: any = await invoke('get_stream_url', { input: { videoId: video.id, resolution, subtitleLang: subtitleLang || 'auto' } })
      const url: string = result.path
      setStreamUrl(url)
      console.log('[DEBUG playVideo] stream URL:', url)
      console.log('[DEBUG playVideo] subtitle tracks:', result.subtitles?.length || 0)

      // 本地文件（download 模式）：使用 convertFileSrc 轉換為 asset:// URL，WebView2 可內建播放
      if (url.startsWith('file://')) {
        const localPath = url.slice(8).replace(/\\/g, '/')
        console.log('[DEBUG playVideo] converting local path:', localPath)
        const assetUrl = convertFileSrc(localPath)
        console.log('[DEBUG playVideo] asset URL:', assetUrl)
        setStreamUrl(assetUrl)
        setStreamSubtitles(result.subtitles || [])
        setPage('player')
        return
      }

      // 播放邏輯由 useEffect 監聽 streamUrl 負責（串流 URL）
      setStreamUrl(url)
      setStreamSubtitles(result.subtitles || [])
      setPage('player')
      return
    } catch (err: any) {
      setLoading(false)
      setError('無法取得串流網址: ' + (err.message || String(err)))
    }
  }

  // 當 streamUrl 變化時執行播放（確保 player 頁面已掛載 <video> 元素）
    useEffect(() => {
      ;(async () => {
    addDebug('streamUrl changed: ' + streamUrl)
    addDebug('streamSubtitles count: ' + (streamSubtitles?.length || 0))

    const videoEl = videoRef.current
    if (!videoEl) {
      addDebug('videoEl is null, returning')
      return
    }

    const subs = streamSubtitles

    if (!streamUrl) {
      addDebug('streamUrl is empty, returning')
      return
    }

    // 清理舊軌道
    const existingTracks = videoEl.querySelectorAll('track')
    addDebug('existing tracks before cleanup: ' + existingTracks.length)
    existingTracks.forEach((t: HTMLTrackElement) => t.remove())

    // 添加字幕軌道（不使用 <track> 元素，改為自定義渲染，可完全控制字體大小）
    addDebug('subs is array: ' + Array.isArray(subs) + ', length: ' + (subs?.length || 0))
    if (subs && Array.isArray(subs) && subs.length > 0) {
      addDebug('processing ' + subs.length + ' subtitle tracks')
      // 讀取第一個字幕文件的內容
      const sub = subs[0]
      let trackSrc = sub.path
      addDebug('subtitle[0] original path: ' + trackSrc)
      addDebug('subtitle[0] name: ' + sub.name + ', language: ' + sub.language)
      if (trackSrc) {
        let localPath = ''
        if (trackSrc.startsWith('file://')) {
          localPath = trackSrc.slice(8).replace(/\\/g, '/')
          addDebug('subtitle[0] converted localPath: ' + localPath)
        } else if (trackSrc.includes(':\\')) {
          localPath = trackSrc.replace(/\\/g, '/')
          addDebug('subtitle[0] converted localPath (backslash): ' + localPath)
        }
        if (localPath) {
          // 透過 Tauri 命令讀取 VTT 檔案內容
          try {
            const bytes: number[] = await invoke('read_binary_file', { path: localPath })
            // 使用 TextDecoder 正確解碼 UTF-8（支持日語等多字節字符）
            const vttContent = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
            addDebug('subtitle[0] VTT content loaded, length: ' + vttContent.length)
            addDebug('subtitle[0] VTT first 200 chars: ' + vttContent.substring(0, 200))

            // 解析 VTT 內容為時間段陣列
            const cues = parseVttCues(vttContent)
            addDebug('subtitle[0] parsed ' + cues.length + ' cues')
            if (cues.length > 0) {
              addDebug('subtitle[0] first cue: start=' + cues[0].start + ', end=' + cues[0].end + ', text=' + cues[0].text.substring(0, 50))
            }

            // 監聽視頻時間更新，顯示對應字幕
            let firstTimeUpdateLogged = false
            const onTimeUpdate = () => {
              const currentTime = videoEl.currentTime
              if (!firstTimeUpdateLogged) {
                addDebug('subtitle[0] first timeupdate: currentTime=' + currentTime.toFixed(3) + ', cues=' + cues.length)
                if (cues.length > 0) {
                  addDebug('subtitle[0] first cue: start=' + cues[0].start + ', end=' + cues[0].end)
                }
                firstTimeUpdateLogged = true
              }
              const activeCue = cues.find(c => currentTime >= c.start && currentTime < c.end)
              if (activeCue) {
                if (!subtitleActive || subtitleText !== activeCue.text) {
                  setSubtitleText(activeCue.text)
                  setSubtitleActive(true)
                }
              } else {
                if (subtitleActive) {
                  setSubtitleText('')
                  setSubtitleActive(false)
                }
              }
            }

            videoEl.removeEventListener('timeupdate', onTimeUpdate)
            videoEl.addEventListener('timeupdate', onTimeUpdate)

            // 視頻加載後立即檢查當前時間，避免跳過前幾秒的字幕
            const onLoadedMetadata = () => {
              const currentTime = videoEl.currentTime
              addDebug('subtitle[0] loadedmetadata: currentTime=' + currentTime.toFixed(3))
              const activeCue = cues.find(c => currentTime >= c.start && currentTime < c.end)
              if (activeCue) {
                if (!subtitleActive || subtitleText !== activeCue.text) {
                  setSubtitleText(activeCue.text)
                  setSubtitleActive(true)
                  addDebug('subtitle[0] showing on load: t=' + currentTime.toFixed(3) + ', text=' + activeCue.text.substring(0, 30))
                }
              }
            }
            videoEl.removeEventListener('loadedmetadata', onLoadedMetadata)
            videoEl.addEventListener('loadedmetadata', onLoadedMetadata)

            // 視頻結束時清除字幕
            const onEnded = () => {
              setSubtitleText('')
              setSubtitleActive(false)
            }
            videoEl.removeEventListener('ended', onEnded)
            videoEl.addEventListener('ended', onEnded)

          } catch (e: any) {
            addDebug('subtitle[0] read_binary_file failed: ' + e.message)
          }
        }
      }
    } else {
      addDebug('no subtitles to add')
    }

    // 播放
    const isLocalFile = streamUrl.startsWith('file://') || streamUrl.startsWith('asset://')
    const isM3u8 = streamUrl.toLowerCase().includes('.m3u8') || streamUrl.toLowerCase().includes('m3u8')

    if (isLocalFile) {
      let playSrc = streamUrl
      if (streamUrl.startsWith('file://')) {
        let localPath = streamUrl.slice(8).replace(/\\/g, '/')
        playSrc = convertFileSrc(localPath)
        addDebug('converted to asset URL: ' + playSrc)
      }
      addDebug('playing local file: ' + playSrc)
      videoEl.src = playSrc
      videoEl.onloadedmetadata = () => {
        addDebug('tauri URI metadata loaded')
        setError('')
        setLoading(false)
      }
      videoEl.onerror = (_e: any) => {
        if (!videoEl.error) return
        const msg = videoEl.error.message || ''
        if (msg.includes('Empty src')) return
        setLoading(false)
        setError('<video> 無法播放此檔案: ' + msg)
      }
      videoEl.play().catch((e: any) => {
        addDebug('video play failed: ' + (e.message || String(e)))
        setLoading(false)
        setError('影片播放失敗: ' + (e.message || String(e)))
      })
    } else if (isM3u8 && Hls.isSupported()) {
      if (hlsRef.current) hlsRef.current.destroy()
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(streamUrl)
      hls.attachMedia(videoEl)
      hls.on(Hls.Events.ERROR, (_ev: any, data: any) => {
        console.error('[DEBUG useEffect] hls.js ERROR:', data)
        setLoading(false)
        setError('hls.js 播放錯誤: ' + (data.details || String(data)))
      })
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('[DEBUG useEffect] hls.js MANIFEST_PARSED, attempting play')
        videoEl.play().then(() => {
          setLoading(false)
        }).catch((e: any) => {
          console.error('[DEBUG useEffect] video play failed after manifest:', e)
          setLoading(false)
          setError('影片播放失敗: ' + (e.message || String(e)))
        })
      })
    } else {
      videoEl.src = streamUrl
      videoEl.onerror = (_e: any) => {
        console.error('[DEBUG useEffect] video element error:', _e)
        setLoading(false)
        setError('<video> 無法播放此格式: ' + (videoEl.error?.message || '未知錯誤'))
      }
      videoEl.play().then(() => {
        setLoading(false)
      }).catch((e: any) => {
        console.error('[DEBUG useEffect] video play failed:', e)
        setLoading(false)
        setError('影片播放失敗: ' + (e.message || String(e)))
      })
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      videoEl.pause()
      videoEl.src = ''
    }
  })()
  }, [streamUrl])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  const backToSearch = () => {
    setPage('search')
    setStreamUrl('')
    setVideoTitle('')
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    const video = videoRef.current
    if (video) {
      video.pause()
      video.src = ''
    }
  }

  const goToChannelVideos = (channel: any) => {
    setVideoTitle(channel.title || '頻道影片')
    setLoading(true)
    setError('')
    try {
      invoke('get_channel_videos', { channelUrl: channel.url || channel.channel_url || '' })
        .then((result: any) => {
          setLoading(false)
          if (!result.ok) {
            setError(result.error || '取得頻道影片失敗')
            return
          }
          const data = result.data
          const list = Array.isArray(data) ? data : (data?.entries || data?.videos || [])
          setVideos(list)
          setPage('channel-videos')
        })
        .catch((err: any) => {
          setLoading(false)
          setError(err.message || '取得頻道影片出錯')
        })
    } catch (err: any) {
      setLoading(false)
      setError(err.message || '取得頻道影片出錯')
    }
  }

  // 全域快捷鍵（僅在播放頁面）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current
      if (!video) return
      if (e.key === ' ') { e.preventDefault(); togglePlay() }
      if (e.key === 'ArrowLeft') { video.currentTime = Math.max(0, video.currentTime - 10) }
      if (e.key === 'ArrowRight') { video.currentTime = Math.min(video.duration, video.currentTime + 10) }
      if (e.key === 'ArrowUp') { video.volume = Math.min(1, video.volume + 0.1) }
      if (e.key === 'ArrowDown') { video.volume = Math.max(0, video.volume - 0.1) }
      if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) video.requestFullscreen?.().catch(() => {})
        else document.exitFullscreen?.().catch(() => {})
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const copyPipCommand = () => {
    navigator.clipboard.writeText('pip install yt-dlp youtube_transcript_api')
  }

  const formatDuration = (sec: any): string => {
    const s = Number(sec)
    if (!s) return ''
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec2 = Math.floor(s % 60)
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec2.toString().padStart(2, '0')}` : `${m}:${sec2.toString().padStart(2, '0')}`
  }

  // 環境檢查頁面 - 加載中
  if (!envChecked) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold">🔍</span>
          </div>
          <h2 className="text-xl font-bold mb-2">正在檢查執行環境…</h2>
          <p className="text-slate-400">請稍候</p>
        </div>
      </div>
    )
  }

  // 環境檢查頁面 - 環境未就緒
  if (page === 'env' && !envReady) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold">⚠️</span>
          </div>
          <h2 className="text-xl font-bold mb-4">執行環境未就緒</h2>
          <p className="mb-6 text-slate-400">{envError}</p>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 text-left mb-6">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">安裝步驟：</h3>
            <ol className="text-sm text-slate-400 space-y-2 list-disc pl-5">
              <li>下載並安裝 Python 3.12：<a href="https://www.python.org/downloads/release/python-3120/" className="text-blue-400 hover:underline">python.org</a></li>
              <li>安裝時請勾選「Add Python to PATH」</li>
              <li>開啟命令提示字元，執行：<div className="flex items-center gap-2"><code className="bg-slate-800 px-2 py-1 rounded text-xs">pip install yt-dlp youtube_transcript_api</code><button onClick={copyPipCommand} className="px-2 py-1 rounded bg-slate-700 border border-slate-600 text-xs text-slate-300 hover:text-white">複製</button></div></li>
              <li>完成後重新啟動 NoadYT-Desktop</li>
            </ol>
          </div>
          <div className="flex items-center justify-center gap-3 mb-4">
            <button
              onClick={() => setPage('search')}
              className="px-6 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 text-sm font-medium"
            >
              我已安裝，繼續
            </button>
            <button
              onClick={() => {
                try { localStorage.setItem('noadyt-env-dismissed', 'true') } catch {}
                setPage('search')
              }}
              className="px-6 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200 text-sm font-medium"
            >
              不再提示
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 導航列
  const nav = (
    <nav className="mb-6 flex items-center gap-4">
      <button
        onClick={() => setPage('search')}
        className={page === 'search' ? 'px-4 py-2 rounded-lg bg-blue-600 text-white' : 'px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'}
      >
        影片搜尋
      </button>
      <button
        onClick={() => setPage('channels')}
        className={page === 'channels' ? 'px-4 py-2 rounded-lg bg-blue-600 text-white' : 'px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'}
      >
        頻道搜尋
      </button>
      <button
        onClick={() => setPage('settings')}
        className={page === 'settings' ? 'px-4 py-2 rounded-lg bg-blue-600 text-white' : 'px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'}
      >
        設定
      </button>
    </nav>
  )

  // 播放頁面
  if (page === 'player') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 flex flex-col">
        <header className="mb-4 flex items-center gap-3">
          <button onClick={backToSearch} className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 text-sm font-medium">← 回搜尋</button>
          <h1 className="text-lg font-bold truncate flex-1">{videoTitle}</h1>
        </header>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="flex-1 bg-black rounded-lg border border-slate-800 flex items-center justify-center min-h-[500px] relative">
          {streamUrl ? (
            <>
              <video ref={videoRef} className="w-full h-full object-contain bg-black" autoPlay controls />
              {/* 自定義字幕顯示區域 */}
              {subtitleActive && subtitleText && (
                <div
                  className="absolute bottom-10 left-0 right-0 flex justify-center px-4 text-center pointer-events-none"
                  style={{ fontSize: subtitleFontSize + 'px' }}
                >
                  <div className="inline-block bg-black/75 text-yellow-300 px-3 py-2 rounded-lg text-shadow-md whitespace-pre-wrap break-words max-w-[80%]">
                    {subtitleText}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-slate-500 text-sm">載入串流中…</div>
          )}
        </div>

        {/* 調試信息面板 */}
        {debugInfo.length > 0 && (
          <div className="mt-4 rounded-lg bg-black/50 border border-slate-700 overflow-hidden">
            <div className="flex justify-between items-center p-3 text-xs font-mono text-green-400 bg-slate-800 cursor-pointer" onClick={() => setDebugCollapsed(!debugCollapsed)}>
              <span className="font-bold">{debugCollapsed ? '▶' : '▼'} 調試日誌</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDebugInfo([])
                }}
                className="text-slate-500 hover:text-white"
              >
                清除
              </button>
            </div>
            {!debugCollapsed && (
              <div className="p-3 max-h-64 overflow-y-auto">
                <div className="space-y-1">
                  {debugInfo.map((log, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all text-xs">{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 字幕大小調整 */}
        <div className="mt-4 flex items-center gap-4 text-sm text-slate-400 bg-slate-800/50 p-3 rounded-lg">
          <label className="text-slate-300">字幕大小：</label>
          <input
            type="range"
            min="12"
            max="64"
            step="2"
            value={subtitleFontSize}
            onChange={(e) => {
              e.stopPropagation()
              setSubtitleFontSize(parseInt(e.target.value))
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className="w-24 accent-blue-500"
          />
          <span className="font-mono text-slate-300">{subtitleFontSize}px</span>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-slate-400">
          <span className="font-mono truncate">{streamUrl ? streamUrl.slice(0, 80) + (streamUrl.length > 80 ? '…' : '') : '—'}</span>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-mono">快捷鍵：</span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs">空白鍵</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs">← →</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs">↑ ↓</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs">F</kbd>
          </div>
        </div>
      </div>
    )
  }

  // 設定頁面
  if (page === 'settings') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
        {nav}
        <h1 className="text-2xl font-bold mb-6">設定</h1>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md">
          <h2 className="text-lg font-semibold mb-4">搜尋設定</h2>
          <div className="mb-4">
            <label className="block text-sm text-slate-300 mb-2">搜尋結果數量</label>
            <input
              type="number"
              min="10"
              max="100"
              value={maxResults}
              onChange={(e) => setMaxResults(parseInt(e.target.value) || 60)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
            />
            <p className="text-xs text-slate-500 mt-1">每次搜尋最多顯示的影片數量</p>
          </div>

          <h2 className="text-lg font-semibold mb-4 mt-8">播放設定</h2>
          <div className="mb-4">
            <label className="block text-sm text-slate-300 mb-2">預設解析度</label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="auto">自動（最高解析度）</option>
              <option value="1080">1080P</option>
              <option value="720">720P</option>
              <option value="480">480P</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">自動會抓取該影片能取得的最高解析度</p>
          </div>
          <div className="mb-4">
            <label className="block text-sm text-slate-300 mb-2">播放器選擇</label>
            <select
              value={playerType}
              onChange={(e) => setPlayerType(e.target.value as 'internal' | 'external')}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="internal">內建播放器（WebView2）</option>
              <option value="external">外部播放器（mpv）</option>
            </select>
            {playerType === 'external' && (
              <div className="mt-2">
                <label className="block text-sm text-slate-300 mb-1">外部播放器程式</label>
                <select
                  value={externalPlayer}
                  onChange={(e) => setExternalPlayer(e.target.value as 'potplayer' | 'vlc' | 'mpv')}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="potplayer">PotPlayer</option>
                  <option value="vlc">VLC media player</option>
                  <option value="mpv">MPV</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">mpv 播放器已內建，PotPlayer/VLC 需預先安裝</p>
              </div>
            )}
          </div>

          <div className="mb-4 mt-8">
            <h2 className="text-lg font-semibold mb-4">緩存管理</h2>
            <button
              onClick={clearCache}
              disabled={cacheStatus === '清除中...'}              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 text-sm font-medium">
              {cacheStatus === '清除中...' ? '清除中...' : '清除下載與字幕緩存'}
            </button>
            {cacheStatus && !cacheStatus.startsWith('清除中') && (
              <p className="text-xs text-green-400 mt-2">{cacheStatus}</p>
            )}
          </div>

          <div className="mb-4 mt-8">
            <h2 className="text-lg font-semibold mb-4">字幕語言</h2>
            <label className="block text-sm text-slate-300 mb-2">字幕語言優先順序</label>
            <select
              value={subtitleLang}
              onChange={(e) => setSubtitleLang(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="auto">自動（偵測可用語言）</option>
              <option value="en">英文</option>
              <option value="zh-Hans">簡體中文</option>
              <option value="zh-Hant">繁體中文</option>
              <option value="ja">日文</option>
              <option value="es">西班牙文</option>
              <option value="de">德語</option>
              <option value="fr">法語</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">播放時會依此語言偏好下載字幕</p>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => { saveSettings(); setPage('search') }}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-sm font-medium"
            >
              儲存並返回
            </button>
            <button
              onClick={() => setPage('search')}
              className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 text-sm font-medium"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 頻道搜尋頁面
  if (page === 'channels') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
        {nav}
        <h1 className="text-2xl font-bold mb-6">頻道搜尋</h1>

        <div className="relative w-full max-w-3xl mb-6">
          <div className="relative">
            <input
              ref={searchInputRef}
              className="w-full px-5 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-lg"
              placeholder="搜尋 YouTube 頻道…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChannelSearch()}
            />
            <button
              onClick={handleChannelSearch}
              className="absolute right-2 top-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium shadow-lg shadow-blue-600/20"
            >
              搜尋
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        {!loading && (searchDuration !== null || videos.length > 0) && (
          <div className="mb-4 flex items-center gap-4 text-xs text-slate-500">
            {searchDuration !== null && <span>耗時：{searchDuration} 秒</span>}
            <span>找到 {videos.length} 個頻道</span>
          </div>
        )}
        {loading && (
          <div className="mb-4 flex items-center gap-2 text-xs text-blue-400 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
            <span>正在搜尋頻道…</span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {!loading && videos.length === 0 && !error && (
            <div className="col-span-full text-slate-500 text-sm text-center py-16">
              {query ? '沒有找到頻道' : '輸入關鍵字開始搜尋頻道'}
            </div>
          )}
          {!loading && videos.map((c: any) => (
            <div key={c.channel_id || c.id} className="group cursor-pointer" onClick={() => goToChannelVideos(c)}>
              <div className="aspect-video rounded-lg bg-slate-800 overflow-hidden relative">
                {c.thumbnail && (
                  <img src={c.thumbnail} alt={c.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-200" />
                )}
              </div>
              <div className="mt-2 flex flex-col gap-1">
                <div className="text-sm font-medium text-slate-200 truncate">{c.title}</div>
                <div className="text-xs text-slate-500 truncate">{c.channel_id || '頻道ID未知'}</div>
                <div className="text-xs text-slate-500">{c.follower_count !== null && c.follower_count !== undefined ? c.follower_count + ' 訂閱' : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 頻道影片頁面
  if (page === 'channel-videos') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <header className="mb-6 flex items-center gap-3">
          <button onClick={() => setPage('channels')} className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 text-sm font-medium">← 回頻道搜尋</button>
          <h1 className="text-xl font-bold truncate flex-1">{videoTitle}</h1>
        </header>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        {!loading && videos.length === 0 && !error && (
          <div className="text-slate-500 text-sm text-center py-16">
            沒有找到影片
          </div>
        )}
        {!loading && videos.map((v: any) => (
          <div key={v.id} className="group cursor-pointer" onClick={() => playVideo(v)}>
            <div className="aspect-video rounded-lg bg-slate-800 overflow-hidden relative">
              {v.thumbnail && (
                <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-200" />
              )}
            </div>
            <div className="mt-2 flex flex-col gap-1">
              <div className="text-sm font-medium text-slate-200 truncate">{v.title}</div>
              <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
                <span>{v.channel || '未知頻道'}</span>
                {v.duration !== undefined && v.duration !== null && (
                  <span className="ml-auto text-slate-500">{formatDuration(v.duration)}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // 搜尋頁面（無播放器）
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      {nav}

      <div className="relative w-full max-w-3xl mb-6">
        <div className="relative">
          <input
            ref={searchInputRef}
            className="w-full px-5 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-lg"
            placeholder="搜尋 YouTube…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowHistory(history.length > 0)}
            onBlur={() => setTimeout(() => setShowHistory(false), 150)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={handleSearch}
            className="absolute right-2 top-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium shadow-lg shadow-blue-600/20"
          >
            搜尋
          </button>
        </div>

        {showHistory && history.length > 0 && (
          <ul ref={historyListRef} className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-xl bg-slate-900 border border-slate-700 shadow-2xl shadow-black/40">
            <li className="px-4 py-3 border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              搜尋歷史
            </li>
            {history.map((kw, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-3 border-b border-slate-800/50 last:border-0 cursor-pointer hover:bg-slate-800/50 group" onClick={() => selectHistory(kw)}>
                <span className="text-sm text-slate-200 truncate flex-1 pr-3">{kw}</span>
                <button
                  onClick={(e) => removeHistory(kw, e)}
                  className="p-1 rounded hover:bg-red-500/10 hover:text-red-400 text-slate-500 group-hover:text-red-400 transition"
                  title="刪除"
                >
                  ✕
                </button>
              </li>
            ))}
            {history.length > 0 && (
              <li className="px-4 py-3 border-t border-slate-800/50 text-center">
                <button
                  onClick={clearHistory}
                  className="text-xs text-red-400 hover:text-red-300 underline"
                >
                  清除全部歷史
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      {!loading && (searchDuration !== null || videos.length > 0) && (
        <div className="mb-4 flex items-center gap-4 text-xs text-slate-500">
          {searchDuration !== null && <span>耗時：{searchDuration} 秒</span>}
          <span>找到 {videos.length} 筆影片</span>
        </div>
      )}
      {loading && (
        <div className="mb-4 flex items-center gap-2 text-xs text-blue-400 animate-pulse">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
          <span>正在呼叫 Python 解析…</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {loading && (
          <div className="col-span-full text-slate-500 text-sm text-center py-8">搜尋中…</div>
        )}
        {!loading && videos.length === 0 && !error && (
          <div className="col-span-full text-slate-500 text-sm text-center py-16">
            {query ? '沒有找到影片' : '輸入關鍵字開始搜尋'}
          </div>
        )}
        {!loading && videos.map((v: any) => (
          <div key={v.id} className="group cursor-pointer" onClick={() => playVideo(v)}>
            <div className="aspect-video rounded-lg bg-slate-800 overflow-hidden relative">
              {v.thumbnail && (
                <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-200" />
              )}
            </div>
            <div className="mt-2 flex flex-col gap-1">
              <div className="text-sm font-medium text-slate-200 truncate">{v.title}</div>
              <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
                <span>{v.channel || '未知頻道'}</span>
                {v.duration !== undefined && v.duration !== null && (
                  <span className="ml-auto text-slate-500">{formatDuration(v.duration)}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <footer className="mt-8 text-xs text-slate-600">
        NoadYT-Desktop · Tauri 2 + React + Python (yt-dlp)
      </footer>
    </div>
  )
}
