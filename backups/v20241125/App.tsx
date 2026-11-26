import { useState, useRef, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  MpvConfig,
  init as mpvInit,
  command as mpvCommand,
  setProperty as mpvSetProperty,
  getProperty as mpvGetProperty,
  destroy as mpvDestroy,
} from 'tauri-plugin-libmpv-api'

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
  const [streamSubtitles] = useState<any[]>([])
  const [pendingStreamUrl, setPendingStreamUrl] = useState<{url: string, subtitles: any[], audioUrl?: string} | null>(null)
  const [videoTitle, setVideoTitle] = useState<string>('')
  const [maxResults, setMaxResults] = useState<number>(60)
  const [resolution, setResolution] = useState<string>('auto')
  const [playerType, setPlayerType] = useState<'internal' | 'external'>('internal')
  const [externalPlayer, setExternalPlayer] = useState<'mpv' | 'vlc'>('mpv')
  const [subtitleLang, setSubtitleLang] = useState<string>('auto')
  const [cacheStatus, setCacheStatus] = useState<string>('')
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  const [subtitleFontSize, setSubtitleFontSize] = useState<number>(32)
  const [styleEl, setStyleEl] = useState<HTMLStyleElement | null>(null)
  const [debugCollapsed, setDebugCollapsed] = useState<boolean>(true)
  const [subtitleText, _setSubtitleText] = useState<string>('')
  const [subtitleActive, _setSubtitleActive] = useState<boolean>(false)
  const [mpvInitialized, setMpvInitialized] = useState<boolean>(false)
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
    invoke('write_log', { message: entry }).catch(e => console.error('Failed to write log:', e))
  }

  // 應用字幕大小到 video 元素，使用動態 style 標籤
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
        setSearchDuration(Math.round((performance.now() - start) / 10) / 100)
        return
      }
      const data = result.data
      const list = Array.isArray(data) ? data : (data?.entries || data?.videos || [])
      setVideos(list.slice(0, maxResults))
      setSearchDuration(Math.round((performance.now() - start) / 10) / 100)
    } catch (err: any) {
      // 搜尋失敗時不清空現有結果，只顯示錯誤提示
      setError('搜尋出錯：' + (err.message || String(err)))
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
      setError('搜尋出錯：' + (err.message || String(err)))
    } finally {
      setLoading(false)
    }
  }

  const playVideo = async (video: any) => {
    setVideoTitle(video.title || '無標題')
    try {
      setLoading(true)
      setError('')
      const result: any = await invoke('get_stream_url', { input: { videoId: video.id, resolution, subtitleLang: subtitleLang || 'auto', playerType: playerType } })
      const url: string = result.path
      console.log('[DEBUG playVideo] stream URL:', url)
      console.log('[DEBUG playVideo] subtitle tracks:', result.subtitles?.length || 0)
      addDebug('[PLAYVIDEO] Full stream URL: ' + url)

      // 外部播放器模式：直接調用 Python --play 命令
      if (playerType === 'external') {
        addDebug('[PLAYVIDEO] External player mode, calling python --play')
        try {
          const ret: any = await invoke('play_with_external_player', {
            videoId: video.id,
            player: externalPlayer,
            subtitleLang: subtitleLang || 'auto',
            maxResolution: resolution || 'auto',
          })
          addDebug('[PLAYVIDEO] External player started: ' + ret)
          setLoading(false)
          return
        } catch (err: any) {
          console.error('[DEBUG playVideo] External player error:', err)
          setLoading(false)
          setError('無法啟動 ' + externalPlayer + ': ' + (err.message || String(err)))
          return
        }
      }

      // 內建播放器模式（libmpv）：直接用 YouTube URL + Headers 串流播放
      addDebug('[PLAYVIDEO] Internal player: streaming mode')
      try {
        // result 已是 get_stream_url 返回值，包含 path/userAgent/subtitles
        const userAgent = result.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        const subPath = result.subtitles?.[0]?.path || ''
        const videoUrl = result.path.startsWith('http') ? result.path : `https://www.youtube.com/watch?v=${video.id}`

        setPage('player')
        setStreamUrl(videoUrl)
        setPendingStreamUrl({ url: videoUrl, subtitles: [{ language: 'ja', name: 'Japanese', path: subPath }] })
        addDebug('[MPV] Streaming from: ' + videoUrl.slice(0, 60))

        // 初始化 mpv
        if (!mpvInitialized) {
          const mpvConfig: MpvConfig = {
            initialOptions: {
              'vo': 'gpu-next',
              'hwdec': 'auto-safe',
              'keep-open': 'yes',
              'force-window': 'yes',
              'video-sync': 'audio',
              'framedrop': 'vo',
              'cache': 'yes',
              'demuxer-readahead-secs': '10',
              'demuxer-max-bytes': '100MiB',
              // 解析度控制：傳給 yt-dlp 的格式字符串
              ...(resolution && resolution !== 'auto'
                ? { 'ytdl-format': `bestvideo[height<=${resolution}]+bestaudio/best[height<=${resolution}]/best[height<=${resolution}]` }
                : { 'ytdl-format': 'bestvideo+bestaudio/best' }),
            },
            observedProperties: [],
          }
          try {
            const initWindowLabel = await mpvInit(mpvConfig)
            setMpvInitialized(true)
            addDebug('[MPV] Initialized in window: ' + initWindowLabel)
          } catch (e: any) {
            console.error('[MPV] Init failed:', e)
            setLoading(false)
            setError('mpv 初始化失敗: ' + (e.message || String(e)))
            return
          }
        }

        // 設定 Headers
        await mpvSetProperty('user-agent', userAgent, 'main')
        await mpvSetProperty('referrer', 'https://youtube.com', 'main')
        addDebug('[MPV] Headers set: UA=' + userAgent.slice(0, 40) + '...')

        // 等待視窗 handle 建立
        await new Promise(resolve => setTimeout(resolve, 200))

        // 載入影片（YouTube 觀看頁面 URL，讓 mpv 自己解析）
        addDebug('[MPV] Loading: ' + videoUrl.slice(0, 60))
        await mpvCommand('loadfile', [videoUrl], 'main')
        addDebug('[MPV] Streaming started!')

        // 設定字幕
        if (subPath) {
          await mpvCommand('sub-file', [subPath], 'main')
          addDebug('[MPV] Subtitle: ' + subPath)
        }

        setLoading(false)
        return
      } catch (err: any) {
        console.error('[DEBUG internal player failed]', err)
        setLoading(false)
        setError('無法啟動內建播放器: ' + (err.message || String(err)))
        return
      }
    } catch (err: any) {
      console.error('[DEBUG playVideo] Error:', err)
      setLoading(false)
      setError('無法取得串流網址: ' + (err.message || String(err)))
    }
  }

// 清理 mpv（離開播放頁面時）
useEffect(() => {
    return () => {
      if (page !== 'player' && mpvInitialized) {
        mpvDestroy()
        setMpvInitialized(false)
        addDebug('[MPV] Destroyed')
      }
    }
  }, [page, mpvInitialized])

  // 當 streamUrl 變化時（僅記錄日誌，實際播放由 playVideo 負責）
  useEffect(() => {
    if (streamUrl) {
      addDebug('streamUrl changed: ' + streamUrl.slice(0, 60))
    }
    if (streamSubtitles && streamSubtitles.length > 0) {
      addDebug('streamSubtitles count: ' + streamSubtitles.length)
    }
  }, [streamUrl, streamSubtitles])

  const togglePlay = async () => {
    if (!mpvInitialized) return
    const paused = await mpvGetProperty('pause', 'flag')
    await mpvSetProperty('pause', !paused)
  }

  const backToSearch = () => {
    setPage('search')
    setStreamUrl('')
    setVideoTitle('')
    if (mpvInitialized) {
      mpvCommand('stop', [], 'main').catch(() => {})
      mpvDestroy()
      setMpvInitialized(false)
      addDebug('[MPV] Destroyed')
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
    const onKey = async (e: KeyboardEvent) => {
      if (!mpvInitialized) return
      if (e.key === ' ') { e.preventDefault(); togglePlay() }
      if (e.key === 'ArrowLeft') {
        const pos = await mpvGetProperty('time-pos', 'double')
        await mpvSetProperty('time-pos', Math.max(0, (pos || 0) - 10))
      }
      if (e.key === 'ArrowRight') {
        const pos = await mpvGetProperty('time-pos', 'double')
        await mpvSetProperty('time-pos', Math.min((pos || 0) + 10, 99999))
      }
      if (e.key === 'ArrowUp') {
        const vol = await mpvGetProperty('volume', 'int64')
        await mpvSetProperty('volume', Math.min(100, (vol || 0) + 10))
      }
      if (e.key === 'ArrowDown') {
        const vol = await mpvGetProperty('volume', 'int64')
        await mpvSetProperty('volume', Math.max(0, (vol || 0) - 10))
      }
      if (e.key === 'f' || e.key === 'F') {
        const fs = await mpvGetProperty('fullscreen', 'flag')
        await mpvSetProperty('fullscreen', !fs)
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

  // 播放頁面 — libmpv 內建播放器（取代 Shaka/Video）
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

        {/* libmpv 渲染容器（mpv 在透明視窗內渲染，不需要 <video> 元素） */}
        <div className="flex-1 bg-black rounded-lg border border-slate-800 flex items-center justify-center min-h-[500px] relative">
          {(streamUrl || pendingStreamUrl?.url) ? (
            <>
              <div className="w-full h-full object-contain bg-black" />
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
              <option value="internal">內建播放器（Libmpv）</option>
              <option value="external">外部播放器（mpv）</option>
            </select>
            {playerType === 'external' && (
              <div className="mt-2">
                <label className="block text-sm text-slate-300 mb-1">外部播放器程式</label>
                <select
                  value={externalPlayer}
                  onChange={(e) => setExternalPlayer(e.target.value as 'mpv' | 'vlc')}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="mpv">MPV</option>
                  <option value="vlc">VLC media player</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">MPV 已內建，VLC 需預先安裝</p>
              </div>
            )}
          </div>

          <div className="mb-4 mt-8">
            <h2 className="text-lg font-semibold mb-4">緩存管理</h2>
            <button
              onClick={clearCache}
              disabled={cacheStatus === '清除中...'}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 text-sm font-medium">
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
